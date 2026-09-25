import { useMemo, useRef, useState } from "react";
import { Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { crewRosterError, type CrewSnapshot } from "@/lib/orders/internalTeamRoster";

export interface CrewRosterDraft {
  employeeIds: string[]; leaderEmployeeId: string | null;
  expectedVersion: string | null; operationId: string;
}

/** Mount keyed by company/team. Never reset an in-progress draft on background refetch. */
export function InternalTeamRosterEditor({ snapshot, onSave, onReload }: {
  snapshot: CrewSnapshot;
  onSave: (draft: CrewRosterDraft) => Promise<void>;
  onReload: () => void;
}) {
  const [base] = useState(snapshot);
  const [ids, setIds] = useState(base.roster.employeeIds);
  const [leader, setLeader] = useState(base.roster.leaderEmployeeId);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const readOnly = !snapshot.canManage || !snapshot.teamActive;
  const stale = snapshot.roster.version !== base.roster.version;
  const employees = snapshot.employees;
  const missingIds = ids.filter(id => !employees.some(e => e.id === id));
  const visible = useMemo(() => employees.filter(e =>
    (e.active || ids.includes(e.id)) && e.name.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")),
  ).sort((a, b) => Number(ids.includes(b.id)) - Number(ids.includes(a.id)) || a.name.localeCompare(b.name, "it")), [employees, ids, search]);
  const invalid = crewRosterError(ids, leader, employees);
  const changed = JSON.stringify([...ids].sort()) !== JSON.stringify([...base.roster.employeeIds].sort()) || leader !== base.roster.leaderEmployeeId;
  const toggle = (id: string) => {
    setIds(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);
    if (leader === id) setLeader(null);
    setError(null);
  };
  const submit = async () => {
    if (submitting.current || readOnly || invalid || stale || !changed) return;
    const fingerprint = JSON.stringify([[...ids].sort(), leader, base.roster.version]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
    submitting.current = true; setPending(true); setError(null);
    try {
      await onSave({ employeeIds: [...ids], leaderEmployeeId: leader, expectedVersion: base.roster.version, operationId: attempt.current.id });
    } catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non verificato. Riprova senza cambiare i dati."); }
    finally { submitting.current = false; setPending(false); }
  };
  return <div className="space-y-4">
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium"><Users className="h-4 w-4" /> {ids.length} dipendenti selezionati</p>
      <p className="mt-1 text-muted-foreground">La composizione abituale suggerisce chi assegnare. Non modifica cantieri, ore, costi o permessi Campo.</p>
    </div>
    {readOnly && <p role="status" className="text-sm text-muted-foreground">{snapshot.teamActive ? "Composizione in sola lettura." : "Squadra inattiva: riattivala prima di modificarne la composizione."}</p>}
    {stale && <div role="alert" className="rounded-md border border-amber-300 p-3 text-sm">La composizione è cambiata in un'altra sessione. La tua selezione è conservata.
      <Button type="button" variant="outline" className="mt-2 h-auto whitespace-normal" onClick={onReload} disabled={pending}>Scarta la selezione e ricarica</Button>
    </div>}
    <label className="block space-y-1.5 text-sm font-medium">Cerca dipendente
      <span className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Nome o cognome" /></span>
    </label>
    <fieldset disabled={readOnly || pending} className="min-w-0 space-y-3">
      <legend className="sr-only">Dipendenti della squadra</legend>
      <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
        {visible.map(e => <label key={e.id} className="flex min-h-14 cursor-pointer items-center gap-3 p-3">
          <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={ids.includes(e.id)} onChange={() => toggle(e.id)} disabled={!e.active && !ids.includes(e.id)} />
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{e.name}</span><span className="text-xs text-muted-foreground">{e.userId ? "Account Campo collegato · accesso ai cantieri da assegnare" : "Senza account Campo · nessun invito automatico"}</span></span>
          {!e.active && <Badge variant="outline">Inattivo</Badge>}
        </label>)}
        {!visible.length && <p className="p-4 text-sm text-muted-foreground">{employees.length ? "Nessun dipendente corrisponde alla ricerca. La selezione resta invariata." : "Nessun dipendente disponibile nell'anagrafica aziendale."}</p>}
        {missingIds.map(id => <label key={id} className="flex items-center gap-3 p-3 text-sm"><input type="checkbox" checked onChange={() => toggle(id)} />Dipendente non più disponibile · rimuovi dalla composizione</label>)}
      </div>
      <label className="block space-y-1.5 text-sm font-medium">Referente abituale (facoltativo)
        <select value={leader ?? ""} onChange={e => { setLeader(e.target.value || null); setError(null); }} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Nessun referente abituale</option>
          {employees.filter(e => e.active && ids.includes(e.id)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Essere referente non concede il ruolo di capocantiere. La delega si gestisce sul singolo incarico.</p>
    </fieldset>
    {invalid && <p role="status" className="text-sm text-amber-700">{invalid}</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" onClick={onReload} disabled={pending}>Scarta la selezione e ricarica</Button></div>}
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">Valida da oggi. Le composizioni precedenti restano nello storico.</p>
      <Button type="button" disabled={pending || readOnly || !!invalid || stale || !changed} onClick={submit}>{pending ? "Salvataggio…" : "Salva composizione"}</Button>
    </div>
  </div>;
}

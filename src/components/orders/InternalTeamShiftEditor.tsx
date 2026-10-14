import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CrewSnapshot } from "@/lib/orders/internalTeamRoster";
import { crewShiftChanges, crewShiftError, overlappingShifts, replaceShiftParticipant, shiftFingerprint, shiftHours, type CrewShift, type CrewShiftDraft } from "@/lib/orders/internalTeamShift";

interface Props {
  snapshot: CrewSnapshot;
  phases: { id: string; name: string }[];
  workDate: string;
  shifts: CrewShift[];
  canPlan: boolean;
  onSave: (draft: CrewShiftDraft & { operationId: string }) => Promise<void>;
  onReload: () => void;
}
const selectClass = "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

export function InternalTeamShiftEditor({ snapshot, phases, workDate, shifts, canPlan, onSave, onReload }: Props) {
  const uid = useId();
  const [base] = useState(snapshot);
  const [draft, setDraft] = useState<CrewShiftDraft>(() => ({
    shiftId: crypto.randomUUID(), expectedVersion: null, rosterVersion: snapshot.roster.version ?? "",
    workDate, startTime: "08:00", endTime: "12:00", phaseId: null,
    employeeIds: [...snapshot.roster.employeeIds], leaderEmployeeId: snapshot.roster.leaderEmployeeId,
    notes: "", status: "planned",
  }));
  const [search, setSearch] = useState("");
  const [absentId, setAbsentId] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const request = useRef<{ fingerprint: string; operationId: string } | null>(null);
  const stale = base.roster.version !== snapshot.roster.version || base.teamId !== snapshot.teamId;
  const changes = crewShiftChanges(base, draft.employeeIds);
  const invalid = crewShiftError(draft, snapshot, phases.map(p => p.id));
  const conflicts = overlappingShifts(draft, shifts);
  const disabled = saving || !canPlan || stale || !snapshot.teamActive;
  const selected = new Set(draft.employeeIds);
  const baseIds = new Set(base.roster.employeeIds);
  const people = snapshot.employees.filter(e => (e.active || selected.has(e.id)) && e.name.toLocaleLowerCase("it").includes(search.toLocaleLowerCase("it")));
  const missing = draft.employeeIds.filter(id => !snapshot.employees.some(e => e.id === id));
  const canReplace = !disabled && !!replaceShiftParticipant(draft, absentId, replacementId, snapshot);
  const names = (ids: string[]) => ids.map(id => snapshot.employees.find(e => e.id === id)?.name ?? "Persona non più disponibile").join(", ");
  const patch = (next: Partial<CrewShiftDraft>) => { setDraft(d => ({ ...d, ...next })); setError(null); };
  const toggle = (id: string) => patch({ employeeIds: selected.has(id) ? draft.employeeIds.filter(e => e !== id) : [...draft.employeeIds, id], leaderEmployeeId: selected.has(id) && draft.leaderEmployeeId === id ? null : draft.leaderEmployeeId });
  const save = async () => {
    if (inFlight.current || disabled || invalid || conflicts.length) return;
    inFlight.current = true; setSaving(true); setError(null);
    const fingerprint = shiftFingerprint(draft);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, operationId: crypto.randomUUID() };
    try { await onSave({ ...draft, operationId: request.current.operationId }); }
    catch (e) { setError(e instanceof Error ? e.message : "Turno non salvato. Riprova."); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div role="region" aria-label="Dettagli del turno" tabIndex={0} className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-medium">Pianificazione, non consuntivo</p>
      <p className="mt-1 text-muted-foreground">Questo turno non registra ore lavorate o costi e non concede accessi Campo. Gli incarichi già attivi restano invariati.</p>
    </div>
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="mb-2 text-sm font-semibold">Quando e dove lavorano</legend>
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1"><Label htmlFor={`${uid}-date`}>Giorno</Label><Input className="min-w-0" id={`${uid}-date`} type="date" min="2000-01-01" max="2100-12-31" value={draft.workDate} onChange={e => patch({ workDate: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-start`}>Dalle</Label><Input className="min-w-0" id={`${uid}-start`} type="time" value={draft.startTime} onChange={e => patch({ startTime: e.target.value })} /></div>
        <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-end`}>Alle</Label><Input className="min-w-0" id={`${uid}-end`} type="time" value={draft.endTime} onChange={e => patch({ endTime: e.target.value })} /></div>
      </div>
      <div className="space-y-1"><Label htmlFor={`${uid}-phase`}>Lavorazione</Label><select className={selectClass} id={`${uid}-phase`} value={draft.phaseId ?? ""} onChange={e => patch({ phaseId: e.target.value || null })}><option value="">Intera commessa</option>{phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    </fieldset>
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold">Chi sarà presente · {selected.size} persone</legend>
      <p className="text-xs text-muted-foreground">Togli chi non partecipa. Seleziona un altro dipendente per aggiungere un sostituto: la squadra abituale non cambia.</p>
      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Sostituisci una persona solo in questo turno</summary>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-absent`}>Chi non partecipa</Label><select className={selectClass} id={`${uid}-absent`} value={absentId} onChange={e => setAbsentId(e.target.value)}><option value="">Scegli una persona prevista</option>{snapshot.employees.filter(e => selected.has(e.id)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="min-w-0 space-y-1"><Label htmlFor={`${uid}-replacement`}>Chi viene al suo posto</Label><select className={selectClass} id={`${uid}-replacement`} value={replacementId} onChange={e => setReplacementId(e.target.value)}><option value="">Scegli il sostituto</option>{snapshot.employees.filter(e => e.active && !selected.has(e.id)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
        </div>
        <Button variant="outline" size="sm" className="mt-3" disabled={!canReplace} onClick={() => {
          if (disabled) return;
          const next = replaceShiftParticipant(draft, absentId, replacementId, snapshot);
          if (next) { setDraft(next); setError(null); setAbsentId(""); setReplacementId(""); }
        }}>Applica alla bozza</Button>
        <p className="mt-2 text-xs text-muted-foreground">Poi conferma con Pianifica turno. Se escludi il referente, scegli chi lo sostituisce nel ruolo.</p>
      </details>
      <Input aria-label="Cerca persona nel turno" placeholder="Cerca un dipendente…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
        {people.map(e => <label key={e.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/40">
          <input className="mt-1 h-4 w-4 shrink-0 accent-primary" type="checkbox" checked={selected.has(e.id)} disabled={disabled || (!e.active && !selected.has(e.id))} onChange={() => toggle(e.id)} />
          <span className="min-w-0 break-words text-sm"><span className="font-medium">{e.name}</span><span className="block text-xs text-muted-foreground">{!e.active ? "Non attivo · rimuovilo dal turno" : baseIds.has(e.id) ? "Squadra abituale" : "Sostituto / rinforzo"}{!e.userId ? " · senza account collegato" : " · account collegato"}</span></span>
        </label>)}
        {!people.length && <p className="p-2 text-sm text-muted-foreground">Nessun dipendente trovato.</p>}
        {missing.map(id => <div className="flex flex-wrap items-center gap-2 p-2 text-sm" key={id}><span>Dipendente non più disponibile</span><Button variant="outline" size="sm" onClick={() => toggle(id)}>Rimuovi dalla selezione</Button></div>)}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">{changes.excluded.length} non previsti · {changes.replacements.length} sostituti / rinforzi · {changes.noAccount.length} senza account</p>
      {(changes.excluded.length > 0 || changes.replacements.length > 0) && <div className="rounded-lg bg-muted/30 p-3 text-xs" aria-live="polite">
        {changes.excluded.length > 0 && <p>Non partecipano: {names(changes.excluded)}</p>}
        {changes.replacements.length > 0 && <p>Persone aggiunte: {names(changes.replacements)}</p>}
        <p className="mt-1 text-muted-foreground">Solo questo turno: la squadra abituale resta invariata.</p>
      </div>}
      <div className="space-y-1"><Label htmlFor={`${uid}-leader`}>Referente del turno</Label><select className={selectClass} id={`${uid}-leader`} value={draft.leaderEmployeeId ?? ""} onChange={e => patch({ leaderEmployeeId: e.target.value || null })}><option value="">Nessun referente</option>{snapshot.employees.filter(e => selected.has(e.id) && e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><p className="text-xs text-muted-foreground">È un riferimento organizzativo: non diventa automaticamente capocantiere nell'app.</p></div>
      <div className="space-y-1"><Label htmlFor={`${uid}-notes`}>Indicazioni per il turno <span className="text-muted-foreground">(facoltative)</span></Label><Textarea id={`${uid}-notes`} maxLength={1000} value={draft.notes} onChange={e => patch({ notes: e.target.value })} placeholder="Es. ritrovo in deposito; materiale da portare" /></div>
    </fieldset>
    {stale && <p role="alert" className="text-sm text-destructive">La composizione è cambiata in un'altra sessione. La tua selezione è conservata: ricarica prima di confermare.</p>}
    {invalid && !stale && <p role="status" className="text-sm text-destructive">{invalid}</p>}
    {!!conflicts.length && <p role="alert" className="text-sm text-destructive">Una persona selezionata ha già un turno sovrapposto in questa commessa.</p>}
    {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
    <div className="rounded-lg bg-muted/30 p-3 text-sm"><span className="font-medium">{selected.size} persone · {shiftHours(draft)?.toLocaleString("it-IT", { maximumFractionDigits: 2 }) ?? "—"} ore di fascia oraria</span><p className="mt-1 text-xs text-muted-foreground">Pause e viaggi vanno distinti dalle ore lavorate nel rapportino. Il controllo automatico copre i nuovi turni, non appuntamenti e assegnazioni precedenti.</p></div>
    </div>
    <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-background pt-3">
      <Button variant="ghost" size="sm" disabled={saving} onClick={onReload}>Scarta e ricarica</Button>
      <Button disabled={disabled || !!invalid || !!conflicts.length} onClick={() => void save()}>{saving ? "Salvataggio…" : "Pianifica turno"}</Button>
    </div>
  </div>;
}

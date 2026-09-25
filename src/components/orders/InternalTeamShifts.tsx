import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isLocalCrewBackend } from "@/lib/orders/internalTeamRoster";
import { loadCrewSnapshot, type CrewRpcClient } from "@/lib/orders/internalTeamRosterApi";
import { loadCrewShifts, saveCrewShift } from "@/lib/orders/internalTeamShiftApi";
import { validShiftDate, type CrewShift } from "@/lib/orders/internalTeamShift";
import { InternalTeamShiftEditor } from "./InternalTeamShiftEditor";

const config = { url: import.meta.env.VITE_SUPABASE_URL, optIn: import.meta.env.VITE_INTERNAL_TEAM_ROSTERS_LOCAL };
const enabled = isLocalCrewBackend(config.url, config.optIn);
const client = supabase as unknown as CrewRpcClient;
interface Props { orderId: string; teams: { id: string; label: string; kind?: "interna" | "esterna" }[]; phases: { id: string; name: string }[]; canPlan: boolean }

/** Entire component is absent on shared backends: no accidental extra queries/writes. */
export function InternalTeamShifts(props: Props) {
  return enabled ? <LocalTeamShifts {...props} /> : null;
}
function LocalTeamShifts({ orderId, teams, phases, canPlan }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [teamId, setTeamId] = useState("");
  const [open, setOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState<CrewShift | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelBusy = useRef(false);
  const cancelRequest = useRef<{ version: string; operationId: string } | null>(null);
  const internalTeams = teams.filter(t => t.kind === "interna");
  const queryKey = ["internal-team-shifts", companyId, orderId, day];
  const shifts = useQuery({ queryKey, enabled: !!companyId && validShiftDate(day) && canPlan, retry: false,
    queryFn: () => loadCrewShifts(client, config, companyId!, orderId, day, day), refetchOnWindowFocus: true });
  const roster = useQuery({ queryKey: ["internal-team-roster", companyId, teamId], enabled: !!companyId && !!teamId && open && canPlan, retry: false,
    queryFn: () => loadCrewSnapshot(client, config, companyId!, teamId) });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["internal-team-shifts", companyId] });
    void qc.invalidateQueries({ queryKey: ["campo-crew-agenda", companyId] });
  };
  const confirmCancel = async () => {
    if (!cancel || cancelBusy.current || !companyId || !canPlan) return;
    cancelBusy.current = true; setBusy(true); setCancelError(null);
    if (cancelRequest.current?.version !== cancel.version) cancelRequest.current = { version: cancel.version, operationId: crypto.randomUUID() };
    try {
      await saveCrewShift(client, config, { ...cancel, companyId, orderId, teamId: cancel.teamId,
        expectedVersion: cancel.version, operationId: cancelRequest.current.operationId, status: "cancelled" });
      invalidate(); setCancel(null); toast.success("Turno annullato. Lo storico è conservato.");
    } catch (e) { setCancelError(e instanceof Error ? e.message : "Annullamento non riuscito."); }
    finally { cancelBusy.current = false; setBusy(false); }
  };
  if (!canPlan) return null;
  return <section aria-label="Turni squadre interne" className="space-y-3 rounded-xl border bg-background p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Turni delle squadre interne</h3><p className="mt-1 text-xs text-muted-foreground">Collaudo locale · turni nell'agenda personale Campo. Ore, costi e incarichi operativi restano separati.</p></div>
      <Button size="sm" variant="outline" disabled={!internalTeams.length || !companyId || shifts.isPending || shifts.isError} onClick={() => { setTeamId(internalTeams[0]?.id ?? ""); setOpen(true); }}>Pianifica squadra</Button>
    </div>
    <label className="flex flex-wrap items-center gap-2 text-sm">Giorno<Input aria-label="Giorno dei turni" className="w-full min-w-0 sm:w-44" type="date" min="2000-01-01" max="2100-12-31" value={day} onChange={e => setDay(e.target.value)} /></label>
    {!validShiftDate(day) ? <p role="status" className="text-sm">Scegli un giorno valido.</p> : shifts.isPending ? <p role="status" className="text-sm">Caricamento turni…</p> : shifts.isError ? <div role="alert" className="space-y-2 text-sm"><p>Non è possibile caricare i turni. Il calendario non viene mostrato vuoto al posto di un errore.</p><Button variant="outline" size="sm" onClick={() => void shifts.refetch()}>Riprova caricamento turni</Button></div> : <>
      {!shifts.data?.length && <p className="text-sm text-muted-foreground">Nessun turno pianificato per questo giorno.</p>}
      {shifts.data?.map(s => <div key={s.shiftId} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
        <div className="min-w-0 flex-1 text-sm"><p className="break-words font-medium">{s.startTime}–{s.endTime} · {s.teamName}{s.status === "cancelled" ? " · Annullato" : ""}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.phaseId ? phases.find(p => p.id === s.phaseId)?.name ?? "Lavorazione non disponibile" : "Intera commessa"}</p>
          <p className="mt-1 break-words">{s.participants.filter(p => p.kind !== "excluded").map(p => `${p.name}${p.kind === "replacement" ? " (rinforzo)" : ""}${p.id === s.leaderEmployeeId ? " · referente" : ""}`).join(", ")}</p>
          {!!s.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{s.notes}</p>}
        </div>
        {s.status === "planned" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setCancel(s); setCancelError(null); }}>Annulla turno</Button>}
      </div>)}
    </>}
    {!internalTeams.length && <p className="text-sm text-muted-foreground">Crea prima una squadra interna e la sua composizione in Impostazioni → Calendari lavori → Squadre.</p>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl">
      <DialogHeader className="pr-6 text-left"><DialogTitle>Pianifica una squadra</DialogTitle><DialogDescription>Parti dalle persone abituali e adatta il turno alla giornata.</DialogDescription></DialogHeader>
      <label className="space-y-1 text-sm font-medium">Squadra interna<select aria-label="Squadra interna" className="flex h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm" disabled={busy} value={teamId} onChange={e => setTeamId(e.target.value)}>{internalTeams.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      {roster.isPending ? <p role="status">Caricamento composizione…</p> : roster.isError ? <div role="alert" className="space-y-2"><p>Composizione non disponibile.</p><Button variant="outline" onClick={() => void roster.refetch()}>Riprova composizione</Button></div> : roster.data && <InternalTeamShiftEditor key={`${companyId}:${orderId}:${teamId}:${generation}`} snapshot={roster.data} phases={phases} workDate={day} shifts={shifts.data ?? []} canPlan={canPlan}
        onReload={() => { void roster.refetch().then(r => { if (!r.isError) setGeneration(n => n + 1); }); }}
        onSave={async draft => {
          setBusy(true);
          try {
            await saveCrewShift(client, config, { ...draft, companyId: companyId!, orderId, teamId });
            setDay(draft.workDate); invalidate(); setOpen(false);
            toast.success("Turno pianificato", { description: "Costi, ore consuntive e accessi Campo invariati." });
          } finally { setBusy(false); }
        }} />}
    </DialogContent></Dialog>
    <Dialog open={!!cancel} onOpenChange={value => { if (!value && !busy) setCancel(null); }}><DialogContent><DialogHeader className="pr-6 text-left"><DialogTitle>Annullare il turno?</DialogTitle><DialogDescription>Lo storico resta disponibile. Non vengono cancellati rapportini, costi o accessi Campo già esistenti.</DialogDescription></DialogHeader>
      {cancelError && <p role="alert" className="text-sm text-destructive">{cancelError}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setCancel(null)}>Mantieni turno</Button><Button variant="destructive" disabled={busy} onClick={() => void confirmCancel()}>{busy ? "Annullamento…" : "Conferma annullamento"}</Button></div>
    </DialogContent></Dialog>
  </section>;
}

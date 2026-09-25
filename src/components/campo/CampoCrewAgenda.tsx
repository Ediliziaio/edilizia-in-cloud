import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, MapPin, RefreshCw, Users } from "lucide-react";
import { campoCrewAgendaEnabled, useCampoCrewAgenda } from "@/hooks/campo/useCampoCrewAgenda";
import { useCampoAssignments } from "@/hooks/campo/useCampoAssignments";
import { campoPlanningDate } from "@/lib/campo/crewAgenda";

/** Gate before mounting hooks: zero new RPCs on shared/remote backends. */
export function CampoCrewAgenda({ day }: { day?: string }) {
  return campoCrewAgendaEnabled ? <PersonalAgenda day={day} /> : null;
}

function PersonalAgenda({ day }: { day?: string }) {
  const [today, setToday] = useState(campoPlanningDate);
  useEffect(() => {
    const update = () => setToday(campoPlanningDate());
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const date = day ?? today;
  const agenda = useCampoCrewAgenda(date);
  const assignments = useCampoAssignments();
  const refresh = () => { void agenda.refetch(); void assignments.refetch(); };
  return <section aria-label="I miei turni di squadra" className="min-w-0 space-y-3 rounded-2xl border bg-background p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2">
      <div><h2 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4 shrink-0" />I miei turni di squadra</h2>
        <p className="mt-1 text-xs text-muted-foreground">{date === today ? "Oggi" : date.split("-").reverse().join("/")} · orari previsti, non ore lavorate · ora italiana</p>
      </div>
      <button type="button" onClick={refresh} disabled={agenda.isFetching || assignments.isFetching} aria-label="Aggiorna i miei turni" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {agenda.isPending ? <p role="status" className="text-sm">Caricamento dei tuoi turni…</p> : agenda.isError ? <div role="alert" className="space-y-2 text-sm">
      <p>Non riesco ad aggiornare i turni. La programmazione precedente potrebbe essere cambiata.</p>
      <button type="button" onClick={refresh} className="min-h-11 text-primary underline">Riprova agenda</button>
    </div> : !agenda.data?.length ? <p className="text-sm text-muted-foreground">Nessun turno di squadra per questo giorno. I cantieri assegnati restano disponibili nella loro sezione.</p> : <ol className="space-y-3">
      {agenda.data.map(shift => {
        const assignment = assignments.isSuccess ? assignments.data?.find(a => a.order_id === shift.orderId && a.order.company_id === shift.companyId) : undefined;
        const cancelled = shift.status === "cancelled";
        const operational = !!assignment && !cancelled;
        return <li key={shift.shiftId} className="min-w-0 space-y-2 rounded-xl border p-3">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4" />{shift.startTime}–{shift.endTime}
            {cancelled && <span className="rounded-full bg-muted px-2 py-1 text-xs">Annullato</span>}</p>
          <p className="break-words font-semibold">{shift.orderCode || "Cantiere programmato"}</p>
          {shift.orderDescription && <p className="break-words text-sm">{shift.orderDescription}</p>}
          {shift.address && <p className="flex items-start gap-1 text-xs text-muted-foreground"><MapPin className="h-4 w-4 shrink-0" /><span className="break-words">{shift.address}</span></p>}
          <p className="break-words text-sm text-muted-foreground">{shift.teamName} · {shift.phaseName || "Intera commessa"}</p>
          {shift.isReferente && <p className="text-xs text-muted-foreground">Sei il referente organizzativo del turno. I permessi da capocantiere restano separati.</p>}
          {operational ? <div className="flex flex-wrap gap-2">
            <Link className="flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" to={`/campo/lavoro/${shift.orderId}`}>Apri cantiere</Link>
            {date === today && <Link className="flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold" to={`/campo/timbratura?order_id=${encodeURIComponent(shift.orderId)}`}>Vai alla timbratura</Link>}
          </div> : !cancelled && <p role="status" className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{assignments.isPending || assignments.isError ? "Accessi non verificati: aggiorna prima di aprire il cantiere." : "Accesso operativo da attivare: chiedi all'ufficio l'incarico Campo. Il turno non abilita da solo timbrature e rapportini."}</p>}
        </li>;
      })}
    </ol>}
  </section>;
}

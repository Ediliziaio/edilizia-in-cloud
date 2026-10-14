import {useMemo, useState, type ReactNode} from "react";
import {ChevronDown, Truck} from "lucide-react";
import type {ExecutorOption, PhaseAssignment, WorkPhase, AssignmentSource} from "@/hooks/useOrderWorkPhases";
import type {SquadraInCommessa} from "@/hooks/useOperai";
import type {MezzoDellaPersona} from "@/hooks/useCantiereLogistica";
import {assignmentName, teamWorkPlan, type TeamWorkGroup} from "@/lib/orders/teamWorkPlan";
import {planningDay} from "@/lib/orders/planning";
import {formatDateIt} from "@/lib/formatters";
import {WorkAssignmentRow, ElencoAssegnazioni, type AssignmentPatch} from "./WorkAssignmentRow";
import {SquadreFase} from "@/components/manodopera/SquadreCommessa";
import {cn} from "@/lib/utils";

interface Props {
  orderId: string;
  phases: WorkPhase[];
  unassigned: PhaseAssignment[];
  allAssignments?: PhaseAssignment[];
  crews: SquadraInCommessa[];
  equipment: MezzoDellaPersona[];
  employees: ExecutorOption[];
  externalTeams: ExecutorOption[];
  canManageCrews: boolean;
  generalCrews?: ReactNode;
  renderAddAssignment: (phaseId: string) => ReactNode;
  onUpdate: (id: string, source: AssignmentSource, patch: AssignmentPatch) => Promise<unknown>;
  onDelete: (id: string, source: AssignmentSource) => Promise<unknown>;
}

/** Operational overview, not a second cost ledger or permission system. */
export function TeamAssignmentPlan(props: Props) {
  const {orderId, phases, unassigned, allAssignments, crews, equipment, employees, externalTeams} = props;
  const groups = useMemo(() => teamWorkPlan(phases, unassigned, crews, equipment, allAssignments), [phases, unassigned, crews, equipment, allAssignments]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const options = phases.map(p => ({id: p.id, name: p.name}));
  const date = (day: string | null) => planningDay(day) ? formatDateIt(day!) : "Da definire";
  const names = (group: TeamWorkGroup) => [...new Set([
    ...group.assignments.map(a => `${assignmentName(a, employees, externalTeams)}${a.executor_inactive ? " (storico)" : ""}`),
    ...group.crews.map(c => `${c.nome} (${c.componenti.length} persone)`),
  ])];
  const rows = (group: TeamWorkGroup) => <>
    {group.assignments.length > 0 && <ElencoAssegnazioni compact>{group.assignments.map(a => <WorkAssignmentRow key={`${a.source}:${a.id}`} compact assignment={a} employees={employees} externalTeams={externalTeams} phases={options} onUpdate={patch => props.onUpdate(a.id, a.source, patch)} onDelete={() => props.onDelete(a.id, a.source)} />)}</ElencoAssegnazioni>}
    {group.equipment.length > 0 && <ul className="space-y-1 text-xs text-muted-foreground" aria-label="Mezzi al seguito delle persone">{group.equipment.map(m => <li key={m.id} className="flex gap-2"><Truck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{m.nome} · {m.persona}{m.a_bordo.length ? ` · a bordo: ${m.a_bordo.join(", ")}` : ""}{m.altrove && <span className="font-medium text-amber-800"> · risulta su {m.altrove}</span>}</span></li>)}</ul>}
  </>;
  const general = groups[0];
  const hasGeneral = general.assignments.length || general.crews.length || general.equipment.length;
  return <section aria-label="Persone e squadre per lavorazione" className="space-y-3">
    {hasGeneral > 0 && <section aria-label="Risorse per tutta la commessa" className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Per tutta la commessa</h3>
      <p className="text-xs text-muted-foreground">Assegnazioni generali, non legate a una singola lavorazione.</p>
      {props.generalCrews}{rows(general)}
    </section>}
    {groups.length > 1 && <>
      <div><h3 className="text-sm font-semibold">Chi esegue le lavorazioni</h3><p className="mt-1 text-xs text-muted-foreground">Apri una riga per assegnare persone o squadre. Le date si gestiscono in Lavorazioni.</p></div>
      <div className="divide-y overflow-hidden rounded-lg border">
        {groups.slice(1).map(group => {
          const fase = group.phase, assigned = names(group);
          const id = `risorse-fase-${orderId}-${group.id}`;
          return <div key={group.id}>
            <button type="button" aria-expanded={!!open[group.id]} aria-controls={id} aria-label={`Risorse per ${fase?.name ?? "lavorazione non disponibile"}`} className="flex min-h-14 w-full items-start gap-3 px-3 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-600" onClick={() => setOpen(v => ({...v, [group.id]: !v[group.id]}))}>
              <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-semibold">{fase?.name ?? "Lavorazione non disponibile"}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-muted-foreground">{fase?.status === "completata" ? "Completata" : fase?.status === "in_corso" ? "In corso" : fase ? "Da iniziare" : "Collegamento da verificare"}</span></span>
                <span className={cn("mt-1 block break-words text-xs", assigned.length ? "text-slate-600" : "text-amber-800")}>{assigned.length ? assigned.join(" · ") : "Nessuna assegnazione specifica"}</span>
                {fase && <span className="mt-1 block text-[11px] text-muted-foreground md:hidden">{date(fase.start_date)} → {date(fase.end_date)}</span>}
              </span>{fase && <span className="hidden shrink-0 pt-1 text-[11px] text-muted-foreground md:block">{date(fase.start_date)} → {date(fase.end_date)}</span>}<ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open[group.id] && "rotate-180")} aria-hidden="true" />
            </button>
            {open[group.id] && <div id={id} className="space-y-3 border-t bg-slate-50/40 p-3">
              {fase && <div className="flex flex-wrap items-center gap-2"><SquadreFase orderId={orderId} fase={{id: fase.id, name: fase.name}} modificabile={props.canManageCrews} />{props.renderAddAssignment(fase.id)}</div>}
              {group.crews.map(c => <p key={c.squadra_id} className="break-words text-xs text-muted-foreground">{c.nome}: {c.componenti.length ? c.componenti.map(p => `${p.nome} ${p.cognome}`).join(", ") : "nessun componente"}{c.responsabile ? ` · referente ${c.responsabile.nome} ${c.responsabile.cognome}` : ""}{c.finita ? " · assegnazione terminata" : ""}</p>)}
              {rows(group)}
            </div>}
          </div>;
        })}
      </div>
    </>}
    {!hasGeneral && groups.length === 1 && <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nessuna risorsa assegnata. Aggiungi una persona o una squadra alla commessa.</p>}
  </section>;
}

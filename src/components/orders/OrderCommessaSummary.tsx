import type { ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronRight, HardHat, ListChecks } from "lucide-react";
import { format, isBefore, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  statusName?: string;
  statusColor?: string | null;
  progress?: { total: number; done: number; inCorso: number; avgPct: number | null };
  progressLoading?: boolean;
  progressError?: boolean;
  workStartDate?: string | null;
  workEndDate?: string | null;
  expectedDate?: string | null;
  nextTask?: {
    title: string;
    due_date: string | null;
    assigned?: { first_name?: string | null; last_name?: string | null } | null;
  } | null;
  taskLoading?: boolean;
  taskError?: boolean;
  onOpenWork: () => void;
  onOpenPlanning: () => void;
  onOpenTasks: () => void;
  children: ReactNode;
}

function dateLabel(value?: string | null) {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : format(date, "d MMM yyyy", { locale: it });
}

const cellClass = "min-w-0 p-3 text-left sm:p-4";
const linkClass = `${cellClass} group flex flex-col items-stretch justify-start transition-colors hover:bg-orange-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`;
const labelClass = "flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[#173b67] [&>svg:first-child]:text-orange-500";

/** A read-only overview shared by every tab. Actions reuse the page's navigation
 * and status controls; no duplicate fetching, financial formulas or mutations. */
export function OrderCommessaSummary({
  statusName, statusColor, progress, progressLoading, progressError,
  workStartDate, workEndDate, expectedDate, nextTask, taskLoading, taskError,
  onOpenWork, onOpenPlanning, onOpenTasks, children,
}: Props) {
  const hasPhases = !!progress?.total;
  const percent = Math.round(Math.min(100, Math.max(0, progress?.avgPct ?? 0)));
  const start = dateLabel(workStartDate);
  const end = dateLabel(workEndDate);
  const installation = dateLabel(expectedDate);
  const due = dateLabel(nextTask?.due_date);
  const overdue = !!due && isBefore(parseISO(nextTask!.due_date!), startOfDay(new Date()));
  const assignee = [nextTask?.assigned?.first_name, nextTask?.assigned?.last_name].filter(Boolean).join(" ");

  return (
    <section aria-label="Riepilogo commessa" className="overflow-hidden rounded-xl border border-slate-200 border-t-2 border-t-orange-400 bg-white shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-slate-100 lg:grid-cols-4">
        <div className={cellClass}>
          <p className={labelClass}>Stato commessa</p>
          <p className="mt-2 flex items-start gap-2 text-sm font-semibold text-slate-900 sm:text-base">
            <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: statusColor || "#64748b" }} />
            <span className="min-w-0 break-words">{statusName || "Stato non impostato"}</span>
          </p>
          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">Stato generale della commessa</p>
        </div>
        <button type="button" onClick={onOpenWork} className={linkClass} aria-label="Apri lavorazioni e squadra">
          <span className={labelClass}><HardHat className="h-3.5 w-3.5 shrink-0" /> Lavorazioni <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" /></span>
          <span className="mt-2 block text-sm font-semibold text-slate-900 sm:text-base">
            {progressError ? "Dati non disponibili" : progressLoading ? "Caricamento…" : hasPhases ? `${percent}% avanzamento` : "Senza fasi"}
          </span>
          {!progressError && !progressLoading && hasPhases ? <>
            <span className="mt-1 block text-xs text-muted-foreground">{progress!.done}/{progress!.total} completate{progress!.inCorso > 0 ? ` · ${progress!.inCorso} in corso` : ""}</span>
            <span role="progressbar" aria-label="Avanzamento medio lavorazioni" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-orange-500" style={{ width: `${percent}%` }} />
            </span>
          </> : <span className="mt-1 hidden text-xs text-muted-foreground sm:block">Squadra e lavoro diretto</span>}
        </button>
        <button type="button" onClick={onOpenPlanning} className={`${linkClass} border-t border-slate-100 lg:border-t-0`} aria-label="Apri date e pianificazione">
          <span className={labelClass}><CalendarDays className="h-3.5 w-3.5 shrink-0" /> Date lavori <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" /></span>
          <span className="mt-2 block text-sm font-semibold text-slate-900 sm:text-base">
            {end ? `Fine ${end}` : installation ? `Posa ${installation}` : start ? `Inizio ${start}` : "Da pianificare"}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {end || installation ? (start ? `Inizio ${start}` : "Inizio non impostato") : start ? "Fine non impostata" : "Nessuna data impostata"}
          </span>
        </button>
        <button type="button" onClick={onOpenTasks} className={`${linkClass} border-t border-slate-100 lg:border-t-0`} aria-label="Apri attività della commessa">
          <span className={labelClass}><ListChecks className="h-3.5 w-3.5 shrink-0" /> Prossima attività <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0" /></span>
          <span className="mt-2 line-clamp-2 break-words text-sm font-semibold text-slate-900 sm:text-base">
            {taskError ? "Dati non disponibili" : taskLoading ? "Caricamento…" : nextTask?.title || "Nessuna attività aperta"}
          </span>
          <span className={`mt-1 text-xs ${!nextTask && !taskError && !taskLoading ? "hidden sm:block" : "block"} ${overdue && !taskError && !taskLoading ? "font-medium text-red-700" : "text-muted-foreground"}`}>
            {taskError || taskLoading ? "Apri l’elenco attività" : nextTask ? [due ? `${overdue ? "Scaduta il" : "Entro il"} ${due}` : "Senza scadenza", assignee].filter(Boolean).join(" · ") : "Pianifica dalle azioni rapide"}
          </span>
        </button>
      </div>
      <details className="group/status border-t border-slate-100">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:min-h-8 sm:px-4 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/status:rotate-180" />
          Stato e storico
        </summary>
        <div id="section-stato" className="scroll-mt-24 space-y-4 border-t border-slate-100 p-3 sm:p-4">{children}</div>
      </details>
    </section>
  );
}

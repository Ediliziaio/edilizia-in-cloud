import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Plus, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDashboardAgenda } from "@/hooks/useDashboardAgenda";
import { AGENDA_LAYERS, buildDashboardAgenda, readAgendaLayers, type AgendaItem, type ToggleAgendaLayer } from "@/lib/attivita/dashboardAgenda";
import type { DashboardTask } from "@/lib/attivita/dashboardTasks";
import type { TaskStatusDefinition } from "@/lib/taskStatuses";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  tasks: DashboardTask[];
  tasksLoading?: boolean;
  tasksError?: boolean;
  onTasksRetry: () => void;
  statuses: TaskStatusDefinition[];
  selectedDate: string | null;
  onDateSelect: (date: string | null) => void;
  onAddTask: (date: string) => void;
  onTaskOpen: (id: string) => void;
}

export function DashboardAgenda({ tasks, tasksLoading, tasksError, onTasksRetry, statuses, selectedDate, onDateSelect, onAddTask, onTaskOpen }: Props) {
  const { user, effectiveCompany } = useAuth();
  const userId = user?.id;
  const p = usePermissions();
  const mobile = useIsMobile();
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<"mese" | "settimana" | "giorno">(mobile ? "giorno" : "mese");
  const prefKey = `agenda-dashboard-personal-v3:${effectiveCompany?.id}:${user?.id}`;
  const [layers, setLayers] = useState(() => {
    try { return readAgendaLayers(localStorage.getItem(prefKey)); } catch { return readAgendaLayers(null); }
  });
  const anchor = selectedDate ? parseISO(selectedDate) : cursor;
  const fromDate = view === "mese" ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }) : view === "settimana" ? startOfWeek(anchor, { weekStartsOn: 1 }) : anchor;
  const toDate = view === "mese" ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) : view === "settimana" ? endOfWeek(anchor, { weekStartsOn: 1 }) : anchor;
  const from = format(fromDate, "yyyy-MM-dd");
  const to = format(toDate, "yyyy-MM-dd");
  const source = useDashboardAgenda(from, to, layers);
  const calendar = useMemo(() => buildDashboardAgenda({
    tasks: layers.has("task") ? tasks.filter(task => !!userId && task.assigned_to === userId) : [],
    orders: p.canViewOrders && layers.has("order") ? source.orders.data ?? [] : [],
    deadlines: [],
    appointments: p.canViewMarketingAppointments && layers.has("appointment") ? (source.appointments.data ?? []).filter(a => !!userId && a.assigned_to === userId) : [],
    leaves: layers.has("leave") ? (source.leaves.data ?? []).filter(a => !!userId && (a.user_id === userId || a.profilo?.user_id === userId)) : [],
    holidays: source.holidays.data ?? [], from, to, statuses,
  }), [tasks, layers, userId, p.canViewOrders, p.canViewMarketingAppointments, source.orders.data, source.appointments.data, source.leaves.data, source.holidays.data, from, to, statuses]);
  const visible: ToggleAgendaLayer[] = ["task", ...(p.canViewOrders ? ["order" as const] : []), ...(p.canViewMarketingAppointments ? ["appointment" as const] : []), "leave"];
  const errors = [
    { label: "Attività", error: tasksError && layers.has("task"), retry: onTasksRetry },
    { label: "Le mie commesse", error: p.canViewOrders && layers.has("order") && source.orders.isError, retry: source.orders.refetch },
    { label: "I miei appuntamenti", error: p.canViewMarketingAppointments && layers.has("appointment") && source.appointments.isError, retry: source.appointments.refetch },
    { label: "Le mie assenze", error: layers.has("leave") && source.leaves.isError, retry: source.leaves.refetch },
    { label: "Chiusure aziendali", error: source.holidays.isError, retry: source.holidays.refetch },
  ].filter(e => e.error);
  const loading = p.isLoading || (layers.has("task") && tasksLoading) || Object.values(source).some(q => q.isLoading || q.isFetching);
  const days = eachDayOfInterval({ start: fromDate, end: toDate });
  const selectedKey = format(anchor, "yyyy-MM-dd");
  const selectedItems = calendar.items.get(selectedKey) ?? [];
  const toggle = (layer: ToggleAgendaLayer) => {
    const next = new Set(layers);
    if (next.has(layer)) next.delete(layer); else next.add(layer);
    setLayers(next);
    try { localStorage.setItem(prefKey, JSON.stringify([...next])); } catch { /* Preferenza locale facoltativa. */ }
  };
  const select = (date: Date) => { setCursor(date); onDateSelect(format(date, "yyyy-MM-dd")); };
  const navigate = (direction: -1 | 1) => {
    const next = view === "mese" ? addMonths(cursor, direction) : addDays(anchor, direction * (view === "settimana" ? 7 : 1));
    setCursor(next);
    onDateSelect(view === "mese" ? null : format(next, "yyyy-MM-dd"));
  };
  const label = view === "mese" ? format(cursor, "MMMM yyyy", { locale: it }) : view === "settimana" ? `${format(fromDate, "d MMM", { locale: it })} – ${format(toDate, "d MMM yyyy", { locale: it })}` : format(anchor, "EEEE d MMMM", { locale: it });
  const eventRow = (item: AgendaItem) => {
    const cfg = AGENDA_LAYERS[item.layer];
    const contents = <><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", cfg.dot)} /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{item.time && <span className="mr-2 font-mono text-xs text-teal-700">{item.time}</span>}{item.title}</span><span className="text-xs text-muted-foreground">{cfg.singular}{item.taskId && " · Apri i dettagli"}</span></span>{(item.href || item.taskId) && <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}</>;
    const cls = "flex w-full items-start gap-2 rounded-lg border bg-card p-2.5 text-left transition-colors hover:bg-muted/40";
    return item.taskId ? <button key={item.id} className={cls} onClick={() => onTaskOpen(item.taskId!)} aria-label={`Apri attività: ${item.title}`}>{contents}</button>
      : item.href ? <Link key={item.id} to={item.href} className={cls}>{contents}</Link>
        : <div key={item.id} className={cls}>{contents}</div>;
  };

  return <Card data-testid="dashboard-agenda" className="min-w-0">
    <CardHeader className="space-y-2 p-4 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="h-4 w-4" />Agenda personale</h2><p className="mt-1 text-xs text-muted-foreground">I tuoi impegni e le tue scadenze. Seleziona un giorno per filtrare le tue attività.</p></div>
        {p.canViewCalendar && <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs"><Link to="/azienda/calendario"><ExternalLink className="h-3 w-3" />Calendario lavori</Link></Button>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg bg-muted p-1" aria-label="Vista dell’agenda">{(["mese", "settimana", "giorno"] as const).map(v => <button key={v} aria-pressed={view === v} className={cn("rounded-md px-2.5 py-1.5 text-xs capitalize", view === v ? "bg-card font-medium shadow-sm" : "text-muted-foreground")} onClick={() => setView(v)}>{v}</button>)}</div>
        <div className="flex items-center gap-1"><Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => select(new Date())}>Oggi</Button><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Periodo precedente" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button><p className="min-w-0 px-1 text-center text-sm font-semibold capitalize" aria-live="polite">{label}</p><Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Periodo successivo" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button></div>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label="Fonti dell’agenda">{visible.map(layer => <button key={layer} aria-pressed={layers.has(layer)} onClick={() => toggle(layer)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium", layers.has(layer) ? AGENDA_LAYERS[layer].tone : "border-border text-muted-foreground")}><span className={cn("h-1.5 w-1.5 rounded-full", layers.has(layer) ? AGENDA_LAYERS[layer].dot : "bg-muted-foreground/40")} />{AGENDA_LAYERS[layer].label}</button>)}</div>
      <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Da dove arrivano questi eventi?</summary><div className="mt-2 space-y-1.5 rounded-lg border bg-muted/20 p-3"><p>Qui vedi le attività e gli appuntamenti assegnati a te, insieme alle tue assenze approvate. Vale anche se sei amministratore.</p><p>Le mie commesse comprende le commesse di cui sei responsabile e quelle assegnate a te tramite squadre o fasi di lavoro. Le date sono quelle della commessa; le pose indicano gli intervalli programmati.</p><p>Le chiusure aziendali sono comuni a tutti. Le priorità del team sono separate e visibili con il permesso di vedere le attività del team.</p>{p.canViewScadenzario && <p>Incassi e pagamenti appartengono allo <Link to="/azienda/scadenzario" className="font-medium text-primary underline">scadenzario aziendale</Link>, disponibile con i relativi permessi.</p>}</div></details>
    </CardHeader>
    <CardContent className="space-y-3 p-4 pt-0">
      {errors.map(e => <div key={e.label} role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-2.5 text-xs"><AlertCircle className="h-4 w-4 text-destructive" /><span className="min-w-0 flex-1">{e.label} non disponibili. Gli altri eventi restano visibili.</span><Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => e.retry()}>Riprova {e.label.toLowerCase()}</Button></div>)}
      {loading && <p role="status" className="text-xs text-muted-foreground">Aggiornamento agenda…</p>}
      {p.isLoading ? <Skeleton className="h-64 w-full" /> : view === "mese" ? <>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Giorni del mese">
          {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(name => <span key={name} className="pb-1 text-center text-[10px] font-medium uppercase text-muted-foreground">{name}</span>)}
          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const items = calendar.items.get(key) ?? [];
            const count = items.filter(i => i.layer === "task").length;
            const poses = calendar.poses.get(key) ?? 0;
            const selected = selectedDate === key;
            return <button key={key} onClick={() => select(day)} aria-pressed={selected} aria-label={`${format(day, "EEEE d MMMM yyyy", { locale: it })}: ${count} attività, ${items.length - count} altri eventi${poses ? `, ${poses} pose nel periodo` : ""}`} className={cn("tap-compact flex h-24 min-w-0 flex-col overflow-hidden rounded-lg border p-1.5 text-left", selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border/60 hover:bg-muted/40", !isSameMonth(day, cursor) && "opacity-40", day.getDay() % 6 === 0 && !selected && "bg-muted/30")}>
              <span className={cn("mb-1 inline-flex h-6 w-6 shrink-0 items-center justify-center self-start rounded-full text-xs font-medium", isToday(day) && "bg-primary text-primary-foreground")}>{format(day, "d")}</span>
              <div className="min-h-0 flex-1 space-y-1 overflow-hidden">{items.slice(0, mobile ? 0 : 2).map(item => <p key={item.id} title={item.title} className="flex items-center gap-1 text-[10px] leading-tight"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", AGENDA_LAYERS[item.layer].dot)} /><span className="truncate">{item.time && `${item.time} `}{item.title}</span></p>)}{mobile && items.length > 0 && <span className="text-xs font-medium text-primary">{items.length}</span>}{items.length > 2 && !mobile && <span className="block text-[10px] text-muted-foreground">+{items.length - 2} eventi</span>}</div>
              {poses > 0 && <span className="mt-1 truncate text-[9px] text-emerald-700">{poses} {poses === 1 ? "posa" : "pose"}</span>}
            </button>;
          })}
        </div>
        <section aria-label="Eventi del giorno selezionato" className="border-t pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold capitalize">{format(anchor, "EEEE d MMMM", { locale: it })}</h3><p className="text-xs text-muted-foreground">{selectedItems.length} eventi dalle fonti attive{calendar.poses.get(selectedKey) ? ` · ${calendar.poses.get(selectedKey)} pose nel periodo` : ""}</p></div>{!p.solaLettura && <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => onAddTask(selectedKey)}><Plus className="h-3 w-3" />Nuova attività</Button>}</div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">{selectedItems.map(eventRow)}{!loading && errors.length === 0 && selectedItems.length === 0 && <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">Nessun evento dalle fonti attive per questo giorno.</p>}</div>
        </section>
      </> : <div className="max-h-[640px] space-y-3 overflow-y-auto">{days.map(day => {
        const key = format(day, "yyyy-MM-dd");
        const items = calendar.items.get(key) ?? [];
        return <section key={key} className="space-y-2 rounded-lg border bg-muted/10 p-3" aria-label={format(day, "EEEE d MMMM", { locale: it })}><div className="flex flex-wrap items-center justify-between gap-2"><button onClick={() => select(day)} className="text-left text-sm font-semibold capitalize text-primary">{format(day, "EEEE d MMMM", { locale: it })}</button><span className="text-xs text-muted-foreground">{items.length} eventi</span>{!p.solaLettura && <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onAddTask(key)}><Plus className="h-3 w-3" />Attività</Button>}</div>{calendar.poses.get(key) ? <p className="text-xs text-emerald-700">{calendar.poses.get(key)} pose programmate in questo giorno</p> : null}{items.map(eventRow)}{!loading && items.length === 0 && <p className="text-xs text-muted-foreground">{errors.length ? "Alcune fonti non sono disponibili." : "Nessun evento dalle fonti attive."}</p>}</section>;
      })}</div>}
    </CardContent>
  </Card>;
}

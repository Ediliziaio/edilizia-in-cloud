/**
 * AdminAttivita — pagina "Attività" unificata per Super Admin.
 *
 * Tabs:
 *   1. "Dashboard"          — header saluto + Meteo + Mini Calendario + Le mie
 *                             attività + Task del Team (vista riassuntiva)
 *   2. "Tutte le attività"  — gestore completo task (filtri avanzati, bulk
 *                             actions, raggruppamenti, creazione) tramite
 *                             riuso di <AdminCSTasks />
 *
 * Sostituisce la doppia voce sidebar "Attività" + "Task CS" — la gestione
 * completa è ora un tab dentro Attività, evitando duplicazioni di codice e
 * di voci sidebar.
 *
 * Source dati: `cs_tasks` (entrambi i tab).
 * Permission gate: `can_manage_companies`.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  format,
  isToday,
  isBefore,
  startOfDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  CloudSun, ChevronLeft, ChevronRight, CalendarDays, Droplets,
  MapPin, ClipboardCheck, AlertCircle, Circle, ArrowUpCircle, Users,
  CheckCircle2, ExternalLink, Loader2, ListChecks, LayoutDashboard, Plus,
  Clock, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NewTaskDialog, type TaskTypeValue } from "@/components/admin/tasks/NewTaskDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import {
  useWeatherForecast,
  weatherCodeToEmoji,
  weatherCodeToLabel,
  type WeatherDay,
} from "@/hooks/useWeatherForecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

// Lazy load del gestore completo task — evita di pagare il bundle iniziale
// quando l'admin è solo sul tab "Dashboard".
const AdminCSTasks = lazy(() => import("@/pages/admin/AdminCSTasks"));

// ─── Constants ────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string; icon: typeof Circle }> = {
  high:   { label: "Alta",     dotClass: "bg-red-500",    badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
  medium: { label: "Normale",  dotClass: "bg-blue-500",   badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: ArrowUpCircle },
  low:    { label: "Bassa",    dotClass: "bg-slate-400",  badgeClass: "bg-muted text-muted-foreground", icon: Circle },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  todo:        { label: "Da fare",    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: "In corso",   className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  completed:   { label: "Completata", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
};

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Default location piattaforma (Milano) — non c'è una sede aziendale unica
// per il super admin. Si potrebbe rendere configurabile in `platform_settings`.
const DEFAULT_LAT = 45.4654;
const DEFAULT_LNG = 9.1859;
const DEFAULT_CITY = "Milano";

interface CSTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  company_id: string | null;
  completed_at: string | null;
  created_at: string;
  task_type: string | null;
}

// ─── Header ───────────────────────────────────────────────────────────────
function AdminAttivitaHeader() {
  const { profile } = useAuth();
  const oggi = format(new Date(), "EEEE d MMMM yyyy", { locale: it });
  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";
  // first_name può essere il prefix dell'email da auto-provisioning
  // (es. "flo.andriciuc"): per il saluto basta il primo segmento, capitalizzato.
  const rawNome = profile?.first_name || "Admin";
  const nome = (rawNome.split(/[._-]/)[0] || rawNome).replace(/^./, (c) => c.toUpperCase());

  return (
    <div>
      <p className="text-muted-foreground text-xs sm:text-sm capitalize">{oggi}</p>
      <h1 className="text-xl sm:text-2xl font-bold">
        {saluto}, {nome}
      </h1>
    </div>
  );
}

// ─── Meteo Widget ─────────────────────────────────────────────────────────
function AdminMeteoWidget() {
  const { data: weatherMap, isLoading, isError, refetch } = useWeatherForecast(DEFAULT_LAT, DEFAULT_LNG);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayWeather = weatherMap?.get(todayStr);

  const forecastDays = useMemo(() => {
    if (!weatherMap) return [];
    const result: { date: string; weather: WeatherDay }[] = [];
    weatherMap.forEach((w, d) => {
      if (d !== todayStr) result.push({ date: d, weather: w });
    });
    return result.slice(0, 3);
  }, [weatherMap, todayStr]);

  if (!weatherMap && isLoading) {
    return <Card><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>;
  }
  if (!todayWeather) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <CloudSun className="h-8 w-8 mx-auto mb-1 opacity-40" />
          <p>Meteo non disponibile</p>
          {isError && (
            <button onClick={() => refetch()} className="mt-2 text-xs text-primary underline">
              Riprova
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 p-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl leading-none">{weatherCodeToEmoji(todayWeather.code)}</span>
          <div className="min-w-0">
            <p className="text-lg font-bold leading-none">
              {todayWeather.maxTemp}°<span className="text-xs font-normal text-muted-foreground"> / {todayWeather.minTemp}°</span>
            </p>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="h-2.5 w-2.5 shrink-0" />{DEFAULT_CITY} · {weatherCodeToLabel(todayWeather.code)}
            </p>
          </div>
          {todayWeather.precip > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-blue-600 dark:text-blue-400">
              <Droplets className="h-3 w-3" />{todayWeather.precip}mm
            </span>
          )}
          {forecastDays.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              {forecastDays.map(({ date, weather }) => (
                <div key={date} className="flex items-center gap-1 text-[10px]">
                  <span className="capitalize text-muted-foreground">{format(new Date(date), "EEE", { locale: it })}</span>
                  <span className="text-base leading-none">{weatherCodeToEmoji(weather.code)}</span>
                  <span className="font-medium tabular-nums">{weather.maxTemp}°</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Mini Calendario ──────────────────────────────────────────────────────
function AdminMiniCalendario({ tasks, onAddTask }: { tasks: CSTask[]; onAddTask?: (dateIso: string) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, CSTask[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const key = t.due_date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    let startDow = getDay(monthStart);
    startDow = startDow === 0 ? 6 : startDow - 1;
    return { allDays, padding: startDow };
  }, [monthStart, monthEnd]);

  const selectedTasks = useMemo(() => {
    if (!selectedDate) return [];
    return tasksByDate.get(format(selectedDate, "yyyy-MM-dd")) ?? [];
  }, [selectedDate, tasksByDate]);

  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />Calendario
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="grid grid-cols-7 mb-1">
          {GIORNI_SETTIMANA.map((g) => (
            <div key={g} className="text-center text-[10px] font-semibold text-muted-foreground py-1 uppercase">{g}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: days.padding }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.allDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) ?? [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentDay = isToday(day);
            const isPast = isBefore(day, today) && !isCurrentDay;
            return (
              <TooltipProvider key={key} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "relative aspect-square flex flex-col items-center justify-center rounded-md text-sm transition-all hover:bg-muted/60",
                        isSelected ? "bg-primary text-primary-foreground font-bold shadow-sm"
                        : isCurrentDay ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/30"
                        : isPast ? "text-muted-foreground/60" : "text-foreground"
                      )}
                    >
                      <span className="text-xs leading-none">{format(day, "d")}</span>
                      {dayTasks.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayTasks.slice(0, 3).map((t, i) => {
                            const cfg = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.medium;
                            const isDone = t.status === "completed";
                            return <div key={i} className={cn("w-1 h-1 rounded-full", isDone ? "bg-green-400" : cfg.dotClass)} />;
                          })}
                          {dayTasks.length > 3 && <span className="text-[8px] leading-none text-muted-foreground">+{dayTasks.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {dayTasks.length > 0 && (
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <p className="font-medium text-xs mb-1">
                        {format(day, "d MMMM", { locale: it })} — {dayTasks.length} attività
                      </p>
                      {dayTasks.slice(0, 4).map((t) => (
                        <p key={t.id} className="text-xs text-muted-foreground truncate">• {t.title}</p>
                      ))}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
        {selectedDate && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isToday(selectedDate) ? "Oggi" : format(selectedDate, "d MMMM", { locale: it })}
                {selectedTasks.length > 0 && ` — ${selectedTasks.length} attività`}
              </p>
              {onAddTask && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 text-[11px] text-primary hover:text-primary"
                  onClick={() => onAddTask(format(selectedDate, "yyyy-MM-dd"))}
                >
                  <Plus className="h-3 w-3" /> Nuovo
                </Button>
              )}
            </div>
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessuna scadenza per questo giorno</p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {selectedTasks.map((t) => {
                  const cfg = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.medium;
                  const isDone = t.status === "completed";
                  return (
                    <div key={t.id} className={cn("flex items-center gap-2 text-xs rounded px-2 py-1.5", isDone ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/50")}>
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", isDone ? "bg-green-500" : cfg.dotClass)} />
                      <span className={cn("flex-1 truncate", isDone && "line-through text-muted-foreground")}>{t.title}</span>
                      <Badge className={cn("text-[9px] px-1 py-0", isDone ? "bg-green-100 text-green-700" : cfg.badgeClass)}>
                        {isDone ? "Fatto" : cfg.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Le mie attività ──────────────────────────────────────────────────────
function MieAttivitaAdmin({
  tasks, onComplete, onCreateTask, onEdit, onDelete, onSetStatus,
}: {
  tasks: CSTask[];
  onComplete: (id: string) => void;
  onCreateTask: () => void;
  onEdit: (task: CSTask) => void;
  onDelete: (task: CSTask) => void;
  onSetStatus: (id: string, status: string) => void;
}) {
  const [filter, setFilter] = useState<"open" | "today" | "overdue" | "all">("open");
  const today = startOfDay(new Date());

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "all") return true;
      if (filter === "open") return t.status !== "completed";
      if (filter === "today") {
        if (!t.due_date || t.status === "completed") return false;
        return isToday(new Date(t.due_date));
      }
      if (filter === "overdue") {
        if (!t.due_date || t.status === "completed") return false;
        return isBefore(new Date(t.due_date), today);
      }
      return true;
    });
  }, [tasks, filter, today]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4" />Le mie attività
            {filtered.length > 0 && <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={onCreateTask}
            >
              <Plus className="h-3 w-3" /> <span className="hidden sm:inline">Nuovo</span>
            </Button>
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Aperte</SelectItem>
                <SelectItem value="today">Oggi</SelectItem>
                <SelectItem value="overdue">In ritardo</SelectItem>
                <SelectItem value="all">Tutte</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm mb-3">
              {filter === "today" ? "Nessuna scadenza oggi" : filter === "overdue" ? "Nessuna in ritardo 🎉" : "Nessuna attività"}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onCreateTask}>
              <Plus className="h-3 w-3" /> Crea il primo task
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {filtered.map((t) => {
              const cfg = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.medium;
              const stCfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.todo;
              const scaduta = t.due_date && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date));
              const isDone = t.status === "completed";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm group",
                    scaduta && !isDone ? "border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10" : "hover:bg-muted/30"
                  )}
                >
                  <button
                    onClick={() => !isDone && onComplete(t.id)}
                    className={cn(
                      "shrink-0 w-4 h-4 rounded-full border-2 transition-colors flex items-center justify-center",
                      isDone ? "bg-green-500 border-green-500" : "border-muted-foreground/40 hover:border-primary"
                    )}
                    aria-label={isDone ? "Già completata" : "Segna come completata"}
                  >
                    {isDone && <CheckCircle2 className="h-3 w-3 text-white" />}
                  </button>
                  <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotClass)} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium text-sm truncate", isDone && "line-through text-muted-foreground")}>{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={cn("text-[9px] px-1 py-0", stCfg.className)}>{stCfg.label}</Badge>
                      {t.due_date && (
                        <span className={cn(
                          "text-[10px]",
                          scaduta && !isDone ? "text-red-500 font-semibold"
                          : isToday(new Date(t.due_date)) ? "text-amber-600"
                          : "text-muted-foreground"
                        )}>
                          {isToday(new Date(t.due_date)) ? "Oggi" : format(new Date(t.due_date), "d MMM", { locale: it })}
                        </span>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 text-muted-foreground hover:text-foreground transition-opacity p-1 rounded"
                        aria-label="Azioni attività"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => onEdit(t)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Modifica
                      </DropdownMenuItem>
                      {t.status !== "todo" && (
                        <DropdownMenuItem onClick={() => onSetStatus(t.id, "todo")}>
                          <Circle className="h-3.5 w-3.5 mr-2" /> Segna da fare
                        </DropdownMenuItem>
                      )}
                      {t.status !== "in_progress" && (
                        <DropdownMenuItem onClick={() => onSetStatus(t.id, "in_progress")}>
                          <Clock className="h-3.5 w-3.5 mr-2" /> Segna in corso
                        </DropdownMenuItem>
                      )}
                      {t.status !== "completed" && (
                        <DropdownMenuItem onClick={() => onComplete(t.id)}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Segna completata
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(t)} className="text-red-600 focus:text-red-600">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 pt-3 border-t">
          <Button asChild variant="ghost" size="sm" className="w-full text-xs gap-1.5">
            <Link to="/admin/attivita?tab=tutte">
              Apri gestione completa <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Task del Team ────────────────────────────────────────────────────────
function TaskTeamAdmin({
  tasks, profilesById, onCreateTask,
}: {
  tasks: CSTask[];
  profilesById: Map<string, { first_name: string | null; last_name: string | null }>;
  onCreateTask: () => void;
}) {
  const [filterUser, setFilterUser] = useState<string>("all");
  const today = startOfDay(new Date());

  // Distinct assignees from team tasks
  const teamMembers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (!t.assigned_to || seen.has(t.assigned_to)) continue;
      const p = profilesById.get(t.assigned_to);
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Utente";
      seen.set(t.assigned_to, name);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks, profilesById]);

  const filtered = useMemo(() => {
    if (filterUser === "all") return tasks;
    return tasks.filter((t) => t.assigned_to === filterUser);
  }, [tasks, filterUser]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />Task del Team
            {filtered.length > 0 && <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-xs"
              onClick={onCreateTask}
            >
              <Plus className="h-3 w-3" /> <span className="hidden sm:inline">Assegna task</span>
              <span className="sm:hidden">Nuovo</span>
            </Button>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i membri</SelectItem>
                {teamMembers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm mb-3">Nessuna attività assegnata al team</p>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onCreateTask}>
              <Plus className="h-3 w-3" /> Assegna task al team
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {filtered.map((t) => {
              const cfg = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.medium;
              const stCfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.todo;
              const scaduta = t.due_date && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date));
              const assignee = t.assigned_to ? profilesById.get(t.assigned_to) : null;
              const assigneeName = [assignee?.first_name, assignee?.last_name].filter(Boolean).join(" ") || "Non assegnato";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    scaduta ? "border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10" : "hover:bg-muted/30"
                  )}
                >
                  <div className={cn("w-2 h-2 rounded-full shrink-0", cfg.dotClass)} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Circle className="h-2.5 w-2.5" />{assigneeName}
                      </span>
                      <Badge variant="outline" className={cn("text-[9px] px-1 py-0", stCfg.className)}>{stCfg.label}</Badge>
                      {t.due_date && (
                        <span className={cn(
                          "text-[10px]",
                          scaduta ? "text-red-500 font-semibold"
                          : isToday(new Date(t.due_date)) ? "text-amber-600"
                          : "text-muted-foreground"
                        )}>
                          {isToday(new Date(t.due_date)) ? "Oggi" : format(new Date(t.due_date), "d MMM", { locale: it })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pulse del team (riepilogo stato) ─────────────────────────────────────
/** Barra statistiche stato dei task del team — colpo d'occhio (come
 *  TeamTaskPulse di /azienda/attivita). Conta su TUTTI i task del team. */
function TeamPulseAdmin({ tasks }: { tasks: CSTask[] }) {
  const today = startOfDay(new Date());
  const stats = useMemo(() => {
    let todo = 0, inProgress = 0, done = 0, overdue = 0;
    for (const t of tasks) {
      if (t.status === "completed") done++;
      else if (t.status === "in_progress") inProgress++;
      else todo++;
      if (t.status !== "completed" && t.due_date && isBefore(new Date(t.due_date), today)) overdue++;
    }
    return { todo, inProgress, done, overdue };
  }, [tasks, today]);

  const tiles = [
    { label: "Da fare", value: stats.todo, icon: Circle, cls: "text-slate-600 dark:text-slate-300", bg: "bg-slate-500/10" },
    { label: "In corso", value: stats.inProgress, icon: Clock, cls: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
    { label: "Completate", value: stats.done, icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "In ritardo", value: stats.overdue, icon: AlertCircle, cls: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="p-3 flex items-center gap-3">
            <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0", tile.bg, tile.cls)}>
              <tile.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xl font-bold leading-none tabular-nums">{tile.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{tile.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Dashboard tab content ────────────────────────────────────────────────
/** Tab "Dashboard" — vista riassuntiva personalizzata.
 *  Niente permission check qui: il wrapper `AdminAttivita` la fa già. */
function AttivitaDashboardTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Dialog task: "new" (con prefill opzionale) oppure "edit" (task esistente).
  const [dialogState, setDialogState] = useState<
    | { mode: "new"; prefill?: { assignedTo?: string; dueDate?: string } }
    | { mode: "edit"; task: CSTask }
    | null
  >(null);
  // Task in attesa di conferma eliminazione.
  const [deletingTask, setDeletingTask] = useState<CSTask | null>(null);

  // Tutte le cs_tasks (verranno splittate in "mie" e "team")
  const { data: allTasks = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["admin-attivita-tasks"],
    queryFn: async (): Promise<CSTask[]> => {
      const { data, error } = await supabase
        .from("cs_tasks" as never)
        .select("id, title, description, status, priority, due_date, assigned_to, company_id, completed_at, created_at, task_type")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as CSTask[];
    },
    staleTime: 60_000,
  });

  // Profili dei membri del team super admin (per mappare assigned_to → nome)
  const assigneeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of allTasks) {
      if (t.assigned_to) ids.add(t.assigned_to);
    }
    return Array.from(ids);
  }, [allTasks]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-attivita-profiles", assigneeIds],
    queryFn: async () => {
      if (assigneeIds.length === 0) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", assigneeIds);
      if (error) throw error;
      return data ?? [];
    },
    enabled: assigneeIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const profilesById = useMemo(() => {
    const map = new Map<string, { first_name: string | null; last_name: string | null }>();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  // Split: mie · team-lista (aperte) · team-pulse (tutti gli stati)
  const myTasks = useMemo(() => allTasks.filter((t) => t.assigned_to === user?.id), [allTasks, user?.id]);
  const allTeamTasks = useMemo(() => allTasks.filter((t) => t.assigned_to && t.assigned_to !== user?.id), [allTasks, user?.id]);
  const teamTasks = useMemo(() => allTeamTasks.filter((t) => t.status !== "completed"), [allTeamTasks]);

  // Mutation: cambia stato (completa / in corso / da fare)
  const setStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: Record<string, unknown> =
        status === "completed"
          ? { status, completed_at: new Date().toISOString() }
          : { status, completed_at: null };
      const { error } = await supabase.from("cs_tasks" as never).update(patch as never).eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "completed" ? "Attività completata" : "Stato aggiornato");
      queryClient.invalidateQueries({ queryKey: ["admin-attivita-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sidebar-badges"] });
    },
    onError: (err: Error) => toast.error("Errore: " + err.message),
  });

  // Mutation: elimina task
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cs_tasks" as never).delete().eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attività eliminata");
      setDeletingTask(null);
      queryClient.invalidateQueries({ queryKey: ["admin-attivita-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sidebar-badges"] });
    },
    onError: (err: Error) => toast.error("Errore: " + err.message),
  });

  const completeTask = (id: string) => setStatusMutation.mutate({ id, status: "completed" });

  // Caricamento → skeleton coerente con il layout (come /azienda/attivita)
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
          <div className="lg:col-span-2 space-y-3 sm:space-y-6">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  // Errore → messaggio + Riprova (prima: schermo vuoto silenzioso)
  if (isError) {
    return (
      <Card className="border-red-200 dark:border-red-900/40">
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-10 w-10 mx-auto mb-3 text-red-500/70" />
          <p className="text-sm font-medium mb-1">Impossibile caricare le attività</p>
          <p className="text-xs text-muted-foreground mb-4">Si è verificato un errore nel recupero dei task.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <Loader2 className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} /> Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sinistra: Meteo + Calendario impilati (2/3) · Destra: le mie attività
          (1/3). Stesso layout di /azienda/attivita (AttivitaStaff › TabAttivita). */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
          <AdminMeteoWidget />
          <AdminMiniCalendario
            tasks={myTasks}
            onAddTask={(date) => setDialogState({ mode: "new", prefill: { assignedTo: user?.id, dueDate: date } })}
          />
        </div>
        <MieAttivitaAdmin
          tasks={myTasks}
          onComplete={completeTask}
          onCreateTask={() => setDialogState({ mode: "new", prefill: { assignedTo: user?.id } })}
          onEdit={(task) => setDialogState({ mode: "edit", task })}
          onDelete={(task) => setDeletingTask(task)}
          onSetStatus={(id, status) => setStatusMutation.mutate({ id, status })}
        />
      </div>

      {/* Strumenti del team, a tutta larghezza sotto (come la "Regia" azienda) */}
      <TeamPulseAdmin tasks={allTeamTasks} />
      <TaskTeamAdmin
        tasks={teamTasks}
        profilesById={profilesById}
        onCreateTask={() => setDialogState({ mode: "new" })}
      />

      {/* Dialog Nuovo / Modifica Task — condiviso */}
      <NewTaskDialog
        open={!!dialogState}
        onOpenChange={(open) => { if (!open) setDialogState(null); }}
        prefill={dialogState?.mode === "new" ? dialogState.prefill : undefined}
        editTask={
          dialogState?.mode === "edit"
            ? {
                id: dialogState.task.id,
                title: dialogState.task.title,
                description: dialogState.task.description,
                type: (dialogState.task.task_type as TaskTypeValue | null) ?? undefined,
                priority: dialogState.task.priority as "low" | "medium" | "high",
                companyId: dialogState.task.company_id,
                assignedTo: dialogState.task.assigned_to,
                dueDate: dialogState.task.due_date ? dialogState.task.due_date.slice(0, 10) : null,
              }
            : undefined
        }
      />

      {/* Conferma eliminazione */}
      <AlertDialog open={!!deletingTask} onOpenChange={(o) => { if (!o) setDeletingTask(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'attività?</AlertDialogTitle>
            <AlertDialogDescription>
              «{deletingTask?.title}» verrà eliminata definitivamente. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingTask && deleteMutation.mutate(deletingTask.id)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Tab fallback (lazy load) ─────────────────────────────────────────────
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─── Wrapper principale con tabs ──────────────────────────────────────────
export default function AdminAttivita() {
  const { permissions } = useSuperAdminPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "tutte" ? "tutte" : "dashboard";
  const [activeTab, setActiveTab] = useState<"dashboard" | "tutte">(initialTab);

  if (!permissions.can_manage_companies) return <AccessDenied />;

  const handleTabChange = (value: string) => {
    const next = value as "dashboard" | "tutte";
    setActiveTab(next);
    // Sincronizza URL — utile per deep-link e browser back/forward
    const newParams = new URLSearchParams(searchParams);
    if (next === "tutte") newParams.set("tab", "tutte");
    else newParams.delete("tab");
    setSearchParams(newParams, { replace: true });
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <AdminAttivitaHeader />
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full max-w-full sm:max-w-md grid-cols-2 h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm py-2">
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="tutte" className="gap-1.5 text-xs sm:text-sm py-2">
            <ListChecks className="h-4 w-4" />
            <span className="truncate"><span className="hidden sm:inline">Tutte le </span>attività</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard" className="mt-6">
          <AttivitaDashboardTab />
        </TabsContent>
        <TabsContent value="tutte" className="mt-6">
          {/* Riuso totale del gestore completo — no duplicazione di logica.
              Lazy-loaded per non impattare il bundle del tab Dashboard. */}
          <Suspense fallback={<TabFallback />}>
            <AdminCSTasks />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

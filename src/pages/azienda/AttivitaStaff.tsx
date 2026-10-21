/**
 * AttivitaStaff — pagina unificata per admin e staff.
 * Accessibile da /azienda/attivita
 *
 * Tab:
 *  1. Attività     — dashboard con meteo, calendario mese, (timbratura solo staff), task manager
 *  2. Team         — (solo admin) task assegnate ai membri del team
 *  3. Timbrature   — (solo staff) storico timbrature personali
 *  4. Ferie        — saldo ferie/permessi e richieste
 *  5. Cedolini     — lista cedolini con download PDF
 */
import { lazy, Suspense, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  format, isToday, isBefore, startOfDay, addDays,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Clock, ClipboardCheck, CheckCircle2, PlayCircle,
  CheckCircle, Loader2, ExternalLink, Palmtree, Receipt,
  CloudSun, ChevronRight, CalendarDays, Droplets,
  MapPin, Plus, Pencil, Trash2, X, Filter,
  ArrowUpCircle, Circle, AlertCircle, MoreHorizontal, Tag, Users, Target, User as UserIcon,
  CalendarClock, Sparkles, ListChecks, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { linkContatto, linkOpportunita } from "@/lib/marketing/linkCrm";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { queryKeys } from "@/lib/queryKeys";
import { CollegaAttivitaPicker, etichettaCollegamento, type CollegamentoAttivita } from "@/components/tasks/CollegaAttivitaPicker";
import { collegamentiAttivita } from "@/lib/attivita/collegamenti";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Link } from "react-router-dom";
import {
  useWeatherForecast,
  weatherCodeToEmoji,
  weatherCodeToLabel,
  type WeatherDay,
} from "@/hooks/useWeatherForecast";
import { TASK_CATEGORY_OPTIONS as CATEGORY_OPTIONS } from "@/lib/taskCategories";
import { DashboardAgenda } from "@/components/attivita/DashboardAgenda";
import { useDashboardTasks } from "@/hooks/useDashboardTasks";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { dashboardTasksForAssignee, dashboardTaskStats, dashboardTaskDateGroup, filterDashboardTasks, type DashboardTaskFilter } from "@/lib/attivita/dashboardTasks";
import { buildTaskStatusUpdate, getNextTaskStatusForQuickAction, getTaskStatusDefinition, getTaskStatusLabel, isTaskDoneStatus, isTaskBlockedStatus, TASK_STATUS_TONE_CLASSES } from "@/lib/taskStatuses";

import { ConfermaQuantita, useConfermaQuantita } from "@/components/shared/ConfermaQuantita";
import { DaApprovareCantieri } from "@/components/campo/DaApprovareCantieri";
// Lazy load delle sotto-pagine
const TimbraturePersonali = lazy(() => import("@/pages/azienda/TimbraturePersonali"));
const FeriePersonali = lazy(() => import("@/pages/azienda/FeriePersonali"));
const CedoliniPersonali = lazy(() => import("@/pages/azienda/CedoliniPersonali"));
const UnifiedTasks = lazy(() => import("@/pages/azienda/UnifiedTasks"));

// ─────────────────────────────────────────────────────────────────────────────
// Costanti
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string; icon: typeof Circle }> = {
  urgente: { label: "Urgente", dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: AlertCircle },
  alta:    { label: "Alta",    dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: ArrowUpCircle },
  normale: { label: "Normale", dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: Circle },
  bassa:   { label: "Bassa",   dotClass: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground", icon: Circle },
};

type TaskFilter = DashboardTaskFilter;
type AddTaskRequest = { date: string; requestId: number };

function InlineLoadError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          {description && <p className="mt-1 text-xs text-red-800">{description}</p>}
        </div>
        <Button variant="outline" size="sm" className="h-7 border-red-200 bg-white text-red-700 hover:bg-red-100" onClick={onRetry}>
          Riprova
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: fetch coordinate azienda
// ─────────────────────────────────────────────────────────────────────────────
function useCompanyLocation() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["company-location", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("operational_lat, operational_lng, operational_city, legal_city")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return {
        lat: data?.operational_lat ?? 45.4654,
        lng: data?.operational_lng ?? 9.1859,
        city: data?.operational_city || data?.legal_city || "Milano",
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 60 * 1000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────
function AttivitaHeader() {
  const { profile } = useAuth();
  const oggi = format(new Date(), "EEEE d MMMM yyyy", { locale: it });
  const ora = new Date().getHours();
  const saluto = ora < 12 ? "Buongiorno" : ora < 18 ? "Buon pomeriggio" : "Buonasera";

  const isMobile = useIsMobile();
  // Su telefono niente data e saluto: la pagina parte dalle linguette.
  if (isMobile) return null;
  return (
    <div>
      <p className="text-muted-foreground text-xs sm:text-sm capitalize">{oggi}</p>
      <h1 className="text-xl sm:text-2xl font-bold">
        {saluto}, {profile?.first_name ?? ""}
      </h1>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget Meteo
// ─────────────────────────────────────────────────────────────────────────────
function MeteoWidget({ compatto = false }: { compatto?: boolean }) {
  const { data: location, isLoading: loadingLoc } = useCompanyLocation();
  // ?? garantisce coordinate stabili dal primo render, evita cambio query key
  // quando location carica (che causava il "meteo sparisce" durante il refetch)
  const lat = location?.lat ?? 45.4654;
  const lng = location?.lng ?? 9.1859;
  const { data: weatherMap, isLoading: loadingWeather, isError: weatherError, refetch: refetchWeather } = useWeatherForecast(lat, lng);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayWeather = weatherMap?.get(todayStr);

  const forecastDays = useMemo(() => {
    if (!weatherMap) return [];
    const result: { date: string; weather: WeatherDay }[] = [];
    weatherMap.forEach((w, d) => { if (d !== todayStr) result.push({ date: d, weather: w }); });
    return result.slice(0, 3);
  }, [weatherMap, todayStr]);

  // Mostra skeleton solo quando non abbiamo ancora nessun dato (primo caricamento).
  // Con keepPreviousData, weatherMap può avere dati placeholder anche quando
  // loadingWeather=true (chiave cambiata) — non nasconderli dietro uno skeleton.
  if (!weatherMap && (loadingLoc || loadingWeather)) {
    return <Card><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>;
  }
  if (!todayWeather) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <CloudSun className="h-8 w-8 mx-auto mb-1 opacity-40" />
          <p>Meteo non disponibile</p>
          {weatherError && (
            <button
              onClick={() => refetchWeather()}
              className="mt-2 text-xs text-primary underline hover:no-underline"
            >
              Riprova
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Mobile: una riga sola, senza riquadro. Il meteo serve a decidere il
  // cantiere di domani, non a occupare un sesto dello schermo prima delle
  // attivita'.
  if (compatto) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
        <span className="text-base leading-none">{weatherCodeToEmoji(todayWeather.code)}</span>
        <span className="font-semibold text-foreground tabular-nums">{todayWeather.maxTemp}°</span>
        <span className="tabular-nums">/{todayWeather.minTemp}°</span>
        <span className="truncate">{location?.city ?? "Milano"}</span>
        {todayWeather.precip > 0 && (
          <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 shrink-0">
            <Droplets className="h-3 w-3" />{todayWeather.precip}mm
          </span>
        )}
        {forecastDays.length > 0 && (
          <span className="ml-auto flex items-center gap-2 shrink-0">
            {forecastDays.map(({ date, weather }) => (
              <span key={date} className="flex items-center gap-0.5">
                <span className="capitalize">{format(new Date(date), "EEEEE", { locale: it })}</span>
                <span className="leading-none">{weatherCodeToEmoji(weather.code)}</span>
                <span className="tabular-nums text-foreground">{weather.maxTemp}°</span>
              </span>
            ))}
          </span>
        )}
      </div>
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
              <MapPin className="h-2.5 w-2.5 shrink-0" />{location?.city ?? "Milano"} · {weatherCodeToLabel(todayWeather.code)}
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


// ─────────────────────────────────────────────────────────────────────────────
// Task Manager — Le mie Attività (stile Asana)
// Features: CRUD, multi-select + bulk actions, grouping, search, compact view
// ─────────────────────────────────────────────────────────────────────────────
type GroupBy = "none" | "priority" | "category" | "date";

/**
 * Il campo «Collegata a» e le colonne della riga: un'opportunità porta con sé
 * il suo contatto, così l'attività si vede anche nella scheda del cliente.
 */
function collegamentiDelModulo(c: CollegamentoAttivita | null | undefined) {
  const { contact_id, opportunity_id } = collegamentiAttivita(
    c?.tipo === "opportunita" ? { opportunityId: c.id } : { contactId: c?.id ?? null },
    c?.tipo === "opportunita" ? c.contactId : null,
  );
  return { contact_id, opportunity_id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collegamentoDelTask(t: any): CollegamentoAttivita | null {
  if (t?.opportunity_id) {
    return {
      tipo: "opportunita",
      id: t.opportunity_id,
      etichetta: t.opportunita?.name || "Opportunità",
      contactId: t.contact_id ?? null,
    };
  }
  if (t?.contact_id) {
    const nome = [t.contatto?.first_name, t.contatto?.last_name].filter(Boolean).join(" ");
    return { tipo: "contatto", id: t.contact_id, etichetta: nome || "Contatto" };
  }
  return null;
}

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Nessuno" },
  { value: "priority", label: "Priorità" },
  { value: "category", label: "Categoria" },
  { value: "date", label: "Data" },
];

export function MieAttivita({ initialDueDate, calendarDate, onCalendarDateClear, openTaskRequest }: { initialDueDate?: AddTaskRequest | null; calendarDate?: string | null; onCalendarDateClear?: () => void; openTaskRequest?: { id: string; requestId: number } | null }) {
  const { user, effectiveCompany, role } = useAuth();
  const isAdmin = role === "company_admin";
  const { canViewTeamTasks, solaLettura, canViewMarketingContacts, canViewMarketingOpportunities, canViewOrders } = usePermissions();
  const creaTitle = solaLettura ? "Sei in sola lettura" : undefined;
  // La lista è sempre personale. Il permesso team abilita il passaggio alla
  // Regia, dove la lettura segue i permessi e la visibilità assegnata.
  const seesTeamTasks = isAdmin || canViewTeamTasks;
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskFilter>("tutte");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  // Mobile: la riga «Aggiungi attività…» non sta fissa sopra la lista, la apre
  // «Nuova» in testata e si richiude quando resta vuota.
  const [aggiuntaAperta, setAggiuntaAperta] = useState(false);
  const apriAggiunta = () => {
    // flushSync: il focus deve partire dentro il tocco, se no iOS non apre la tastiera.
    flushSync(() => setAggiuntaAperta(true));
    quickAddRef.current?.focus();
  };
  const [searchQuery, setSearchQuery] = useState("");
  const filterKey = JSON.stringify([filter, searchQuery, calendarDate]);
  const [selection, setSelection] = useState({ key: filterKey, ids: new Set<string>() });
  const selectedIds = selection.key === filterKey ? selection.ids : new Set<string>();
  const setSelectedIds = (next: Set<string> | ((previous: Set<string>) => Set<string>)) => setSelection(previous => ({ key: filterKey, ids: typeof next === "function" ? next(previous.key === filterKey ? previous.ids : new Set<string>()) : next }));
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const confermaBulk = useConfermaQuantita(selectedIds.size, bulkConfirmOpen);
  const [compact, setCompact] = useState(false);
  // Modalità selezione multipla: di default la card mostra SOLO il cerchio
  // "completa"; il checkbox di selezione compare unicamente in questa modalità,
  // così l'utente non vede mai due controlli (cerchio + quadrato) insieme.
  const [selectionMode, setSelectionMode] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Mobile: le opzioni di raggruppamento stanno in un pannello.
  const [filtriAperti, setFiltriAperti] = useState(false);

  // ── Form state ──
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPriority, setFormPriority] = useState("normale");
  const [formDueDate, setFormDueDate] = useState("");
  const [formCategory, setFormCategory] = useState("altro");
  const [formStatus, setFormStatus] = useState("da_fare");
  const [formAssignedTo, setFormAssignedTo] = useState("");
  // A chi è attaccata l'attività: cliente o opportunità (23/09/2026).
  const [formCollegamento, setFormCollegamento] = useState<CollegamentoAttivita | null>(null);

  const { data: teamMembers = [] } = useCompanyStaffUsers(isAdmin ? companyId : null);

  const { data: allTasks = [], isLoading, isError, error, refetch } = useDashboardTasks();
  const observedStatuses = useMemo(() => [...new Set(allTasks.map(t => t.status))], [allTasks]);
  const { statuses: taskStatuses } = useTaskStatuses(companyId, observedStatuses);
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);
  const tasksDiChi = useMemo(() => dashboardTasksForAssignee(allTasks, "me", user?.id), [allTasks, user?.id]);
  const filteredTasks = useMemo(() => filterDashboardTasks(tasksDiChi, filter, today, searchQuery, calendarDate, taskStatuses), [tasksDiChi, filter, today, searchQuery, calendarDate, taskStatuses]);
  const stats = useMemo(() => dashboardTaskStats(tasksDiChi, today, taskStatuses), [tasksDiChi, today, taskStatuses]);
  const [pagination, setPagination] = useState({ key: filterKey, page: 1 });
  const page = pagination.key === filterKey ? pagination.page : 1;
  const setPage = (next: number) => setPagination({ key: filterKey, page: next });
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / 20));
  const currentPage = Math.min(page, pageCount);
  const visibleTasks = filteredTasks.slice((currentPage - 1) * 20, currentPage * 20);

  // ── Grouping ──
  const groupedTasks = useMemo(() => {
    if (groupBy === "none") return null;
    const groups = new Map<string, any[]>();
    for (const t of visibleTasks) {
      let key: string;
      if (groupBy === "priority") key = PRIORITY_CONFIG[t.priority ?? "normale"]?.label ?? "Normale";
      else if (groupBy === "category") key = CATEGORY_OPTIONS.find(c => c.value === t.category)?.label ?? "Altro";
      else key = dashboardTaskDateGroup(t, today, taskStatuses);
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }
    return groups;
  }, [visibleTasks, groupBy, today, taskStatuses]);

  // ── Mutations ──
  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["my-tasks-all"] }),
    queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
    queryClient.invalidateQueries({ queryKey: ["calendar-tasks"] }),
    queryClient.invalidateQueries({ queryKey: ["team-tasks"] }),
    queryClient.invalidateQueries({ queryKey: ["team-task-pulse"] }),
    queryClient.invalidateQueries({ queryKey: ["my-task-count"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
  ]);
  const checkWrite = () => { if (!companyId || !user?.id || solaLettura) throw new Error("Non puoi modificare le attività in questo momento."); };

  const createTask = useMutation({
    mutationFn: async (task: { title: string; notes?: string; priority: string; due_date?: string; category: string; assigned_to?: string; collegamento?: CollegamentoAttivita | null }) => {
      checkWrite();
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId!, assigned_to: task.assigned_to || user!.id, created_by: user!.id,
        title: task.title, notes: task.notes || null,
        priority: task.priority, due_date: task.due_date || null,
        category: task.category, status: "da_fare",
        ...collegamentiDelModulo(task.collegamento),
      } as any).select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Attività creata"); await invalidate(); },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); void invalidate(); },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      checkWrite();
      let q = supabase.from("tasks").update(updates).eq("id", id).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { error } = await q.select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Attività aggiornata"); await invalidate(); },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); void invalidate(); },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      checkWrite();
      let q = supabase.from("tasks").delete().eq("id", taskId).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { error } = await q.select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Attività eliminata"); await invalidate(); },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); void invalidate(); },
  });

  // Bulk update mutation
  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      checkWrite();
      const updates = buildTaskStatusUpdate(status, taskStatuses);
      let q = supabase.from("tasks").update(updates).in("id", ids).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { data, error } = await q.select("id");
      if (error) throw error;
      if (data?.length !== new Set(ids).size) throw new Error("Alcune attività non sono più modificabili. Aggiorna la lista prima di riprovare.");
    },
    onSuccess: async (_, { ids, status }) => {
      const label = getTaskStatusLabel(status, taskStatuses);
      toast.success(`${ids.length} attività → ${label}`);
      setSelectedIds(new Set());
      await invalidate();
    },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); void invalidate(); },
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      checkWrite();
      let q = supabase.from("tasks").delete().in("id", ids).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { data, error } = await q.select("id");
      if (error) throw error;
      if (data?.length !== new Set(ids).size) throw new Error("Alcune attività non sono più modificabili. Aggiorna la lista prima di riprovare.");
    },
    onSuccess: async (_, ids) => {
      toast.success(`${ids.length} attività eliminate`);
      setSelectedIds(new Set());
      await invalidate();
    },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); void invalidate(); },
  });

  const postponeMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      checkWrite();
      let q = supabase.from("tasks").update({ due_date: newDate }).eq("id", id).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { error } = await q.select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { toast.success("Scadenza posticipata di 7 giorni"); await invalidate(); },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); void invalidate(); },
  });

  const mutationBusy = createTask.isPending || updateTask.isPending || deleteTask.isPending || bulkUpdateStatus.isPending || bulkDelete.isPending || postponeMutation.isPending;
  const readOnlyDialog = solaLettura || !!(editingTask && !isAdmin && editingTask.assigned_to !== user?.id);

  const defaultAssignee = user?.id;

  // ── Helpers ──
  const openCreate = useCallback((dueDate?: string) => {
    // In sola lettura la policy su tasks rifiuta l'inserimento: niente modulo.
    if (solaLettura) return;
    setEditingTask(null);
    setFormTitle(""); setFormNotes(""); setFormPriority("normale");
    setFormDueDate(dueDate ?? ""); setFormCategory("altro"); setFormStatus("da_fare");
    setFormAssignedTo(defaultAssignee ?? "");
    setFormCollegamento(null);
    setDialogOpen(true);
  }, [solaLettura, defaultAssignee, setEditingTask, setFormTitle, setFormNotes, setFormPriority, setFormDueDate, setFormCategory, setFormStatus, setFormAssignedTo, setFormCollegamento, setDialogOpen]);

  const openEdit = useCallback((t: any) => {
    setEditingTask(t);
    setFormTitle(t.title); setFormNotes(t.notes ?? "");
    setFormPriority(t.priority ?? "normale");
    setFormDueDate(t.due_date ?? ""); setFormCategory(t.category ?? "altro");
    setFormStatus(t.status ?? "da_fare");
    setFormAssignedTo(t.assigned_to ?? user?.id ?? "");
    setFormCollegamento(collegamentoDelTask(t));
    setDialogOpen(true);
  }, [user?.id, setEditingTask, setFormTitle, setFormNotes, setFormPriority, setFormDueDate, setFormCategory, setFormStatus, setFormAssignedTo, setFormCollegamento, setDialogOpen]);

  const openedRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!openTaskRequest || openedRequest.current === openTaskRequest.requestId) return;
    const task = tasksDiChi.find(t => t.id === openTaskRequest.id);
    if (!task) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { openedRequest.current = openTaskRequest.requestId; openEdit(task); } });
    return () => { cancelled = true; };
  }, [openTaskRequest, tasksDiChi, openEdit]);
  useEffect(() => {
    if (!initialDueDate?.date) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) openCreate(initialDueDate.date); });
    return () => { cancelled = true; };
  }, [initialDueDate, openCreate]);

  const handleSave = () => {
    if (readOnlyDialog || mutationBusy) return;
    if (!formTitle.trim()) { toast.error("Inserisci un titolo"); return; }
    if (editingTask) {
      const updates: any = { id: editingTask.id, title: formTitle.trim(), notes: formNotes.trim() || null, priority: formPriority, due_date: formDueDate || null, category: formCategory, status: formStatus, ...collegamentiDelModulo(formCollegamento) };
      if (isAdmin && formAssignedTo) updates.assigned_to = formAssignedTo;
      if (formStatus !== editingTask.status) Object.assign(updates, buildTaskStatusUpdate(formStatus, taskStatuses));
      updateTask.mutate(updates, { onSuccess: () => setDialogOpen(false) });
    } else {
      createTask.mutate({ title: formTitle.trim(), notes: formNotes.trim(), priority: formPriority, due_date: formDueDate || undefined, category: formCategory, assigned_to: isAdmin ? formAssignedTo : undefined, collegamento: formCollegamento }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const handleQuickAdd = () => {
    if (!quickAddTitle.trim() || solaLettura || mutationBusy) return;
    createTask.mutate({ title: quickAddTitle.trim(), priority: "normale", category: "altro", due_date: calendarDate || undefined, assigned_to: isAdmin ? defaultAssignee : undefined }, { onSuccess: () => { setQuickAddTitle(""); if (isMobile) setAggiuntaAperta(false); } });
  };

  // La stessa avanzata di stato della Regia: rispetta revisione e attività in attesa.
  const markDone = (t: any) => {
    if (solaLettura || mutationBusy || isTaskBlockedStatus(t.status, taskStatuses)) return;
    const next = getNextTaskStatusForQuickAction(t.status, taskStatuses);
    updateTask.mutate({ id: t.id, ...buildTaskStatusUpdate(next.value, taskStatuses) });
  };

  const toggleSelect = (id: string) => {
    const task = allTasks.find(t => t.id === id);
    if (solaLettura || mutationBusy || !task || isTaskBlockedStatus(task.status, taskStatuses) || (!isAdmin && task.assigned_to !== user?.id)) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    // Solo le task gestibili: chi ha la visione team (non admin) vede anche
    // task altrui in sola lettura — selezionarle gonfierebbe i conteggi bulk
    // mentre le mutation (assigned_to = me) le salterebbero in silenzio.
    const selectable = visibleTasks.filter((t: any) => !solaLettura && !isTaskBlockedStatus(t.status, taskStatuses) && (isAdmin || t.assigned_to === user?.id));
    if (selectedIds.size === selectable.length && selectable.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectable.map((t: any) => t.id)));
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const showDefaultSections = filter === "tutte" && groupBy === "none" && !calendarDate && visibleTasks.length > 0;
  const defaultGroups = ["Scadute", "Oggi", "Prossimi 7 giorni", "Più avanti", "Senza data", "In attesa", "Completate"].map(label => ({ label, tasks: visibleTasks.filter(t => dashboardTaskDateGroup(t, today, taskStatuses) === label) })).filter(group => group.tasks.length > 0);

  const hasSelection = selectedIds.size > 0;

  // ── Render task card ──
  const renderTask = (t: any) => {
    const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
    const definition = getTaskStatusDefinition(t.status, taskStatuses);
    const stCfg = { label: definition.label, className: TASK_STATUS_TONE_CLASSES[definition.tone].badge };
    const blocked = isTaskBlockedStatus(t.status, taskStatuses);
    const nextStatus = getNextTaskStatusForQuickAction(t.status, taskStatuses);
    const scaduta = t.due_date && !isTaskDoneStatus(t.status, taskStatuses) && !blocked && isBefore(parseISO(t.due_date.slice(0, 10)), today) && !isToday(parseISO(t.due_date.slice(0, 10)));
    const isDone = isTaskDoneStatus(t.status, taskStatuses);
    const catLabel = CATEGORY_OPTIONS.find(c => c.value === t.category)?.label;
    const isSelected = selectedIds.has(t.id);
    // Chi ha solo la visione team (non admin) vede le task altrui in sola
    // lettura: le mutation lato client filtrano già assigned_to = me.
    const canManage = !solaLettura && !mutationBusy && (isAdmin || t.assigned_to === user?.id);

    const assigneeName = getAssigneeName(t);
    // A chi è attaccata: si legge dalla riga, senza aprirla, e si apre con un clic se si può vedere quella pagina.
    const collegata = etichettaCollegamento(t);
    const hrefCollegata = collegata?.icona === "opportunita"
      ? (t.opportunity_id && canViewMarketingOpportunities ? linkOpportunita("/azienda/marketing", t.opportunity_id) : null)
      : collegata && t.contact_id && canViewMarketingContacts ? linkContatto("/azienda/marketing", t.contact_id) : null;

    if (compact) {
      // Vista compatta — riga singola
      return (
        <div key={t.id} className={`group flex items-center gap-1.5 sm:gap-2 rounded border px-2 sm:px-3 py-1.5 transition-all text-sm ${isDone ? "opacity-50 bg-muted/30" : ""} ${scaduta ? "border-red-200 bg-red-50/20" : ""} ${isSelected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}>
          {/* Un solo controllo a sinistra: in modalità selezione il checkbox,
              altrimenti il cerchio "completa". Mai entrambi insieme. */}
          {selectionMode && canManage ? (
            <input
              type="checkbox"
              checked={isSelected}
              disabled={blocked || mutationBusy}
              onChange={() => toggleSelect(t.id)}
              className="h-4 w-4 rounded border-muted-foreground/40 accent-primary shrink-0"
              aria-label={isSelected ? "Deseleziona attività" : "Seleziona attività"}
            />
          ) : (
            <button
              onClick={() => !isDone && !blocked && canManage && markDone(t)}
              disabled={isDone || blocked || !canManage}
              className={`shrink-0 transition-colors ${isDone ? "text-green-500" : canManage ? "text-muted-foreground/30 hover:text-green-500" : "text-muted-foreground/20"}`}
              aria-label={`${isDone ? "Attività completata" : blocked ? "Attività in attesa" : `Passa a ${nextStatus.label}`}: ${t.title}`}
              title={isDone ? "Completata" : blocked ? "In attesa dell’attività precedente" : canManage ? `Passa a ${nextStatus.label}` : "Attività in sola lettura"}
            >
              {isDone ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </button>
          )}
          {/* Title */}
          <button type="button" className={`flex-1 truncate text-left ${isDone ? "line-through text-muted-foreground" : ""}`} onClick={() => openEdit(t)}>{t.title}</button>
          {/* Assignee avatar */}
          {assigneeName && (
            <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded-full shrink-0 font-medium">{assigneeName.split(" ").map((n: string) => n[0]).join("")}</span>
          )}
          {/* Priority dot */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} title={cfg.label} />
          {/* Due date */}
          {t.due_date && (
            <span className={`text-[10px] shrink-0 ${scaduta ? "text-red-500 font-semibold" : isToday(parseISO(t.due_date.slice(0, 10))) ? "text-amber-600" : "text-muted-foreground"}`}>
              {isToday(parseISO(t.due_date.slice(0, 10))) ? "Oggi" : format(parseISO(t.due_date.slice(0, 10)), "d/MM", { locale: it })}
            </span>
          )}
          {/* Posticipa +7gg — visibile subito sulle scadute */}
          {scaduta && canManage && (
            <button
              onClick={(e) => { e.stopPropagation(); postponeMutation.mutate({ id: t.id, newDate: format(addDays(new Date(), 7), "yyyy-MM-dd") }); }}
              className="p-1 -m-0.5 text-amber-500 hover:text-amber-600 shrink-0 transition-colors"
              title="Posticipa di 7 giorni"
              aria-label="Posticipa di 7 giorni"
            >
              <CalendarClock className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Quick actions: visibili sempre su mobile (no hover), opacity transition solo su md+ */}
          {canManage && (
            <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
              <button onClick={() => openEdit(t)} className="p-1 -m-0.5 text-muted-foreground hover:text-foreground" title="Modifica" aria-label="Modifica attività">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setTaskToDelete(t.id)} className="p-1 -m-0.5 text-muted-foreground hover:text-red-500" title="Elimina" aria-label="Elimina attività">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      );
    }

    // Vista normale — card
    return (
      <div key={t.id} className={`group flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 transition-all hover:shadow-sm hover:border-primary/20 ${isDone ? "opacity-50" : ""} ${scaduta ? "border-red-200 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10" : ""} ${isSelected ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}>
        {/* Un solo controllo a sinistra: checkbox in modalità selezione,
            altrimenti il cerchio "completa" (gesto to-do naturale). Niente più
            cerchio + quadrato impilati. */}
        <div className="mt-0.5 shrink-0">
          {selectionMode && canManage ? (
            <input
              type="checkbox"
              checked={isSelected}
              disabled={blocked || mutationBusy}
              onChange={() => toggleSelect(t.id)}
              className="h-[18px] w-[18px] rounded border-muted-foreground/40 accent-primary"
              aria-label={isSelected ? "Deseleziona attività" : "Seleziona attività"}
            />
          ) : (
            <button
              onClick={() => !isDone && !blocked && canManage && markDone(t)}
              disabled={isDone || blocked || !canManage}
              className={`tap-compact -m-1 p-1 transition-colors ${isDone ? "text-green-500" : canManage ? "text-muted-foreground/30 hover:text-green-500" : "text-muted-foreground/20"}`}
              aria-label={`${isDone ? "Attività completata" : blocked ? "Attività in attesa" : `Passa a ${nextStatus.label}`}: ${t.title}`}
              title={isDone ? "Completata" : blocked ? "In attesa dell’attività precedente" : canManage ? `Passa a ${nextStatus.label}` : "Attività in sola lettura"}
            >
              {isDone ? <CheckCircle className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
            </button>
          )}
        </div>

        {/* Content — titolo leggibile su TUTTA la larghezza (fino a 2 righe) +
            una sola riga meta. La priorità è un pallino colorato: non ruba
            spazio al titolo e alleggerisce il testo. */}
        <div className="flex-1 min-w-0">
          <button type="button" onClick={() => openEdit(t)} className={`w-full text-left font-medium text-[13px] leading-snug line-clamp-2 ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</button>
          {/* Riga meta su UNA sola riga: priorità (pallino) · stato · scadenza.
              overflow-hidden: le voci meno importanti (categoria/assegnatario/
              ordine) si troncano invece di mandare a capo la card. */}
          <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground">
            <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dotClass}`} title={`Priorità ${cfg.label}`} />
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${stCfg.className}`}>{stCfg.label}</Badge>
            {t.due_date && (
              <span className={`shrink-0 ${scaduta ? "text-red-500 font-semibold" : isDone ? "" : isToday(parseISO(t.due_date.slice(0, 10))) ? "text-amber-600 font-medium" : ""}`}>
                {isToday(parseISO(t.due_date.slice(0, 10))) ? "Oggi" : format(parseISO(t.due_date.slice(0, 10)), t.due_date.slice(0, 4) === String(today.getFullYear()) ? "d MMM" : "d MMM yyyy", { locale: it })}
              </span>
            )}
            {catLabel && <span className="flex min-w-0 items-center gap-1"><Tag className="w-3 h-3 shrink-0" /><span className="truncate">{catLabel}</span></span>}
            {assigneeName && <span className="flex shrink-0 items-center gap-1 text-violet-600 dark:text-violet-400 font-medium"><Users className="w-3 h-3" />{assigneeName}</span>}
            {t.order?.order_code && (canViewOrders && t.order_id ? <Link to={`/azienda/ordini/${t.order_id}`} onClick={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1 hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" />{t.order.order_code}</Link> : <span>{t.order.order_code}</span>)}
            {collegata && (hrefCollegata ? (
              <Link
                to={hrefCollegata}
                onClick={(e) => e.stopPropagation()}
                className="flex min-w-0 items-center gap-1 text-foreground/70 hover:text-foreground hover:underline transition-colors"
                title={collegata.icona === "opportunita" ? "Apri l'opportunità collegata" : "Apri il contatto collegato"}
              >
                {collegata.icona === "opportunita" ? <Target className="w-3 h-3 shrink-0" /> : <UserIcon className="w-3 h-3 shrink-0" />}
                <span className="truncate">{collegata.testo}</span>
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-1 text-foreground/70" title={collegata.icona === "opportunita" ? "Opportunità collegata" : "Cliente collegato"}>
                {collegata.icona === "opportunita" ? <Target className="w-3 h-3 shrink-0" /> : <UserIcon className="w-3 h-3 shrink-0" />}
                <span className="truncate">{collegata.testo}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        {canManage && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity" aria-label="Azioni attività"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Mobile: «Modifica» è il tocco sulla card e «Segna come fatta» il cerchio. */}
            {!isMobile && <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-2" />Modifica</DropdownMenuItem>}
            {!isDone && !blocked && !isMobile && <DropdownMenuItem onClick={() => markDone(t)}><CheckCircle2 className="h-3.5 w-3.5 mr-2" />Passa a {nextStatus.label}</DropdownMenuItem>}
            {scaduta && <DropdownMenuItem onClick={() => postponeMutation.mutate({ id: t.id, newDate: format(addDays(new Date(), 7), "yyyy-MM-dd") })}><CalendarClock className="h-3.5 w-3.5 mr-2" />Posticipa +7 giorni</DropdownMenuItem>}
            {t.status === "da_fare" && <DropdownMenuItem onClick={() => updateTask.mutate({ id: t.id, status: "in_corso" })}><PlayCircle className="h-3.5 w-3.5 mr-2" />Inizia (In corso)</DropdownMenuItem>}
            {(!isMobile || scaduta || t.status === "da_fare") && <DropdownMenuSeparator />}
            <DropdownMenuItem className="text-red-600" onClick={() => setTaskToDelete(t.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>}
      </div>
    );
  };

  // Render grouped section
  const renderGroup = (key: string, tasks: any[]) => {
    const isCollapsed = collapsedGroups.has(key);
    return (
      <div key={key} className="space-y-1.5">
        <button onClick={() => toggleGroup(key)} className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/30 rounded px-1 -mx-1">
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{key}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{tasks.length}</Badge>
        </button>
        {!isCollapsed && <div className={compact ? "space-y-1" : "space-y-2"}>{tasks.map(renderTask)}</div>}
      </div>
    );
  };

  // Helper: get assignee name
  const getAssigneeName = (t: any) => {
    if (!seesTeamTasks || t.assigned_to === user?.id) return null;
    const a = t.assignee as any;
    return a ? `${a.first_name || ""} ${a.last_name || ""}`.trim() : null;
  };

  return (
    <>
      <Card data-testid="dashboard-task-manager" role="region" aria-label="Gestione delle attività">
        <CardHeader className="p-3 sm:p-4 sm:pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold shrink-0">
                <ClipboardCheck className="h-5 w-5 text-primary" />Le mie attività
                {!calendarDate && stats.total > 0 && <Badge variant="secondary" className="text-xs">{stats.total}</Badge>}
              </h2>
              {calendarDate && (
                <button
                  onClick={() => { onCalendarDateClear?.(); }}
                  className="tap-compact inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  title="Rimuovi filtro data"
                >
                  <CalendarDays className="h-3 w-3" />
                  {format(parseISO(calendarDate), calendarDate.slice(0, 4) === String(today.getFullYear()) ? "d MMM" : "d MMM yyyy", { locale: it })}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft: `Cosa conta ora? Ho ${stats.overdue > 0 ? `${stats.overdue} attività scadute` : "alcune attività aperte"} — dimmi cosa prioritizzare oggi.` } }))}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 transition-colors dark:bg-orange-950/20 dark:text-orange-300 dark:border-orange-900/40"
                title="Chiedi a Silvio come prioritizzare"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {/* A 768px la colonna è di 320px: solo l'icona, se no «Nuova» va a capo. */}
                <span className="hidden sm:inline md:hidden lg:inline">Silvio</span>
              </button>
              {/* Desktop: «Nuova» apre la scheda completa. Mobile: apre la riga
                  di aggiunta veloce (titolo e invio). Silvio ha già il bottone
                  centrale in basso. */}
              <Button size="sm" className="hidden sm:inline-flex h-8 gap-1.5" disabled={solaLettura || mutationBusy} title={creaTitle} onClick={() => openCreate(calendarDate || undefined)}>
                <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuova</span>
              </Button>
              <Button size="sm" className="tap-compact sm:hidden h-8 gap-1 px-3" disabled={solaLettura} title={creaTitle} onClick={apriAggiunta}>
                <Plus className="h-4 w-4" />Nuova
              </Button>
            </div>
          </div>

          {/* «Di chi» sta nella riga della ricerca, in una tendina: le pillole,
              una per persona, diventavano una riga da scorrere di lato che
              col mouse non si scorre (a 1024px si leggeva «M. B»). Su mobile
              la scelta sta nel pannello «Filtri». */}
          {/* Filtri stato — "quando". Da tablet vanno a capo invece di
              scorrere di lato: col mouse l'ultima pillola restava tagliata. */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:gap-1 sm:overflow-visible">
            {([
              { key: "tutte", label: "Aperte", count: stats.total },
              { key: "oggi", label: "Oggi", count: stats.today },
              { key: "scadute", label: "Scadute", count: stats.overdue },
              { key: "settimana", label: "7 giorni", count: stats.week },
              { key: "senza-data", label: "Senza data", count: stats.undated },
              { key: "completate", label: "Completate", count: stats.completed },
            ] as const).map(f => (
              <button key={f.key} aria-pressed={!calendarDate && filter === f.key} onClick={() => { onCalendarDateClear?.(); setFilter(f.key); setSelectedIds(new Set()); }}
                className={`tap-compact inline-flex shrink-0 items-center gap-1 h-8 md:h-7 px-3 sm:px-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors active:scale-95 ${!calendarDate && filter === f.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                {f.label}
                {/* Il totale da tablet è già accanto al titolo: su «Tutte» era un doppione. */}
                {f.count != null && f.count > 0 && <span className={`text-[10px] ${filter === f.key ? "opacity-80" : ""} ${f.key === "tutte" ? "sm:hidden" : ""}`}>({f.count})</span>}
              </button>
            ))}
          </div>

          {/* Ricerca e controlli. Mobile: una riga sola — ricerca e bottone
              «di chi» che apre il pannello con persona e raggruppamento. */}
          <div className="flex flex-row items-center gap-2 mt-2">
            <div className="flex-1 min-w-0 relative">
              <Input
                aria-label="Cerca attività" placeholder="Cerca attività..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 text-base md:text-sm pl-8"
              />
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label="Pulisci ricerca"><X className="h-3 w-3" /></button>}
            </div>
            {/* Mobile: raggruppamento e opzioni della lista personale. */}
            <button
              type="button"
              onClick={() => setFiltriAperti(true)}
              className="sm:hidden inline-flex items-center gap-1.5 h-9 max-w-[45%] shrink-0 rounded-md border bg-background px-2.5 text-xs font-medium"
              aria-label="Filtri attività"
            >
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">Opzioni</span>
              {groupBy !== "none" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              {/* Raggruppa, vista compatta e selezione multipla: tre comandi
                  che si usano di rado, prima tre bottoni. Il pallino dice che
                  la vista non è quella di base. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="relative h-9 w-9 shrink-0 p-0" aria-label="Opzioni della lista">
                    <MoreHorizontal className="h-4 w-4" />
                    {(groupBy !== "none" || compact) && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Raggruppa per</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={groupBy} onValueChange={v => { setGroupBy(v as GroupBy); setCollapsedGroups(new Set()); }}>
                    {GROUP_OPTIONS.map(g => <DropdownMenuRadioItem key={g.value} value={g.value}>{g.value === "none" ? "Nessun gruppo" : g.label}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={compact} onCheckedChange={v => setCompact(v === true)}>Vista compatta</DropdownMenuCheckboxItem>
                  <DropdownMenuItem onClick={() => setSelectionMode(v => { if (v) setSelectedIds(new Set()); return !v; })}>
                    <ListChecks className="mr-2 h-3.5 w-3.5" />{selectionMode ? "Esci dalla selezione" : "Seleziona più attività"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
          {/* Bulk action bar — visibile in modalità selezione o quando c'è già
              una selezione; su mobile wrap, su desktop 1 riga */}
          {(hasSelection || selectionMode) && (
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === visibleTasks.filter(t => !solaLettura && !isTaskBlockedStatus(t.status, taskStatuses) && (isAdmin || t.assigned_to === user?.id)).length} onChange={selectAll} className="h-4 w-4 accent-primary shrink-0" aria-label="Seleziona le attività gestibili di questa pagina" />
                <span className="text-xs font-medium truncate">
                  {selectedIds.size > 0
                    ? `${selectedIds.size} ${selectedIds.size === 1 ? "selezionata" : "selezionate"}`
                    : "Tocca le attività da selezionare"}
                </span>
                <button onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }} className="p-1 text-muted-foreground hover:text-foreground ml-auto sm:hidden" aria-label="Chiudi selezione"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "completata" })}>
                  <CheckCircle className="h-3.5 w-3.5" />Fatte
                </Button>
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "in_corso" })}>
                  <PlayCircle className="h-3.5 w-3.5" />In corso
                </Button>
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "da_fare" })}>
                  <Circle className="h-3.5 w-3.5" />Da fare
                </Button>
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none text-red-600 hover:text-red-700" onClick={() => setBulkConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />Elimina
                </Button>
                <button onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }} className="hidden sm:inline-flex p-1 text-muted-foreground hover:text-foreground ml-1" aria-label="Chiudi selezione"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}

          {isError ? (
            <InlineLoadError
              title="Errore nel caricamento attività"
              description={error instanceof Error ? error.message : "Non riesco a leggere le attività in questo momento."}
              onRetry={() => refetch()}
            />
          ) : isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              {/* Quick add (su mobile solo dopo «Nuova») */}
              {(!isMobile || aggiuntaAperta) && (
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input ref={quickAddRef} placeholder={solaLettura ? "Sei in sola lettura" : "Aggiungi attività…"} value={quickAddTitle}
                    disabled={solaLettura || mutationBusy}
                    onBlur={() => { if (isMobile && !quickAddTitle.trim()) setAggiuntaAperta(false); }}
                    onChange={e => setQuickAddTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !createTask.isPending) handleQuickAdd(); if (e.key === "Escape") { setQuickAddTitle(""); quickAddRef.current?.blur(); } }}
                    className="h-9 text-base md:text-sm pr-8" />
                  {quickAddTitle && <button onClick={() => setQuickAddTitle("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <Button variant="outline" size="sm" className="h-9 shrink-0" aria-label="Aggiungi attività rapida" onClick={handleQuickAdd} disabled={solaLettura || !quickAddTitle.trim() || mutationBusy} title={creaTitle}>
                  {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              )}

              {/* Grouped view */}
              <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1" aria-label="Elenco attività">
              {groupBy !== "none" && groupedTasks ? (
                groupedTasks.size === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                    <Filter className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">Nessuna attività trovata</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...groupedTasks.entries()].map(([key, tasks]) => renderGroup(key, tasks))}
                  </div>
                )
              ) : showDefaultSections ? (
                <div className="space-y-4">{defaultGroups.map(group => <section key={group.label} className="space-y-2" aria-label={`${group.label}: ${group.tasks.length} attività in questa pagina`}><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label} <span className="font-normal">({group.tasks.length})</span></h3><div className={compact ? "space-y-1" : "space-y-2"}>{group.tasks.map(renderTask)}</div></section>)}</div>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                  <Filter className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      // Messaggio contestuale: dice ESATTAMENTE quale combinazione
                      // di filtri è vuota (es. "Nessuna attività scaduta di Mario
                      // Bianchi"), invece del generico "per questo filtro".
                      const who = " assegnata a te";
                      const what = filter === "scadute" ? " scaduta"
                        : filter === "oggi" ? " per oggi"
                          : filter === "settimana" ? " questa settimana"
                            : filter === "completate" ? " completata" : "";
                      return `Nessuna attività${what}${who}${searchQuery ? ` per «${searchQuery}»` : ""}`;
                    })()}
                  </p>
                  {(filter !== "tutte" || !!searchQuery) && (
                    <button
                      type="button"
                      onClick={() => { setFilter("tutte"); setSearchQuery(""); setSelectedIds(new Set()); }}
                      className="mt-2 text-xs font-semibold text-primary hover:underline"
                    >
                      Mostra tutte le mie attività
                    </button>
                  )}
                </div>
              ) : (
                <div className={compact ? "space-y-1" : "space-y-2"}>{visibleTasks.map(renderTask)}</div>
              )}
              </div>
              {filteredTasks.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p role="status" className="text-xs text-muted-foreground">{(currentPage - 1) * 20 + 1}–{Math.min(currentPage * 20, filteredTasks.length)} di {filteredTasks.length} attività</p><div className="flex gap-1"><Button variant="outline" size="sm" className="h-8 text-xs" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedIds(new Set()); }}>Precedenti</Button><Button variant="outline" size="sm" className="h-8 text-xs" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelectedIds(new Set()); }}>Successive</Button></div></div>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog crea/modifica task ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{readOnlyDialog ? "Dettagli attività" : editingTask ? "Modifica attività" : "Nuova attività"}</DialogTitle>
            <DialogDescription className="sr-only">{editingTask ? "Modifica i dettagli dell'attività." : "Crea una nuova attività."}</DialogDescription>
          </DialogHeader>
          <fieldset disabled={readOnlyDialog || mutationBusy} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Titolo *</Label>
              <Input id="task-title" placeholder="Cosa devi fare?" value={formTitle} onChange={e => setFormTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && formTitle.trim()) handleSave(); }} autoFocus={!isMobile || !editingTask} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Descrizione</Label>
              <Textarea id="task-notes" placeholder="Aggiungi dettagli, link, note..." value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="resize-none" />
            </div>
            {/* Senza questo campo l'attività nasceva slegata: non si vedeva né
                nella scheda del cliente né in quella dell'opportunità. */}
            <div className="space-y-1.5">
              <Label>Collegata a</Label>
              <CollegaAttivitaPicker companyId={companyId} valore={formCollegamento} onChange={setFormCollegamento} />
              {formCollegamento?.tipo === "opportunita" && canViewMarketingOpportunities && (
                <Link to={linkOpportunita("/azienda/marketing", formCollegamento.id)} onClick={() => setDialogOpen(false)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  Apri l'opportunità
                </Link>
              )}
              {formCollegamento?.tipo === "contatto" && canViewMarketingContacts && (
                <Link to={linkContatto("/azienda/marketing", formCollegamento.id)} onClick={() => setDialogOpen(false)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  Apri il contatto
                </Link>
              )}
            </div>
            {/* Mobile: i campi brevi in una griglia sola a due colonne (a tre
                colonne «Categoria» e la data si troncavano); la categoria resta
                al desktop. */}
            <div className="grid grid-cols-2 gap-3 sm:block sm:space-y-4">
            {/* Assegna a (admin) + Priorità */}
            <div className="grid grid-cols-2 gap-3 max-sm:contents">
              {isAdmin && (
                <div className="space-y-1.5">
                  <Label>Assegna a</Label>
                  <Select value={formAssignedTo} onValueChange={setFormAssignedTo}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={user?.id ?? ""}>
                        <span className="flex items-center gap-2">Me stesso</span>
                      </SelectItem>
                      {teamMembers.filter(m => m.id !== user?.id).map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Priorità</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => {
                      const Icon = v.icon;
                      return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><Icon className={`h-3.5 w-3.5 ${k === "urgente" ? "text-red-500" : k === "alta" ? "text-orange-500" : k === "normale" ? "text-blue-500" : "text-slate-400"}`} />{v.label}</span></SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
              {!isAdmin && (
                <div className="space-y-1.5 max-sm:hidden">
                  <Label>Categoria</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {/* Categoria (admin) + Scadenza + Stato */}
            <div className={`grid gap-3 max-sm:contents ${editingTask ? "grid-cols-3" : "grid-cols-2"}`}>
              {isAdmin && (
                <div className="space-y-1.5 max-sm:hidden">
                  <Label>Categoria</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="task-due">Scadenza</Label>
                <Input id="task-due" type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} className="h-9" />
              </div>
              {editingTask && (
                <div className="space-y-1.5">
                  <Label>Stato</Label>
                  <Select disabled={!!editingTask && isTaskBlockedStatus(editingTask.status, taskStatuses)} value={formStatus} onValueChange={setFormStatus}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{taskStatuses.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            </div>
          </fieldset>
          <DialogFooter className="gap-2">
            {/* Mobile: chiude la X in alto, resta un bottone solo. */}
            <Button variant="outline" className="max-sm:hidden" onClick={() => setDialogOpen(false)}>Annulla</Button>
            {editingTask && seesTeamTasks && <Button asChild variant="outline" className="gap-1 text-xs"><Link to={`/azienda/attivita?tab=regia&attivita=${encodeURIComponent(editingTask.id)}`} onClick={() => setDialogOpen(false)}><ExternalLink className="h-3 w-3" />Gestione completa</Link></Button>}
            {!readOnlyDialog && <Button onClick={handleSave} disabled={!formTitle.trim() || mutationBusy}>
              {(createTask.isPending || updateTask.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTask ? "Salva" : "Crea"}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Conferma eliminazione singola ── */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(o) => !o && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questa attività?</AlertDialogTitle>
            <AlertDialogDescription>L'azione è irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (taskToDelete) deleteTask.mutate(taskToDelete);
                setTaskToDelete(null);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Conferma eliminazione multipla ── */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {selectedIds.size} attività?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare {selectedIds.size} {selectedIds.size === 1 ? "attività" : "attività"}. L'azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ConfermaQuantita stato={confermaBulk} cosa="attività" />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!confermaBulk.valida}
              onClick={(e) => {
                if (!confermaBulk.valida) { e.preventDefault(); return; }
                bulkDelete.mutate([...selectedIds]);
                setBulkConfirmOpen(false);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Le opzioni cambiano il raggruppamento, mai la visibilità personale. */}
      <Sheet open={filtriAperti} onOpenChange={setFiltriAperti}>
        <SheetContent side="bottom" className="rounded-t-2xl px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[80dvh] overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>Filtri</SheetTitle>
            <SheetDescription>Come raggruppare le tue attività.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Raggruppa per</p>
              <div className="grid grid-cols-2 gap-2">
                {GROUP_OPTIONS.map(g => (
                  <button key={g.value} type="button"
                    onClick={() => { setGroupBy(g.value); setCollapsedGroups(new Set()); }}
                    className={`h-11 rounded-lg border text-sm font-medium transition-colors ${groupBy === g.value ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                    {g.value === "none" ? "Nessun gruppo" : g.label}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full h-11" onClick={() => setFiltriAperti(false)}>Fatto</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab content — Attività (Dashboard Widget)
// ─────────────────────────────────────────────────────────────────────────────
function TabAttivita() {
  const { user, effectiveCompany, role } = useAuth();
  const isAdmin = role === "company_admin";
  const isMobile = useIsMobile();
  const [addTaskDate, setAddTaskDate] = useState<AddTaskRequest | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [openTaskRequest, setOpenTaskRequest] = useState<{ id: string; requestId: number } | null>(null);
  const [mobileAgenda, setMobileAgenda] = useState(false);
  const [mobileTeam, setMobileTeam] = useState(false);
  const requestSequence = useRef(0);
  const permissions = usePermissions();
  const taskQuery = useDashboardTasks();
  const observedStatuses = useMemo(() => [...new Set((taskQuery.data ?? []).map(t => t.status))], [taskQuery.data]);
  const { statuses } = useTaskStatuses(effectiveCompany?.id, observedStatuses);
  const agendaTasks = dashboardTasksForAssignee(taskQuery.data ?? [], "me", user?.id);
  const seesTeam = !permissions.isLoading && (permissions.isAdmin || permissions.canViewTeamTasks);

  // Striscia «focus del giorno»: colpo d'occhio su cosa fare, con le attività
  // dell'utente. Toccare un numero porta all'elenco giusto.
  const focus = dashboardTaskStats(agendaTasks, new Date(), statuses);
  const vaiAlleAttivita = () => document.getElementById("le-mie-attivita")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusTiles = [
    focus.overdue > 0 ? { key: "scadute", n: focus.overdue, label: "Scadute", cls: "border-red-300 bg-red-50 text-red-700", onClick: vaiAlleAttivita } : null,
    { key: "oggi", n: focus.today, label: "Oggi", cls: "border-primary/30 bg-primary/5 text-primary", onClick: () => { setCalendarDate(format(new Date(), "yyyy-MM-dd")); vaiAlleAttivita(); } },
    { key: "settimana", n: focus.week, label: "Prossimi 7 giorni", cls: "border-border bg-muted/40 text-foreground", onClick: vaiAlleAttivita },
  ].filter(Boolean) as Array<{ key: string; n: number; label: string; cls: string; onClick: () => void }>;

  return (
    <div className="space-y-4">
      {/* La timbratura è nella barra in alto (TimbraHeaderButton), raggiungibile
          da ogni pagina, non più qui nel corpo di Attività. */}

      {/* Focus del giorno: cosa aspetta l'utente, in un colpo d'occhio. */}
      <div className="flex flex-wrap gap-2">
        {focusTiles.map((t) => (
          <button key={t.key} type="button" onClick={t.onClick} className={cn("flex min-w-[88px] flex-1 flex-col rounded-xl border px-3 py-2 text-left transition hover:brightness-[0.97]", t.cls)}>
            <span className="text-xl font-bold tabular-nums">{t.n}</span>
            <span className="text-xs font-medium">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Dal cantiere: rapportini, timbrature dimenticate e bolle da approvare, solo per chi può
          approvarli. Senza niente in attesa non occupa posto. */}
      <DaApprovareCantieri />

      {/* Sinistra: Meteo + Calendario (integrati) · Destra: le mie attività.
          Da tablet due colonne con le attività a larghezza fissa: a un terzo
          di pagina, a 1024px, il pannello restava di 210px e tagliava
          ricerca e filtri; sotto i 1024 finiva in fondo, dopo il calendario. */}
      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Primaria: le mie attività — è quello che si usa ogni giorno, quindi in colonna larga. */}
        <div id="le-mie-attivita" className="min-w-0 space-y-4 scroll-mt-20">
          <MieAttivita
            initialDueDate={addTaskDate}
            calendarDate={calendarDate}
            onCalendarDateClear={() => setCalendarDate(null)}
            openTaskRequest={openTaskRequest}
          />
        </div>
        {/* Secondaria: meteo compatto, agenda (parte da «Giorno») e priorità del team. */}
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <MeteoWidget compatto />
          {isMobile && <Button variant="outline" className="w-full justify-between" onClick={() => setMobileAgenda(v => !v)} aria-expanded={mobileAgenda}><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Agenda personale</span><ChevronDown className={cn("h-4 w-4", mobileAgenda && "rotate-180")} /></Button>}
          {(!isMobile || mobileAgenda) && <DashboardAgenda
            tasks={agendaTasks} tasksLoading={taskQuery.isLoading} tasksError={taskQuery.isError} onTasksRetry={() => taskQuery.refetch()}
            statuses={statuses} selectedDate={calendarDate} onDateSelect={setCalendarDate}
            onAddTask={date => setAddTaskDate({ date, requestId: ++requestSequence.current })}
            onTaskOpen={id => setOpenTaskRequest({ id, requestId: ++requestSequence.current })}
          />}
          {seesTeam && (isMobile ? <div className="space-y-3"><Button variant="outline" className="w-full justify-between" onClick={() => setMobileTeam(v => !v)} aria-expanded={mobileTeam}><span className="flex items-center gap-2"><Users className="h-4 w-4" />Priorità del team</span><ChevronDown className={cn("h-4 w-4", mobileTeam && "rotate-180")} /></Button>{mobileTeam && <TeamTaskPulse compact />}</div> : <TeamTaskPulse compact />)}
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Priorità del team — lettura solo con il permesso dedicato
// ─────────────────────────────────────────────────────────────────────────────
export function TeamTaskPulse({ compact = false }: { compact?: boolean }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const permissions = usePermissions();
  const seesTeam = !permissions.isLoading && (permissions.isAdmin || permissions.canViewTeamTasks);
  const { data: pulseTasks = [], isLoading, isError, error, refetch } = useDashboardTasks("team");
  const observed = useMemo(() => [...new Set(pulseTasks.map(t => t.status))], [pulseTasks]);
  const { statuses } = useTaskStatuses(companyId, observed);
  const tasks = pulseTasks.filter(t => !isTaskDoneStatus(t.status, statuses) && !isTaskBlockedStatus(t.status, statuses));

  const pulse = useMemo(() => {
    const today = startOfDay(new Date());
    const openTasks = tasks.filter((task: any) => task.status !== "completata");
    const getDueDate = (task: any) => task.due_date ? parseISO(task.due_date) : null;
    const overdue = openTasks.filter((task: any) => {
      const dueDate = getDueDate(task);
      return dueDate && isBefore(dueDate, today) && !isToday(dueDate);
    });
    const dueToday = openTasks.filter((task: any) => {
      const dueDate = getDueDate(task);
      return dueDate && isToday(dueDate);
    });
    const urgent = openTasks.filter((task: any) => task.priority === "urgente");
    const unassigned = openTasks.filter((task: any) => !task.assigned_to);
    const unique = new Map<string, any>();
    [...overdue, ...urgent, ...dueToday, ...unassigned].forEach((task: any) => unique.set(task.id, task));

    return {
      overdue,
      dueToday,
      urgent,
      unassigned,
      priorities: Array.from(unique.values()).slice(0, 6),
      openCount: openTasks.length,
    };
  }, [tasks]);

  const metrics = [
    { label: "Scadute", value: pulse.overdue.length, className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300" },
    { label: "Urgenti", value: pulse.urgent.length, className: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/20 dark:text-orange-300" },
    { label: "Oggi", value: pulse.dueToday.length, className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300" },
    { label: "Senza assegnatario", value: pulse.unassigned.length, className: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300" },
  ];

  if (!seesTeam) return null;

  return (
    <Card role="region" aria-label="Priorità del team">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpCircle className="h-4 w-4" />{compact ? "Priorità del team" : "Regia rapida"}
          </CardTitle>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
            <Link to="/azienda/attivita?tab=regia">
              Apri regia <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Attività del team che sei autorizzato a consultare. La tua agenda resta personale.</p>
        {isError ? (
          <InlineLoadError
            title="Errore nel caricamento della regia"
            description={error instanceof Error ? error.message : "Non riesco a leggere le attività aziendali in questo momento."}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="space-y-4">
            <div className={cn("grid grid-cols-2 gap-3", !compact && "md:grid-cols-4")}>
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-20 w-full" />)}
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : pulse.openCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna attività aperta da gestire</p>
        ) : (
          <div className="space-y-4">
            <div className={cn("grid grid-cols-2 gap-3", !compact && "md:grid-cols-4")}>
              {metrics.map((metric) => (
                <div key={metric.label} className={`rounded-lg border p-3 ${metric.className}`}>
                  <p className="text-xs font-medium opacity-80">{metric.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{metric.value}</p>
                </div>
              ))}
            </div>
            {/* Lista senza riquadro proprio: stava in una cornice dentro la
                card, dentro la pagina. */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priorità da guardare</p>
                <span className="text-xs tabular-nums text-muted-foreground">{pulse.openCount} aperte</span>
              </div>
              {pulse.priorities.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">Nessuna criticità immediata.</p>
              ) : (
                <div className="divide-y border-y">
                  {pulse.priorities.slice(0, compact ? 3 : 6).map((task: any) => {
                    const priority = PRIORITY_CONFIG[task.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                    const dueDate = task.due_date ? parseISO(task.due_date) : null;
                    const scaduta = dueDate && isBefore(dueDate, startOfDay(new Date())) && !isToday(dueDate);
                    const assigneeName = [task.assignee?.first_name, task.assignee?.last_name].filter(Boolean).join(" ") || "Non assegnata";

                    return (
                      <div key={task.id} className="flex flex-wrap items-center gap-2 px-1 py-2 text-sm">
                        <div className={`h-2 w-2 shrink-0 rounded-full ${priority.dotClass}`} />
                        <Link to={`/azienda/attivita?tab=regia&attivita=${encodeURIComponent(task.id)}`} className={cn("flex-1 font-medium text-primary hover:underline", compact ? "w-full basis-full line-clamp-2" : "min-w-[180px] truncate")}>{task.title}</Link>
                        <span className="text-xs text-muted-foreground">{assigneeName}</span>
                        {task.category && <Badge variant="outline" className="text-[10px]">{CATEGORY_OPTIONS.find(c => c.value === task.category)?.label || task.category}</Badge>}
                        {dueDate && (
                          <Badge variant="outline" className={`text-[10px] ${scaduta ? "border-red-200 bg-red-50 text-red-700" : isToday(dueDate) ? "border-amber-200 bg-amber-50 text-amber-700" : ""}`}>
                            {scaduta ? "Scaduta" : isToday(dueDate) ? "Oggi" : format(dueDate, "d MMM", { locale: it })}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback loading
// ─────────────────────────────────────────────────────────────────────────────
function TabFallback() {
  return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagina principale con Tabs
// ─────────────────────────────────────────────────────────────────────────────
export default function AttivitaStaff() {
  const { effectiveCompany, user } = useAuth();
  if (!user?.id) return <p role="status">Caricamento attività…</p>;
  if (!effectiveCompany?.id) return <Card><CardContent className="p-4">Seleziona un’azienda per consultare le attività.</CardContent></Card>;
  return <AttivitaAzienda key={`${effectiveCompany.id}:${user?.id}`} />;
}

function AttivitaAzienda() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin";
  // La Regia è lo strumento "di team": la vede l'admin e chi ha il permesso
  // esplicito "Attività del team" (che già vedeva i filtri per persona nella
  // Dashboard ma non aveva la pagina per lavorarci). La RLS resta il confine.
  const { canViewTeamTasks } = usePermissions();
  const seesRegia = isAdmin || canViewTeamTasks;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "attivita";
  const allowedTabs = isAdmin
    ? ["attivita", "regia"]
    : seesRegia
      ? ["attivita", "regia", "timbrature", "ferie", "cedolini"]
      : ["attivita", "timbrature", "ferie", "cedolini"];
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : "attivita";

  useEffect(() => {
    if (requestedTab === activeTab) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (activeTab === "attivita") next.delete("tab");
      else next.set("tab", activeTab);
      return next;
    }, { replace: true });
  }, [activeTab, requestedTab, setSearchParams]);

  const handleTabChange = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "attivita") next.delete("tab");
      else next.set("tab", tab);
      return next;
    }, { replace: true });
  };

  return (
    // Il margine lo da' gia' <main> (12px su telefono, 24 da tablet): un
    // padding anche qui lo raddoppiava, 48px per lato sul desktop.
    <div>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {/* Saluto e linguette su una riga quando ci stanno: sotto il saluto
            restava una fascia vuota larga quanto la pagina. Su telefono il
            saluto non c'e' e restano le linguette da sole. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <AttivitaHeader />
          {isAdmin ? (
          <TabsList className="grid w-full max-w-full sm:w-80 grid-cols-2 h-auto">
            <TabsTrigger value="attivita" className="gap-1.5 text-xs sm:text-sm py-1.5 sm:py-2"><ClipboardCheck className="h-4 w-4" /><span>Dashboard</span></TabsTrigger>
            <TabsTrigger value="regia" className="gap-1.5 text-xs sm:text-sm py-1.5 sm:py-2"><Users className="h-4 w-4" /><span className="truncate">Regia<span className="hidden sm:inline"> attività</span></span></TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className={cn("grid w-full h-auto", seesRegia ? "grid-cols-5 max-w-2xl lg:w-[36rem]" : "grid-cols-4 max-w-xl lg:w-[30rem]")}>
            <TabsTrigger value="attivita" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><ClipboardCheck className="h-4 w-4" /><span className="truncate">Attività</span></TabsTrigger>
            {seesRegia && (
              <TabsTrigger value="regia" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Users className="h-4 w-4" /><span className="truncate">Regia</span></TabsTrigger>
            )}
            <TabsTrigger value="timbrature" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Clock className="h-4 w-4" /><span className="truncate">Timbra</span></TabsTrigger>
            <TabsTrigger value="ferie" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Palmtree className="h-4 w-4" /><span className="truncate">Ferie</span></TabsTrigger>
            <TabsTrigger value="cedolini" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Receipt className="h-4 w-4" /><span className="truncate">Cedolini</span></TabsTrigger>
          </TabsList>
          )}
        </div>
        <TabsContent value="attivita" className="mt-3 sm:mt-4"><TabAttivita /></TabsContent>
        {seesRegia && (
          <TabsContent value="regia" className="mt-3 sm:mt-4">
            <Suspense fallback={<TabFallback />}>
              <UnifiedTasks embedded initialTab="all" />
            </Suspense>
          </TabsContent>
        )}
        {!isAdmin && (
          <>
            <TabsContent value="timbrature" className="mt-3 sm:mt-4"><Suspense fallback={<TabFallback />}><TimbraturePersonali /></Suspense></TabsContent>
            <TabsContent value="ferie" className="mt-3 sm:mt-4"><Suspense fallback={<TabFallback />}><FeriePersonali /></Suspense></TabsContent>
            <TabsContent value="cedolini" className="mt-3 sm:mt-4"><Suspense fallback={<TabFallback />}><CedoliniPersonali /></Suspense></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

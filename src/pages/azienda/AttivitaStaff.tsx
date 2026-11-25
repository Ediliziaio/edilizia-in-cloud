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
import { BOTTONE_NUOVO } from "@/components/orders/TestataScheda";
import { Fragment, lazy, Suspense, useState, useMemo, useCallback, useRef, useEffect } from "react";
import { flushSync } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  format, isToday, isBefore, startOfDay, addDays,
  parseISO,
} from "date-fns";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
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
import { CantieriTecniciLink } from "@/components/campo/CantieriTecniciLink";
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
import { useUfficiAttivi } from "@/hooks/useUffici";
import { TaskAssignmentFields } from "@/components/tasks/TaskAssignmentFields";
import { taskAssignment } from "@/lib/attivita/taskAssignment";
import { TaskOrderLink } from "@/components/tasks/TaskOrderLink";
import { invalidateOfficeWorkspace } from "@/lib/orders/officeWorkspace";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { useDashboardTasks } from "@/hooks/useDashboardTasks";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { dashboardDateKey, dashboardTasksForAssignee, dashboardTaskStats, dashboardTaskDateGroup, filterDashboardTasks, type DashboardTaskFilter } from "@/lib/attivita/dashboardTasks";
import { buildTaskStatusUpdate, getNextTaskStatusForQuickAction, getTaskStatusDefinition, getTaskStatusLabel, isTaskDoneStatus, isTaskBlockedStatus, TASK_STATUS_TONE_CLASSES } from "@/lib/taskStatuses";

import { ConfermaQuantita, useConfermaQuantita } from "@/components/shared/ConfermaQuantita";
import { DaApprovareCantieri, DaApprovareChip } from "@/components/campo/DaApprovareCantieri";
import { DocumentiDaConfermareBox } from "@/components/email-ai/DocumentiDaConfermareBox";
import { ScadenzeDittaBox } from "@/components/documentiAzienda/ScadenzeDittaBox";
import { EccezioniOperative } from "@/components/operazioni/EccezioniOperative";
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
  const t = useT();
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          {description && <p className="mt-1 text-xs text-red-800">{description}</p>}
        </div>
        <Button variant="outline" size="sm" className="h-7 border-red-200 bg-white text-red-700 hover:bg-red-100" onClick={onRetry}>
          {t("Riprova")}
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
  const t = useT();
  const oggi = format(new Date(), "EEEE d MMMM yyyy", { locale: dateFnsCampo() });
  const ora = new Date().getHours();
  const saluto = t(ora < 12 ? "Buongiorno, {nome}" : ora < 18 ? "Buon pomeriggio, {nome}" : "Buonasera, {nome}", { nome: profile?.first_name ?? "" });

  const isMobile = useIsMobile();
  // Su telefono niente data e saluto: la pagina parte dalle linguette.
  if (isMobile) return null;
  return (
    // Come le altre pagine (25/11/2026): titolo a 20px, la data accanto, piccola.
    <div className="flex flex-wrap items-baseline gap-x-2.5">
      <h1 className="text-xl font-bold leading-tight tracking-tight">
        {saluto}
      </h1>
      <p className="text-xs text-muted-foreground capitalize">{oggi}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Widget Meteo
// ─────────────────────────────────────────────────────────────────────────────
function MeteoWidget({ compatto = false }: { compatto?: boolean }) {
  const t = useT();
  const { data: location, isLoading: loadingLoc } = useCompanyLocation();
  // ?? garantisce coordinate stabili dal primo render, evita cambio query key
  // quando location carica (che causava il "meteo sparisce" durante il refetch)
  const lat = location?.lat ?? 45.4654;
  const lng = location?.lng ?? 9.1859;
  const { data: weatherMap, isLoading: loadingWeather, isError: weatherError, refetch: refetchWeather } = useWeatherForecast(lat, lng);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayWeather = weatherMap?.get(todayStr);

  const forecastDays: { date: string; weather: WeatherDay }[] = [];
  if (weatherMap) {
    for (const [date, weather] of weatherMap) {
      if (date !== todayStr) forecastDays.push({ date, weather });
      if (forecastDays.length === 3) break;
    }
  }

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
          <p>{t("Meteo non disponibile")}</p>
          {weatherError && (
            <button
              onClick={() => refetchWeather()}
              className="mt-2 text-xs text-primary underline hover:no-underline"
            >
              {t("Riprova")}
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
                <span className="capitalize">{format(new Date(date), "EEEEE", { locale: dateFnsCampo() })}</span>
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
              <MapPin className="h-2.5 w-2.5 shrink-0" />{location?.city ?? "Milano"} · {t(weatherCodeToLabel(todayWeather.code))}
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
                  <span className="capitalize text-muted-foreground">{format(new Date(date), "EEE", { locale: dateFnsCampo() })}</span>
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

export function MieAttivita({ initialDueDate, calendarDate, onCalendarDateClear, openTaskRequest, filter: controlledFilter, onFilterChange }: { initialDueDate?: AddTaskRequest | null; calendarDate?: string | null; onCalendarDateClear?: () => void; openTaskRequest?: { id: string; requestId: number } | null; filter?: TaskFilter; onFilterChange?: (filter: TaskFilter) => void }) {
  const { user, effectiveCompany, role } = useAuth();
  const tr = useT();
  const isAdmin = role === "company_admin";
  const { canViewTeamTasks, solaLettura, canViewMarketingContacts, canViewMarketingOpportunities, canViewOrders, canEditOrders } = usePermissions();
  const creaTitle = solaLettura ? tr("Sei in sola lettura") : undefined;
  // La lista è sempre personale. Il permesso team abilita il passaggio alla
  // Regia, dove la lettura segue i permessi e la visibilità assegnata.
  const seesTeamTasks = isAdmin || canViewTeamTasks;
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [localFilter, setLocalFilter] = useState<TaskFilter>("tutte");
  const filter = controlledFilter ?? localFilter;
  const setFilter = (next: TaskFilter) => { setLocalFilter(next); onFilterChange?.(next); };
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
  const [formOffice, setFormOffice] = useState("");
  const [formOrder, setFormOrder] = useState("");
  const canLinkOrder = isAdmin || canEditOrders;
  const taskSaveRef = useRef(false);
  const [areaView, setAreaView] = useState("all");
  const [claimingTaskId, setClaimingTaskId] = useState<string | null>(null);
  const offices = useUfficiAttivi(companyId);
  const availableOffices = offices.data.filter(o => isAdmin || o.membri.includes(user?.id ?? ""));
  // A chi è attaccata l'attività: cliente o opportunità (23/09/2026).
  const [formCollegamento, setFormCollegamento] = useState<CollegamentoAttivita | null>(null);

  const { data: teamMembers = [] } = useCompanyStaffUsers(isAdmin ? companyId : null);

  const { data: allTasks = [], isLoading, isError, error, refetch } = useDashboardTasks();
  const observedStatuses = useMemo(() => [...new Set(allTasks.map(t => t.status))], [allTasks]);
  const { statuses: taskStatuses } = useTaskStatuses(companyId, observedStatuses);
  const today = startOfDay(new Date());
  const tasksDiChi = useMemo(() => dashboardTasksForAssignee(allTasks, "me", user?.id).filter(t => areaView === "all" || (areaView === "personal" ? !t.ufficio_id : t.ufficio_id === areaView)), [allTasks, user?.id, areaView]);
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
  const claimAreaTask = async (id: string, release: boolean) => {
    if (claimingTaskId) return;
    setClaimingTaskId(id);
    try {
      const { error } = await supabase.rpc("attivita_prendi_in_carico" as never, { p_task: id, p_rilascia: release } as never);
      if (error) throw error;
      toast.success(release ? tr("Attività restituita all’area") : tr("Presa in carico confermata"));
    } catch (error) { toast.error(error instanceof Error ? error.message : String((error as { message?: string })?.message ?? tr("Presa in carico non confermata"))); }
    finally { setClaimingTaskId(null); await invalidate(); }
  };
  const checkWrite = () => { if (!companyId || !user?.id || solaLettura) throw new Error(tr("Non puoi modificare le attività in questo momento.")); };

  const createTask = useMutation({
    mutationFn: async (task: { title: string; notes?: string; priority: string; due_date?: string; category: string; assigned_to?: string; ufficio_id?: string; order_id?: string; collegamento?: CollegamentoAttivita | null }) => {
      checkWrite();
      if (task.order_id && !canLinkOrder) throw new Error(tr("Non puoi collegare attività a questa commessa."));
      const { data, error } = await supabase.from("tasks").insert({
        company_id: companyId!, ...taskAssignment({ officeId: task.ufficio_id, assigneeId: task.assigned_to, userId: user!.id, offices: availableOffices, canAssignOthers: isAdmin }), created_by: user!.id,
        title: task.title, notes: task.notes || null,
        priority: task.priority, due_date: task.due_date || null,
        category: task.category, status: "da_fare",
        order_id: task.order_id || null,
        activity_scope: task.order_id ? "ufficio" : "generale",
        ...(task.order_id ? { office_stage: "altro" } : {}),
        ...collegamentiDelModulo(task.collegamento),
      } as any).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error(tr("Creazione dell’attività non confermata."));
      return data;
    },
    onSuccess: async (_data, variables) => { toast.success(tr("Attività creata")); if (variables.order_id) invalidateOfficeWorkspace(queryClient, variables.order_id); await invalidate(); },
    onSettled: () => { taskSaveRef.current = false; },
    onError: (err: any) => { toast.error(tr("Errore: {messaggio}", { messaggio: err.message ?? tr("Riprovare") })); void invalidate(); },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      checkWrite();
      let q = supabase.from("tasks").update(updates).eq("id", id).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { error } = await q.select("id").single();
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => { toast.success(tr("Attività aggiornata")); if (variables.order_id) invalidateOfficeWorkspace(queryClient, variables.order_id); await invalidate(); },
    onSettled: () => { taskSaveRef.current = false; },
    onError: (err: any) => { toast.error(tr("Errore: {messaggio}", { messaggio: err.message ?? tr("Riprovare") })); void invalidate(); },
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      checkWrite();
      let q = supabase.from("tasks").delete().eq("id", taskId).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { error } = await q.select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(tr("Attività eliminata")); await invalidate(); },
    onError: (err: any) => { toast.error(tr("Errore: {messaggio}", { messaggio: err.message ?? tr("Riprovare") })); void invalidate(); },
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
      if (data?.length !== new Set(ids).size) throw new Error(tr("Alcune attività non sono più modificabili. Aggiorna la lista prima di riprovare."));
    },
    onSuccess: async (_, { ids, status }) => {
      const label = getTaskStatusLabel(status, taskStatuses);
      toast.success(tr("{n} attività → {stato}", { n: ids.length, stato: tr(label) }));
      setSelectedIds(new Set());
      await invalidate();
    },
    onError: (err: any) => { toast.error(tr("Errore: {messaggio}", { messaggio: err.message ?? tr("Riprovare") })); void invalidate(); },
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      checkWrite();
      let q = supabase.from("tasks").delete().in("id", ids).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { data, error } = await q.select("id");
      if (error) throw error;
      if (data?.length !== new Set(ids).size) throw new Error(tr("Alcune attività non sono più modificabili. Aggiorna la lista prima di riprovare."));
    },
    onSuccess: async (_, ids) => {
      toast.success(tr("{n} attività eliminate", { n: ids.length }));
      setSelectedIds(new Set());
      await invalidate();
    },
    onError: (err: any) => { toast.error(tr("Errore: {messaggio}", { messaggio: err.message ?? tr("Riprovare") })); void invalidate(); },
  });

  const postponeMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      checkWrite();
      let q = supabase.from("tasks").update({ due_date: newDate }).eq("id", id).eq("company_id", companyId!);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);

      const { error } = await q.select("id").single();
      if (error) throw error;
    },
    onSuccess: async () => { toast.success(tr("Scadenza posticipata di 7 giorni")); await invalidate(); },
    onError: (err: any) => { toast.error(tr("Errore: {messaggio}", { messaggio: err.message ?? tr("Riprovare") })); void invalidate(); },
  });

  const mutationBusy = createTask.isPending || updateTask.isPending || deleteTask.isPending || bulkUpdateStatus.isPending || bulkDelete.isPending || postponeMutation.isPending;
  const readOnlyDialog = solaLettura || !!(editingTask && !isAdmin && (editingTask.assigned_to !== user?.id || editingTask.ufficio_id && editingTask.created_by !== user?.id));

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
    setFormOffice("");
    setFormOrder("");
    setDialogOpen(true);
  }, [solaLettura, defaultAssignee, setEditingTask, setFormTitle, setFormNotes, setFormPriority, setFormDueDate, setFormCategory, setFormStatus, setFormAssignedTo, setFormCollegamento, setFormOffice, setFormOrder, setDialogOpen]);

  const openEdit = useCallback((t: any) => {
    setEditingTask(t);
    setFormTitle(t.title); setFormNotes(t.notes ?? "");
    setFormPriority(t.priority ?? "normale");
    setFormDueDate(t.due_date ?? ""); setFormCategory(t.category ?? "altro");
    setFormStatus(t.status ?? "da_fare");
    setFormAssignedTo(t.assigned_to ?? (t.ufficio_id ? "" : user?.id ?? ""));
    setFormOffice(t.ufficio_id ?? "");
    setFormOrder(t.order_id ?? "");
    setFormCollegamento(collegamentoDelTask(t));
    setDialogOpen(true);
  }, [user?.id, setEditingTask, setFormTitle, setFormNotes, setFormPriority, setFormDueDate, setFormCategory, setFormStatus, setFormAssignedTo, setFormCollegamento, setFormOffice, setFormOrder, setDialogOpen]);

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
    if (readOnlyDialog || mutationBusy || taskSaveRef.current) return;
    if (!formTitle.trim()) { toast.error(tr("Inserisci un titolo")); return; }
    if (formTitle.trim().length > 250) { toast.error(tr("Il titolo può contenere al massimo 250 caratteri")); return; }
    const assignmentChanged = !editingTask || (editingTask.assigned_to ?? "") !== formAssignedTo;
    if (assignmentChanged && (offices.isLoading || offices.isError)) { toast.error(tr("Attendi il caricamento delle aree o riprova.")); return; }
    if (assignmentChanged) {
      try { taskAssignment({ officeId: formOffice, assigneeId: formAssignedTo, userId: user!.id, offices: availableOffices, canAssignOthers: isAdmin }); }
      catch (error) { toast.error(error instanceof Error ? error.message : tr("Assegnazione non disponibile")); return; }
    }
    taskSaveRef.current = true;
    if (editingTask) {
      const updates: any = { id: editingTask.id, title: formTitle.trim(), notes: formNotes.trim() || null, priority: formPriority, due_date: formDueDate || null, category: formCategory, status: formStatus, ...collegamentiDelModulo(formCollegamento) };
      if (canLinkOrder) Object.assign(updates, { order_id: formOrder || null, ...(formOrder ? { activity_scope: "ufficio" } : {}) });
      if (isAdmin && assignmentChanged) updates.assigned_to = formAssignedTo || null;
      if (formStatus !== editingTask.status) Object.assign(updates, buildTaskStatusUpdate(formStatus, taskStatuses));
      updateTask.mutate(updates, { onSuccess: () => setDialogOpen(false) });
    } else {
      createTask.mutate({ order_id: formOrder || undefined, ufficio_id: formOffice || undefined, title: formTitle.trim(), notes: formNotes.trim(), priority: formPriority, due_date: formDueDate || undefined, category: formCategory, assigned_to: formOffice ? formAssignedTo || undefined : isAdmin ? formAssignedTo : undefined, collegamento: formCollegamento }, { onSuccess: () => setDialogOpen(false) });
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
              aria-label={isSelected ? tr("Deseleziona attività") : tr("Seleziona attività")}
            />
          ) : (
            <button
              onClick={() => !isDone && !blocked && canManage && markDone(t)}
              disabled={isDone || blocked || !canManage}
              className={`shrink-0 transition-colors ${isDone ? "text-green-500" : canManage ? "text-muted-foreground/30 hover:text-green-500" : "text-muted-foreground/20"}`}
              aria-label={`${isDone ? tr("Attività completata") : blocked ? tr("Attività in attesa") : tr("Passa a {stato}", { stato: tr(nextStatus.label) })}: ${t.title}`}
              title={isDone ? tr("Completata") : blocked ? tr("In attesa dell’attività precedente") : canManage ? tr("Passa a {stato}", { stato: tr(nextStatus.label) }) : tr("Attività in sola lettura")}
            >
              {isDone ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </button>
          )}
          {/* Title */}
          <button type="button" dir="auto" className={`flex-1 truncate text-left ${isDone ? "line-through text-muted-foreground" : ""}`} onClick={() => openEdit(t)}>{t.title}</button>
          {/* Assignee avatar */}
          {assigneeName && (
            <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded-full shrink-0 font-medium">{assigneeName.split(" ").map((n: string) => n[0]).join("")}</span>
          )}
          {/* Priority dot */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} title={tr(cfg.label)} />
          {/* Due date */}
          {t.ufficio_id && <span className="text-xs" onClick={e => e.stopPropagation()}>
              <span>{(offices.data ?? []).find(o => o.id === t.ufficio_id)?.nome ?? tr("Area")} · {t.assignee ? [t.assignee.first_name,t.assignee.last_name].filter(Boolean).join(" ") : tr("Da prendere in carico")}</span>
              {!solaLettura && !isDone && (!t.assigned_to || t.assigned_to === user?.id) &&
                <Button variant="outline" size="sm" disabled={claimingTaskId !== null} onClick={() => void claimAreaTask(t.id, !!t.assigned_to)}>{t.assigned_to ? tr("Rilascia all’area") : tr("Me ne occupo io")}</Button>}
            </span>}
            {t.due_date && (
            <span className={`text-[10px] shrink-0 ${scaduta ? "text-red-500 font-semibold" : isToday(parseISO(t.due_date.slice(0, 10))) ? "text-amber-600" : "text-muted-foreground"}`}>
              {isToday(parseISO(t.due_date.slice(0, 10))) ? tr("Oggi") : format(parseISO(t.due_date.slice(0, 10)), "d/MM", { locale: dateFnsCampo() })}
            </span>
          )}
          {/* Posticipa +7gg — visibile subito sulle scadute */}
          {scaduta && canManage && (
            <button
              onClick={(e) => { e.stopPropagation(); postponeMutation.mutate({ id: t.id, newDate: format(addDays(new Date(), 7), "yyyy-MM-dd") }); }}
              className="p-1 -m-0.5 text-amber-500 hover:text-amber-600 shrink-0 transition-colors"
              title={tr("Posticipa di 7 giorni")}
              aria-label={tr("Posticipa di 7 giorni")}
            >
              <CalendarClock className="h-3.5 w-3.5" />
            </button>
          )}
          {/* Quick actions: visibili sempre su mobile (no hover), opacity transition solo su md+ */}
          {canManage && (
            <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
              <button onClick={() => openEdit(t)} className="p-1 -m-0.5 text-muted-foreground hover:text-foreground" title={tr("Modifica")} aria-label={tr("Modifica attività")}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setTaskToDelete(t.id)} className="p-1 -m-0.5 text-muted-foreground hover:text-red-500" title={tr("Elimina")} aria-label={tr("Elimina attività")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      );
    }

    // Vista normale — card
    return (
      <div key={t.id} className={`group flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 transition-all hover:shadow-sm hover:border-primary/20 ${isDone ? "opacity-50" : ""} ${scaduta ? "sm:border-red-200 sm:dark:border-red-900/30 sm:bg-red-50/30 sm:dark:bg-red-950/10" : ""} ${isSelected ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}>
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
              aria-label={isSelected ? tr("Deseleziona attività") : tr("Seleziona attività")}
            />
          ) : (
            <button
              onClick={() => !isDone && !blocked && canManage && markDone(t)}
              disabled={isDone || blocked || !canManage}
              className={`tap-compact -m-1 p-1 transition-colors ${isDone ? "text-green-500" : canManage ? "text-muted-foreground/30 hover:text-green-500" : "text-muted-foreground/20"}`}
              aria-label={`${isDone ? tr("Attività completata") : blocked ? tr("Attività in attesa") : tr("Passa a {stato}", { stato: tr(nextStatus.label) })}: ${t.title}`}
              title={isDone ? tr("Completata") : blocked ? tr("In attesa dell’attività precedente") : canManage ? tr("Passa a {stato}", { stato: tr(nextStatus.label) }) : tr("Attività in sola lettura")}
            >
              {isDone ? <CheckCircle className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
            </button>
          )}
        </div>

        {/* Content — titolo leggibile su TUTTA la larghezza (fino a 2 righe) +
            una sola riga meta. La priorità è un pallino colorato: non ruba
            spazio al titolo e alleggerisce il testo. */}
        <div className="flex-1 min-w-0">
          <button type="button" dir="auto" onClick={() => openEdit(t)} className={`w-full text-left font-medium text-[13px] leading-snug line-clamp-2 ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</button>
          {/* Riga meta su UNA sola riga: priorità (pallino) · stato · scadenza.
              overflow-hidden: le voci meno importanti (categoria/assegnatario/
              ordine) si troncano invece di mandare a capo la card. */}
          <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground">
            <span className={`h-2 w-2 shrink-0 rounded-full ${cfg.dotClass}`} title={tr("Priorità {livello}", { livello: tr(cfg.label) })} />
            {/* Telefono: «Da fare» è lo stato di quasi tutte e non distingue niente; gli altri stati restano. */}
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", stCfg.className, stCfg.label === "Da fare" && "max-sm:hidden")}>{stCfg.label}</Badge>
            {t.ufficio_id && <span className="text-xs" onClick={e => e.stopPropagation()}>
              <span>{(offices.data ?? []).find(o => o.id === t.ufficio_id)?.nome ?? tr("Area")} · {t.assignee ? [t.assignee.first_name,t.assignee.last_name].filter(Boolean).join(" ") : tr("Da prendere in carico")}</span>
              {!solaLettura && !isDone && (!t.assigned_to || t.assigned_to === user?.id) &&
                <Button variant="outline" size="sm" disabled={claimingTaskId !== null} onClick={() => void claimAreaTask(t.id, !!t.assigned_to)}>{t.assigned_to ? tr("Rilascia all’area") : tr("Me ne occupo io")}</Button>}
            </span>}
            {t.due_date && (
              <span className={`shrink-0 ${scaduta ? "text-red-500 font-semibold" : isDone ? "" : isToday(parseISO(t.due_date.slice(0, 10))) ? "text-amber-600 font-medium" : ""}`}>
                {isToday(parseISO(t.due_date.slice(0, 10))) ? tr("Oggi") : format(parseISO(t.due_date.slice(0, 10)), t.due_date.slice(0, 4) === String(today.getFullYear()) ? "d MMM" : "d MMM yyyy", { locale: dateFnsCampo() })}
              </span>
            )}
            {catLabel && <span className="flex min-w-0 items-center gap-1"><Tag className="w-3 h-3 shrink-0" /><span className="truncate">{tr(catLabel)}</span></span>}
            {assigneeName && <span className="flex shrink-0 items-center gap-1 text-violet-600 dark:text-violet-400 font-medium"><Users className="w-3 h-3" />{assigneeName}</span>}
            {/* Telefono: il codice commessa non si ripete se è già nel titolo. */}
            {t.order?.order_code && (canViewOrders && t.order_id ? <Link to={`/azienda/ordini/${t.order_id}`} onClick={(e) => e.stopPropagation()} className={cn("flex shrink-0 items-center gap-1 hover:text-foreground transition-colors", t.title.includes(t.order.order_code) && "max-sm:hidden")}><ExternalLink className="w-3 h-3" />{t.order.order_code}</Link> : <span>{t.order.order_code}</span>)}
            {collegata && (hrefCollegata ? (
              <Link
                to={hrefCollegata}
                onClick={(e) => e.stopPropagation()}
                className="flex min-w-0 items-center gap-1 text-foreground/70 hover:text-foreground hover:underline transition-colors"
                title={collegata.icona === "opportunita" ? tr("Apri l'opportunità collegata") : tr("Apri il contatto collegato")}
              >
                {collegata.icona === "opportunita" ? <Target className="w-3 h-3 shrink-0" /> : <UserIcon className="w-3 h-3 shrink-0" />}
                <span className="truncate">{collegata.testo}</span>
              </Link>
            ) : (
              <span className="flex min-w-0 items-center gap-1 text-foreground/70" title={collegata.icona === "opportunita" ? tr("Opportunità collegata") : tr("Cliente collegato")}>
                {collegata.icona === "opportunita" ? <Target className="w-3 h-3 shrink-0" /> : <UserIcon className="w-3 h-3 shrink-0" />}
                <span className="truncate">{collegata.testo}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        {canManage && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity" aria-label={tr("Azioni attività")}><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Mobile: «Modifica» è il tocco sulla card e «Segna come fatta» il cerchio. */}
            {!isMobile && <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-2" />{tr("Modifica")}</DropdownMenuItem>}
            {!isDone && !blocked && !isMobile && <DropdownMenuItem onClick={() => markDone(t)}><CheckCircle2 className="h-3.5 w-3.5 mr-2" />{tr("Passa a {stato}", { stato: tr(nextStatus.label) })}</DropdownMenuItem>}
            {scaduta && <DropdownMenuItem onClick={() => postponeMutation.mutate({ id: t.id, newDate: format(addDays(new Date(), 7), "yyyy-MM-dd") })}><CalendarClock className="h-3.5 w-3.5 mr-2" />{tr("Posticipa +7 giorni")}</DropdownMenuItem>}
            {t.status === "da_fare" && <DropdownMenuItem onClick={() => updateTask.mutate({ id: t.id, status: "in_corso" })}><PlayCircle className="h-3.5 w-3.5 mr-2" />{tr("Inizia (In corso)")}</DropdownMenuItem>}
            {(!isMobile || scaduta || t.status === "da_fare") && <DropdownMenuSeparator />}
            <DropdownMenuItem className="text-red-600" onClick={() => setTaskToDelete(t.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />{tr("Elimina")}</DropdownMenuItem>
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
        <button aria-expanded={!isCollapsed} onClick={() => toggleGroup(key)} className="flex items-center gap-2 w-full text-left py-1 hover:bg-muted/30 rounded px-1 -mx-1">
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-90"}`} />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{tr(key)}</span>
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
      <Card data-testid="dashboard-task-manager" role="region" aria-label={tr("Gestione delle attività")}>
        <CardHeader className="p-3 sm:p-4 sm:pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2 className="flex items-center gap-2 text-base font-semibold shrink-0 max-md:text-[15px]">
                <ClipboardCheck className="h-4 w-4 text-primary" /><span className="max-sm:hidden">{tr("Le mie attività")}</span>
                {/* Telefono: titolo corto, così «+ Nuova» resta sulla stessa riga. */}
                <span className="sm:hidden">{tr("Attività")}</span>
                {!calendarDate && stats.total > 0 && <Badge variant="secondary" className="text-xs">{stats.total}</Badge>}
              </h2>
              {calendarDate && (
                <button
                  onClick={() => { onCalendarDateClear?.(); }}
                  className="tap-compact inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  title={tr("Rimuovi filtro data")}
                >
                  <CalendarDays className="h-3 w-3" />
                  {format(parseISO(calendarDate), calendarDate.slice(0, 4) === String(today.getFullYear()) ? "d MMM" : "d MMM yyyy", { locale: dateFnsCampo() })}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft: `Cosa conta ora? Ho ${stats.overdue > 0 ? `${stats.overdue} attività scadute` : "alcune attività aperte"} — dimmi cosa prioritizzare oggi.` } }))}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 transition-colors dark:bg-orange-950/20 dark:text-orange-300 dark:border-orange-900/40"
                title={tr("Chiedi a Silvio come prioritizzare")}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {/* A 768px la colonna è di 320px: solo l'icona, se no «Nuova» va a capo. */}
                <span className="hidden sm:inline md:hidden lg:inline">Silvio</span>
              </button>
              {/* Desktop: «Nuova» apre la scheda completa. Mobile: apre la riga
                  di aggiunta veloce (titolo e invio). Silvio ha già il bottone
                  centrale in basso. */}
              <Button size="sm" className={cn(BOTTONE_NUOVO, "hidden sm:inline-flex")} disabled={solaLettura || mutationBusy} title={creaTitle} onClick={() => openCreate(calendarDate || undefined)}>
                <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">{tr("Nuova")}</span>
              </Button>
              <Button size="sm" className={cn(BOTTONE_NUOVO, "tap-compact sm:hidden")} disabled={solaLettura} title={creaTitle} onClick={apriAggiunta}>
                <Plus className="h-4 w-4" />{tr("Nuova")}
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
                {tr(f.label)}
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
                aria-label={tr("Cerca attività")} placeholder={tr("Cerca attività...")}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 text-base sm:h-8 md:text-xs pl-8"
              />
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label={tr("Pulisci ricerca")}><X className="h-3 w-3" /></button>}
            </div>
            {/* Mobile: raggruppamento e opzioni della lista personale. */}
            <button
              type="button"
              onClick={() => setFiltriAperti(true)}
              className="sm:hidden inline-flex items-center gap-1.5 h-9 max-w-[45%] shrink-0 rounded-md border bg-background px-2.5 text-xs font-medium"
              aria-label={tr("Filtri attività")}
            >
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{tr("Opzioni")}</span>
              {(groupBy !== "none" || areaView !== "all") && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />}
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            <div className="hidden sm:flex items-center gap-2">
              {/* «Di chi» accanto alla ricerca (25/11/2026): era una riga intera da sola
                  tra la ricerca e l'elenco. */}
              <Select value={areaView} onValueChange={setAreaView}>
                <SelectTrigger aria-label={tr("Ambito attività")} className="h-8 w-auto max-w-[190px] gap-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">{tr("Mie e delle mie aree")}</SelectItem><SelectItem value="personal">{tr("Solo individuali")}</SelectItem>
                  {(offices.data ?? []).filter(o => o.membri.includes(user?.id ?? "")).map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {/* Raggruppa, vista compatta e selezione multipla: tre comandi
                  che si usano di rado, prima tre bottoni. Il pallino dice che
                  la vista non è quella di base. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="relative h-8 w-8 shrink-0 p-0" aria-label={tr("Opzioni della lista")}>
                    <MoreHorizontal className="h-4 w-4" />
                    {(groupBy !== "none" || compact) && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">{tr("Raggruppa per")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={groupBy} onValueChange={v => { setGroupBy(v as GroupBy); setCollapsedGroups(new Set()); }}>
                    {GROUP_OPTIONS.map(g => <DropdownMenuRadioItem key={g.value} value={g.value}>{g.value === "none" ? tr("Nessun gruppo") : tr(g.label)}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={compact} onCheckedChange={v => setCompact(v === true)}>{tr("Vista compatta")}</DropdownMenuCheckboxItem>
                  <DropdownMenuItem onClick={() => setSelectionMode(v => { if (v) setSelectedIds(new Set()); return !v; })}>
                    <ListChecks className="mr-2 h-3.5 w-3.5" />{selectionMode ? tr("Esci dalla selezione") : tr("Seleziona più attività")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
          {/* Sul telefono la scelta «di chi» sta nel pannello «Opzioni»: qui era una riga intera
              in più tra la ricerca e l'elenco. */}
          {/* Bulk action bar — visibile in modalità selezione o quando c'è già
              una selezione; su mobile wrap, su desktop 1 riga */}
          {(hasSelection || selectionMode) && (
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input type="checkbox" checked={selectedIds.size > 0 && selectedIds.size === visibleTasks.filter(t => !solaLettura && !isTaskBlockedStatus(t.status, taskStatuses) && (isAdmin || t.assigned_to === user?.id)).length} onChange={selectAll} className="h-4 w-4 accent-primary shrink-0" aria-label={tr("Seleziona le attività gestibili di questa pagina")} />
                <span className="text-xs font-medium truncate">
                  {selectedIds.size > 0
                    ? tr(selectedIds.size === 1 ? "{n} selezionata" : "{n} selezionate", { n: selectedIds.size })
                    : tr("Tocca le attività da selezionare")}
                </span>
                <button onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }} className="p-1 text-muted-foreground hover:text-foreground ml-auto sm:hidden" aria-label={tr("Chiudi selezione")}><X className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "completata" })}>
                  <CheckCircle className="h-3.5 w-3.5" />{tr("Fatte")}
                </Button>
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "in_corso" })}>
                  <PlayCircle className="h-3.5 w-3.5" />{tr("In corso")}
                </Button>
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "da_fare" })}>
                  <Circle className="h-3.5 w-3.5" />{tr("Da fare")}
                </Button>
                <Button size="sm" variant="outline" disabled={solaLettura || mutationBusy || selectedIds.size === 0} className="h-8 text-xs gap-1 flex-1 sm:flex-none text-red-600 hover:text-red-700" onClick={() => setBulkConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />{tr("Elimina")}
                </Button>
                <button onClick={() => { setSelectedIds(new Set()); setSelectionMode(false); }} className="hidden sm:inline-flex p-1 text-muted-foreground hover:text-foreground ml-1" aria-label={tr("Chiudi selezione")}><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          )}

          {isError ? (
            <InlineLoadError
              title={tr("Errore nel caricamento attività")}
              description={error instanceof Error ? error.message : tr("Non riesco a leggere le attività in questo momento.")}
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
                  <Input ref={quickAddRef} aria-label={tr("Titolo della nuova attività rapida")} placeholder={solaLettura ? tr("Sei in sola lettura") : tr("Aggiungi attività…")} value={quickAddTitle}
                    disabled={solaLettura || mutationBusy}
                    onBlur={() => { if (isMobile && !quickAddTitle.trim()) setAggiuntaAperta(false); }}
                    onChange={e => setQuickAddTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !createTask.isPending) handleQuickAdd(); if (e.key === "Escape") { setQuickAddTitle(""); quickAddRef.current?.blur(); } }}
                    className="h-9 text-base sm:h-8 md:text-xs pr-8" />
                  {quickAddTitle && <button aria-label={tr("Cancella il titolo della nuova attività")} onClick={() => setQuickAddTitle("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <Button variant="outline" size="sm" className="h-9 shrink-0 sm:h-8" aria-label={tr("Aggiungi attività rapida")} onClick={handleQuickAdd} disabled={solaLettura || !quickAddTitle.trim() || mutationBusy} title={creaTitle}>
                  {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
              )}

              {/* Grouped view */}
              <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1" aria-label={tr("Elenco attività")}>
              {groupBy !== "none" && groupedTasks ? (
                groupedTasks.size === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                    <Filter className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
                    <p className="text-sm text-muted-foreground">{tr("Nessuna attività trovata")}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...groupedTasks.entries()].map(([key, tasks]) => renderGroup(key, tasks))}
                  </div>
                )
              ) : showDefaultSections ? (
                <div className="space-y-4">{defaultGroups.map(group => <section key={group.label} className="space-y-2" aria-label={tr("{gruppo}: {n} attività in questa pagina", { gruppo: tr(group.label), n: group.tasks.length })}><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr(group.label)} <span className="font-normal">({group.tasks.length})</span></h3><div className={compact ? "space-y-1" : "space-y-2"}>{group.tasks.map(renderTask)}</div></section>)}</div>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                  <Filter className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      // Messaggio contestuale: dice ESATTAMENTE quale combinazione
                      // di filtri è vuota (es. "Nessuna attività scaduta di Mario
                      // Bianchi"), invece del generico "per questo filtro".
                      // Frasi intere, una per combinazione: si traducono senza incollare pezzi.
                      if (searchQuery) {
                        const q = searchQuery;
                        return filter === "scadute" ? tr("Nessuna attività scaduta assegnata a te per «{q}»", { q })
                          : filter === "oggi" ? tr("Nessuna attività per oggi assegnata a te per «{q}»", { q })
                            : filter === "settimana" ? tr("Nessuna attività questa settimana assegnata a te per «{q}»", { q })
                              : filter === "completate" ? tr("Nessuna attività completata assegnata a te per «{q}»", { q })
                                : tr("Nessuna attività assegnata a te per «{q}»", { q });
                      }
                      return filter === "scadute" ? tr("Nessuna attività scaduta assegnata a te")
                        : filter === "oggi" ? tr("Nessuna attività per oggi assegnata a te")
                          : filter === "settimana" ? tr("Nessuna attività questa settimana assegnata a te")
                            : filter === "completate" ? tr("Nessuna attività completata assegnata a te")
                              : tr("Nessuna attività assegnata a te");
                    })()}
                  </p>
                  {(filter !== "tutte" || !!searchQuery) && (
                    <button
                      type="button"
                      onClick={() => { setFilter("tutte"); setSearchQuery(""); setSelectedIds(new Set()); }}
                      className="mt-2 text-xs font-semibold text-primary hover:underline"
                    >
                      {tr("Mostra tutte le mie attività")}
                    </button>
                  )}
                </div>
              ) : (
                <div className={compact ? "space-y-1" : "space-y-2"}>{visibleTasks.map(renderTask)}</div>
              )}
              </div>
              {filteredTasks.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p role="status" className="text-xs text-muted-foreground">{tr("{da}–{a} di {totale} attività", { da: (currentPage - 1) * 20 + 1, a: Math.min(currentPage * 20, filteredTasks.length), totale: filteredTasks.length })}</p><div className="flex gap-1"><Button variant="outline" size="sm" className="h-8 text-xs" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedIds(new Set()); }}>{tr("Precedenti")}</Button><Button variant="outline" size="sm" className="h-8 text-xs" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelectedIds(new Set()); }}>{tr("Successive")}</Button></div></div>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog crea/modifica task ── */}
      <Dialog open={dialogOpen} onOpenChange={next => { if (!taskSaveRef.current && !mutationBusy) setDialogOpen(next); }}>
        <DialogContent ampiezza="modulo" struttura="scorrevole" className="task-editor-dialog gap-3">
          <DialogHeader>
            <DialogTitle>{readOnlyDialog ? tr("Dettagli attività") : editingTask ? tr("Modifica attività") : tr("Nuova attività")}</DialogTitle>
            <DialogDescription>{readOnlyDialog ? tr("Consulta assegnazione, scadenza e collegamenti dell’attività.") : editingTask ? tr("Aggiorna dettagli, responsabile e scadenza dell’attività.") : tr("Organizza il lavoro, scegli l’area e il responsabile.")}</DialogDescription>
          </DialogHeader>
          <form id="attivita-modulo" onSubmit={e => { e.preventDefault(); handleSave(); }}>
          <fieldset disabled={readOnlyDialog || mutationBusy} aria-busy={mutationBusy} className="min-w-0 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">{tr("Titolo *")}</Label>
              <Input id="task-title" placeholder={tr("Es. Confermare l’ordine al fornitore")} required maxLength={250} value={formTitle} onChange={e => setFormTitle(e.target.value)} autoFocus={!isMobile || !editingTask} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-notes">{tr("Descrizione")}</Label>
              <Textarea id="task-notes" placeholder={tr("Aggiungi dettagli, link, note...")} value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="resize-none" />
            </div>
            <TaskAssignmentFields offices={availableOffices}
              people={[
                ...(user ? [{ id: user.id, name: tr("Me stesso") }] : []),
                ...teamMembers.filter(m => m.id !== user?.id).map(m => ({ id: m.id, name: [m.first_name, m.last_name].filter(Boolean).join(" ") || tr("Nome non disponibile") })),
                ...(editingTask?.assigned_to && editingTask.assigned_to !== user?.id && !teamMembers.some(m => m.id === editingTask.assigned_to)
                  ? [{ id: editingTask.assigned_to as string, name: [editingTask.assignee?.first_name, editingTask.assignee?.last_name].filter(Boolean).join(" ") || tr("Responsabile assegnato") }] : []),
              ]}
              manageOffices={isAdmin} userId={user?.id} officeId={formOffice} assigneeId={formAssignedTo}
              onOfficeChange={office => { setFormOffice(office); setFormAssignedTo(office ? "" : user?.id ?? ""); }}
              onAssigneeChange={setFormAssignedTo} officeDisabled={!!editingTask}
              canAssignOthers={isAdmin} loading={offices.isLoading} error={offices.isError}
              onRetry={() => { void offices.refetch(); }} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="task-priority">{tr("Priorità")}</Label>
                <OfficeSelect id="task-priority" label={tr("Priorità")} value={formPriority} onValueChange={setFormPriority}
                  options={Object.entries(PRIORITY_CONFIG).map(([value, config]) => ({ value, label: tr(config.label) }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-due">{tr("Scadenza")}</Label>
                <Input id="task-due" type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} />
              </div>
            </div>
            <section className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2" aria-label={tr("Collegamenti e organizzazione")}>
              {canViewOrders && <div className="sm:col-span-2">
                <TaskOrderLink companyId={companyId} value={formOrder} fixed={!!editingTask?.order_id}
                  disabled={!canLinkOrder} onChange={order => { setFormOrder(order); if (order && formCategory === "altro") setFormCategory("ordini"); }} />
              </div>}
            {/* Senza questo campo l'attività nasceva slegata: non si vedeva né
                nella scheda del cliente né in quella dell'opportunità. */}
            <div className={cn("space-y-1.5", editingTask && "sm:col-span-2")}>
              <Label htmlFor="task-link">{tr("Cliente / Opportunità")}</Label>
              <CollegaAttivitaPicker id="task-link" companyId={companyId} valore={formCollegamento} onChange={setFormCollegamento} />
              {formCollegamento?.tipo === "opportunita" && canViewMarketingOpportunities && (
                <Link to={linkOpportunita("/azienda/marketing", formCollegamento.id)} onClick={() => setDialogOpen(false)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  {tr("Apri l'opportunità")}
                </Link>
              )}
              {formCollegamento?.tipo === "contatto" && canViewMarketingContacts && (
                <Link to={linkContatto("/azienda/marketing", formCollegamento.id)} onClick={() => setDialogOpen(false)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  {tr("Apri il contatto")}
                </Link>
              )}
            </div>
              <div className="contents">
                <div className="space-y-1.5">
                  <Label htmlFor="task-category">{tr("Categoria")}</Label>
                  <OfficeSelect id="task-category" label={tr("Categoria")} value={formCategory} onValueChange={setFormCategory}
                    options={CATEGORY_OPTIONS.map(c => ({ value: c.value, label: tr(c.label) }))} />
                </div>
                {editingTask && <div className="space-y-1.5">
                  <Label htmlFor="task-status">{tr("Stato")}</Label>
                  <OfficeSelect id="task-status" label={tr("Stato")} disabled={isTaskBlockedStatus(editingTask.status, taskStatuses)}
                    value={formStatus} onValueChange={setFormStatus} options={taskStatuses.map(v => ({ value: v.value, label: tr(v.label) }))} />
                </div>}
              </div>
            </section>
          </fieldset>
          </form>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={mutationBusy} onClick={() => setDialogOpen(false)}>{readOnlyDialog ? tr("Chiudi") : tr("Annulla")}</Button>
            {editingTask && seesTeamTasks && <Button asChild variant="outline" className="gap-1 text-xs"><Link to={`/azienda/attivita?tab=regia&attivita=${encodeURIComponent(editingTask.id)}`} onClick={() => setDialogOpen(false)}><ExternalLink className="h-3 w-3" />{tr("Gestione completa")}</Link></Button>}
            {!readOnlyDialog && <Button type="submit" form="attivita-modulo" disabled={!formTitle.trim() || mutationBusy || (!editingTask && (offices.isLoading || offices.isError))}>
              {(createTask.isPending || updateTask.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTask ? tr("Salva modifiche") : tr("Crea attività")}
            </Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Conferma eliminazione singola ── */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(o) => !o && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Eliminare questa attività?")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("L'azione è irreversibile.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (taskToDelete) deleteTask.mutate(taskToDelete);
                setTaskToDelete(null);
              }}
            >
              {tr("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Conferma eliminazione multipla ── */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Eliminare {n} attività?", { n: selectedIds.size })}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("Stai per eliminare {n} attività. L'azione è irreversibile.", { n: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ConfermaQuantita stato={confermaBulk} cosa="attività" />
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={!confermaBulk.valida}
              onClick={(e) => {
                if (!confermaBulk.valida) { e.preventDefault(); return; }
                bulkDelete.mutate([...selectedIds]);
                setBulkConfirmOpen(false);
              }}
            >
              {tr("Elimina")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Le opzioni cambiano il raggruppamento, mai la visibilità personale. */}
      <Sheet open={filtriAperti} onOpenChange={setFiltriAperti}>
        <SheetContent side="bottom" className="rounded-t-2xl max-sm:rounded-none px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[80dvh] max-sm:max-h-none overflow-y-auto">
          <SheetHeader className="text-left">
            <SheetTitle>{tr("Filtri")}</SheetTitle>
            <SheetDescription>{tr("Quali attività vedere e come raggrupparle.")}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Quali")}</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ id: "all", nome: tr("Mie e delle mie aree") }, { id: "personal", nome: tr("Solo individuali") }, ...(offices.data ?? []).filter(o => o.membri.includes(user?.id ?? ""))].map(o => (
                  <button key={o.id} type="button" onClick={() => setAreaView(o.id)}
                    className={`min-h-11 rounded-lg border px-2 text-sm font-medium transition-colors ${areaView === o.id ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                    {o.nome}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr("Raggruppa per")}</p>
              <div className="grid grid-cols-2 gap-2">
                {GROUP_OPTIONS.map(g => (
                  <button key={g.value} type="button"
                    onClick={() => { setGroupBy(g.value); setCollapsedGroups(new Set()); }}
                    className={`h-11 rounded-lg border text-sm font-medium transition-colors ${groupBy === g.value ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                    {g.value === "none" ? tr("Nessun gruppo") : tr(g.label)}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full h-11" onClick={() => setFiltriAperti(false)}>{tr("Fatto")}</Button>
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
  const { user, effectiveCompany } = useAuth();
  const tr = useT();
  const isMobile = useIsMobile();
  const [addTaskDate, setAddTaskDate] = useState<AddTaskRequest | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("tutte");
  const [openTaskRequest, setOpenTaskRequest] = useState<{ id: string; requestId: number } | null>(null);
  const [mobileAgenda, setMobileAgenda] = useState(false);
  const [mobileTeam, setMobileTeam] = useState(false);
  const [approvareAperto, setApprovareAperto] = useState(false);
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
  const mostraAttivita = (filter: TaskFilter) => {
    setCalendarDate(null);
    setTaskFilter(filter);
    vaiAlleAttivita();
  };
  const focusTiles = [
    focus.overdue > 0 ? { key: "scadute", n: focus.overdue, label: "Scadute", cls: "border-red-300 bg-red-50 text-red-700", onClick: () => mostraAttivita("scadute") } : null,
    { key: "oggi", n: focus.today, label: "Oggi", cls: "border-primary/30 bg-primary/5 text-primary", onClick: () => mostraAttivita("oggi") },
    { key: "settimana", n: focus.week, label: "Prossimi 7 giorni", cls: "border-border bg-muted/40 text-foreground", onClick: () => mostraAttivita("settimana") },
  ].filter(Boolean) as Array<{ key: string; n: number; label: string; cls: string; onClick: () => void }>;

  return (
    <div className="space-y-4">
      {/* La timbratura è nella barra in alto (TimbraHeaderButton), raggiungibile
          da ogni pagina, non più qui nel corpo di Attività. */}

      {/* Focus del giorno: cosa aspetta l'utente, in un colpo d'occhio. */}
      {/* Sul telefono una riga sola (decisione del founder, 23/11/2026, come nel calendario):
          i tre riquadri ripetevano le pillole «Scadute · Oggi · 7 giorni» dell'elenco qui sotto. */}
      <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-muted-foreground sm:hidden" aria-busy={taskQuery.isLoading}>
        {taskQuery.isLoading || taskQuery.isError ? "Attività…" : focusTiles.map((t, i) => (
          <Fragment key={t.key}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <button type="button" onClick={t.onClick} className={cn("underline-offset-2 hover:underline", t.key === "scadute" && "font-semibold text-red-700")}>
              {t.n} {t.key === "settimana" ? "in 7 giorni" : t.label.toLowerCase()}
            </button>
          </Fragment>
        ))}
      </p>
      {/* «Da sistemare» (25/11/2026): cantieri, approvazioni, documenti e carte della ditta
          in UNA riga di pastiglie. Prima erano quattro riquadri impilati, più tre riquadri
          «Scadute · Oggi · 7 giorni» che ripetevano le pillole dell'elenco qui sotto: la
          lista cominciava a metà schermo. Ogni pastiglia si nasconde da sola se non c'è niente;
          senza nessuna, la riga sparisce (empty:hidden). Le approvazioni si aprono qui sotto. */}
      <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
        <DaApprovareChip aperto={approvareAperto} onToggle={() => setApprovareAperto(v => !v)} />
        <DocumentiDaConfermareBox compatto />
        <ScadenzeDittaBox compatto />
        <CantieriTecniciLink compatto />
      </div>
      {approvareAperto && <DaApprovareCantieri />}

      {/* Sinistra: Meteo + Calendario (integrati) · Destra: le mie attività.
          Da tablet due colonne con le attività a larghezza fissa: a un terzo
          di pagina, a 1024px, il pannello restava di 210px e tagliava
          ricerca e filtri; sotto i 1024 finiva in fondo, dopo il calendario. */}
      <div className="grid grid-cols-1 items-start gap-3 sm:gap-4 md:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Primaria: le mie attività — è quello che si usa ogni giorno, quindi in colonna larga. */}
        <div id="le-mie-attivita" className="min-w-0 space-y-4 scroll-mt-20">
          <MieAttivita
            filter={taskFilter}
            onFilterChange={setTaskFilter}
            initialDueDate={addTaskDate}
            calendarDate={calendarDate}
            onCalendarDateClear={() => setCalendarDate(null)}
            openTaskRequest={openTaskRequest}
          />
        </div>
        {/* Secondaria: meteo compatto, agenda (parte da «Giorno») e priorità del team. */}
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <MeteoWidget compatto />
          {isMobile && <Button variant="outline" className="w-full justify-between" onClick={() => setMobileAgenda(v => !v)} aria-expanded={mobileAgenda}><span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{tr("Agenda personale")}</span><ChevronDown className={cn("h-4 w-4", mobileAgenda && "rotate-180")} /></Button>}
          {(!isMobile || mobileAgenda) && <DashboardAgenda
            tasks={agendaTasks} tasksLoading={taskQuery.isLoading} tasksError={taskQuery.isError} onTasksRetry={() => taskQuery.refetch()}
            statuses={statuses} selectedDate={calendarDate} onDateSelect={setCalendarDate}
            onAddTask={date => setAddTaskDate({ date, requestId: ++requestSequence.current })}
            onTaskOpen={id => setOpenTaskRequest({ id, requestId: ++requestSequence.current })}
          />}
          {seesTeam && (isMobile ? <div className="space-y-3"><Button variant="outline" className="w-full justify-between" onClick={() => setMobileTeam(v => !v)} aria-expanded={mobileTeam}><span className="flex items-center gap-2"><Users className="h-4 w-4" />{tr("Priorità del team")}</span><ChevronDown className={cn("h-4 w-4", mobileTeam && "rotate-180")} /></Button>{mobileTeam && <TeamTaskPulse compact />}</div> : <TeamTaskPulse compact />)}
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
  const t = useT();
  const companyId = effectiveCompany?.id;

  const permissions = usePermissions();
  const seesTeam = !permissions.isLoading && (permissions.isAdmin || permissions.canViewTeamTasks);
  const { data: pulseTasks = [], isLoading, isError, error, refetch } = useDashboardTasks("team");
  const observed = useMemo(() => [...new Set(pulseTasks.map(t => t.status))], [pulseTasks]);
  const { statuses } = useTaskStatuses(companyId, observed);
  const oggi = format(new Date(), "yyyy-MM-dd");
  const pulse = useMemo(() => {
    const openTasks = pulseTasks.filter(task => task.status !== "completata" && !isTaskDoneStatus(task.status, statuses) && !isTaskBlockedStatus(task.status, statuses));
    const overdue = openTasks.filter(task => {
      const scadenza = dashboardDateKey(task.due_date);
      return scadenza && scadenza < oggi;
    });
    const dueToday = openTasks.filter(task => dashboardDateKey(task.due_date) === oggi);
    const urgent = openTasks.filter(task => task.priority === "urgente");
    const unassigned = openTasks.filter(task => !task.assigned_to);
    const unique = new Map([...overdue, ...urgent, ...dueToday, ...unassigned].map(task => [task.id, task]));

    return {
      overdue,
      dueToday,
      urgent,
      unassigned,
      priorities: Array.from(unique.values()).slice(0, 6),
      openCount: openTasks.length,
    };
  }, [pulseTasks, statuses, oggi]);

  const metrics = [
    { label: "Scadute", value: pulse.overdue.length },
    { label: "Urgenti", value: pulse.urgent.length },
    { label: "Oggi", value: pulse.dueToday.length },
    { label: "Senza assegnatario", value: pulse.unassigned.length },
  ];

  if (!seesTeam) return null;

  return (
    <Card role="region" aria-label={t("Priorità del team")}>
      {/* Telefono: il titolo c'è già sul bottone che apre il riquadro; qui resta solo «Apri regia». */}
      <CardHeader className="pb-3 max-sm:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 max-sm:justify-end">
          <CardTitle className="flex items-center gap-2 text-base max-sm:hidden">
            <ArrowUpCircle className="h-4 w-4" />{compact ? t("Priorità del team") : t("Regia rapida")}
          </CardTitle>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
            <Link to="/azienda/attivita?tab=regia">
              {t("Apri regia")} <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-sm:p-3">
        {isError ? (
          <InlineLoadError
            title={t("Errore nel caricamento della regia")}
            description={error instanceof Error ? error.message : t("Non riesco a leggere le attività aziendali in questo momento.")}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : pulse.openCount === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nessuna attività aperta da gestire")}</p>
        ) : (
          <div className="space-y-4 max-sm:space-y-3">
            {/* I numeri in una riga (solo quelli diversi da zero), anche da computer (25/11/2026):
                i quattro riquadri colorati alti 80px erano altri quattro «allarmi» nella colonna. */}
            <p className="text-[13px] leading-snug text-muted-foreground">
              {metrics.filter((m) => m.value > 0).map((m, i) => (
                <Fragment key={m.label}>{i > 0 && " · "}<span className={cn("font-semibold tabular-nums", m.label === "Scadute" ? "text-red-700" : "text-foreground")}>{m.value}</span> {t(m.label).toLowerCase()}</Fragment>
              ))}
              <span className="sm:hidden">{" · "}<Link to="/azienda/attivita?tab=regia" className="font-medium text-primary underline-offset-2 hover:underline">{t("Vai alla regia")}</Link></span>
            </p>
            {/* Lista senza riquadro proprio: stava in una cornice dentro la
                card, dentro la pagina. */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Priorità da guardare")}</p>
                <span className="text-xs tabular-nums text-muted-foreground">{t("{n} aperte", { n: pulse.openCount })}</span>
              </div>
              {pulse.priorities.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">{t("Nessuna criticità immediata.")}</p>
              ) : (
                <div className="divide-y border-y">
                  {pulse.priorities.slice(0, compact ? 3 : 6).map(task => {
                    const priority = PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normale;
                    const dueDate = task.due_date ? parseISO(task.due_date) : null;
                    const scaduta = dueDate && isBefore(dueDate, startOfDay(new Date())) && !isToday(dueDate);
                    const assigneeName = [task.assignee?.first_name, task.assignee?.last_name].filter(Boolean).join(" ") || t("Non assegnata");

                    return (
                      compact ? (
                        // Compatto: pallino accanto al titolo (prima stava da solo su una riga), sotto una
                        // riga di testo «chi · area · scadenza» al posto di due etichette.
                        <div key={task.id} className="flex items-start gap-2 px-1 py-2 text-sm">
                          <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priority.dotClass}`} />
                          <div className="min-w-0 flex-1">
                            <Link to={`/azienda/attivita?tab=regia&attivita=${encodeURIComponent(task.id)}`} className="line-clamp-2 font-medium text-primary hover:underline">{task.title}</Link>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {assigneeName}
                              {task.category && <> · {CATEGORY_OPTIONS.find(c => c.value === task.category)?.label || task.category}</>}
                              {dueDate && <> · <span className={cn(scaduta ? "font-medium text-red-700" : isToday(dueDate) && "font-medium text-amber-700")}>{scaduta ? t("scaduta il {dueDate}", { dueDate: format(dueDate, "d MMM", { locale: dateFnsCampo() }) }) : isToday(dueDate) ? t("oggi") : format(dueDate, "d MMM", { locale: dateFnsCampo() })}</span></>}
                            </p>
                          </div>
                        </div>
                      ) : (
                      <div key={task.id} className="flex flex-wrap items-center gap-2 px-1 py-2 text-sm">
                        <div className={`h-2 w-2 shrink-0 rounded-full ${priority.dotClass}`} />
                        <Link to={`/azienda/attivita?tab=regia&attivita=${encodeURIComponent(task.id)}`} className="min-w-[180px] flex-1 truncate font-medium text-primary hover:underline">{task.title}</Link>
                        <span className="text-xs text-muted-foreground">{assigneeName}</span>
                        {task.category && <Badge variant="outline" className="text-[10px]">{t(CATEGORY_OPTIONS.find(c => c.value === task.category)?.label || task.category)}</Badge>}
                        {dueDate && (
                          <Badge variant="outline" className={`text-[10px] ${scaduta ? "border-red-200 bg-red-50 text-red-700" : isToday(dueDate) ? "border-amber-200 bg-amber-50 text-amber-700" : ""}`}>
                            {scaduta ? t("Scaduta") : isToday(dueDate) ? t("Oggi") : format(dueDate, "d MMM", { locale: dateFnsCampo() })}
                          </Badge>
                        )}
                      </div>
                      )
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
  const t = useT();
  if (!user?.id) return <p role="status">{t("Caricamento attività…")}</p>;
  if (!effectiveCompany?.id) return <Card><CardContent className="p-4">{t("Seleziona un’azienda per consultare le attività.")}</CardContent></Card>;
  return <AttivitaAzienda key={`${effectiveCompany.id}:${user.id}`} companyId={effectiveCompany.id} />;
}

function AttivitaAzienda({ companyId }: { companyId: string }) {
  const { role } = useAuth();
  const t = useT();
  const isAdmin = role === "company_admin";
  // La Regia è lo strumento "di team": la vede l'admin e chi ha il permesso
  // esplicito "Attività del team" (che già vedeva i filtri per persona nella
  // Dashboard ma non aveva la pagina per lavorarci). La RLS resta il confine.
  const { canViewTeamTasks, canViewOrders, canManageSuppliers, canManagePayments, isLoading: permessiInCaricamento } = usePermissions();
  const seesRegia = isAdmin || canViewTeamTasks;
  const vedeEccezioni = isAdmin || canViewOrders || canManageSuppliers || canManagePayments;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "attivita";
  const allowedTabs = isAdmin
    ? ["attivita", "regia"]
    : seesRegia
      ? ["attivita", "regia", "timbrature", "ferie", "cedolini"]
      : ["attivita", "timbrature", "ferie", "cedolini"];
  if (vedeEccezioni) allowedTabs.push("eccezioni");
  const activeTab = allowedTabs.includes(requestedTab) ? requestedTab : "attivita";
  const layoutSchede = allowedTabs.length === 6 ? "grid-cols-6 max-w-3xl lg:w-[40rem]"
    : allowedTabs.length === 5 ? "grid-cols-5 max-w-2xl lg:w-[36rem]"
    : "grid-cols-4 max-w-xl lg:w-[30rem]";

  useEffect(() => {
    if (requestedTab === activeTab || (requestedTab === "eccezioni" && permessiInCaricamento)) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (activeTab === "attivita") next.delete("tab");
      else next.set("tab", activeTab);
      return next;
    }, { replace: true });
  }, [activeTab, requestedTab, permessiInCaricamento, setSearchParams]);

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
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <AttivitaHeader />
          {isAdmin ? (
          <TabsList className="grid w-full max-w-full sm:w-96 grid-cols-3 h-auto">
            <TabsTrigger value="attivita" className="gap-1.5 text-xs py-1.5 sm:py-1"><ClipboardCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span>{t("Le mie attività")}</span></TabsTrigger>
            <TabsTrigger value="regia" className="gap-1.5 text-xs py-1.5 sm:py-1"><Users className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="truncate">{t("Regia")}</span></TabsTrigger>
            <TabsTrigger value="eccezioni" className="gap-1.5 text-xs py-1.5 sm:py-1"><AlertCircle className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span>{t("Eccezioni")}</span></TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className={cn("grid w-full h-auto", layoutSchede)}>
            <TabsTrigger value="attivita" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs py-2 sm:py-1 px-1 sm:px-3"><ClipboardCheck className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="truncate">{t("Le mie")}</span></TabsTrigger>
            {seesRegia && (
              <TabsTrigger value="regia" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs py-2 sm:py-1 px-1 sm:px-3"><Users className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="truncate">{t("Regia")}</span></TabsTrigger>
            )}
            <TabsTrigger value="timbrature" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs py-2 sm:py-1 px-1 sm:px-3"><Clock className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="truncate">{t("Timbra")}</span></TabsTrigger>
            <TabsTrigger value="ferie" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs py-2 sm:py-1 px-1 sm:px-3"><Palmtree className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="truncate">{t("Ferie")}</span></TabsTrigger>
            <TabsTrigger value="cedolini" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs py-2 sm:py-1 px-1 sm:px-3"><Receipt className="h-4 w-4 sm:h-3.5 sm:w-3.5" /><span className="truncate">{t("Cedolini")}</span></TabsTrigger>
            {vedeEccezioni && (
              <TabsTrigger value="eccezioni" className="gap-1 sm:gap-1.5 text-[11px] sm:text-xs py-2 sm:py-1 px-1 sm:px-3"><AlertCircle className="hidden h-3.5 w-3.5 sm:block" /><span className="truncate">{t("Eccezioni")}</span></TabsTrigger>
            )}
          </TabsList>
          )}
        </div>
        <TabsContent value="attivita" className="mt-3 sm:mt-4"><TabAttivita /></TabsContent>
        {vedeEccezioni && (
          <TabsContent value="eccezioni" className="mt-3 sm:mt-4">
            <EccezioniOperative companyId={companyId} />
          </TabsContent>
        )}
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

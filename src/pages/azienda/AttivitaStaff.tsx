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
import { lazy, Suspense, useState, useMemo, useRef, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  format, isToday, isBefore, startOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, addDays,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Clock, ClipboardCheck, CheckCircle2, PlayCircle, PauseCircle, LogOut,
  CheckCircle, Loader2, ExternalLink, Palmtree, Receipt,
  CloudSun, ChevronLeft, ChevronRight, CalendarDays, Droplets,
  MapPin, Plus, Pencil, Trash2, X, Filter,
  ArrowUpCircle, Circle, AlertCircle, MoreHorizontal, Tag, Users,
  CalendarClock, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import { logger } from "@/utils/logger";
import {
  useWeatherForecast,
  weatherCodeToEmoji,
  weatherCodeToLabel,
  type WeatherDay,
} from "@/hooks/useWeatherForecast";

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

const STATUS_CONFIG: Record<string, { label: string; className: string; next: string | null }> = {
  da_fare:     { label: "Da fare",     className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",     next: "in_corso" },
  in_corso:    { label: "In corso",    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",      next: "completata" },
  completata:  { label: "Completata",  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",  next: null },
};

const CATEGORY_OPTIONS = [
  { value: "amministrazione", label: "Amministrazione" },
  { value: "hr",              label: "Risorse Umane" },
  { value: "contabilita",     label: "Contabilità" },
  { value: "commerciale",     label: "Commerciale" },
  { value: "logistica",       label: "Logistica" },
  { value: "altro",           label: "Altro" },
];

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const ORE_GRIGLIA = Array.from({ length: 14 }, (_, i) => 7 + i); // 07:00 → 20:00

// ── Calendar layer config ──────────────────────────────────────────────────
const LAYER_CONFIG = {
  commessa:     { label: "Commesse",     dotClass: "bg-emerald-500", chipOn: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",  chipOff: "border-border text-muted-foreground/60 hover:bg-muted/40" },
  scadenza:     { label: "Scadenze",     dotClass: "bg-amber-500",   chipOn: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",           chipOff: "border-border text-muted-foreground/60 hover:bg-muted/40" },
  appuntamento: { label: "Appuntamenti", dotClass: "bg-teal-500",    chipOn: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100",               chipOff: "border-border text-muted-foreground/60 hover:bg-muted/40" },
  feria:        { label: "Ferie",        dotClass: "bg-orange-400",  chipOn: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100",       chipOff: "border-border text-muted-foreground/60 hover:bg-muted/40" },
} as const;
type LayerId = keyof typeof LAYER_CONFIG;

type TaskFilter = "tutte" | "oggi" | "scadute" | "settimana" | "completate";
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
function MeteoWidget() {
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
// Mini Calendario Mensile
// ─────────────────────────────────────────────────────────────────────────────
function MiniCalendario({ onAddTask, onDateSelect }: { onAddTask?: (date: string) => void; onDateSelect?: (date: string | null) => void }) {
  const { user, effectiveCompany } = useAuth();
  const { canViewOrders, canViewScadenzario, canViewMarketingAppointments, canViewPersone } = usePermissions();
  const companyId = effectiveCompany?.id;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  // Layer toggles — persisted in localStorage
  const [enabledLayers, setEnabledLayers] = useState<Set<LayerId>>(() => {
    try {
      const stored = localStorage.getItem("cal-layers-v1");
      if (stored) return new Set(JSON.parse(stored) as LayerId[]);
    } catch { /* localStorage non disponibile/corrotto: uso default */ }
    return new Set<LayerId>(["commessa", "scadenza", "appuntamento", "feria"]);
  });
  const toggleLayer = (id: LayerId) => {
    setEnabledLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("cal-layers-v1", JSON.stringify([...next])); } catch { /* quota/private mode: ignora persistenza */ }
      return next;
    });
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");
  const monthEndStr = format(monthEnd, "yyyy-MM-dd");
  const monthStr = format(monthStart, "yyyy-MM");

  // ── 1. Tasks (proprie, sempre) ─────────────────────────────────────────
  const { data: monthTasks = [] } = useQuery({
    queryKey: ["calendar-tasks", user?.id, companyId, monthStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority, status, category")
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  // ── 2. Nearest task (auto-jump) ────────────────────────────────────────
  const { data: nearestTaskDate } = useQuery({
    queryKey: ["nearest-task-date", user?.id, companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("due_date")
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .not("due_date", "is", null)
        .neq("status", "completata")
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any)?.due_date as string | null ?? null;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── 3. Commesse (canViewOrders + layer on) ─────────────────────────────
  const layerCommessaOn = enabledLayers.has("commessa") && canViewOrders;
  const { data: monthOrders = [] } = useQuery({
    queryKey: ["calendar-commesse", companyId, monthStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_code, description, work_start_date, work_end_date, expected_date, warehouse_arrival_date")
        .eq("company_id", companyId!)
        .or(
          `and(work_start_date.lte.${monthEndStr},work_end_date.gte.${monthStartStr}),` +
          `and(work_start_date.gte.${monthStartStr},work_start_date.lte.${monthEndStr}),` +
          `and(expected_date.gte.${monthStartStr},expected_date.lte.${monthEndStr}),` +
          `and(warehouse_arrival_date.gte.${monthStartStr},warehouse_arrival_date.lte.${monthEndStr})`
        );
      return (data ?? []) as any[];
    },
    enabled: !!companyId && layerCommessaOn,
    staleTime: 5 * 60 * 1000,
  });

  // ── 4. Scadenze (canViewScadenzario + layer on) ────────────────────────
  const layerScadenzaOn = enabledLayers.has("scadenza") && canViewScadenzario;
  const { data: monthScadenze = [] } = useQuery({
    queryKey: ["calendar-scadenze", companyId, monthStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("scadenze")
        .select("id, description, due_date, tipo, status")
        .eq("company_id", companyId!)
        .gte("due_date", monthStartStr)
        .lte("due_date", monthEndStr)
        .not("status", "eq", "annullata");
      return (data ?? []) as any[];
    },
    enabled: !!companyId && layerScadenzaOn,
    staleTime: 5 * 60 * 1000,
  });

  // ── 5. Appuntamenti mkt (canViewMarketingAppointments + layer on) ──────
  const layerAppuntamentoOn = enabledLayers.has("appuntamento") && canViewMarketingAppointments;
  const { data: monthAppuntamenti = [] } = useQuery({
    queryKey: ["calendar-appuntamenti", user?.id, companyId, monthStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, title, appointment_date, appointment_time, status")
        .eq("company_id", companyId!)
        .gte("appointment_date", monthStartStr)
        .lte("appointment_date", monthEndStr);
      return (data ?? []) as any[];
    },
    enabled: !!companyId && layerAppuntamentoOn,
    staleTime: 5 * 60 * 1000,
  });

  // ── 6. Employee id corrente (per scoping ferie proprie) ────────────────
  const layerFeriaOn = enabledLayers.has("feria");
  const { data: myEmployeeId } = useQuery({
    queryKey: ["my-employee-id-cal", user?.id, companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id")
        .eq("company_id", companyId!)
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
    enabled: !!user?.id && !!companyId && layerFeriaOn,
    staleTime: 10 * 60 * 1000,
  });

  // ── 7. Ferie/assenze approvate (proprie sempre; altrui solo se canViewPersone) ──
  // Privacy: la RLS di leave_requests consente a CHIUNQUE in azienda di leggere
  // tutte le richieste (branch company_id = get_my_company_id()). Quindi per i
  // non-autorizzati filtriamo ESPLICITAMENTE alle proprie (employee_id).
  const { data: monthFerie = [] } = useQuery({
    queryKey: ["calendar-ferie", myEmployeeId, companyId, monthStr, canViewPersone],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("leave_requests") as any)
        .select("id, employee_id, type, start_date, end_date, employee:employees!leave_requests_employee_id_fkey(first_name, last_name)")
        .eq("company_id", companyId!)
        .eq("status", "approved")
        .lte("start_date", monthEndStr)
        .gte("end_date", monthStartStr);
      if (!canViewPersone) {
        if (!myEmployeeId) return [];
        q = q.eq("employee_id", myEmployeeId);
      }
      const { data } = await q;
      return (data ?? []) as any[];
    },
    enabled: !!companyId && layerFeriaOn && (canViewPersone || !!myEmployeeId),
    staleTime: 5 * 60 * 1000,
  });

  // ── 8. Festività/chiusure aziendali (sempre visibili, no toggle) ───────
  const { data: allFestivita = [] } = useQuery({
    queryKey: ["hr-festivita-cal", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("hr_festivita")
        .select("id, data, descrizione, ricorrente")
        .eq("company_id", companyId!);
      return (data ?? []) as { id: string; data: string; descrizione: string; ricorrente: boolean }[];
    },
    enabled: !!companyId,
    staleTime: 60 * 60 * 1000,
  });

  // ── Auto-jump al mese con task se il mese corrente è vuoto ────────────
  const hasAutoJumped = useRef(false);
  useEffect(() => {
    if (hasAutoJumped.current || !nearestTaskDate || monthTasks.length > 0) return;
    const nearestMonth = nearestTaskDate.slice(0, 7);
    const currentMonthStr = format(currentMonth, "yyyy-MM");
    if (nearestMonth !== currentMonthStr) {
      hasAutoJumped.current = true;
      setCurrentMonth(startOfMonth(parseISO(nearestTaskDate)));
    }
  }, [nearestTaskDate, monthTasks.length, currentMonth]);

  // ── Build date maps ────────────────────────────────────────────────────
  const { tasksByDate, eventsByDate, rangeByDate, festivitaByDate } = useMemo(() => {
    type LayerEvent = { id: string; type: LayerId; label: string; dotClass: string; time?: string };

    // Tasks
    const tasksByDate = new Map<string, typeof monthTasks>();
    for (const t of monthTasks) {
      if (!t.due_date) continue;
      const arr = tasksByDate.get(t.due_date) ?? [];
      arr.push(t);
      tasksByDate.set(t.due_date, arr);
    }

    // Multi-layer events
    const eventsByDate = new Map<string, LayerEvent[]>();
    const addEv = (date: string, ev: LayerEvent) => {
      const arr = eventsByDate.get(date) ?? [];
      arr.push(ev);
      eventsByDate.set(date, arr);
    };

    // Scadenze
    for (const s of monthScadenze) {
      if (!s.due_date) continue;
      addEv(s.due_date, { id: s.id, type: "scadenza", label: s.description ?? "Scadenza", dotClass: LAYER_CONFIG.scadenza.dotClass });
    }

    // Appuntamenti
    for (const a of monthAppuntamenti) {
      const d = (a.appointment_date as string | undefined)?.slice(0, 10);
      if (!d) continue;
      addEv(d, { id: a.id, type: "appuntamento", label: a.title ?? "Appuntamento", dotClass: LAYER_CONFIG.appuntamento.dotClass, time: (a.appointment_time as string | undefined)?.slice(0, 5) });
    }

    // Commesse milestones
    for (const o of monthOrders) {
      const code = (o.order_code as string | null) ?? "";
      const desc = (o.description as string | null) ?? "";
      const baseLabel = [code, desc].filter(Boolean).join(" · ").slice(0, 35);
      const milestones: { date: string | null; suffix: string }[] = [
        { date: o.work_start_date, suffix: "Inizio posa" },
        { date: o.work_end_date,   suffix: "Fine posa" },
        { date: o.expected_date,   suffix: "Consegna" },
        { date: o.warehouse_arrival_date, suffix: "Arrivo mag." },
      ];
      for (const { date, suffix } of milestones) {
        if (!date || date < monthStartStr || date > monthEndStr) continue;
        addEv(date as string, { id: `${o.id}-${suffix}`, type: "commessa", label: `${suffix}${baseLabel ? ": " + baseLabel : ""}`, dotClass: LAYER_CONFIG.commessa.dotClass });
      }
    }

    // Ferie — espandi range in giorni singoli
    for (const f of monthFerie) {
      const start = f.start_date as string;
      const end = f.end_date as string;
      if (!start || !end) continue;
      const emp = f.employee as { first_name?: string; last_name?: string } | null;
      const nome = emp ? `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.trim() : "";
      const label = nome || "Ferie";
      const clampStart = start < monthStartStr ? monthStartStr : start;
      const clampEnd = end > monthEndStr ? monthEndStr : end;
      if (clampStart > clampEnd) continue;
      for (const day of eachDayOfInterval({ start: parseISO(clampStart), end: parseISO(clampEnd) })) {
        const d = format(day, "yyyy-MM-dd");
        addEv(d, { id: `${f.id}-${d}`, type: "feria", label, dotClass: LAYER_CONFIG.feria.dotClass });
      }
    }

    // Range commesse (sfondo verde per giorni fra inizio/fine posa)
    const rangeByDate = new Set<string>();
    for (const o of monthOrders) {
      const ws = o.work_start_date as string | null;
      const we = o.work_end_date as string | null;
      if (!ws || !we || ws > we) continue;
      const clampStart = ws < monthStartStr ? monthStartStr : ws;
      const clampEnd = we > monthEndStr ? monthEndStr : we;
      if (clampStart > clampEnd) continue;
      for (const day of eachDayOfInterval({ start: parseISO(clampStart), end: parseISO(clampEnd) })) {
        rangeByDate.add(format(day, "yyyy-MM-dd"));
      }
    }

    // Festività — ricorrenti trasposte all'anno corrente
    const currentYear = format(currentMonth, "yyyy");
    const currentMonthNum = format(currentMonth, "MM");
    const festivitaByDate = new Map<string, { id: string; descrizione: string }[]>();
    for (const fv of allFestivita) {
      if (!fv.data) continue;
      let dateKey: string;
      if (fv.ricorrente) {
        const md = fv.data.slice(5); // "MM-DD"
        if (!md.startsWith(currentMonthNum)) continue;
        dateKey = `${currentYear}-${md}`;
      } else {
        if (fv.data.slice(0, 7) !== monthStr) continue;
        dateKey = fv.data;
      }
      const arr = festivitaByDate.get(dateKey) ?? [];
      arr.push({ id: fv.id, descrizione: fv.descrizione });
      festivitaByDate.set(dateKey, arr);
    }

    return { tasksByDate, eventsByDate, rangeByDate, festivitaByDate };
  }, [monthTasks, monthScadenze, monthAppuntamenti, monthOrders, monthFerie, allFestivita, monthStartStr, monthEndStr, monthStr, currentMonth]);

  const days = useMemo(() => {
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    let startDow = getDay(monthStart);
    startDow = startDow === 0 ? 6 : startDow - 1;
    return { allDays, padding: startDow };
  }, [monthStart, monthEnd]);

  const today = startOfDay(new Date());
  const [calView, setCalView] = useState<"mese" | "settimana" | "giorno">("mese");
  const weekDays = useMemo(() => {
    const start = new Date(selectedDate ?? today);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // lunedì come primo giorno
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [selectedDate, today]);

  // Navigazione contestuale: ‹ › cambia mese / settimana / giorno secondo la vista attiva.
  const goCalendario = (dir: -1 | 1) => {
    if (calView === "mese") {
      setCurrentMonth((m) => (dir === 1 ? addMonths(m, 1) : subMonths(m, 1)));
      return;
    }
    const step = calView === "settimana" ? 7 : 1;
    const next = addDays(selectedDate ?? today, dir * step);
    setSelectedDate(next);
    setCurrentMonth(startOfMonth(next));
  };
  const headerLabel =
    calView === "mese"
      ? format(currentMonth, "MMMM yyyy", { locale: it })
      : calView === "settimana"
        ? `${format(weekDays[0], "d", { locale: it })}–${format(weekDays[6], "d MMM", { locale: it })}`
        : format(selectedDate ?? today, "EEE d MMM", { locale: it });

  // Eventi di un giorno divisi tra "tutto il dì" e per ora (07–20).
  const buildSchedule = (date: Date) => {
    const k = format(date, "yyyy-MM-dd");
    const allDay: { id: string; label: string; cls: string }[] = [];
    const byHour: Record<number, { id: string; label: string; cls: string; time?: string }[]> = {};
    (tasksByDate.get(k) ?? []).forEach((t: { id: string; title?: string }) =>
      allDay.push({ id: t.id, label: t.title ?? "Attività", cls: "bg-primary/60" }));
    (festivitaByDate.get(k) ?? []).forEach((f) =>
      allDay.push({ id: f.id, label: f.descrizione, cls: "bg-red-400" }));
    (eventsByDate.get(k) ?? []).forEach((e: { id: string; label: string; dotClass: string; time?: string }) => {
      const m = e.time ? /^(\d{2}):/.exec(e.time) : null;
      if (m) {
        const h = Math.min(20, Math.max(7, parseInt(m[1], 10)));
        (byHour[h] ??= []).push({ id: e.id, label: e.label, cls: e.dotClass, time: e.time });
      } else {
        allDay.push({ id: e.id, label: e.label, cls: e.dotClass });
      }
    });
    return { allDay, byHour };
  };

  // Griglia oraria: colonne = giorni, righe = ore. Usata per Settimana e Giorno.
  const renderTimeGrid = (gridDays: Date[]) => {
    const sched = gridDays.map((d) => ({ date: d, key: format(d, "yyyy-MM-dd"), ...buildSchedule(d) }));
    return (
      <div className="mt-2 overflow-auto">
        <div className="grid text-xs" style={{ gridTemplateColumns: `34px repeat(${gridDays.length}, minmax(64px, 1fr))` }}>
          <div className="bg-card" />
          {sched.map((s) => (
            <div key={`hd-${s.key}`} className={cn("py-1 text-center text-[10px] font-semibold capitalize", isToday(s.date) && "text-primary")}>
              {format(s.date, "EEE d", { locale: it })}
            </div>
          ))}
          <div className="border-t bg-card py-0.5 pr-1 text-right text-[8px] text-muted-foreground">tutto il dì</div>
          {sched.map((s) => (
            <div key={`ad-${s.key}`} className="space-y-0.5 border-l border-t p-0.5">
              {s.allDay.map((it) => (
                <div key={it.id} className="flex items-center gap-1 rounded bg-muted/50 px-1 py-0.5">
                  <span className={`h-1 w-1 shrink-0 rounded-full ${it.cls}`} />
                  <span className="truncate text-[9px] leading-tight">{it.label}</span>
                </div>
              ))}
            </div>
          ))}
          {ORE_GRIGLIA.map((h) => (
            <Fragment key={`row-${h}`}>
              <div className="border-t bg-card py-1 pr-1 text-right text-[9px] text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </div>
              {sched.map((s) => (
                <div key={`c-${s.key}-${h}`} className="min-h-[26px] space-y-0.5 border-l border-t p-0.5">
                  {(s.byHour[h] ?? []).map((it) => (
                    <div key={it.id} className="flex items-center gap-1 rounded bg-teal-50 px-1 py-0.5 dark:bg-teal-950/30">
                      <span className="shrink-0 font-mono text-[8px] font-semibold text-teal-600">{it.time}</span>
                      <span className="truncate text-[9px] leading-tight">{it.label}</span>
                    </div>
                  ))}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    );
  };

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedTasks    = useMemo(() => selectedKey ? (tasksByDate.get(selectedKey)    ?? []) : [], [selectedKey, tasksByDate]);
  const selectedEvents   = useMemo(() => selectedKey ? (eventsByDate.get(selectedKey)   ?? []) : [], [selectedKey, eventsByDate]);
  const selectedFestivita = useMemo(() => selectedKey ? (festivitaByDate.get(selectedKey) ?? []) : [], [selectedKey, festivitaByDate]);

  // Quali chip mostrare (solo se l'utente ha il permesso per quel layer)
  const visibleChips: LayerId[] = [
    ...(canViewOrders              ? ["commessa"]     as LayerId[] : []),
    ...(canViewScadenzario         ? ["scadenza"]     as LayerId[] : []),
    ...(canViewMarketingAppointments ? ["appuntamento"] as LayerId[] : []),
    ...["feria"] as LayerId[],
  ];
  const hasFestivita = allFestivita.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />Calendario
          </CardTitle>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goCalendario(-1)} aria-label="Precedente"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs sm:text-sm font-medium min-w-[90px] sm:min-w-[120px] text-center capitalize">{headerLabel}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goCalendario(1)} aria-label="Successivo"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1">
          {(["mese", "settimana", "giorno"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setCalView(v); if (v === "giorno") setSelectedDate(new Date()); }}
              className={cn(
                "h-6 rounded-md px-2 text-[11px] font-medium capitalize transition-colors",
                calView === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {visibleChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {visibleChips.map(id => {
              const cfg = LAYER_CONFIG[id];
              const on = enabledLayers.has(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleLayer(id)}
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    on ? cfg.chipOn : cfg.chipOff,
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", on ? cfg.dotClass : "bg-muted-foreground/30")} />
                  {cfg.label}
                </button>
              );
            })}
            {hasFestivita && (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                Chiusure
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="pb-3">
        {calView === "mese" && (<>
        <div className="grid grid-cols-7 mb-1">
          {GIORNI_SETTIMANA.map(g => <div key={g} className="text-center text-[10px] font-semibold text-muted-foreground py-1 uppercase">{g}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: days.padding }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
          {days.allDays.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks   = tasksByDate.get(key)    ?? [];
            const dayEvents  = eventsByDate.get(key)   ?? [];
            const isFestivita = festivitaByDate.has(key);
            const isInRange   = rangeByDate.has(key);
            const isSelected  = !!(selectedDate && isSameDay(day, selectedDate));
            const isCurrentDay = isToday(day);
            const isPast      = isBefore(day, today) && !isCurrentDay;

            // Item con TITOLO da mostrare nelle celle (più informazioni dei pallini)
            const cellItems: { label: string; cls: string }[] = [
              ...dayTasks.map((t: { title?: string; priority?: string; status?: string }) => ({
                label: String(t.title ?? "Attività"),
                cls: t.status === "completata"
                  ? "bg-green-400"
                  : (PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale).dotClass,
              })),
              ...dayEvents.map((ev: { label: string; dotClass: string }) => ({ label: ev.label, cls: ev.dotClass })),
            ];
            const cellShown = cellItems.slice(0, 2);
            const cellOverflow = cellItems.length - cellShown.length;

            return (
              <TooltipProvider key={key} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        const newSel = selectedDate && isSameDay(day, selectedDate) ? null : day;
                        setSelectedDate(newSel);
                        onDateSelect?.(newSel ? format(newSel, "yyyy-MM-dd") : null);
                      }}
                      className={cn(
                        "relative min-h-[58px] sm:min-h-[72px] flex flex-col items-stretch justify-start rounded-md p-1 text-sm transition-all",
                        isSelected
                          ? "bg-primary text-primary-foreground font-bold shadow-sm hover:bg-primary/90"
                          : isCurrentDay
                          ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/20"
                          : isFestivita
                          ? "bg-red-50 dark:bg-red-950/20 text-foreground hover:bg-red-100 dark:hover:bg-red-950/40"
                          : isInRange
                          ? "bg-emerald-50 dark:bg-emerald-950/20 text-foreground hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                          : isPast
                          ? "text-muted-foreground/60 hover:bg-muted/60"
                          : "text-foreground hover:bg-muted/60",
                      )}
                    >
                      <span className="text-xs leading-none mb-0.5">{format(day, "d")}</span>
                      <div className="flex-1 w-full space-y-0.5 overflow-hidden text-left">
                        {cellShown.map((it, i) => (
                          <div key={i} className="flex items-center gap-1 leading-tight">
                            <span className={`w-1 h-1 rounded-full shrink-0 ${it.cls}`} />
                            <span className="truncate text-[9px]">{it.label}</span>
                          </div>
                        ))}
                        {isFestivita && cellItems.length === 0 && (
                          <div className="flex items-center gap-1 leading-tight">
                            <span className="w-1 h-1 rounded-full shrink-0 bg-red-400" />
                            <span className="truncate text-[9px] text-red-600">Festività</span>
                          </div>
                        )}
                        {cellOverflow > 0 && (
                          <span className="block text-[8px] leading-none text-muted-foreground">+{cellOverflow} altri</span>
                        )}
                      </div>
                    </button>
                  </TooltipTrigger>
                  {(dayTasks.length > 0 || dayEvents.length > 0 || isFestivita) && (
                    <TooltipContent side="bottom" className="max-w-[220px]">
                      <p className="font-medium text-xs mb-1">{format(day, "d MMMM", { locale: it })}</p>
                      {dayTasks.length > 0 && <p className="text-xs text-muted-foreground">🔵 {dayTasks.length} attività</p>}
                      {dayEvents.filter((e: any) => e.type === "commessa").length > 0 && <p className="text-xs text-muted-foreground">🟢 {dayEvents.filter((e: any) => e.type === "commessa").length} commesse</p>}
                      {dayEvents.filter((e: any) => e.type === "scadenza").length > 0 && <p className="text-xs text-muted-foreground">🟡 {dayEvents.filter((e: any) => e.type === "scadenza").length} scadenze</p>}
                      {dayEvents.filter((e: any) => e.type === "appuntamento").length > 0 && <p className="text-xs text-muted-foreground">🩵 {dayEvents.filter((e: any) => e.type === "appuntamento").length} appuntamenti</p>}
                      {dayEvents.filter((e: any) => e.type === "feria").length > 0 && <p className="text-xs text-muted-foreground">🟠 {dayEvents.filter((e: any) => e.type === "feria").length} ferie</p>}
                      {isFestivita && festivitaByDate.get(key)!.map(fv => <p key={fv.id} className="text-xs text-red-600">🔴 {fv.descrizione}</p>)}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>
        </>)}
        {calView === "settimana" && renderTimeGrid(weekDays)}
        {calView === "giorno" && renderTimeGrid([selectedDate ?? today])}
        {calView === "mese" && selectedDate && (
          <div className="mt-3 border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {isToday(selectedDate) ? "Oggi" : format(selectedDate, "d MMMM", { locale: it })}
                {(selectedTasks.length + selectedEvents.length + selectedFestivita.length) > 0 &&
                  ` — ${selectedTasks.length + selectedEvents.length + selectedFestivita.length} eventi`}
              </p>
              {onAddTask && !isBefore(selectedDate, today) && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-primary" onClick={() => onAddTask(format(selectedDate!, "yyyy-MM-dd"))}>
                  <Plus className="h-3 w-3" />Aggiungi
                </Button>
              )}
            </div>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
              {selectedTasks.map((t: any) => {
                const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                const isDone = t.status === "completata";
                return (
                  <div key={t.id} className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${isDone ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/50"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-green-500" : cfg.dotClass}`} />
                    <span className={`flex-1 truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                    <Badge className={`text-[9px] px-1 py-0 ${isDone ? "bg-green-100 text-green-700" : cfg.badgeClass}`}>{isDone ? "Fatto" : cfg.label}</Badge>
                  </div>
                );
              })}
              {selectedEvents.map((ev: { id: string; type: LayerId; label: string; dotClass: string; time?: string }) => (
                <div key={ev.id} className="flex items-center gap-2 text-xs rounded px-2 py-1.5 bg-muted/40">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.dotClass}`} />
                  {ev.time && <span className="font-mono text-[10px] font-semibold text-teal-600 shrink-0">{ev.time}</span>}
                  <span className="flex-1 truncate">{ev.label}</span>
                  <span className={cn("text-[9px] px-1 py-0 rounded font-medium",
                    ev.type === "commessa"     ? "bg-emerald-100 text-emerald-700" :
                    ev.type === "scadenza"     ? "bg-amber-100 text-amber-700" :
                    ev.type === "appuntamento" ? "bg-teal-100 text-teal-700" :
                                                "bg-orange-100 text-orange-700",
                  )}>
                    {LAYER_CONFIG[ev.type].label.replace(/e$/, "a")}
                  </span>
                </div>
              ))}
              {selectedFestivita.map(fv => (
                <div key={fv.id} className="flex items-center gap-2 text-xs rounded px-2 py-1.5 bg-red-50 dark:bg-red-950/20">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-400" />
                  <span className="flex-1 truncate text-red-700">{fv.descrizione}</span>
                  <span className="text-[9px] px-1 py-0 rounded font-medium bg-red-100 text-red-700">Chiusura</span>
                </div>
              ))}
              {selectedTasks.length === 0 && selectedEvents.length === 0 && selectedFestivita.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nessun evento per questo giorno</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TimbraturaSede
// ─────────────────────────────────────────────────────────────────────────────
function TimbraturaSede() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: profilo, isLoading: loadingProfilo } = useQuery({
    queryKey: ["hr-my-profilo", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_profili").select("id, nome, cognome").eq("company_id", companyId!).eq("user_id", user!.id).eq("attivo", true).maybeSingle();
      if (error) { logger.error("TimbraturaSede — errore:", error); throw error; }
      return data;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: timbratureOggi = [], isLoading: loadingTimbrature } = useQuery({
    queryKey: ["hr-timbrature-today", profilo?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_timbrature").select("id, tipo, timestamp, ora_evento").eq("profilo_id", profilo!.id).eq("data_evento", todayStr).order("timestamp", { ascending: true });
      if (error) { logger.error("TimbraturaSede — errore:", error); throw error; }
      return data ?? [];
    },
    enabled: !!profilo?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const timbraMutation = useMutation({
    mutationFn: async (tipo: "entrata" | "uscita" | "pausa_inizio" | "pausa_fine") => {
      const now = new Date();
      const { error } = await supabase.from("hr_timbrature").insert({
        company_id: companyId,
        profilo_id: profilo!.id,
        tipo,
        timestamp: now.toISOString(),
        data_evento: format(now, "yyyy-MM-dd"),
        ora_evento: format(now, "HH:mm:ss"),
        lat: null,
        lng: null,
        fonte: "web",
        note: "Sede ufficio",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Timbratura registrata"); queryClient.invalidateQueries({ queryKey: ["hr-timbrature-today"] }); },
    onError: (err: any) => { toast.error("Errore: " + (err.message ?? "Riprovare")); },
  });

  const oreLavorate = useMemo(() => {
    let totaleMs = 0; let ultimaEntrata: Date | null = null;
    for (const t of timbratureOggi) {
      const ts = new Date((t as any).timestamp);
      if ((t as any).tipo === "entrata" || (t as any).tipo === "pausa_fine") ultimaEntrata = ts;
      else if (((t as any).tipo === "uscita" || (t as any).tipo === "pausa_inizio") && ultimaEntrata) { totaleMs += ts.getTime() - ultimaEntrata.getTime(); ultimaEntrata = null; }
    }
    if (ultimaEntrata) totaleMs += Date.now() - ultimaEntrata.getTime();
    return Math.round((totaleMs / 3_600_000) * 10) / 10;
  }, [timbratureOggi]);

  const lastTimbro = timbratureOggi[timbratureOggi.length - 1] as any;
  const isEntrato = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
  const isInPausa = lastTimbro?.tipo === "pausa_inizio";
  const isUscito = lastTimbro?.tipo === "uscita";
  const nonHaTimbrato = !lastTimbro;
  const isLoading = loadingProfilo || loadingTimbrature;
  const isMutating = timbraMutation.isPending;

  if (!isLoading && !profilo) return (
    <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Timbratura Sede</CardTitle></CardHeader>
    <CardContent><p className="text-sm text-muted-foreground">Il tuo profilo HR non è ancora configurato. Contatta l'amministratore.</p></CardContent></Card>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Timbratura Sede</CardTitle>
          {isEntrato && <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">{oreLavorate}h lavorate oggi</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : (
          <>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isEntrato ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : isInPausa ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${isEntrato ? "bg-green-500 animate-pulse" : isInPausa ? "bg-amber-500 animate-pulse" : "bg-slate-400"}`} />
              <span className="font-medium">{isUscito ? "Giornata completata" : isInPausa ? "In pausa" : isEntrato ? "In servizio" : "Non hai ancora timbrato"}</span>
              {lastTimbro?.ora_evento && <span className="ml-auto text-xs opacity-75">ultimo: {lastTimbro.ora_evento.slice(0, 5)}</span>}
            </div>
            {!isUscito && (
              <div className="flex flex-wrap gap-2">
                {nonHaTimbrato && <Button className="flex-1 min-w-[100px] sm:min-w-[120px] gap-2 bg-green-600 hover:bg-green-700 text-white" disabled={isMutating} onClick={() => timbraMutation.mutate("entrata")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Entrata</Button>}
                {isEntrato && <><Button variant="outline" className="flex-1 min-w-[100px] sm:min-w-[120px] gap-2" disabled={isMutating} onClick={() => timbraMutation.mutate("pausa_inizio")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}Pausa</Button><Button variant="destructive" className="flex-1 min-w-[100px] sm:min-w-[120px] gap-2" disabled={isMutating} onClick={() => timbraMutation.mutate("uscita")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Uscita</Button></>}
                {isInPausa && <><Button className="flex-1 min-w-[100px] sm:min-w-[120px] gap-2 bg-amber-600 hover:bg-amber-700 text-white" disabled={isMutating} onClick={() => timbraMutation.mutate("pausa_fine")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Fine Pausa</Button><Button variant="destructive" className="flex-1 min-w-[100px] sm:min-w-[120px] gap-2" disabled={isMutating} onClick={() => timbraMutation.mutate("uscita")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Uscita</Button></>}
              </div>
            )}
            {timbratureOggi.length > 0 && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Oggi</p>
                {timbratureOggi.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                    <span className="font-medium tabular-nums">{t.ora_evento?.slice(0, 5)}</span>
                    <span>—</span>
                    <span>{t.tipo === "entrata" ? "Entrata" : t.tipo === "uscita" ? "Uscita" : t.tipo === "pausa_inizio" ? "Inizio pausa" : t.tipo === "pausa_fine" ? "Fine pausa" : t.tipo}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Manager — Le mie Attività (stile Asana)
// Features: CRUD, multi-select + bulk actions, grouping, search, compact view
// ─────────────────────────────────────────────────────────────────────────────
type GroupBy = "none" | "priority" | "category" | "date";

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "Nessuno" },
  { value: "priority", label: "Priorità" },
  { value: "category", label: "Categoria" },
  { value: "date", label: "Data" },
];

function MieAttivita({ initialDueDate, calendarDate, onCalendarDateClear }: { initialDueDate?: AddTaskRequest | null; calendarDate?: string | null; onCalendarDateClear?: () => void }) {
  const { user, effectiveCompany, role } = useAuth();
  const isAdmin = role === "company_admin";
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<TaskFilter>("tutte");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filterAssignee, setFilterAssignee] = useState<string>("me");

  // ── Form state ──
  const [formTitle, setFormTitle] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPriority, setFormPriority] = useState("normale");
  const [formDueDate, setFormDueDate] = useState("");
  const [formCategory, setFormCategory] = useState("altro");
  const [formStatus, setFormStatus] = useState("da_fare");
  const [formAssignedTo, setFormAssignedTo] = useState("");

  useEffect(() => {
    if (initialDueDate?.date) { setFormDueDate(initialDueDate.date); setDialogOpen(true); }
  }, [initialDueDate?.requestId, initialDueDate?.date]);

  const { data: teamMembers = [] } = useCompanyStaffUsers(isAdmin ? companyId : null);

  // ── Fetch tasks — admin vede tutto, staff solo le sue ──
  const { data: allTasks = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["my-tasks-all", user?.id, companyId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from("tasks")
        .select(`id, title, notes, status, priority, due_date, category, assigned_to, created_by,
          order:orders!tasks_order_id_fkey(order_code),
          stock_item:warehouse_stock!tasks_stock_item_id_fkey(name),
          assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)`)
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);
      const { data, error } = await q;
      if (error) { logger.error("MieAttivita — errore:", error); throw error; }
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
  });

  // ── Filtered + searched tasks ──
  const today = startOfDay(new Date());
  const weekEnd = addDays(today, 7);

  // Auto-set "scadute" al primo carico se ci sono task in ritardo
  const hasSetInitialFilter = useRef(false);

  const filteredTasks = useMemo(() => {
    // Quando il calendario ha selezionato una data: mostra TUTTE le task di quel giorno
    if (calendarDate) {
      return allTasks.filter((t: any) => t.due_date?.slice(0, 10) === calendarDate);
    }

    let filtered = allTasks;
    // Assignee filter (admin only)
    if (isAdmin && filterAssignee !== "all") {
      if (filterAssignee === "me") filtered = filtered.filter((t: any) => t.assigned_to === user?.id);
      else filtered = filtered.filter((t: any) => t.assigned_to === filterAssignee);
    }
    switch (filter) {
      case "oggi":
        filtered = filtered.filter((t: any) => t.status !== "completata" && t.due_date && (isToday(new Date(t.due_date)) || isBefore(new Date(t.due_date), today)));
        break;
      case "scadute":
        filtered = filtered.filter((t: any) => t.status !== "completata" && t.due_date && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date)));
        break;
      case "settimana":
        filtered = filtered.filter((t: any) => t.status !== "completata" && t.due_date && isBefore(new Date(t.due_date), weekEnd));
        break;
      case "completate":
        filtered = filtered.filter((t: any) => t.status === "completata");
        break;
      default:
        filtered = filtered.filter((t: any) => t.status !== "completata");
    }
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((t: any) =>
        t.title.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [allTasks, filter, today, weekEnd, searchQuery, isAdmin, filterAssignee, user?.id, calendarDate]);

  // Stats
  const stats = useMemo(() => {
    const active = allTasks.filter((t: any) => t.status !== "completata");
    const overdue = active.filter((t: any) => t.due_date && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date)));
    const todayTasks = active.filter((t: any) => t.due_date && isToday(new Date(t.due_date)));
    const completed = allTasks.filter((t: any) => t.status === "completata");
    const inProgress = active.filter((t: any) => t.status === "in_corso");
    return { total: active.length, overdue: overdue.length, today: todayTasks.length, completed: completed.length, inProgress: inProgress.length };
  }, [allTasks, today]);

  // Default al tab "scadute" alla prima apertura se ci sono task in ritardo
  useEffect(() => {
    if (hasSetInitialFilter.current || isLoading || allTasks.length === 0) return;
    hasSetInitialFilter.current = true;
    if (stats.overdue > 0) setFilter("scadute");
  }, [isLoading, allTasks.length, stats.overdue]);


  // ── Grouping ──
  const groupedTasks = useMemo(() => {
    if (groupBy === "none") return null;
    const groups = new Map<string, any[]>();
    for (const t of filteredTasks) {
      let key: string;
      if (groupBy === "priority") key = PRIORITY_CONFIG[t.priority ?? "normale"]?.label ?? "Normale";
      else if (groupBy === "category") key = CATEGORY_OPTIONS.find(c => c.value === t.category)?.label ?? "Altro";
      else {
        if (!t.due_date) key = "Senza scadenza";
        else if (isToday(new Date(t.due_date))) key = "Oggi";
        else if (isBefore(new Date(t.due_date), today)) key = "Scadute";
        else if (isBefore(new Date(t.due_date), weekEnd)) key = "Questa settimana";
        else key = "Più avanti";
      }
      const arr = groups.get(key) ?? [];
      arr.push(t);
      groups.set(key, arr);
    }
    return groups;
  }, [filteredTasks, groupBy, today, weekEnd]);

  // ── Mutations ──
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["my-tasks-all"] });
    queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["team-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };

  const createTask = useMutation({
    mutationFn: async (task: { title: string; notes?: string; priority: string; due_date?: string; category: string; assigned_to?: string }) => {
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId!, assigned_to: task.assigned_to || user!.id, created_by: user!.id,
        title: task.title, notes: task.notes || null,
        priority: task.priority, due_date: task.due_date || null,
        category: task.category, status: "da_fare",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Attività creata"); invalidate(); },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      let q = supabase.from("tasks").update(updates).eq("id", id);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);
      else q = q.eq("company_id", companyId!);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Attività aggiornata"); invalidate(); },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      let q = supabase.from("tasks").delete().eq("id", taskId);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);
      else q = q.eq("company_id", companyId!);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Attività eliminata"); invalidate(); },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  // Bulk update mutation
  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const updates: any = { status };
      if (status === "completata") updates.completed_at = new Date().toISOString();
      let q = supabase.from("tasks").update(updates).in("id", ids);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);
      else q = q.eq("company_id", companyId!);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_, { ids, status }) => {
      const label = STATUS_CONFIG[status]?.label ?? status;
      toast.success(`${ids.length} attività → ${label}`);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      let q = supabase.from("tasks").delete().in("id", ids);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);
      else q = q.eq("company_id", companyId!);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} attività eliminate`);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  const postponeMutation = useMutation({
    mutationFn: async ({ id, newDate }: { id: string; newDate: string }) => {
      let q = supabase.from("tasks").update({ due_date: newDate }).eq("id", id);
      if (!isAdmin) q = q.eq("assigned_to", user!.id);
      else q = q.eq("company_id", companyId!);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Scadenza posticipata di 7 giorni"); invalidate(); },
    onError: (err: any) => toast.error("Errore: " + (err.message ?? "Riprovare")),
  });

  // ── Helpers ──
  const openCreate = (dueDate?: string) => {
    setEditingTask(null);
    setFormTitle(""); setFormNotes(""); setFormPriority("normale");
    setFormDueDate(dueDate ?? ""); setFormCategory("altro"); setFormStatus("da_fare");
    setFormAssignedTo(user?.id ?? "");
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditingTask(t);
    setFormTitle(t.title); setFormNotes(t.notes ?? "");
    setFormPriority(t.priority ?? "normale");
    setFormDueDate(t.due_date ?? ""); setFormCategory(t.category ?? "altro");
    setFormStatus(t.status ?? "da_fare");
    setFormAssignedTo(t.assigned_to ?? user?.id ?? "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formTitle.trim()) { toast.error("Inserisci un titolo"); return; }
    if (editingTask) {
      const updates: any = { id: editingTask.id, title: formTitle.trim(), notes: formNotes.trim() || null, priority: formPriority, due_date: formDueDate || null, category: formCategory, status: formStatus };
      if (isAdmin && formAssignedTo) updates.assigned_to = formAssignedTo;
      if (formStatus === "completata" && editingTask.status !== "completata") updates.completed_at = new Date().toISOString();
      updateTask.mutate(updates);
    } else {
      createTask.mutate({ title: formTitle.trim(), notes: formNotes.trim(), priority: formPriority, due_date: formDueDate || undefined, category: formCategory, assigned_to: isAdmin ? formAssignedTo : undefined });
    }
    setDialogOpen(false);
  };

  const handleQuickAdd = () => {
    if (!quickAddTitle.trim()) return;
    createTask.mutate({ title: quickAddTitle.trim(), priority: "normale", category: "altro" });
    setQuickAddTitle("");
  };

  // Click = completa subito (intuitivo come checkbox)
  const markDone = (t: any) => {
    updateTask.mutate({ id: t.id, status: "completata", completed_at: new Date().toISOString() });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredTasks.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredTasks.map((t: any) => t.id)));
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Separazione oggi / prossime (solo quando groupBy = none) ──
  const taskOggi = filteredTasks.filter((t: any) => filter === "tutte" && groupBy === "none" && (!t.due_date || isBefore(new Date(t.due_date), addDays(today, 1))));
  const taskFuture = filteredTasks.filter((t: any) => filter === "tutte" && groupBy === "none" && t.due_date && !isBefore(new Date(t.due_date), addDays(today, 1)));
  const showDefaultSections = filter === "tutte" && groupBy === "none";

  const hasSelection = selectedIds.size > 0;

  // ── Render task card ──
  const renderTask = (t: any) => {
    const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
    const stCfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.da_fare;
    const scaduta = t.due_date && t.status !== "completata" && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date));
    const isDone = t.status === "completata";
    const catLabel = CATEGORY_OPTIONS.find(c => c.value === t.category)?.label;
    const PriorityIcon = cfg.icon;
    const isSelected = selectedIds.has(t.id);

    const assigneeName = getAssigneeName(t);

    if (compact) {
      // Vista compatta — riga singola
      return (
        <div key={t.id} className={`group flex items-center gap-1.5 sm:gap-2 rounded border px-2 sm:px-3 py-1.5 transition-all text-sm ${isDone ? "opacity-50 bg-muted/30" : ""} ${scaduta ? "border-red-200 bg-red-50/20" : ""} ${isSelected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}>
          {/* Checkbox select */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(t.id)}
            className="h-3.5 w-3.5 rounded border-muted-foreground/30 accent-primary shrink-0"
          />
          {/* Complete button */}
          <button
            onClick={() => !isDone && markDone(t)}
            disabled={isDone}
            className={`shrink-0 transition-colors ${isDone ? "text-green-500" : "text-muted-foreground/30 hover:text-green-500"}`}
            title={isDone ? "Completata" : "Segna come fatta"}
          >
            {isDone ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
          {/* Title */}
          <span className={`flex-1 truncate cursor-pointer ${isDone ? "line-through text-muted-foreground" : ""}`} onClick={() => openEdit(t)}>
            {t.title}
          </span>
          {/* Assignee avatar */}
          {assigneeName && (
            <span className="text-[10px] text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded-full shrink-0 font-medium">{assigneeName.split(" ").map((n: string) => n[0]).join("")}</span>
          )}
          {/* Priority dot */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} title={cfg.label} />
          {/* Due date */}
          {t.due_date && (
            <span className={`text-[10px] shrink-0 ${scaduta ? "text-red-500 font-semibold" : isToday(new Date(t.due_date)) ? "text-amber-600" : "text-muted-foreground"}`}>
              {isToday(new Date(t.due_date)) ? "Oggi" : format(new Date(t.due_date), "d/MM", { locale: it })}
            </span>
          )}
          {/* Posticipa +7gg — visibile subito sulle scadute */}
          {scaduta && (
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
          <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
            <button onClick={() => openEdit(t)} className="p-1 -m-0.5 text-muted-foreground hover:text-foreground" title="Modifica" aria-label="Modifica attività">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setTaskToDelete(t.id)} className="p-1 -m-0.5 text-muted-foreground hover:text-red-500" title="Elimina" aria-label="Elimina attività">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      );
    }

    // Vista normale — card
    return (
      <div key={t.id} className={`group flex items-start gap-3 rounded-lg border bg-card p-3 transition-all hover:shadow-sm hover:border-primary/20 ${isDone ? "opacity-50" : ""} ${scaduta ? "border-red-200 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10" : ""} ${isSelected ? "ring-2 ring-primary/40 bg-primary/5" : ""}`}>
        {/* Checkbox + Complete */}
        <div className="flex flex-col items-center gap-1 mt-0.5 shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(t.id)}
            className="h-3.5 w-3.5 rounded border-muted-foreground/30 accent-primary"
          />
          <button
            onClick={() => !isDone && markDone(t)}
            disabled={isDone}
            className={`transition-colors ${isDone ? "text-green-500" : "text-muted-foreground/30 hover:text-green-500"}`}
            title={isDone ? "Completata" : "Segna come fatta"}
          >
            {isDone ? <CheckCircle className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(t)}>
          <div className="flex items-start justify-between gap-2">
            <p className={`font-medium text-sm leading-snug ${isDone ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${cfg.badgeClass}`}>
              <PriorityIcon className="h-2.5 w-2.5 mr-0.5" />{cfg.label}
            </Badge>
          </div>
          {t.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.notes}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${stCfg.className}`}>{stCfg.label}</Badge>
            {assigneeName && <span className="flex items-center gap-1 text-violet-600 dark:text-violet-400 font-medium"><Users className="w-3 h-3" />{assigneeName}</span>}
            {catLabel && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{catLabel}</span>}
            {t.order?.order_code && <Link to="/azienda/ordini" className="flex items-center gap-1 hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" />{t.order.order_code}</Link>}
            {t.due_date && (
              <span className={scaduta ? "text-red-500 font-semibold" : isDone ? "" : isToday(new Date(t.due_date)) ? "text-amber-600 font-medium" : ""}>
                {scaduta ? "Scaduta " : isToday(new Date(t.due_date)) ? "Oggi" : "Entro "}{!isToday(new Date(t.due_date)) && format(new Date(t.due_date), "d MMM", { locale: it })}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 md:h-7 md:w-7 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity" aria-label="Azioni attività"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-2" />Modifica</DropdownMenuItem>
            {!isDone && <DropdownMenuItem onClick={() => markDone(t)}><CheckCircle2 className="h-3.5 w-3.5 mr-2" />Segna come fatta</DropdownMenuItem>}
            {scaduta && <DropdownMenuItem onClick={() => postponeMutation.mutate({ id: t.id, newDate: format(addDays(new Date(), 7), "yyyy-MM-dd") })}><CalendarClock className="h-3.5 w-3.5 mr-2" />Posticipa +7 giorni</DropdownMenuItem>}
            {t.status === "da_fare" && <DropdownMenuItem onClick={() => updateTask.mutate({ id: t.id, status: "in_corso" })}><PlayCircle className="h-3.5 w-3.5 mr-2" />Inizia (In corso)</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => setTaskToDelete(t.id)}><Trash2 className="h-3.5 w-3.5 mr-2" />Elimina</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
    if (!isAdmin || t.assigned_to === user?.id) return null;
    const a = t.assignee as any;
    return a ? `${a.first_name || ""} ${a.last_name || ""}`.trim() : null;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <CardTitle className="flex items-center gap-2 text-base shrink-0">
                <ClipboardCheck className="h-4 w-4" />{isAdmin ? "Attività" : "Le mie Attività"}
                {!calendarDate && stats.total > 0 && <Badge variant="secondary" className="text-xs">{stats.total}</Badge>}
              </CardTitle>
              {calendarDate && (
                <button
                  onClick={() => { onCalendarDateClear?.(); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  title="Rimuovi filtro data"
                >
                  <CalendarDays className="h-3 w-3" />
                  {format(parseISO(calendarDate), "d MMM", { locale: it })}
                  <X className="h-3 w-3 opacity-60" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft: `Cosa conta ora? Ho ${stats.overdue > 0 ? `${stats.overdue} attività scadute` : "alcune attività aperte"} — dimmi cosa prioritizzare oggi.` } }))}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 transition-colors dark:bg-orange-950/20 dark:text-orange-300 dark:border-orange-900/40"
                title="Chiedi a Silvio come prioritizzare"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Silvio</span>
              </button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => openCreate()}>
                <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuova</span>
              </Button>
            </div>
          </div>

          {/* Stats */}
          {(stats.total > 0 || stats.completed > 0) && (
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {stats.overdue > 0 && <span className="text-red-500 font-medium">{stats.overdue} scadute</span>}
              {stats.inProgress > 0 && <span className="text-blue-500">{stats.inProgress} in corso</span>}
              {stats.today > 0 && <span className="text-amber-600">{stats.today} oggi</span>}
              <span className="text-green-500">{stats.completed} completate</span>
            </div>
          )}

          {/* Assignee filter (admin only) */}
          {isAdmin && teamMembers.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
              {[
                { key: "me", label: "Le mie" },
                { key: "all", label: "Tutte" },
                ...teamMembers.filter(m => m.id !== user?.id).map(m => ({
                  key: m.id, label: `${m.first_name?.[0] || ""}. ${m.last_name || ""}`.trim()
                })),
              ].map(f => (
                <button key={f.key} onClick={() => setFilterAssignee(f.key)}
                  className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterAssignee === f.key ? "bg-violet-600 text-white shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Filtri stato */}
          <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
            {([
              { key: "tutte", label: "Tutte", count: stats.total },
              { key: "oggi", label: "Oggi", count: stats.today + stats.overdue },
              { key: "scadute", label: "Scadute", count: stats.overdue },
              { key: "settimana", label: "Settimana", count: null },
              { key: "completate", label: "Completate", count: stats.completed },
            ] as const).map(f => (
              <button key={f.key} onClick={() => { setFilter(f.key); setSelectedIds(new Set()); }}
                className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filter === f.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                {f.label}
                {f.count != null && f.count > 0 && <span className={`text-[10px] ${filter === f.key ? "opacity-80" : ""}`}>({f.count})</span>}
              </button>
            ))}
          </div>

          {/* Search + view controls — mobile: search full-row, controls below */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Cerca attività..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-9 text-base md:text-sm pl-8"
              />
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label="Pulisci ricerca"><X className="h-3 w-3" /></button>}
            </div>
            <div className="flex items-center gap-2">
              {/* Group by */}
              <Select value={groupBy} onValueChange={v => { setGroupBy(v as GroupBy); setCollapsedGroups(new Set()); }}>
                <SelectTrigger className="h-9 flex-1 sm:w-[110px] sm:flex-none text-xs"><SelectValue placeholder="Raggruppa" /></SelectTrigger>
                <SelectContent>{GROUP_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
              </Select>
              {/* Compact toggle */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={compact ? "default" : "outline"} size="sm" className="h-9 w-9 p-0 shrink-0" onClick={() => setCompact(!compact)} aria-label="Cambia vista compatta">
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5" /><rect x="1" y="7" width="14" height="2" rx="0.5" /><rect x="1" y="12" width="14" height="2" rx="0.5" /></svg>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{compact ? "Vista espansa" : "Vista compatta"}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Bulk action bar — su mobile wrap, su desktop 1 riga */}
          {hasSelection && (
            <div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input type="checkbox" checked={selectedIds.size === filteredTasks.length} onChange={selectAll} className="h-4 w-4 accent-primary shrink-0" aria-label="Seleziona tutte" />
                <span className="text-xs font-medium truncate">{selectedIds.size} {selectedIds.size === 1 ? "selezionata" : "selezionate"}</span>
                <button onClick={() => setSelectedIds(new Set())} className="p-1 text-muted-foreground hover:text-foreground ml-auto sm:hidden" aria-label="Annulla selezione"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "completata" })}>
                  <CheckCircle className="h-3.5 w-3.5" />Fatte
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "in_corso" })}>
                  <PlayCircle className="h-3.5 w-3.5" />In corso
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 flex-1 sm:flex-none" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "da_fare" })}>
                  <Circle className="h-3.5 w-3.5" />Da fare
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 flex-1 sm:flex-none text-red-600 hover:text-red-700" onClick={() => setBulkConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />Elimina
                </Button>
                <button onClick={() => setSelectedIds(new Set())} className="hidden sm:inline-flex p-1 text-muted-foreground hover:text-foreground ml-1" aria-label="Annulla selezione"><X className="h-3.5 w-3.5" /></button>
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
              {/* Quick add */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input ref={quickAddRef} placeholder="+ Aggiungi attività veloce... (Invio)" value={quickAddTitle}
                    onChange={e => setQuickAddTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !createTask.isPending) handleQuickAdd(); if (e.key === "Escape") { setQuickAddTitle(""); quickAddRef.current?.blur(); } }}
                    className="h-9 text-base md:text-sm pr-8" />
                  {quickAddTitle && <button onClick={() => setQuickAddTitle("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={handleQuickAdd} disabled={!quickAddTitle.trim() || createTask.isPending}>
                  {createTask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>

              {/* Grouped view */}
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
                <>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attività di oggi {taskOggi.length > 0 && `(${taskOggi.length})`}</p>
                    </div>
                    {taskOggi.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-center"><CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500 opacity-60" /><p className="text-xs text-muted-foreground">Nessuna attività per oggi</p></div>
                    ) : <div className={compact ? "space-y-1" : "space-y-2"}>{taskOggi.map(renderTask)}</div>}
                  </div>
                  <div className="border-t" />
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prossime attività {taskFuture.length > 0 && `(${taskFuture.length})`}</p>
                    </div>
                    {taskFuture.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-center"><CalendarDays className="h-5 w-5 mx-auto mb-1 text-blue-400 opacity-60" /><p className="text-xs text-muted-foreground">Nessuna attività in programma</p></div>
                    ) : <div className={compact ? "space-y-1" : "space-y-2"}>{taskFuture.map(renderTask)}</div>}
                  </div>
                </>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center">
                  <Filter className="h-6 w-6 mx-auto mb-2 text-muted-foreground opacity-40" />
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      // Messaggio contestuale: dice ESATTAMENTE quale combinazione
                      // di filtri è vuota (es. "Nessuna attività scaduta di Mario
                      // Bianchi"), invece del generico "per questo filtro".
                      const who = filterAssignee === "me"
                        ? " assegnata a te"
                        : filterAssignee !== "all"
                          ? (() => {
                              const m = teamMembers.find((t) => t.id === filterAssignee);
                              return m ? ` di ${[m.first_name, m.last_name].filter(Boolean).join(" ")}` : "";
                            })()
                          : "";
                      const what = filter === "scadute" ? " scaduta"
                        : filter === "oggi" ? " per oggi"
                          : filter === "settimana" ? " questa settimana"
                            : filter === "completate" ? " completata" : "";
                      return `Nessuna attività${what}${who}${searchQuery ? ` per «${searchQuery}»` : ""}`;
                    })()}
                  </p>
                  {(filterAssignee !== "all" || filter !== "tutte" || !!searchQuery) && (
                    <button
                      type="button"
                      onClick={() => { setFilterAssignee("all"); setFilter("tutte"); setSearchQuery(""); setSelectedIds(new Set()); }}
                      className="mt-2 text-xs font-semibold text-primary hover:underline"
                    >
                      Mostra tutte le attività
                    </button>
                  )}
                </div>
              ) : (
                <div className={compact ? "space-y-1" : "space-y-2"}>{filteredTasks.map(renderTask)}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog crea/modifica task ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingTask ? "Modifica attività" : "Nuova attività"}</DialogTitle>
            <DialogDescription>{editingTask ? "Modifica i dettagli dell'attività." : "Crea una nuova attività."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-title">Titolo *</Label>
              <Input id="task-title" placeholder="Cosa devi fare?" value={formTitle} onChange={e => setFormTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && formTitle.trim()) handleSave(); }} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-notes">Descrizione</Label>
              <Textarea id="task-notes" placeholder="Aggiungi dettagli, link, note..." value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} className="resize-none" />
            </div>
            {/* Assegna a (admin) + Priorità */}
            <div className={`grid gap-3 ${isAdmin ? "grid-cols-2" : "grid-cols-2"}`}>
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
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORY_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {/* Categoria (admin) + Scadenza + Stato */}
            <div className={`grid gap-3 ${editingTask ? "grid-cols-3" : "grid-cols-2"}`}>
              {isAdmin && (
                <div className="space-y-1.5">
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
                  <Select value={formStatus} onValueChange={setFormStatus}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={handleSave} disabled={!formTitle.trim() || createTask.isPending || updateTask.isPending}>
              {(createTask.isPending || updateTask.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTask ? "Salva" : "Crea"}
            </Button>
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
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                bulkDelete.mutate([...selectedIds]);
                setBulkConfirmOpen(false);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab content — Attività (Dashboard Widget)
// ─────────────────────────────────────────────────────────────────────────────
function TabAttivita() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin";
  const isMobile = useIsMobile();
  const [addTaskDate, setAddTaskDate] = useState<AddTaskRequest | null>(null);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Timbratura in cima per lo staff non-admin */}
      {!isAdmin && <TimbraturaSede />}

      {/* Sinistra: Meteo + Calendario (integrati) · Destra: le mie attività giornaliere */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
          <MeteoWidget />
          {/* Calendario mese: ingombrante e poco usato su mobile (la vista
              "Oggi/Settimana" dei chip basta). Solo da tablet in su. */}
          {!isMobile && (
            <MiniCalendario
              onAddTask={(date) => setAddTaskDate({ date, requestId: Date.now() })}
              onDateSelect={(date) => setCalendarDate(date)}
            />
          )}
        </div>
        <MieAttivita
          initialDueDate={addTaskDate}
          calendarDate={calendarDate}
          onCalendarDateClear={() => setCalendarDate(null)}
        />
      </div>

      {/* Strumenti del team (solo admin). Su mobile NON montati (query pesanti
          + scroll lungo): sono la vista desktop "Regia" — raggiungibile in 1
          tap dal tab Regia. "Il troppo non va bene" sul telefono. */}
      {isAdmin && !isMobile && <TeamTaskPulse />}
      {isAdmin && !isMobile && <TaskTeam />}
      {isAdmin && isMobile && (
        <Button variant="outline" className="w-full gap-2" asChild>
          <Link to="/azienda/attivita?tab=regia">
            <ArrowUpCircle className="h-4 w-4" /> Apri regia team
          </Link>
        </Button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Regia rapida — indicatori operativi per admin
// ─────────────────────────────────────────────────────────────────────────────
function TeamTaskPulse() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: tasks = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["team-task-pulse", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`id, title, status, priority, due_date, assigned_to, category,
          assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)`)
        .eq("company_id", companyId!)
        .neq("status", "completata")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpCircle className="h-4 w-4" />Regia rapida
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Vista sintetica sulle attività aperte di tutta l'azienda.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" asChild>
            <Link to="/azienda/attivita?tab=regia">
              Apri regia <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <InlineLoadError
            title="Errore nel caricamento della regia"
            description={error instanceof Error ? error.message : "Non riesco a leggere le attività aziendali in questo momento."}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-20 w-full" />)}
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ) : pulse.openCount === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-muted-foreground">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">Nessuna attività aperta da gestire</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metrics.map((metric) => (
                <div key={metric.label} className={`rounded-lg border p-3 ${metric.className}`}>
                  <p className="text-xs font-medium opacity-80">{metric.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{metric.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <p className="text-sm font-semibold">Priorità da guardare</p>
                <Badge variant="secondary" className="text-xs">{pulse.openCount} aperte</Badge>
              </div>
              {pulse.priorities.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Nessuna criticità immediata.</p>
              ) : (
                <div className="divide-y">
                  {pulse.priorities.map((task: any) => {
                    const priority = PRIORITY_CONFIG[task.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                    const dueDate = task.due_date ? parseISO(task.due_date) : null;
                    const scaduta = dueDate && isBefore(dueDate, startOfDay(new Date())) && !isToday(dueDate);
                    const assigneeName = [task.assignee?.first_name, task.assignee?.last_name].filter(Boolean).join(" ") || "Non assegnata";

                    return (
                      <div key={task.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                        <div className={`h-2 w-2 shrink-0 rounded-full ${priority.dotClass}`} />
                        <span className="min-w-[180px] flex-1 truncate font-medium">{task.title}</span>
                        <span className="text-xs text-muted-foreground">{assigneeName}</span>
                        {task.category && <Badge variant="outline" className="text-[10px]">{task.category}</Badge>}
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
// Task del Team (solo admin) — overview attività assegnate ai membri del team
// ─────────────────────────────────────────────────────────────────────────────
function TaskTeam() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [filterUser, setFilterUser] = useState<string>("all");

  const { data: rawTeamMembers = [] } = useCompanyStaffUsers(companyId);
  const teamMembers = rawTeamMembers.filter((member) => member.id !== user?.id);

  // Fetch team tasks
  const { data: teamTasks = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["team-tasks", companyId, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`id, title, status, priority, due_date, assigned_to,
          assignee:profiles!tasks_assigned_to_fkey(first_name, last_name)`)
        .eq("company_id", companyId!)
        .neq("assigned_to", user!.id)
        .neq("status", "completata")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && !!user?.id,
    staleTime: 60_000,
  });

  const filteredTasks = useMemo(() => {
    if (filterUser === "all") return teamTasks;
    return teamTasks.filter((t: any) => t.assigned_to === filterUser);
  }, [teamTasks, filterUser]);

  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />Task del Team
            {teamTasks.length > 0 && <Badge variant="secondary" className="text-xs">{teamTasks.length}</Badge>}
          </CardTitle>
          <Select value={filterUser} onValueChange={setFilterUser}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Tutti" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i membri</SelectItem>
              {teamMembers.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.first_name} {m.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isError ? (
          <InlineLoadError
            title="Errore nel caricamento task team"
            description={error instanceof Error ? error.message : "Non riesco a leggere le attività del team in questo momento."}
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nessuna attività assegnata al team</p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {filteredTasks.map((t: any) => {
              const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
              const scaduta = t.due_date && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date));
              const assigneeName = [t.assignee?.first_name, t.assignee?.last_name].filter(Boolean).join(" ");
              const stCfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.da_fare;
              return (
                <div key={t.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${scaduta ? "border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10" : "hover:bg-muted/30"}`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dotClass}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Circle className="h-2.5 w-2.5" />{assigneeName}
                      </span>
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${stCfg.className}`}>{stCfg.label}</Badge>
                      {t.due_date && (
                        <span className={`text-[10px] ${scaduta ? "text-red-500 font-semibold" : isToday(new Date(t.due_date)) ? "text-amber-600" : "text-muted-foreground"}`}>
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
  const { role } = useAuth();
  const isAdmin = role === "company_admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") || "attivita";
  const allowedTabs = isAdmin
    ? ["attivita", "regia"]
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
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <AttivitaHeader />
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        {isAdmin ? (
          <TabsList className="grid w-full max-w-full sm:max-w-md grid-cols-2 h-auto">
            <TabsTrigger value="attivita" className="gap-1.5 text-xs sm:text-sm py-2"><ClipboardCheck className="h-4 w-4" /><span>Dashboard</span></TabsTrigger>
            <TabsTrigger value="regia" className="gap-1.5 text-xs sm:text-sm py-2"><Users className="h-4 w-4" /><span className="truncate"><span className="hidden sm:inline">Regia </span>attività</span></TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className="grid w-full grid-cols-4 max-w-xl h-auto">
            <TabsTrigger value="attivita" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><ClipboardCheck className="h-4 w-4" /><span className="truncate">Attività</span></TabsTrigger>
            <TabsTrigger value="timbrature" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Clock className="h-4 w-4" /><span className="truncate">Timbra</span></TabsTrigger>
            <TabsTrigger value="ferie" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Palmtree className="h-4 w-4" /><span className="truncate">Ferie</span></TabsTrigger>
            <TabsTrigger value="cedolini" className="gap-1 sm:gap-1.5 text-[11px] sm:text-sm py-2 px-1 sm:px-3"><Receipt className="h-4 w-4" /><span className="truncate">Cedolini</span></TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="attivita" className="mt-4 sm:mt-6"><TabAttivita /></TabsContent>
        {isAdmin && (
          <TabsContent value="regia" className="mt-6">
            <Suspense fallback={<TabFallback />}>
              <UnifiedTasks embedded initialTab="all" />
            </Suspense>
          </TabsContent>
        )}
        {!isAdmin && (
          <>
            <TabsContent value="timbrature" className="mt-6"><Suspense fallback={<TabFallback />}><TimbraturePersonali /></Suspense></TabsContent>
            <TabsContent value="ferie" className="mt-6"><Suspense fallback={<TabFallback />}><FeriePersonali /></Suspense></TabsContent>
            <TabsContent value="cedolini" className="mt-6"><Suspense fallback={<TabFallback />}><CedoliniPersonali /></Suspense></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

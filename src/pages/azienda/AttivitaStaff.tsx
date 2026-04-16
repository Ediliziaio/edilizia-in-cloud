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
import { lazy, Suspense, useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  format, isToday, isBefore, startOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, addDays,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Clock, ClipboardCheck, CheckCircle2, PlayCircle, PauseCircle, LogOut,
  CheckCircle, Loader2, ExternalLink, Palmtree, Receipt,
  CloudSun, ChevronLeft, ChevronRight, CalendarDays, Droplets,
  Thermometer, MapPin, Plus, Pencil, Trash2, X, Filter,
  ArrowUpCircle, Circle, AlertCircle, MoreHorizontal, Tag, Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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

type TaskFilter = "tutte" | "oggi" | "scadute" | "settimana" | "completate";

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
      <p className="text-muted-foreground text-sm capitalize">{oggi}</p>
      <h1 className="text-2xl font-bold">
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
  const { data: weatherMap, isLoading: loadingWeather } = useWeatherForecast(
    location?.lat ?? 45.4654,
    location?.lng ?? 9.1859,
  );
  const isLoading = loadingLoc || loadingWeather;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayWeather = weatherMap?.get(todayStr);

  const forecastDays = useMemo(() => {
    if (!weatherMap) return [];
    const result: { date: string; weather: WeatherDay }[] = [];
    weatherMap.forEach((w, d) => { if (d !== todayStr) result.push({ date: d, weather: w }); });
    return result.slice(0, 3);
  }, [weatherMap, todayStr]);

  if (isLoading) return <Card><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>;
  if (!todayWeather) return <Card><CardContent className="p-4 text-center text-sm text-muted-foreground"><CloudSun className="h-8 w-8 mx-auto mb-1 opacity-40" />Meteo non disponibile</CardContent></Card>;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /><span>{location?.city ?? "Milano"}</span></div>
            <span className="text-xs text-muted-foreground">Oggi</span>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-4xl leading-none">{weatherCodeToEmoji(todayWeather.code)}</span>
            <div>
              <p className="text-2xl font-bold leading-none">{todayWeather.maxTemp}°C</p>
              <p className="text-xs text-muted-foreground mt-0.5">{weatherCodeToLabel(todayWeather.code)}</p>
            </div>
            <div className="ml-auto text-right space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground"><Thermometer className="h-3 w-3" /><span>{todayWeather.minTemp}° / {todayWeather.maxTemp}°</span></div>
              {todayWeather.precip > 0 && <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400"><Droplets className="h-3 w-3" /><span>{todayWeather.precip}mm</span></div>}
            </div>
          </div>
        </div>
        {forecastDays.length > 0 && (
          <div className="grid grid-cols-3 divide-x border-t">
            {forecastDays.map(({ date, weather }) => (
              <div key={date} className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground capitalize">{format(new Date(date), "EEE d", { locale: it })}</p>
                <p className="text-lg leading-none mt-0.5">{weatherCodeToEmoji(weather.code)}</p>
                <p className="text-xs font-medium mt-0.5">{weather.minTemp}° / {weather.maxTemp}°</p>
                {weather.precip > 0 && <p className="text-[10px] text-blue-500">{weather.precip}mm</p>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini Calendario Mensile
// ─────────────────────────────────────────────────────────────────────────────
function MiniCalendario({ onAddTask }: { onAddTask?: (date: string) => void }) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const { data: monthTasks = [] } = useQuery({
    queryKey: ["calendar-tasks", user?.id, companyId, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, priority, status, category")
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .gte("due_date", format(monthStart, "yyyy-MM-dd"))
        .lte("due_date", format(monthEnd, "yyyy-MM-dd"))
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof monthTasks>();
    for (const t of monthTasks) {
      if (!t.due_date) continue;
      const arr = map.get(t.due_date) ?? [];
      arr.push(t);
      map.set(t.due_date, arr);
    }
    return map;
  }, [monthTasks]);

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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(m => subMonths(m, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">{format(currentMonth, "MMMM yyyy", { locale: it })}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(m => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="grid grid-cols-7 mb-1">
          {GIORNI_SETTIMANA.map(g => <div key={g} className="text-center text-[10px] font-semibold text-muted-foreground py-1 uppercase">{g}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-px">
          {Array.from({ length: days.padding }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
          {days.allDays.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) ?? [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentDay = isToday(day);
            const isPast = isBefore(day, today) && !isCurrentDay;
            return (
              <TooltipProvider key={key} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button onClick={() => setSelectedDate(day)} className={`relative aspect-square flex flex-col items-center justify-center rounded-md text-sm transition-all hover:bg-muted/60 ${isSelected ? "bg-primary text-primary-foreground font-bold shadow-sm" : isCurrentDay ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/30" : isPast ? "text-muted-foreground/60" : "text-foreground"}`}>
                      <span className="text-xs leading-none">{format(day, "d")}</span>
                      {dayTasks.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayTasks.slice(0, 3).map((t: any, i: number) => {
                            const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                            const isDone = t.status === "completata";
                            return <div key={i} className={`w-1 h-1 rounded-full ${isDone ? "bg-green-400" : cfg.dotClass}`} />;
                          })}
                          {dayTasks.length > 3 && <span className="text-[8px] leading-none text-muted-foreground">+{dayTasks.length - 3}</span>}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {dayTasks.length > 0 && (
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <p className="font-medium text-xs mb-1">{format(day, "d MMMM", { locale: it })} — {dayTasks.length} attività</p>
                      {dayTasks.slice(0, 4).map((t: any) => <p key={t.id} className="text-xs text-muted-foreground truncate">• {t.title}</p>)}
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
              {onAddTask && !isBefore(selectedDate, today) && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-primary" onClick={() => onAddTask(format(selectedDate!, "yyyy-MM-dd"))}>
                  <Plus className="h-3 w-3" />Aggiungi
                </Button>
              )}
            </div>
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nessuna scadenza per questo giorno</p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
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
              </div>
            )}
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
  const todayStr = new Date().toISOString().slice(0, 10);

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
      const now = new Date().toISOString();
      const { error } = await supabase.from("hr_timbrature").insert({ company_id: companyId, profilo_id: profilo!.id, tipo, timestamp: now, data_evento: now.slice(0, 10), ora_evento: now.slice(11, 19), lat: null, lng: null, fonte: "web", note: "Sede ufficio" } as any);
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
                {nonHaTimbrato && <Button className="flex-1 min-w-[120px] gap-2 bg-green-600 hover:bg-green-700 text-white" disabled={isMutating} onClick={() => timbraMutation.mutate("entrata")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Entrata</Button>}
                {isEntrato && <><Button variant="outline" className="flex-1 min-w-[120px] gap-2" disabled={isMutating} onClick={() => timbraMutation.mutate("pausa_inizio")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}Pausa</Button><Button variant="destructive" className="flex-1 min-w-[120px] gap-2" disabled={isMutating} onClick={() => timbraMutation.mutate("uscita")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Uscita</Button></>}
                {isInPausa && <><Button className="flex-1 min-w-[120px] gap-2 bg-amber-600 hover:bg-amber-700 text-white" disabled={isMutating} onClick={() => timbraMutation.mutate("pausa_fine")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}Fine Pausa</Button><Button variant="destructive" className="flex-1 min-w-[120px] gap-2" disabled={isMutating} onClick={() => timbraMutation.mutate("uscita")}>{isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Uscita</Button></>}
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

function MieAttivita({ initialDueDate }: { initialDueDate?: string | null }) {
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
    if (initialDueDate) { setFormDueDate(initialDueDate); setDialogOpen(true); }
  }, [initialDueDate]);

  // ── Team members for assignment (admin only) ──
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["attivita-team-members", companyId],
    queryFn: async () => {
      const { data: perms } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", companyId!);
      const validIds = (perms || []).map((p) => p.user_id);
      if (!validIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", validIds)
        .order("last_name");
      return (profiles || []).filter((p) => p.first_name || p.last_name);
    },
    enabled: !!companyId && isAdmin,
    staleTime: 10 * 60 * 1000,
  });

  // ── Fetch tasks — admin vede tutto, staff solo le sue ──
  const { data: allTasks = [], isLoading } = useQuery({
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

  const filteredTasks = useMemo(() => {
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
  }, [allTasks, filter, today, weekEnd, searchQuery, isAdmin, filterAssignee, user?.id]);

  // Stats
  const stats = useMemo(() => {
    const active = allTasks.filter((t: any) => t.status !== "completata");
    const overdue = active.filter((t: any) => t.due_date && isBefore(new Date(t.due_date), today) && !isToday(new Date(t.due_date)));
    const todayTasks = active.filter((t: any) => t.due_date && isToday(new Date(t.due_date)));
    const completed = allTasks.filter((t: any) => t.status === "completata");
    const inProgress = active.filter((t: any) => t.status === "in_corso");
    return { total: active.length, overdue: overdue.length, today: todayTasks.length, completed: completed.length, inProgress: inProgress.length };
  }, [allTasks, today]);

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
        <div key={t.id} className={`group flex items-center gap-2 rounded border px-3 py-1.5 transition-all text-sm ${isDone ? "opacity-50 bg-muted/30" : ""} ${scaduta ? "border-red-200 bg-red-50/20" : ""} ${isSelected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}>
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
          {/* Quick actions on hover */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => openEdit(t)} className="p-0.5 text-muted-foreground hover:text-foreground" title="Modifica">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={() => setTaskToDelete(t.id)} className="p-0.5 text-muted-foreground hover:text-red-500" title="Elimina">
              <Trash2 className="h-3 w-3" />
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
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5 mr-2" />Modifica</DropdownMenuItem>
            {!isDone && <DropdownMenuItem onClick={() => markDone(t)}><CheckCircle2 className="h-3.5 w-3.5 mr-2" />Segna come fatta</DropdownMenuItem>}
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
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4" />{isAdmin ? "Attività" : "Le mie Attività"}
              {stats.total > 0 && <Badge variant="secondary" className="text-xs">{stats.total}</Badge>}
            </CardTitle>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => openCreate()}>
              <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Nuova</span>
            </Button>
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
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filterAssignee === f.key ? "bg-violet-600 text-white shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
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
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${filter === f.key ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                {f.label}
                {f.count != null && f.count > 0 && <span className={`text-[10px] ${filter === f.key ? "opacity-80" : ""}`}>({f.count})</span>}
              </button>
            ))}
          </div>

          {/* Search + view controls */}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 relative">
              <Input
                placeholder="Cerca attività..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8"
              />
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
            </div>
            {/* Group by */}
            <Select value={groupBy} onValueChange={v => { setGroupBy(v as GroupBy); setCollapsedGroups(new Set()); }}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="Raggruppa" /></SelectTrigger>
              <SelectContent>{GROUP_OPTIONS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
            </Select>
            {/* Compact toggle */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={compact ? "default" : "outline"} size="sm" className="h-8 w-8 p-0" onClick={() => setCompact(!compact)}>
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="0.5" /><rect x="1" y="7" width="14" height="2" rx="0.5" /><rect x="1" y="12" width="14" height="2" rx="0.5" /></svg>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{compact ? "Vista espansa" : "Vista compatta"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>

        <CardContent>
          {/* Bulk action bar */}
          {hasSelection && (
            <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
              <input type="checkbox" checked={selectedIds.size === filteredTasks.length} onChange={selectAll} className="h-3.5 w-3.5 accent-primary" />
              <span className="text-xs font-medium">{selectedIds.size} selezionate</span>
              <div className="flex-1" />
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "completata" })}>
                <CheckCircle className="h-3 w-3" />Fatte
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "in_corso" })}>
                <PlayCircle className="h-3 w-3" />In corso
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => bulkUpdateStatus.mutate({ ids: [...selectedIds], status: "da_fare" })}>
                <Circle className="h-3 w-3" />Da fare
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 hover:text-red-700" onClick={() => setBulkConfirmOpen(true)}>
                <Trash2 className="h-3 w-3" />Elimina
              </Button>
              <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground ml-1"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              {/* Quick add */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <Input ref={quickAddRef} placeholder="+ Aggiungi attività veloce... (Invio)" value={quickAddTitle}
                    onChange={e => setQuickAddTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleQuickAdd(); if (e.key === "Escape") { setQuickAddTitle(""); quickAddRef.current?.blur(); } }}
                    className="h-9 text-sm pr-8" />
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
                  <p className="text-sm text-muted-foreground">Nessuna attività trovata per questo filtro</p>
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
        <DialogContent className="sm:max-w-[480px]">
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
  const [addTaskDate, setAddTaskDate] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Riga 1: Meteo (1/3) + Timbratura o TaskTeam (2/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MeteoWidget />
        <div className="lg:col-span-2">
          {isAdmin ? <TaskTeam /> : <TimbraturaSede />}
        </div>
      </div>
      {/* Riga 2: Calendario (1/2) + Le mie attività (1/2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MiniCalendario onAddTask={setAddTaskDate} />
        <MieAttivita initialDueDate={addTaskDate} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task del Team (solo admin) — overview attività assegnate ai membri del team
// ─────────────────────────────────────────────────────────────────────────────
function TaskTeam() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [filterUser, setFilterUser] = useState<string>("all");

  // Fetch team members
  const { data: teamMembers = [] } = useQuery({
    queryKey: ["team-members-tasks", companyId],
    queryFn: async () => {
      const { data: perms } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", companyId!);
      const validIds = (perms || []).map((p) => p.user_id).filter((id) => id !== user?.id);
      if (!validIds.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", validIds)
        .order("last_name");
      return (profiles || []).filter((p) => p.first_name || p.last_name);
    },
    enabled: !!companyId && !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch team tasks
  const { data: teamTasks = [], isLoading } = useQuery({
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
        {isLoading ? (
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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "attivita";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6 p-6">
      <AttivitaHeader />
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {isAdmin ? (
          <TabsList className="max-w-[200px]">
            <TabsTrigger value="attivita" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /><span className="hidden sm:inline">Attività</span></TabsTrigger>
          </TabsList>
        ) : (
          <TabsList className="grid w-full grid-cols-4 max-w-xl">
            <TabsTrigger value="attivita" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /><span className="hidden sm:inline">Attività</span></TabsTrigger>
            <TabsTrigger value="timbrature" className="gap-1.5"><Clock className="h-4 w-4" /><span className="hidden sm:inline">Timbrature</span></TabsTrigger>
            <TabsTrigger value="ferie" className="gap-1.5"><Palmtree className="h-4 w-4" /><span className="hidden sm:inline">Ferie</span></TabsTrigger>
            <TabsTrigger value="cedolini" className="gap-1.5"><Receipt className="h-4 w-4" /><span className="hidden sm:inline">Cedolini</span></TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="attivita" className="mt-6"><TabAttivita /></TabsContent>
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

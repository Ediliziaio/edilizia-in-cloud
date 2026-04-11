/**
 * AttivitaStaff — pagina unificata per i dipendenti ufficio (role: company_staff).
 * Accessibile da /azienda/attivita
 *
 * Tab:
 *  1. Attività     — dashboard con meteo, calendario mese, timbratura, task
 *  2. Timbrature   — storico timbrature personali
 *  3. Ferie        — saldo ferie/permessi e richieste
 *  4. Cedolini     — lista cedolini con download PDF
 */
import { lazy, Suspense, useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  format, isToday, isBefore, startOfDay, startOfMonth, endOfMonth,
  eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isSameDay,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Clock, ClipboardCheck, CheckCircle2, PlayCircle, PauseCircle, LogOut,
  CheckCircle, Loader2, ExternalLink, Palmtree, Receipt,
  CloudSun, ChevronLeft, ChevronRight, CalendarDays, Droplets, Wind,
  Thermometer, MapPin,
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
// Costanti priorità
// ─────────────────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<string, { label: string; dotClass: string; badgeClass: string }> = {
  urgente: { label: "Urgente", dotClass: "bg-red-500", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  alta:    { label: "Alta",    dotClass: "bg-orange-500", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  normale: { label: "Normale", dotClass: "bg-blue-500", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  bassa:   { label: "Bassa",   dotClass: "bg-slate-400", badgeClass: "bg-muted text-muted-foreground" },
};

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

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
    staleTime: 60 * 60 * 1000, // 1h
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocco 1 — Header
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
  const { data: weatherMap, isLoading: loadingWeather } = useWeatherForecast(
    location?.lat,
    location?.lng,
  );

  const isLoading = loadingLoc || loadingWeather;
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayWeather = weatherMap?.get(todayStr);

  // Prossimi 3 giorni (escl. oggi)
  const forecastDays = useMemo(() => {
    if (!weatherMap) return [];
    const result: { date: string; weather: WeatherDay }[] = [];
    weatherMap.forEach((w, d) => {
      if (d !== todayStr) result.push({ date: d, weather: w });
    });
    return result.slice(0, 3);
  }, [weatherMap, todayStr]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!todayWeather) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <CloudSun className="h-8 w-8 mx-auto mb-1 opacity-40" />
          Meteo non disponibile
        </CardContent>
      </Card>
    );
  }

  const emoji = weatherCodeToEmoji(todayWeather.code);
  const label = weatherCodeToLabel(todayWeather.code);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Oggi */}
        <div className="bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>{location?.city ?? "Milano"}</span>
            </div>
            <span className="text-xs text-muted-foreground">Oggi</span>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <span className="text-4xl leading-none">{emoji}</span>
            <div>
              <p className="text-2xl font-bold leading-none">{todayWeather.maxTemp}°C</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </div>
            <div className="ml-auto text-right space-y-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Thermometer className="h-3 w-3" />
                <span>{todayWeather.minTemp}° / {todayWeather.maxTemp}°</span>
              </div>
              {todayWeather.precip > 0 && (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <Droplets className="h-3 w-3" />
                  <span>{todayWeather.precip}mm</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Previsioni prossimi giorni */}
        {forecastDays.length > 0 && (
          <div className="grid grid-cols-3 divide-x border-t">
            {forecastDays.map(({ date, weather }) => (
              <div key={date} className="p-2 text-center">
                <p className="text-[10px] text-muted-foreground capitalize">
                  {format(new Date(date), "EEE d", { locale: it })}
                </p>
                <p className="text-lg leading-none mt-0.5">
                  {weatherCodeToEmoji(weather.code)}
                </p>
                <p className="text-xs font-medium mt-0.5">
                  {weather.minTemp}° / {weather.maxTemp}°
                </p>
                {weather.precip > 0 && (
                  <p className="text-[10px] text-blue-500">{weather.precip}mm</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini Calendario Mensile con task/scadenze
// ─────────────────────────────────────────────────────────────────────────────
function MiniCalendario() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Fetch task con due_date nel mese corrente + qualche margine
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
      if (error) {
        logger.error("MiniCalendario — errore fetch tasks:", error);
        throw error;
      }
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  // Mappa: "yyyy-MM-dd" → array di task
  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof monthTasks>();
    for (const t of monthTasks) {
      if (!t.due_date) continue;
      const key = t.due_date;
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [monthTasks]);

  // Generazione giorni del mese con padding iniziale
  const days = useMemo(() => {
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    // getDay: 0=Sun, 1=Mon, ... Per il calendario italiano Lunedì=0
    let startDow = getDay(monthStart); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // converti a Lun=0
    return { allDays, padding: startDow };
  }, [monthStart, monthEnd]);

  // Task del giorno selezionato
  const selectedTasks = useMemo(() => {
    if (!selectedDate) return [];
    const key = format(selectedDate, "yyyy-MM-dd");
    return tasksByDate.get(key) ?? [];
  }, [selectedDate, tasksByDate]);

  const today = startOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" />
            Calendario
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Intestazione giorni settimana */}
        <div className="grid grid-cols-7 mb-1">
          {GIORNI_SETTIMANA.map(g => (
            <div
              key={g}
              className="text-center text-[10px] font-semibold text-muted-foreground py-1 uppercase"
            >
              {g}
            </div>
          ))}
        </div>

        {/* Griglia giorni */}
        <div className="grid grid-cols-7 gap-px">
          {/* Padding */}
          {Array.from({ length: days.padding }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {/* Giorni */}
          {days.allDays.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) ?? [];
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isCurrentDay = isToday(day);
            const isPast = isBefore(day, today) && !isCurrentDay;
            const hasUrgent = dayTasks.some((t: any) => t.priority === "urgente" || t.priority === "alta");
            const hasOverdue = dayTasks.some((t: any) => t.status !== "completata" && isPast);

            return (
              <TooltipProvider key={key} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setSelectedDate(day)}
                      className={`
                        relative aspect-square flex flex-col items-center justify-center rounded-md
                        text-sm transition-all hover:bg-muted/60
                        ${isSelected
                          ? "bg-primary text-primary-foreground font-bold shadow-sm"
                          : isCurrentDay
                            ? "bg-primary/10 font-semibold text-primary ring-1 ring-primary/30"
                            : isPast
                              ? "text-muted-foreground/60"
                              : "text-foreground"
                        }
                      `}
                    >
                      <span className="text-xs leading-none">{format(day, "d")}</span>
                      {/* Dots per task */}
                      {dayTasks.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {dayTasks.slice(0, 3).map((t: any, i: number) => {
                            const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                            const isDone = t.status === "completata";
                            return (
                              <div
                                key={i}
                                className={`w-1 h-1 rounded-full ${
                                  isDone
                                    ? "bg-green-400"
                                    : hasOverdue
                                      ? "bg-red-500"
                                      : cfg.dotClass
                                }`}
                              />
                            );
                          })}
                          {dayTasks.length > 3 && (
                            <span className="text-[8px] leading-none text-muted-foreground">
                              +{dayTasks.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </TooltipTrigger>
                  {dayTasks.length > 0 && (
                    <TooltipContent side="bottom" className="max-w-[200px]">
                      <p className="font-medium text-xs mb-1">
                        {format(day, "d MMMM", { locale: it })} — {dayTasks.length} attività
                      </p>
                      {dayTasks.slice(0, 4).map((t: any) => (
                        <p key={t.id} className="text-xs text-muted-foreground truncate">
                          • {t.title}
                        </p>
                      ))}
                      {dayTasks.length > 4 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          +{dayTasks.length - 4} altre
                        </p>
                      )}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        {/* Task del giorno selezionato */}
        {selectedDate && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {isToday(selectedDate)
                ? "Oggi"
                : format(selectedDate, "d MMMM", { locale: it })}
              {selectedTasks.length > 0 && ` — ${selectedTasks.length} attività`}
            </p>
            {selectedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                Nessuna scadenza per questo giorno
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                {selectedTasks.map((t: any) => {
                  const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
                  const isDone = t.status === "completata";
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center gap-2 text-xs rounded px-2 py-1.5 ${
                        isDone ? "bg-green-50 dark:bg-green-950/20" : "bg-muted/50"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isDone ? "bg-green-500" : cfg.dotClass
                      }`} />
                      <span className={`flex-1 truncate ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        {t.title}
                      </span>
                      <Badge className={`text-[9px] px-1 py-0 ${isDone ? "bg-green-100 text-green-700" : cfg.badgeClass}`}>
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

// ─────────────────────────────────────────────────────────────────────────────
// Blocco 2 — TimbraturaSede
// ─────────────────────────────────────────────────────────────────────────────
function TimbraturaSede() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Recupera profilo HR del dipendente corrente
  const { data: profilo, isLoading: loadingProfilo } = useQuery({
    queryKey: ["hr-my-profilo", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_profili")
        .select("id, nome, cognome")
        .eq("company_id", companyId!)
        .eq("user_id", user!.id)
        .eq("attivo", true)
        .maybeSingle();
      if (error) {
        logger.error("TimbraturaSede — errore fetch profilo HR:", error);
        throw error;
      }
      return data;
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Timbrature di oggi
  const { data: timbratureOggi = [], isLoading: loadingTimbrature } = useQuery({
    queryKey: ["hr-timbrature-today", profilo?.id, todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_timbrature")
        .select("id, tipo, timestamp, ora_evento")
        .eq("profilo_id", profilo!.id)
        .eq("data_evento", todayStr)
        .order("timestamp", { ascending: true });
      if (error) {
        logger.error("TimbraturaSede — errore fetch timbrature:", error);
        throw error;
      }
      return data ?? [];
    },
    enabled: !!profilo?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Mutation: registra una timbratura
  const timbraMutation = useMutation({
    mutationFn: async (tipo: "entrata" | "uscita" | "pausa_inizio" | "pausa_fine") => {
      const now = new Date().toISOString();
      const { error } = await supabase.from("hr_timbrature").insert({
        company_id: companyId,
        profilo_id: profilo!.id,
        tipo,
        timestamp: now,
        data_evento: now.slice(0, 10),
        ora_evento: now.slice(11, 19),
        lat: null,
        lng: null,
        fonte: "web",
        note: "Sede ufficio",
      } as any);
      if (error) {
        logger.error("TimbraturaSede — errore insert timbratura:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Timbratura registrata");
      queryClient.invalidateQueries({ queryKey: ["hr-timbrature-today"] });
    },
    onError: (err: any) => {
      toast.error("Errore: " + (err.message ?? "Riprovare"));
    },
  });

  // Calcola ore lavorate in tempo reale
  const oreLavorate = useMemo(() => {
    let totaleMs = 0;
    let ultimaEntrata: Date | null = null;
    for (const t of timbratureOggi) {
      const ts = new Date((t as any).timestamp);
      if ((t as any).tipo === "entrata" || (t as any).tipo === "pausa_fine") {
        ultimaEntrata = ts;
      } else if (((t as any).tipo === "uscita" || (t as any).tipo === "pausa_inizio") && ultimaEntrata) {
        totaleMs += ts.getTime() - ultimaEntrata.getTime();
        ultimaEntrata = null;
      }
    }
    if (ultimaEntrata) totaleMs += Date.now() - ultimaEntrata.getTime();
    return Math.round((totaleMs / 3_600_000) * 10) / 10;
  }, [timbratureOggi]);

  // Stato corrente
  const lastTimbro = timbratureOggi[timbratureOggi.length - 1] as any;
  const isEntrato  = lastTimbro?.tipo === "entrata" || lastTimbro?.tipo === "pausa_fine";
  const isInPausa  = lastTimbro?.tipo === "pausa_inizio";
  const isUscito   = lastTimbro?.tipo === "uscita";
  const nonHaTimbrato = !lastTimbro;

  const isLoading = loadingProfilo || loadingTimbrature;
  const isMutating = timbraMutation.isPending;

  // Se profilo HR non presente mostra avviso soft
  if (!isLoading && !profilo) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Timbratura Sede
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Il tuo profilo HR non è ancora configurato. Contatta l'amministratore.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Timbratura Sede
          </CardTitle>
          {isEntrato && (
            <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {oreLavorate}h lavorate oggi
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {/* Stato corrente */}
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              isEntrato  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" :
              isInPausa  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" :
              isUscito   ? "bg-muted text-muted-foreground" :
              "bg-muted text-muted-foreground"
            }`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                isEntrato  ? "bg-green-500 animate-pulse" :
                isInPausa  ? "bg-amber-500 animate-pulse" :
                "bg-slate-400"
              }`} />
              <span className="font-medium">
                {isUscito      ? "Giornata completata" :
                 isInPausa     ? "In pausa" :
                 isEntrato     ? "In servizio" :
                 "Non hai ancora timbrato"}
              </span>
              {lastTimbro?.ora_evento && (
                <span className="ml-auto text-xs opacity-75">
                  ultimo: {lastTimbro.ora_evento.slice(0, 5)}
                </span>
              )}
            </div>

            {/* Bottoni azione */}
            {!isUscito && (
              <div className="flex flex-wrap gap-2">
                {nonHaTimbrato && (
                  <Button
                    className="flex-1 min-w-[120px] gap-2 bg-green-600 hover:bg-green-700 text-white"
                    disabled={isMutating}
                    onClick={() => timbraMutation.mutate("entrata")}
                  >
                    {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Entrata
                  </Button>
                )}
                {isEntrato && (
                  <>
                    <Button
                      variant="outline"
                      className="flex-1 min-w-[120px] gap-2"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("pausa_inizio")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
                      Pausa
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 min-w-[120px] gap-2"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("uscita")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Uscita
                    </Button>
                  </>
                )}
                {isInPausa && (
                  <>
                    <Button
                      className="flex-1 min-w-[120px] gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("pausa_fine")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                      Fine Pausa
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 min-w-[120px] gap-2"
                      disabled={isMutating}
                      onClick={() => timbraMutation.mutate("uscita")}
                    >
                      {isMutating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      Uscita
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Timeline timbrature oggi */}
            {timbratureOggi.length > 0 && (
              <div className="space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Oggi</p>
                {timbratureOggi.map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                    <span className="font-medium tabular-nums">{t.ora_evento?.slice(0, 5)}</span>
                    <span>—</span>
                    <span>
                      {t.tipo === "entrata"      ? "Entrata" :
                       t.tipo === "uscita"       ? "Uscita" :
                       t.tipo === "pausa_inizio" ? "Inizio pausa" :
                       t.tipo === "pausa_fine"   ? "Fine pausa" : t.tipo}
                    </span>
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
// Blocco 3 — MieAttivita
// ─────────────────────────────────────────────────────────────────────────────
function MieAttivita() {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["my-tasks", user?.id, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id, title, description, status, priority, due_date, category,
          order:orders!tasks_order_id_fkey(description, order_code),
          stock_item:warehouse_stock!tasks_stock_item_id_fkey(name)
        `)
        .eq("company_id", companyId!)
        .eq("assigned_to", user!.id)
        .neq("status", "completata")
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true });
      if (error) {
        logger.error("MieAttivita — errore fetch tasks:", error);
        throw error;
      }
      return data ?? [];
    },
    enabled: !!user?.id && !!companyId,
    staleTime: 60_000,
  });

  const completaTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completata", completed_at: new Date().toISOString() } as any)
        .eq("id", taskId)
        .eq("assigned_to", user!.id);
      if (error) {
        logger.error("MieAttivita — errore completamento task:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Attività completata");
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
    onError: (err: any) => {
      toast.error("Errore: " + (err.message ?? "Riprovare"));
    },
  });

  // Separa task di oggi / scadute da quelle future
  const today = startOfDay(new Date());
  const taskOggi    = tasks.filter((t: any) => !t.due_date || isBefore(new Date(t.due_date), new Date()) || isToday(new Date(t.due_date)));
  const taskFuture  = tasks.filter((t: any) => t.due_date && !isBefore(new Date(t.due_date), new Date()) && !isToday(new Date(t.due_date)));

  const renderTask = (t: any) => {
    const cfg = PRIORITY_CONFIG[t.priority ?? "normale"] ?? PRIORITY_CONFIG.normale;
    const scaduta = t.due_date && isBefore(new Date(t.due_date), today);

    return (
      <div
        key={t.id}
        className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-muted/40 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dotClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="font-medium text-sm leading-snug">{t.title}</p>
            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 ${cfg.badgeClass}`}>
              {cfg.label}
            </Badge>
          </div>
          {t.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
            {t.order?.order_code && (
              <Link to="/azienda/ordini" className="flex items-center gap-1 hover:text-foreground transition-colors">
                <ExternalLink className="w-3 h-3" />
                {t.order.order_code}
              </Link>
            )}
            {t.stock_item?.name && (
              <span className="flex items-center gap-1">
                <ExternalLink className="w-3 h-3" />
                {t.stock_item.name}
              </span>
            )}
            {t.due_date && (
              <span className={scaduta ? "text-red-500 font-medium" : ""}>
                {scaduta ? "Scaduta " : "Entro "}
                {format(new Date(t.due_date), "d MMM", { locale: it })}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-green-600"
          disabled={completaTask.isPending}
          onClick={() => completaTask.mutate(t.id)}
          title="Segna come completata"
        >
          {completaTask.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Le mie Attività
          {tasks.length > 0 && (
            <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-60" />
            <p className="font-medium">Nessuna attività assegnata</p>
            <p className="text-sm mt-1">Ottimo lavoro! Sei in pari con tutto.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {taskOggi.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Da fare oggi
                </p>
                {taskOggi.map(renderTask)}
              </div>
            )}
            {taskFuture.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Prossimamente
                </p>
                {taskFuture.map(renderTask)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab content — Attività (Dashboard Widget)
// ─────────────────────────────────────────────────────────────────────────────
function TabAttivita() {
  return (
    <div className="space-y-6">
      {/* Riga 1: Meteo + Timbratura */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MeteoWidget />
        <div className="lg:col-span-2">
          <TimbraturaSede />
        </div>
      </div>

      {/* Riga 2: Calendario + Attività */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MiniCalendario />
        <MieAttivita />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback loading
// ─────────────────────────────────────────────────────────────────────────────
function TabFallback() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagina principale con Tabs
// ─────────────────────────────────────────────────────────────────────────────
export default function AttivitaStaff() {
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "attivita";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6 p-6">
      <AttivitaHeader />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-xl">
          <TabsTrigger value="attivita" className="gap-1.5">
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Attività</span>
          </TabsTrigger>
          <TabsTrigger value="timbrature" className="gap-1.5">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Timbrature</span>
          </TabsTrigger>
          <TabsTrigger value="ferie" className="gap-1.5">
            <Palmtree className="h-4 w-4" />
            <span className="hidden sm:inline">Ferie</span>
          </TabsTrigger>
          <TabsTrigger value="cedolini" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Cedolini</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="attivita" className="mt-6">
          <TabAttivita />
        </TabsContent>

        <TabsContent value="timbrature" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <TimbraturePersonali />
          </Suspense>
        </TabsContent>

        <TabsContent value="ferie" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <FeriePersonali />
          </Suspense>
        </TabsContent>

        <TabsContent value="cedolini" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <CedoliniPersonali />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

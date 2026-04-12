/**
 * Lavori — vista settimanale/mensile per l'operaio.
 * Mostra cantieri + appuntamenti/sopralluoghi programmati per data.
 * Calcola distanze dalla sede e tra impegni consecutivi.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format, addDays, startOfWeek, startOfMonth, endOfMonth, isSameDay,
  isWithinInterval, addWeeks, subWeeks, addMonths, subMonths,
  parseISO, isToday, isTomorrow, isYesterday, isSameMonth,
  differenceInCalendarDays, eachDayOfInterval, getDay,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, MapPin, Loader2, CalendarOff,
  Clock, Navigation, HardHat, CheckCircle2, Route, Building2,
  Eye, CalendarDays, CalendarRange, ArrowDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { haversineMeters } from "@/lib/tsp";

// ── Types ──
interface Cantiere {
  id: string;
  type: "cantiere";
  order: {
    id: string;
    order_code: string;
    description: string;
    status: string;
    indirizzo_lavori: string | null;
    percentuale_avanzamento: number;
    work_start_date: string | null;
    work_end_date: string | null;
  };
  lat?: number;
  lng?: number;
}

interface Appuntamento {
  id: string;
  type: "appuntamento";
  title: string;
  description: string | null;
  appointment_date: string;
  appointment_time: string | null;
  appointment_end_time: string | null;
  appointment_type: string;
  status: string;
  formatted_address: string | null;
  lat: number | null;
  lng: number | null;
  order_id: string | null;
  order?: { order_code: string } | null;
}

type CalendarItem = Cantiere | Appuntamento;

// ── Helpers ──
function dayLabel(day: Date): string {
  if (isToday(day)) return "Oggi";
  if (isTomorrow(day)) return "Domani";
  if (isYesterday(day)) return "Ieri";
  return format(day, "EEEE d MMMM", { locale: it });
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    confermato:     { label: "Confermato",  cls: "bg-blue-100 text-blue-700" },
    in_corso:       { label: "In corso",    cls: "bg-green-100 text-green-700" },
    in_lavorazione: { label: "In corso",    cls: "bg-green-100 text-green-700" },
    completato:     { label: "Completato",  cls: "bg-slate-100 text-slate-600" },
    sospeso:        { label: "Sospeso",     cls: "bg-amber-100 text-amber-700" },
  };
  return map[status?.toLowerCase()] ?? { label: status ?? "—", cls: "bg-muted text-muted-foreground" };
}

function appointmentTypeLabel(type: string) {
  const map: Record<string, { label: string; cls: string; emoji: string }> = {
    sopralluogo:      { label: "Sopralluogo",       cls: "bg-violet-100 text-violet-700",  emoji: "🔍" },
    sopralluogo_tecnico: { label: "Sopralluogo Tecnico", cls: "bg-violet-100 text-violet-700", emoji: "🔍" },
    consegna:         { label: "Consegna",           cls: "bg-teal-100 text-teal-700",     emoji: "📦" },
    riunione:         { label: "Riunione",           cls: "bg-indigo-100 text-indigo-700", emoji: "👥" },
    misura:           { label: "Presa misure",       cls: "bg-cyan-100 text-cyan-700",     emoji: "📏" },
    installazione:    { label: "Installazione",      cls: "bg-emerald-100 text-emerald-700", emoji: "🔧" },
    manutenzione:     { label: "Manutenzione",       cls: "bg-amber-100 text-amber-700",   emoji: "🛠" },
    generico:         { label: "Appuntamento",       cls: "bg-slate-100 text-slate-600",    emoji: "📅" },
  };
  return map[type?.toLowerCase()] ?? { label: type ?? "Evento", cls: "bg-slate-100 text-slate-600", emoji: "📅" };
}

function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Sede demo
const SEDE = { lat: 45.4642, lng: 9.1900, label: "Sede" }; // Milano

export default function CampoCalendario() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Employee ID
  const { data: employeeId } = useQuery({
    queryKey: ["campo-emp-id", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees").select("id")
        .eq("user_id", user!.id).eq("company_id", profile!.company_id)
        .maybeSingle();
      return data?.id ?? null;
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  // Cantieri assegnati
  const { data: allCantieri = [], isLoading: loadingCantieri } = useQuery({
    queryKey: ["campo-lavori-full", employeeId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_employees")
        .select(`id, order_id, order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento, work_start_date, work_end_date)`)
        .eq("employee_id", employeeId!);
      const seen = new Set<string>();
      return (data ?? []).filter((a: any) => {
        if (!a.order?.id || seen.has(a.order.id)) return false;
        seen.add(a.order.id);
        const s = a.order.status?.toLowerCase();
        return s !== "annullato" && s !== "chiuso";
      }).map((a: any) => ({ ...a, type: "cantiere" as const }));
    },
    enabled: !!employeeId,
  });

  // Appuntamenti assegnati all'operaio
  const { data: allAppuntamenti = [], isLoading: loadingApp } = useQuery({
    queryKey: ["campo-appuntamenti", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, title, description, appointment_date, appointment_time, appointment_end_time, appointment_type, status, formatted_address, lat, lng, order_id, address_line, address_city")
        .eq("company_id", profile!.company_id)
        .eq("assigned_to", user!.id)
        .neq("status", "annullato")
        .neq("status", "cancelled");
      return (data ?? []).map((a: any) => ({
        ...a,
        type: "appuntamento" as const,
        formatted_address: a.formatted_address || [a.address_line, a.address_city].filter(Boolean).join(", ") || null,
      }));
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  const isLoading = loadingCantieri || loadingApp;

  // Filtra items per giorno
  const itemsForDay = useMemo(() => {
    return (day: Date): CalendarItem[] => {
      const cantieri = allCantieri.filter((a: any) => {
        const o = a.order;
        if (!o) return false;
        if (o.work_start_date && o.work_end_date) {
          return isWithinInterval(day, { start: parseISO(o.work_start_date), end: parseISO(o.work_end_date) });
        }
        if (o.work_start_date) return parseISO(o.work_start_date) <= day;
        return true;
      });

      const appuntamenti = allAppuntamenti.filter((a: any) =>
        a.appointment_date && isSameDay(parseISO(a.appointment_date), day)
      );

      // Ordina appuntamenti per orario, poi cantieri
      const sortedApp = [...appuntamenti].sort((a: any, b: any) => {
        if (!a.appointment_time) return 1;
        if (!b.appointment_time) return -1;
        return a.appointment_time.localeCompare(b.appointment_time);
      });

      return [...sortedApp, ...cantieri] as CalendarItem[];
    };
  }, [allCantieri, allAppuntamenti]);

  const dayItems = useMemo(() => itemsForDay(selectedDay), [itemsForDay, selectedDay]);

  // Conta items per giorno (per dots)
  const countForDay = useMemo(() => {
    return (day: Date) => itemsForDay(day).length;
  }, [itemsForDay]);

  // Calcola distanze dalla sede e tra items consecutivi
  const distanze = useMemo(() => {
    const result: { fromSede?: number; between: number[] }[] = [];
    const geoItems = dayItems.map((item) => {
      if (item.type === "appuntamento") return { lat: item.lat, lng: item.lng };
      return null; // cantieri non hanno lat/lng diretto
    });

    for (let i = 0; i < dayItems.length; i++) {
      const geo = geoItems[i];
      const entry: { fromSede?: number; between: number[] } = { between: [] };

      // Distanza dalla sede
      if (geo?.lat && geo?.lng) {
        entry.fromSede = haversineMeters(SEDE.lat, SEDE.lng, geo.lat, geo.lng);
      }

      // Distanza dall'item precedente
      if (i > 0) {
        const prevGeo = geoItems[i - 1];
        if (geo?.lat && geo?.lng && prevGeo?.lat && prevGeo?.lng) {
          entry.between.push(haversineMeters(prevGeo.lat, prevGeo.lng, geo.lat, geo.lng));
        }
      }

      result.push(entry);
    }
    return result;
  }, [dayItems]);

  // Mese calendario
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7; // Monday = 0

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto">
      {/* Toggle vista */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h1 className="text-lg font-bold">I miei lavori</h1>
        <div className="flex bg-muted rounded-xl p-0.5">
          <button
            onClick={() => setViewMode("week")}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              viewMode === "week" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <CalendarRange className="w-3.5 h-3.5" />
            Settimana
          </button>
          <button
            onClick={() => setViewMode("month")}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
              viewMode === "month" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Mese
          </button>
        </div>
      </div>

      {/* ──── Vista Settimana ──── */}
      {viewMode === "week" && (
        <div className="bg-gradient-to-b from-muted/80 to-background border-b border-border/50 px-4 pt-1 pb-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setWeekStart(w => subWeeks(w, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:scale-95 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold capitalize">
              {format(weekStart, "MMMM yyyy", { locale: it })}
            </span>
            <button onClick={() => setWeekStart(w => addWeeks(w, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:scale-95 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex gap-1">
            {weekDays.map((day) => {
              const isSelected = isSameDay(day, selectedDay);
              const isDayToday = isToday(day);
              const count = countForDay(day);
              return (
                <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                  className={cn(
                    "flex-1 flex flex-col items-center py-2 rounded-2xl transition-all duration-150",
                    isSelected ? "bg-primary shadow-sm shadow-primary/20" : "active:bg-muted"
                  )}>
                  <span className={cn("text-[10px] font-semibold uppercase",
                    isSelected ? "text-primary-foreground" : "text-muted-foreground")}>
                    {format(day, "EEE", { locale: it }).slice(0, 2)}
                  </span>
                  <span className={cn("text-base font-bold mt-0.5",
                    isSelected ? "text-primary-foreground" : isDayToday ? "text-primary" : "text-foreground")}>
                    {format(day, "d")}
                  </span>
                  {count > 0 && (
                    <div className="flex gap-0.5 mt-1">
                      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <div key={i} className={cn("w-1.5 h-1.5 rounded-full",
                          isSelected ? "bg-primary-foreground/70" : "bg-primary/60")} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ──── Vista Mese ──── */}
      {viewMode === "month" && (
        <div className="bg-gradient-to-b from-muted/80 to-background border-b border-border/50 px-4 pt-1 pb-3">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:scale-95 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-semibold capitalize">
              {format(currentMonth, "MMMM yyyy", { locale: it })}
            </span>
            <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-background border active:scale-95 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          {/* Intestazioni giorni */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"].map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">{d}</div>
            ))}
          </div>
          {/* Griglia mese */}
          <div className="grid grid-cols-7 gap-0.5">
            {/* Spazi vuoti prima del primo giorno */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-10" />
            ))}
            {monthDays.map((day) => {
              const isSelected = isSameDay(day, selectedDay);
              const isDayToday = isToday(day);
              const count = countForDay(day);
              return (
                <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                  className={cn(
                    "h-10 flex flex-col items-center justify-center rounded-xl transition-all relative",
                    isSelected ? "bg-primary" : isDayToday ? "bg-primary/10" : "active:bg-muted"
                  )}>
                  <span className={cn("text-sm font-semibold",
                    isSelected ? "text-primary-foreground" : isDayToday ? "text-primary" : "text-foreground")}>
                    {format(day, "d")}
                  </span>
                  {count > 0 && (
                    <div className="flex gap-0.5 absolute bottom-0.5">
                      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <div key={i} className={cn("w-1 h-1 rounded-full",
                          isSelected ? "bg-primary-foreground/70" : "bg-primary/60")} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ──── Contenuto giorno ──── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 md:pb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold capitalize">{dayLabel(selectedDay)}</h2>
          {!isToday(selectedDay) && (
            <button onClick={() => {
              setSelectedDay(new Date());
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
              setCurrentMonth(new Date());
            }}
              className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 active:bg-primary/20 transition-all">
              Oggi
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : dayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <CalendarOff className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-muted-foreground">Nessun impegno</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {isToday(selectedDay) ? "Giornata libera!" : `Niente programmato per ${format(selectedDay, "EEEE d", { locale: it })}`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {dayItems.map((item, idx) => {
              const dist = distanze[idx];
              const prevItem = idx > 0 ? dayItems[idx - 1] : null;

              return (
                <div key={item.id}>
                  {/* Distanza tra appuntamenti */}
                  {idx > 0 && dist?.between?.[0] != null && (
                    <DistanceBadge meters={dist.between[0]} />
                  )}
                  {/* Distanza dalla sede (primo item) */}
                  {idx === 0 && dist?.fromSede != null && (
                    <div className="flex items-center gap-2 py-2 pl-2">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        Dalla sede: <span className="font-semibold text-foreground">{formatKm(dist.fromSede)}</span>
                      </span>
                    </div>
                  )}

                  {item.type === "appuntamento" ? (
                    <AppuntamentoCard item={item} navigate={navigate} />
                  ) : (
                    <CantiereCard item={item} selectedDay={selectedDay} navigate={navigate} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Distance badge tra impegni ──
function DistanceBadge({ meters }: { meters: number }) {
  return (
    <div className="flex items-center justify-center py-1.5">
      <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-full px-3 py-1">
        <Route className="w-3 h-3 text-blue-500" />
        <span className="text-[11px] font-semibold text-blue-700">{formatKm(meters)}</span>
        <ArrowDown className="w-3 h-3 text-blue-400" />
      </div>
    </div>
  );
}

// ── Card appuntamento/sopralluogo ──
function AppuntamentoCard({ item, navigate }: { item: Appuntamento; navigate: any }) {
  const typeInfo = appointmentTypeLabel(item.appointment_type);
  const timeStr = item.appointment_time
    ? item.appointment_time.slice(0, 5) + (item.appointment_end_time ? ` - ${item.appointment_end_time.slice(0, 5)}` : "")
    : null;

  return (
    <button
      onClick={() => item.order_id ? navigate(`/campo/lavoro/${item.order_id}`) : null}
      className="w-full bg-background border-l-4 border-l-violet-400 border border-border/80 rounded-2xl p-4 text-left active:scale-[0.98] transition-all shadow-sm mb-3"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm">{typeInfo.emoji}</span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", typeInfo.cls)}>
              {typeInfo.label}
            </span>
            {item.order && (
              <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {(item.order as any).order_code}
              </span>
            )}
          </div>
          <p className="font-bold text-foreground text-[15px] leading-snug">{item.title}</p>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
        {timeStr && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-primary/5 rounded-lg px-2 py-1">
            <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>{timeStr}</span>
          </div>
        )}
        {item.formatted_address && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary/60 shrink-0" />
            <span className="truncate max-w-[220px]">{item.formatted_address}</span>
          </div>
        )}
      </div>
    </button>
  );
}

// ── Card cantiere ──
function CantiereCard({ item, selectedDay, navigate }: { item: Cantiere; selectedDay: Date; navigate: any }) {
  const order = item.order;
  if (!order) return null;

  const badge = statusBadge(order.status);
  const perc = order.percentuale_avanzamento ?? 0;
  const hasDateRange = order.work_start_date && order.work_end_date;
  let dayInfo = "";
  if (hasDateRange) {
    const start = parseISO(order.work_start_date!);
    const end = parseISO(order.work_end_date!);
    const total = differenceInCalendarDays(end, start) + 1;
    const current = differenceInCalendarDays(selectedDay, start) + 1;
    dayInfo = `Giorno ${current} di ${total}`;
  }

  return (
    <button
      onClick={() => navigate(`/campo/lavoro/${order.id}`)}
      className="w-full bg-background border border-border/80 rounded-2xl p-4 text-left active:scale-[0.98] transition-all shadow-sm mb-3"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-bold text-foreground text-[15px]">{order.order_code}</p>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", badge.cls)}>
              {badge.label}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">{order.description}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 mb-3">
        {order.indirizzo_lavori && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 text-primary/60 shrink-0" />
            <span className="truncate max-w-[200px]">{order.indirizzo_lavori}</span>
          </div>
        )}
        {dayInfo && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary/60 shrink-0" />
            <span>{dayInfo}</span>
          </div>
        )}
      </div>

      {hasDateRange && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-3 bg-muted/50 rounded-lg px-2.5 py-1.5">
          <Navigation className="w-3 h-3 shrink-0" />
          <span>{format(parseISO(order.work_start_date!), "d MMM", { locale: it })} → {format(parseISO(order.work_end_date!), "d MMM", { locale: it })}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div className={cn("h-2 rounded-full transition-all",
            perc >= 100 ? "bg-green-500" : perc > 0 ? "bg-primary" : "bg-muted-foreground/20"
          )} style={{ width: `${Math.max(perc, 2)}%` }} />
        </div>
        <div className="flex items-center gap-1">
          {perc >= 100 && <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />}
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">{perc}%</span>
        </div>
      </div>
    </button>
  );
}

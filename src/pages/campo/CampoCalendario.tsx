/**
 * Lavori — vista settimanale/mensile per l'operaio.
 * Mostra cantieri + appuntamenti/sopralluoghi programmati per data.
 * Calcola distanze dalla sede e tra impegni consecutivi.
 */
import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { NavigateFunction } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  format, addDays, startOfWeek, startOfMonth, endOfMonth, isSameDay,
  isWithinInterval, addWeeks, subWeeks, addMonths, subMonths,
  parseISO, isToday, isTomorrow, isYesterday,
  differenceInCalendarDays, eachDayOfInterval, getDay,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, MapPin, Loader2, CalendarOff,
  Clock, Navigation, HardHat, CheckCircle2, Route, Building2,
  Eye, CalendarDays, CalendarRange, ArrowDown, ClipboardList, MapPinned,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { cn } from "@/lib/utils";
import { haversineMeters } from "@/lib/tsp";
import { forwardGeocode } from "@/lib/geocoding";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// ── Types ──
interface OrderSummary {
  id: string;
  order_code: string;
  description: string;
  status: string;
  indirizzo_lavori: string | null;
  percentuale_avanzamento: number;
  work_start_date: string | null;
  work_end_date: string | null;
}

interface Cantiere {
  id: string;
  type: "cantiere";
  order: OrderSummary;
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

type AssignmentRow = {
  id: string;
  order_id: string | null;
  order: OrderSummary | null;
};

type AppointmentRow = Omit<Appuntamento, "type" | "formatted_address"> & {
  formatted_address: string | null;
  address_line?: string | null;
  address_city?: string | null;
};

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

function formatDriveTime(meters: number): string {
  const minutes = Math.max(3, Math.round((meters / 1000 / 35) * 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function itemTitle(item: CalendarItem): string {
  if (item.type === "appuntamento") return item.title;
  return item.order?.description || item.order?.order_code || "Cantiere";
}

function campoLavoroUrl(order: {
  id: string;
  order_code?: string | null;
  description?: string | null;
  indirizzo_lavori?: string | null;
}): string {
  const params = new URLSearchParams();
  if (order.order_code) params.set("order_code", order.order_code);
  if (order.description) params.set("order_title", order.description);
  if (order.indirizzo_lavori) params.set("order_address", order.indirizzo_lavori);
  const query = params.toString();
  return `/campo/lavoro/${order.id}${query ? `?${query}` : ""}`;
}

function isOpenOrder(order: OrderSummary | null | undefined): order is OrderSummary {
  if (!order?.id) return false;
  const status = order.status?.toLowerCase();
  return status !== "annullato" && status !== "chiuso";
}

/**
 * Lavoro ancora aperto ma con la data di fine già passata → è IN RITARDO
 * (se fosse finito sarebbe "chiuso"). Confronto per giorni di calendario:
 * evita i falsi positivi dovuti all'orario e ai fusi.
 */
function isOverdueOrder(order: OrderSummary | null | undefined): boolean {
  if (!order?.work_end_date) return false;
  return differenceInCalendarDays(new Date(), parseISO(order.work_end_date)) > 0;
}

function assignmentsToCantieri(rows: AssignmentRow[] | null | undefined): Cantiere[] {
  const seen = new Set<string>();
  return (rows ?? [])
    .filter((row) => {
      if (!isOpenOrder(row.order) || seen.has(row.order.id)) return false;
      seen.add(row.order.id);
      return true;
    })
    .map((row) => ({
      id: row.id,
      type: "cantiere" as const,
      order: row.order!,
    }));
}

// Sede demo
const SEDE = { lat: 45.4642, lng: 9.1900, label: "Sede" }; // Milano

export default function CampoCalendario() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isSubappaltatore } = useIsCampo();

  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [selectedAppuntamento, setSelectedAppuntamento] = useState<Appuntamento | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Employee ID
  const { data: employeeId } = useQuery({
    queryKey: ["campo-emp-id", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees").select("id")
        .eq("user_id", user!.id).eq("company_id", profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    enabled: !!user?.id && !!profile?.company_id,
  });

  // Cantieri assegnati
  const { data: allCantieri = [], isLoading: loadingCantieri } = useQuery<Cantiere[]>({
    queryKey: ["campo-lavori-full", employeeId, user?.id, profile?.company_id, isSubappaltatore],
    queryFn: async () => {
      if (isSubappaltatore) {
        const { data: directAssignments, error: directError } = await supabase
          .from("order_campo_assignments")
          .select(`
            id, order_id, role_type, note,
            order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento, work_start_date, work_end_date)
          `)
          .eq("user_id", user!.id);
        if (directError) throw directError;

        const directCantieri = assignmentsToCantieri(directAssignments as AssignmentRow[] | null);
        if (directCantieri.length > 0) return directCantieri;

        const { data: subcontractor, error: subcontractorError } = await supabase
          .from("subappaltatori")
          .select("id")
          .eq("user_id", user!.id)
          .maybeSingle();
        if (subcontractorError) throw subcontractorError;
        if (!subcontractor?.id) return [];

        const { data: contracts, error: contractsError } = await supabase
          .from("contratti_subappalto")
          .select(`
            id, order_id, stato,
            order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento, work_start_date, work_end_date)
          `)
          .eq("subappaltatore_id", subcontractor.id)
          .eq("stato", "attivo");
        if (contractsError) throw contractsError;

        return assignmentsToCantieri(contracts as AssignmentRow[] | null);
      }

      const { data, error } = await supabase
        .from("order_employees")
        .select(`id, order_id, order:orders(id, order_code, description, status, indirizzo_lavori, percentuale_avanzamento, work_start_date, work_end_date)`)
        .eq("employee_id", employeeId!);
      if (error) throw error;
      return assignmentsToCantieri(data as AssignmentRow[] | null);
    },
    enabled: isSubappaltatore ? !!user?.id : !!employeeId,
  });

  // Appuntamenti assegnati all'operaio
  const { data: allAppuntamenti = [], isLoading: loadingApp } = useQuery<Appuntamento[]>({
    queryKey: ["campo-appuntamenti", user?.id, profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, appointment_date, appointment_time, appointment_end_time, appointment_type, status, formatted_address, lat, lng, order_id, address_line, address_city")
        .eq("company_id", profile!.company_id)
        .eq("assigned_to", user!.id)
        .neq("status", "annullato")
        .neq("status", "cancelled");
      if (error) throw error;
      return ((data ?? []) as AppointmentRow[]).map((a) => ({
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
      const cantieri = allCantieri.filter((a) => {
        const o = a.order;
        if (!o) return false;
        if (o.work_start_date && o.work_end_date) {
          if (isWithinInterval(day, { start: parseISO(o.work_start_date), end: parseISO(o.work_end_date) })) {
            return true;
          }
          // Lavoro ancora APERTO (allCantieri esclude già chiuso/annullato) ma
          // oltre la data di fine = in ritardo, non finito. Senza questo ramo
          // spariva del tutto da "I miei lavori" proprio mentre la Home lo
          // conta ancora tra i "Cantieri attivi" → le due schermate si
          // contraddicevano. Lo teniamo visibile su OGGI finché non è chiuso.
          return isToday(day) && isOverdueOrder(o);
        }
        if (o.work_start_date) return parseISO(o.work_start_date) <= day;
        return true;
      });

      const appuntamenti = allAppuntamenti.filter((a) =>
        a.appointment_date && isSameDay(parseISO(a.appointment_date), day)
      );

      // Ordina appuntamenti per orario, poi cantieri
      const sortedApp = [...appuntamenti].sort((a, b) => {
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

  const todayItems = useMemo(() => itemsForDay(new Date()), [itemsForDay]);
  const weekItemsCount = useMemo(() => weekDays.reduce((total, day) => total + countForDay(day), 0), [weekDays, countForDay]);
  const selectedAppointments = dayItems.filter((item) => item.type === "appuntamento").length;
  const selectedSites = dayItems.filter((item) => item.type === "cantiere").length;

  const nextCommitment = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i));
    for (const day of days) {
      const first = itemsForDay(day)[0];
      if (first) return { day, item: first };
    }
    return null;
  }, [itemsForDay]);

  // Geocoding cantieri — risolvi indirizzo → coordinate
  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number } | null>>({});

  useEffect(() => {
    let cancelled = false;
    const toGeocode = allCantieri.filter((c) => {
      const addr = c.order?.indirizzo_lavori;
      return addr && !(addr in geocodedCoords);
    });
    if (toGeocode.length === 0) return;

    (async () => {
      const results: Record<string, { lat: number; lng: number } | null> = {};
      for (const c of toGeocode) {
        if (cancelled) break;
        const addr = c.order?.indirizzo_lavori;
        if (!addr) continue;
        const coords = await forwardGeocode(addr);
        results[addr] = coords;
      }
      if (!cancelled) {
        setGeocodedCoords(prev => ({ ...prev, ...results }));
      }
    })();
    return () => { cancelled = true; };
  }, [allCantieri]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calcola distanze dalla sede e tra items consecutivi
  const distanze = useMemo(() => {
    const result: { fromSede?: number; between: number[] }[] = [];
    const geoItems = dayItems.map((item) => {
      if (item.type === "appuntamento") return { lat: item.lat, lng: item.lng };
      // Cantieri: usa coordinate geocodate dall'indirizzo
      const addr = (item as Cantiere).order?.indirizzo_lavori;
      if (addr && geocodedCoords[addr]) return geocodedCoords[addr];
      return null;
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
  }, [dayItems, geocodedCoords]);

  // Mese calendario
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = (getDay(monthStart) + 6) % 7; // Monday = 0

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3 md:gap-4">
      <div className="rounded-2xl border bg-background p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <HardHat className="h-3.5 w-3.5" />
              Area campo
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">I miei lavori</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Calendario operativo con cantieri, sopralluoghi, indirizzi e avanzamento lavori in una vista unica.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:gap-2 xl:min-w-[560px]">
            <SummaryTile icon={CalendarDays} label="Oggi" value={todayItems.length} tone="blue" />
            <SummaryTile icon={CalendarRange} label="Settimana" value={weekItemsCount} tone="indigo" />
            <SummaryTile icon={Building2} label="Cantieri" value={allCantieri.length} tone="emerald" />
            <SummaryTile icon={Clock} label="Appuntamenti" value={allAppuntamenti.length} tone="amber" />
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[430px_minmax(0,1fr)]">
        <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
          <div className="rounded-2xl border bg-background p-3 shadow-sm md:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vista calendario</p>
                <p className="text-sm font-semibold capitalize">
                  {viewMode === "week" ? format(weekStart, "MMMM yyyy", { locale: it }) : format(currentMonth, "MMMM yyyy", { locale: it })}
                </p>
              </div>
              <div className="flex rounded-xl bg-muted p-0.5">
                <button
                  onClick={() => setViewMode("week")}
                  className={cn(
                    "flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-all",
                    viewMode === "week" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  Settimana
                </button>
                <button
                  onClick={() => setViewMode("month")}
                  className={cn(
                    "flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold transition-all",
                    viewMode === "month" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Mese
                </button>
              </div>
            </div>

            {viewMode === "week" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button onClick={() => setWeekStart(w => subWeeks(w, 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border bg-background transition-all active:scale-95">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="text-center">
                    <p className="text-sm font-bold">Settimana</p>
                    <p className="text-xs text-muted-foreground">
                      {format(weekStart, "d MMM", { locale: it })} - {format(addDays(weekStart, 6), "d MMM", { locale: it })}
                    </p>
                  </div>
                  <button onClick={() => setWeekStart(w => addWeeks(w, 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border bg-background transition-all active:scale-95">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map((day) => {
                    const isSelected = isSameDay(day, selectedDay);
                    const isDayToday = isToday(day);
                    const count = countForDay(day);
                    return (
                      <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                        className={cn(
                          "flex min-h-[62px] flex-col items-center justify-center rounded-xl border transition-all md:min-h-[76px] md:rounded-2xl",
                          isSelected ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20" :
                          isDayToday ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent bg-muted/50 text-foreground hover:bg-muted"
                        )}>
                        <span className={cn("text-[10px] font-bold uppercase", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          {format(day, "EEE", { locale: it }).slice(0, 2)}
                        </span>
                        <span className="mt-1 text-lg font-black">{format(day, "d")}</span>
                        <span className={cn("mt-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          isSelected ? "bg-primary-foreground/15 text-primary-foreground" : count > 0 ? "bg-primary/10 text-primary" : "text-muted-foreground"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {viewMode === "month" && (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <button onClick={() => setCurrentMonth(m => subMonths(m, 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border bg-background transition-all active:scale-95">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm font-bold capitalize">
                    {format(currentMonth, "MMMM yyyy", { locale: it })}
                  </span>
                  <button onClick={() => setCurrentMonth(m => addMonths(m, 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border bg-background transition-all active:scale-95">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"].map(d => (
                    <div key={d} className="py-1 text-center text-[10px] font-bold text-muted-foreground">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="h-12" />
                  ))}
                  {monthDays.map((day) => {
                    const isSelected = isSameDay(day, selectedDay);
                    const isDayToday = isToday(day);
                    const count = countForDay(day);
                    return (
                      <button key={day.toISOString()} onClick={() => setSelectedDay(day)}
                        className={cn(
                          "relative flex h-10 flex-col items-center justify-center rounded-xl border transition-all md:h-12",
                          isSelected ? "border-primary bg-primary text-primary-foreground" :
                          isDayToday ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent hover:bg-muted"
                        )}>
                        <span className="text-sm font-bold">{format(day, "d")}</span>
                        {count > 0 && (
                          <span className={cn("absolute bottom-1 h-1.5 w-1.5 rounded-full",
                            isSelected ? "bg-primary-foreground/75" : "bg-primary"
                          )} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border bg-background p-3 shadow-sm md:p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <MapPinned className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Prossimo impegno</p>
                {nextCommitment ? (
                  <>
                    <p className="mt-1 text-sm text-foreground line-clamp-2">{itemTitle(nextCommitment.item)}</p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">{dayLabel(nextCommitment.day)}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Nessun lavoro programmato nei prossimi giorni.</p>
                )}
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border bg-background shadow-sm">
          <div className="border-b p-4 md:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agenda giorno</p>
                <h2 className="text-xl font-bold capitalize md:text-2xl">{dayLabel(selectedDay)}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AgendaPill icon={ClipboardList} label={`${selectedAppointments} appuntamenti`} />
                <AgendaPill icon={HardHat} label={`${selectedSites} cantieri`} />
                {!isToday(selectedDay) && (
                  <button onClick={() => {
                    setSelectedDay(new Date());
                    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
                    setCurrentMonth(new Date());
                  }}
                    className="h-9 rounded-lg bg-primary/10 px-3 text-xs font-semibold text-primary transition-all active:bg-primary/20">
                    Torna a oggi
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-[340px] px-3 py-3 pb-28 md:min-h-[520px] md:px-5 md:pb-6">

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : dayItems.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center md:min-h-[360px]">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <CalendarOff className="h-8 w-8 text-muted-foreground/60" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Nessun impegno programmato</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {isToday(selectedDay) ? "Oggi non risultano cantieri o appuntamenti assegnati." : `Niente programmato per ${format(selectedDay, "EEEE d MMMM", { locale: it })}.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {dayItems.map((item, idx) => {
              const dist = distanze[idx];

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
                    <AppuntamentoCard
                      item={item}
                      navigate={navigate}
                      distanceFromSede={dist?.fromSede}
                      onShowDetail={setSelectedAppuntamento}
                    />
                  ) : (
                    <CantiereCard
                      item={item}
                      selectedDay={selectedDay}
                      navigate={navigate}
                      distanceFromSede={dist?.fromSede}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
          </div>
        </section>
      </div>

      {/* ──── Detail Sheet per appuntamento ──── */}
      <Sheet open={!!selectedAppuntamento} onOpenChange={(open) => !open && setSelectedAppuntamento(null)}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto pb-10">
          {selectedAppuntamento && (() => {
            const a = selectedAppuntamento;
            const typeInfo = appointmentTypeLabel(a.appointment_type);
            const timeStr = a.appointment_time
              ? a.appointment_time.slice(0, 5) + (a.appointment_end_time ? ` - ${a.appointment_end_time.slice(0, 5)}` : "")
              : null;
            const dateStr = format(parseISO(a.appointment_date), "EEEE d MMMM yyyy", { locale: it });

            return (
              <div className="space-y-5">
                <SheetHeader className="text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{typeInfo.emoji}</span>
                    <span className={cn("text-xs font-semibold px-2.5 py-1 rounded-full", typeInfo.cls)}>
                      {typeInfo.label}
                    </span>
                    {a.order && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {a.order.order_code}
                      </span>
                    )}
                  </div>
                  <SheetTitle className="text-xl">{a.title}</SheetTitle>
                </SheetHeader>

                {a.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.description}</p>
                )}

                <div className="space-y-3 bg-muted/50 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <CalendarDays className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Data</p>
                      <p className="text-sm font-semibold capitalize">{dateStr}</p>
                    </div>
                  </div>

                  {timeStr && (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Clock className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Orario</p>
                        <p className="text-sm font-semibold">{timeStr}</p>
                      </div>
                    </div>
                  )}

                  {a.formatted_address && (
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                        <MapPin className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Indirizzo</p>
                        <p className="text-sm font-semibold">{a.formatted_address}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Eye className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Stato</p>
                      <p className="text-sm font-semibold capitalize">{a.status || "Programmato"}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2.5">
                  {a.order_id && (
                    <Button
                      onClick={() => {
                        setSelectedAppuntamento(null);
                        navigate(campoLavoroUrl({
                          id: a.order_id!,
                          order_code: a.order?.order_code,
                          description: a.description ?? a.title,
                          indirizzo_lavori: a.formatted_address,
                        }));
                      }}
                      className="w-full h-12 text-base font-semibold rounded-2xl"
                    >
                      <HardHat className="w-5 h-5 mr-2" />
                      Vai al cantiere
                    </Button>
                  )}
                  {a.formatted_address && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        const q = encodeURIComponent(a.formatted_address!);
                        window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank");
                      }}
                      className="w-full h-12 text-base font-semibold rounded-2xl"
                    >
                      <Navigation className="w-5 h-5 mr-2" />
                      Apri in Maps
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "blue" | "indigo" | "emerald" | "amber";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };

  return (
    <div className={cn("rounded-xl border p-2.5 md:p-3", tones[tone])}>
      <div className="mb-1.5 flex items-center justify-between gap-1 md:mb-2">
        <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
        <span className="text-lg font-black tabular-nums leading-none md:text-xl">{value}</span>
      </div>
      <p className="truncate text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

function AgendaPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="inline-flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {label}
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
function AppuntamentoCard({
  item,
  navigate,
  distanceFromSede,
  onShowDetail,
}: {
  item: Appuntamento;
  navigate: NavigateFunction;
  distanceFromSede?: number;
  onShowDetail?: (a: Appuntamento) => void;
}) {
  const typeInfo = appointmentTypeLabel(item.appointment_type);
  const timeStr = item.appointment_time
    ? item.appointment_time.slice(0, 5) + (item.appointment_end_time ? ` - ${item.appointment_end_time.slice(0, 5)}` : "")
    : null;

  return (
    <button
      onClick={() => onShowDetail ? onShowDetail(item) : (item.order_id ? navigate(campoLavoroUrl({
        id: item.order_id,
        order_code: item.order?.order_code,
        description: item.description ?? item.title,
        indirizzo_lavori: item.formatted_address,
      })) : null)}
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
                {item.order.order_code}
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

      {(item.formatted_address || distanceFromSede != null) && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {item.formatted_address && (
            <div className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dove andare</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{item.formatted_address}</p>
            </div>
          )}
          {distanceFromSede != null && (
            <>
              <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-75">Distanza</p>
                <p className="mt-0.5 text-xs font-black">{formatKm(distanceFromSede)}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-75">Tempo stimato</p>
                <p className="mt-0.5 text-xs font-black">{formatDriveTime(distanceFromSede)}</p>
              </div>
            </>
          )}
        </div>
      )}
    </button>
  );
}

// ── Card cantiere ──
function CantiereCard({
  item,
  selectedDay,
  navigate,
  distanceFromSede,
}: {
  item: Cantiere;
  selectedDay: Date;
  navigate: NavigateFunction;
  distanceFromSede?: number;
}) {
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
      onClick={() => navigate(campoLavoroUrl(order))}
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

      {(order.indirizzo_lavori || distanceFromSede != null) && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {order.indirizzo_lavori && (
            <div className="rounded-xl bg-muted/60 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Dove andare</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{order.indirizzo_lavori}</p>
            </div>
          )}
          {distanceFromSede != null && (
            <>
              <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-75">Distanza</p>
                <p className="mt-0.5 text-xs font-black">{formatKm(distanceFromSede)}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-75">Tempo stimato</p>
                <p className="mt-0.5 text-xs font-black">{formatDriveTime(distanceFromSede)}</p>
              </div>
            </>
          )}
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

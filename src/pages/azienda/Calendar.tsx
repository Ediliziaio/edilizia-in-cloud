import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { useOutlookCalendarSync } from "@/hooks/useOutlookCalendarSync";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useCalendarWeather, type CalendarLocation } from "@/hooks/useWeatherForecast";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";

import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import { useConflictDetection } from "@/hooks/useConflictDetection";
import { CalendarLayerPanel } from "@/components/calendar/CalendarLayerPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, GanttChart, Calendar as CalendarIcon, RotateCcw, AlertTriangle, BarChart3, Plus, RefreshCw, SlidersHorizontal, Eye, CalendarRange, Download, MoreHorizontal, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { exportAppointmentsIcal } from "@/lib/icalExport";
import { createTimeoutSignal, withClientTimeout } from "@/lib/query-timeout";
import { cn } from "@/lib/utils";
import type { CalendarOrder, CalendarViewType, OrderStatus, CustomerFilter, CalendarAppointment, GoogleBusySlot, CalendarWarehouseInfo, CalendarIntervento, CalendarManutenzione } from "@/types/calendar";
import { AppointmentDialog } from "@/components/appointments/AppointmentDialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { DEFAULT_CALENDAR_EVENT_COLORS, normalizeCalendarEventColors, orderColor, type CalendarEventColorKey, type CalendarColorMode, type CalendarAvvisiPagamento } from "@/lib/calendarUtils";
import { messaggioRata } from "@/lib/orders/rateEventi";

type CalendarEmployee = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  user_id: string | null;
  role_type?: string | null;
  area?: string | null;
};

type CalendarWarehouseItem = {
  id: string;
  name: string;
  status: string | null;
  order_id: string | null;
};

const calendarViews: CalendarViewType[] = ["month", "week", "day", "gantt", "heatmap"];

const normalizeCalendarView = (value: string | null | undefined, isMobile: boolean): CalendarViewType => {
  if (!value || !calendarViews.includes(value as CalendarViewType)) return "month";
  if (isMobile && value === "gantt") return "month";
  return value as CalendarViewType;
};

const getPersonName = (firstName?: string | null, lastName?: string | null, fallback = "Senza nome") => {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
};

const isWorkCalendarEmployee = (employee: CalendarEmployee) => {
  const area = (employee.area || "").toLowerCase();
  const roleType = (employee.role_type || "").toLowerCase();
  if (area === "cantiere" || area === "tecnico") return true;
  if (area === "commerciale" || area === "amministrazione") return false;
  return roleType !== "staff_interno";
};

function CalendarInner() {
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isGoogleConnected, pullBusySlots } = useGoogleCalendarSync();
  const { isAppleConnected } = useAppleCalendarSync();
  const { isOutlookConnected } = useOutlookCalendarSync();
  const [view, setViewState] = useState<CalendarViewType>(() => normalizeCalendarView(searchParams.get("view"), isMobile));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [externalTeamFilter, setExternalTeamFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Layer visibility state — initialize from localStorage (parse once)
  const savedPrefs = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("calendar-layer-prefs") || "{}"); }
    catch { return {}; }
  }, []);
  const [layerPanelOpen, setLayerPanelOpen] = useState(savedPrefs.layerPanelOpen ?? !isMobile);
  const [layerVisibility, setLayerVisibility] = useState({
    showPosa: savedPrefs.showPosa ?? true,
    showLavoro: savedPrefs.showLavoro ?? true,
    showAppuntamento: savedPrefs.showAppuntamento ?? true,
    // 2026-05-27: nuovo layer "Commerciale" = appuntamenti con
    // calendar_id (legati a marketing_calendars). Default ON così il
    // titolare singolo (che fa vendite + pose) vede tutto. Chi ha squadre
    // operative dedicate può spegnerlo per ridurre il rumore.
    showAppuntamentoCommerciale: savedPrefs.showAppuntamentoCommerciale ?? true,
    showMerce: false,
    showGoogleBusy: false,
    showLeaves: false,
    showWeather: savedPrefs.showWeather ?? true,
    showInterventi: false,
    showManutenzioni: false,
  });
  const setLayer = useCallback((layer: keyof typeof layerVisibility, v: boolean) => {
    setLayerVisibility(prev => ({ ...prev, [layer]: v }));
  }, []);
  const [eventColors, setEventColors] = useState(() => normalizeCalendarEventColors(savedPrefs.eventColors));
  const setEventColor = useCallback((key: CalendarEventColorKey, color: string) => {
    setEventColors(prev => ({ ...prev, [key]: color }));
  }, []);
  // Colore delle barre lavoro: per COMMESSA (default: con 6 cantieri aperti
  // il verde unico non dice quale striscia è quale), per SQUADRA (chi ci
  // lavora), o per TIPO evento (il comportamento storico coi colori sotto).
  const [colorMode, setColorMode] = useState<CalendarColorMode>(() => {
    const m = savedPrefs.colorMode;
    if (m === "tipo" || m === "commessa" || m === "squadra") return m;
    return savedPrefs.colorByOrder === false ? "tipo" : "commessa";
  });
  const orderColorFn = useMemo(() => {
    if (colorMode === "tipo") return undefined;
    if (colorMode === "commessa") return (o: CalendarOrder) => orderColor(o.id);
    return (o: CalendarOrder) => {
      const team = o.order_external_teams?.[0]?.external_team;
      // Senza squadra: grigio neutro — sul calendario si vede subito chi è scoperto.
      if (!team) return "#94A3B8";
      return team.color || orderColor(team.id);
    };
  }, [colorMode]);
  // Avvisi pagamento sulle barre: tutti, solo i rossi (acconto non incassato
  // — l'ambra dei saldi a lavori chiusi può affollare il mese), o spenti.
  const [avvisiPagamento, setAvvisiPagamento] = useState<CalendarAvvisiPagamento>(() => {
    const a = savedPrefs.avvisiPagamento;
    return a === "tutti" || a === "rossi" || a === "off" ? a : "tutti";
  });
  // Il colore squadra è dell'AZIENDA (tutti lo vedono uguale), quindi vive
  // su external_teams e non nelle preferenze locali del browser.
  const onTeamColorChange = useCallback(async (teamId: string, color: string) => {
    const { error } = await supabase.from("external_teams").update({ color } as never).eq("id", teamId);
    if (error) {
      toast.error("Colore squadra non salvato");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["external-teams-filter"] });
    queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.list(effectiveCompany?.id) });
  }, [queryClient, effectiveCompany?.id]);
  const { showPosa, showLavoro, showAppuntamento, showAppuntamentoCommerciale, showMerce, showGoogleBusy, showLeaves, showWeather, showInterventi, showManutenzioni } = layerVisibility;
  // Robusto contro localStorage corrotto o di vecchie versioni: SOLO un array
  // diventa un Set; qualsiasi altro valore (stringa, numero, oggetto, ecc.)
  // viene trattato come null (= "mostra tutti"). Prima `new Set(valore)` su un
  // valore non iterabile lanciava "X is not iterable" durante l'init, mandando
  // l'intera pagina nell'ErrorBoundary ("il calendario non si apre").
  const [visibleEmployeeIds, setVisibleEmployeeIds] = useState<Set<string> | null>(
    () => (Array.isArray(savedPrefs.visibleEmployeeIds) ? new Set<string>(savedPrefs.visibleEmployeeIds.map(String)) : null)
  );
  const [visibleTeamIds, setVisibleTeamIds] = useState<Set<string> | null>(
    () => (Array.isArray(savedPrefs.visibleTeamIds) ? new Set<string>(savedPrefs.visibleTeamIds.map(String)) : null)
  );

  useEffect(() => {
    const requestedView = searchParams.get("view");
    const nextView = normalizeCalendarView(requestedView, isMobile);
    setViewState(prev => prev === nextView ? prev : nextView);
    if (requestedView && requestedView !== nextView) {
      const nextParams = new URLSearchParams(searchParams);
      if (nextView === "month") nextParams.delete("view");
      else nextParams.set("view", nextView);
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, isMobile, setSearchParams]);

  const setView = useCallback((nextView: CalendarViewType) => {
    const safeView = normalizeCalendarView(nextView, isMobile);
    setViewState(safeView);
    const nextParams = new URLSearchParams(searchParams);
    if (safeView === "month") nextParams.delete("view");
    else nextParams.set("view", safeView);
    setSearchParams(nextParams, { replace: true });
  }, [isMobile, searchParams, setSearchParams]);

  // Persist layer prefs to localStorage (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const prefs = {
        layerPanelOpen,
        ...layerVisibility,
        visibleEmployeeIds: visibleEmployeeIds ? Array.from(visibleEmployeeIds) : null,
        visibleTeamIds: visibleTeamIds ? Array.from(visibleTeamIds) : null,
        eventColors,
        colorMode,
        avvisiPagamento,
      };
      localStorage.setItem("calendar-layer-prefs", JSON.stringify(prefs));
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [layerPanelOpen, layerVisibility, visibleEmployeeIds, visibleTeamIds, eventColors, colorMode, avvisiPagamento]);

  // Compute a ±2-month window around the current date for calendar queries
  const calendarRangeStart = useMemo(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() - 2);
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, [currentDate]);
  const calendarRangeEnd = useMemo(() => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + 3);
    d.setDate(0);
    return d.toISOString().slice(0, 10);
  }, [currentDate]);

  const { data: ordersRaw = [], isLoading, isError } = useQuery({
    queryKey: [...queryKeys.calendarOrders.list(effectiveCompany?.id), calendarRangeStart, calendarRangeEnd],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);

      try {
        const query = supabase
          .from("orders")
          .select(`
            id,
            order_code,
            description,
            expected_date,
            work_start_date,
            work_end_date,
            work_start_time,
            work_end_time,
            warehouse_arrival_date,
            created_at,
            customer_id,
            current_status_id,
            indirizzo_lavori,
            customer:profiles!orders_customer_id_fkey(first_name, last_name),
            status:order_statuses!orders_current_status_id_fkey(name, color),
            order_employees(employee:employees(id, first_name, last_name)),
            order_external_teams(external_team:external_teams(id, name, color))
          `)
          .eq("company_id", effectiveCompany.id)
          .or(`work_start_date.lte.${calendarRangeEnd},expected_date.lte.${calendarRangeEnd},warehouse_arrival_date.lte.${calendarRangeEnd}`)
          .or(`work_end_date.gte.${calendarRangeStart},work_start_date.gte.${calendarRangeStart},expected_date.gte.${calendarRangeStart},warehouse_arrival_date.gte.${calendarRangeStart}`)
          .order("work_start_date", { ascending: true })
          .limit(1000)
          .abortSignal(timeout.signal);

        const { data, error } = await withClientTimeout(query, "Caricamento calendario lavori", 10_000);

        if (error) throw error;
        // Guardia: customer è un LEFT join (profiles via customer_id) → può
        // essere null (cliente cancellato/assente). Le viste calendario lo
        // leggono come order.customer.last_name → crash "reading 'last_name'"
        // (incidente prod 06-18). Normalizziamo alla fonte: un solo punto
        // protegge tutte le viste (Month/Gantt/Heatmap/Day/DraggableOrderBar).
        // `as unknown`: i tipi generati non conoscono ancora work_start_time/work_end_time.
        return ((data || []) as unknown as CalendarOrder[]).map((o) => ({
          ...o,
          customer: o.customer ?? { first_name: "", last_name: "Cliente non associato" },
        }));
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Rate cliente NON incassate delle commesse in vista: alimentano l'avviso
  // "stai iniziando un lavoro ma il cliente non ha pagato" (acconto scoperto)
  // e "lavori chiusi, saldo da incassare". Solo i tipi cliente-dovuti:
  // il financing lo paga la finanziaria dopo la fine, non è un ritardo.
  const orderIdsKey = useMemo(() => ordersRaw.map((o) => o.id).sort().join(","), [ordersRaw]);
  // Forma dei pagamenti scoperti per commessa, con la quota in preavviso.
  type ScopertiCommessa = {
    acconto_eur: number;
    saldo_eur: number;
    preavviso_eur?: number;
    preavviso_giorni?: number;
    preavviso_messaggio?: string;
  };
  type RigaRataScoperta = {
    order_id: string; type: string; amount: number | null; label: string | null;
    trigger_evento: string | null; stato_incasso: string | null; giorni_all_evento: number | null;
  };

  const { data: scopertiMap } = useQuery({
    queryKey: ["calendar-installments-scoperti", effectiveCompany?.id, orderIdsKey],
    enabled: !!effectiveCompany?.id && ordersRaw.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ids = ordersRaw.map((o) => o.id);
      const out = new Map<string, ScopertiCommessa>();
      // La vista sa quando la rata scade DAVVERO: se è agganciata a un evento
      // del cantiere (inizio lavori, arrivo merce…) la data la calcola lei e si
      // sposta insieme al cantiere.
      // .in() con centinaia di id regge; il calendario carica max 1000 ordini.
      for (let i = 0; i < ids.length; i += 400) {
        const { data, error } = await supabase
          .from("v_rate_commessa_stato")
          .select("order_id, type, amount, label, trigger_evento, stato_incasso, giorni_all_evento")
          .in("order_id", ids.slice(i, i + 400))
          .eq("is_paid", false)
          .in("type", ["deposit", "balance"]);
        if (error) throw error;
        for (const r of (data ?? []) as RigaRataScoperta[]) {
          const cur = out.get(r.order_id) ?? { acconto_eur: 0, saldo_eur: 0, preavviso_eur: 0 };
          const importo = Number(r.amount || 0);
          if (r.type === "deposit") cur.acconto_eur += importo;
          else cur.saldo_eur += importo;
          // Preavviso: evento vicino ma non ancora arrivato. Il messaggio lo
          // costruisce la rata più imminente, che è quella di cui parlare.
          if (r.stato_incasso === "preavviso") {
            cur.preavviso_eur = (cur.preavviso_eur ?? 0) + importo;
            const giorni = r.giorni_all_evento;
            if (cur.preavviso_giorni === undefined || (giorni !== null && giorni < cur.preavviso_giorni)) {
              cur.preavviso_giorni = giorni ?? undefined;
              cur.preavviso_messaggio =
                messaggioRata({ stato: "preavviso", evento: r.trigger_evento, giorni, importoEur: importo })
                ?? undefined;
            }
          }
          out.set(r.order_id, cur);
        }
      }
      return out;
    },
  });

  const orders = useMemo(() => {
    // Il filtro avvisi si applica QUI, a monte: le viste ricevono solo i
    // pagamenti_scoperti da mostrare e non devono sapere del filtro.
    if (avvisiPagamento === "off" || !scopertiMap || scopertiMap.size === 0) return ordersRaw;
    return ordersRaw.map((o) => {
      const raw = scopertiMap.get(o.id);
      if (!raw) return o;
      // "Solo rossi": l'ambra nasce dal saldo → azzerandolo resta solo
      // l'avviso acconto (rosso), senza toccare la logica nelle viste.
      const sc = avvisiPagamento === "rossi"
        ? { acconto_eur: raw.acconto_eur, saldo_eur: 0, preavviso_eur: raw.preavviso_eur, preavviso_messaggio: raw.preavviso_messaggio }
        : raw;
      return sc.acconto_eur > 0 || sc.saldo_eur > 0 || (sc.preavviso_eur ?? 0) > 0 ? { ...o, pagamenti_scoperti: sc } : o;
    });
  }, [ordersRaw, scopertiMap, avvisiPagamento]);

  // Fetch all profiles for the company (small, cached)
  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Fetch appointments
  const { data: appointments = [], isLoading: isAppointmentsLoading } = useQuery({
    queryKey: ["appointments", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd, permissions.onlyAssigned, user?.id],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        let query = supabase
          .from("appointments")
          .select(`
            *,
            order:orders!appointments_order_id_fkey(order_code, description, customer:profiles!orders_customer_id_fkey(first_name, last_name)),
            contact:marketing_contacts!appointments_contact_id_fkey(first_name, last_name)
          `)
          .eq("company_id", effectiveCompany.id)
          // B10 — rimosso .is("calendar_id", null) che escludeva appuntamenti con calendario specifico
          .gte("appointment_date", calendarRangeStart)
          .lte("appointment_date", calendarRangeEnd);
        // Ruolo ristretto (only_assigned): vede SOLO i propri appuntamenti.
        if (permissions.onlyAssigned && user?.id) query = query.eq("assigned_to", user.id);
        query = query
          .order("appointment_date", { ascending: true })
          .limit(1000)
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(query, "Caricamento appuntamenti calendario", 10_000);
        if (error) throw error;

        return (data || []) as CalendarAppointment[];
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // ── Meteo multi-location: estrae coordinate dagli appuntamenti ──
  const appointmentLocations = useMemo<CalendarLocation[]>(() => {
    const locMap = new Map<string, CalendarLocation>();
    for (const apt of appointments) {
      if (!apt.order_id) continue;
      if (apt.lat && apt.lng) {
        const key = `${Math.round(apt.lat * 100)},${Math.round(apt.lng * 100)}`;
        const existing = locMap.get(key);
        // Costruisci nome cliente da ordine o contatto
        const custName = apt.order?.customer
          ? `${apt.order.customer.first_name} ${apt.order.customer.last_name}`.trim()
          : apt.contact
            ? `${apt.contact.first_name} ${apt.contact.last_name}`.trim()
            : undefined;

        if (existing) {
          if (!existing.dates.includes(apt.appointment_date)) {
            existing.dates.push(apt.appointment_date);
          }
          // Arricchisci con dati mancanti
          if (!existing.address && apt.formatted_address) existing.address = apt.formatted_address;
          if (!existing.orderRef && apt.order?.order_code) existing.orderRef = apt.order.order_code;
          if (!existing.orderDesc && apt.order?.description) existing.orderDesc = apt.order.description;
          if (!existing.customerName && custName) existing.customerName = custName;
          if (!existing.city && apt.address_city) existing.city = apt.address_city;
        } else {
          locMap.set(key, {
            lat: apt.lat,
            lng: apt.lng,
            city: apt.address_city ?? undefined,
            address: apt.formatted_address ?? undefined,
            orderRef: apt.order?.order_code ?? undefined,
            orderDesc: apt.order?.description ?? undefined,
            customerName: custName,
            dates: [apt.appointment_date],
          });
        }
      }
    }
    return Array.from(locMap.values());
  }, [appointments]);

  // Fetch meteo sede aziendale (fallback)
  const companyLocationQuery = useQuery({
    queryKey: ["company-location-calendar", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("operational_lat, operational_lng, operational_city, legal_city")
        .eq("id", effectiveCompany!.id)
        .maybeSingle();
      if (error) throw error;
      return {
        lat: data?.operational_lat ?? 45.4654,
        lng: data?.operational_lng ?? 9.1859,
        city: data?.operational_city || data?.legal_city || "Milano",
      };
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 60 * 60 * 1000,
  });
  const companyLoc = companyLocationQuery.data;

  // Meteo multi-location a 14 giorni per ogni cantiere
  // Usa ?? per avere valori stabili fin dal primo render (evita cambio query key
  // quando companyLoc carica e causerebbe il "meteo sparisce" mentre refetcha)
  const { data: calendarWeatherMulti } = useCalendarWeather(
    appointmentLocations,
    companyLoc?.lat ?? 45.4654,
    companyLoc?.lng ?? 9.1859,
    companyLoc?.city ?? "Milano",
  );

  // Converti in formato compatibile (worst-case per giorno)
  const weatherForecast = useMemo(() => {
    if (!calendarWeatherMulti || calendarWeatherMulti.size === 0) return undefined;
    const map = new Map<string, import("@/hooks/useWeatherForecast").WeatherDay>();
    calendarWeatherMulti.forEach((entries, date) => {
      if (entries.length === 0) return;
      if (entries.length === 1) {
        map.set(date, entries[0]);
        return;
      }
      const worst = entries.reduce((a, b) => ({
        maxTemp: Math.max(a.maxTemp, b.maxTemp),
        minTemp: Math.min(a.minTemp, b.minTemp),
        precip: Math.max(a.precip, b.precip),
        code: Math.max(a.code, b.code),
      }));
      map.set(date, worst);
    });
    return map;
  }, [calendarWeatherMulti]);

  // ── Mappa ordine → coordinate cantiere (dagli appuntamenti) ──
  const orderLocations = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; city?: string; address?: string }>();
    for (const apt of appointments) {
      if (apt.order_id && apt.lat && apt.lng && !map.has(apt.order_id)) {
        map.set(apt.order_id, {
          lat: apt.lat,
          lng: apt.lng,
          city: apt.address_city ?? undefined,
          address: apt.formatted_address ?? undefined,
        });
      }
    }
    return map;
  }, [appointments]);

  // ── Distanze reali OSRM (sede → ogni cantiere) ──
  // Genera una query key stabile dalle location uniche
  const orderLocEntries = useMemo(() =>
    Array.from(orderLocations.entries()).sort(([a], [b]) => a.localeCompare(b)),
    [orderLocations]
  );
  const routeQueryKey = useMemo(() =>
    orderLocEntries.map(([id, loc]) => `${id}:${loc.lat},${loc.lng}`).join("|"),
    [orderLocEntries]
  );

  const { data: osrmDistances } = useQuery({
    queryKey: ["osrm-order-distances", companyLoc?.lat, companyLoc?.lng, routeQueryKey],
    queryFn: async () => {
      if (!companyLoc || orderLocEntries.length === 0) return new Map<string, { distanceKm: number; durationMin: number; durationLabel: string }>();

      const results = new Map<string, { distanceKm: number; durationMin: number; durationLabel: string }>();

      // Fetch in parallelo (batch max 10 per evitare rate limiting OSRM)
      const batches = orderLocEntries.slice(0, 10);
      const promises = batches.map(async ([orderId, loc]) => {
        try {
          const coords = `${companyLoc.lng},${companyLoc.lat};${loc.lng},${loc.lat}`;
          const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!res.ok) return null;
          const data = await res.json();
          if (data.code !== "Ok" || !data.routes?.[0]) return null;
          const route = data.routes[0];
          const distanceKm = Math.round(route.distance / 1000);
          const durationMin = Math.round(route.duration / 60);
          const durationLabel = durationMin < 60
            ? `${durationMin} min`
            : `${Math.floor(durationMin / 60)}h ${durationMin % 60}min`;
          return { orderId, distanceKm, durationMin, durationLabel };
        } catch {
          return null;
        }
      });

      const responses = await Promise.all(promises);
      for (const r of responses) {
        if (r) results.set(r.orderId, { distanceKm: r.distanceKm, durationMin: r.durationMin, durationLabel: r.durationLabel });
      }
      return results;
    },
    enabled: !!companyLoc && orderLocEntries.length > 0,
    staleTime: 60 * 60 * 1000, // 1 ora — le distanze non cambiano spesso
    gcTime: 2 * 60 * 60 * 1000,
    retry: 1,
  });

  // ── Mappa finale ordine → meteo + distanza reale ──
  interface OrderWeatherInfo {
    weather?: import("@/hooks/useWeatherForecast").LocationWeatherDay;
    distanceKm?: number;
    durationMin?: number;
    durationLabel?: string;
    address?: string;
  }
  const orderWeatherMap = useMemo(() => {
    const map = new Map<string, OrderWeatherInfo>();
    if (!companyLoc) return map;

    const todayStr = new Date().toISOString().slice(0, 10);
    orderLocations.forEach((loc, orderId) => {
      // Distanza reale da OSRM
      const osrm = osrmDistances?.get(orderId);

      // Meteo per questa location
      let weather: import("@/hooks/useWeatherForecast").LocationWeatherDay | undefined;
      if (calendarWeatherMulti) {
        const dayEntries = calendarWeatherMulti.get(todayStr);
        if (dayEntries) {
          const locKey = `${Math.round(loc.lat * 100)},${Math.round(loc.lng * 100)}`;
          weather = dayEntries.find(e =>
            `${Math.round(e.lat * 100)},${Math.round(e.lng * 100)}` === locKey
          );
          if (!weather && dayEntries.length > 0) weather = dayEntries[0];
        }
      }

      map.set(orderId, {
        weather,
        distanceKm: osrm?.distanceKm,
        durationMin: osrm?.durationMin,
        durationLabel: osrm?.durationLabel,
        address: loc.address,
      });
    });

    return map;
  }, [orderLocations, companyLoc, calendarWeatherMulti, osrmDistances]);

  // Fetch Google Calendar busy slots
  // Squadre con un calendario Google collegato (Calendari lavori): i loro
  // impegni entrano nel layer «occupato» col colore della squadra, anche se
  // chi guarda non ha collegato il PROPRIO Google.
  const { data: squadreGoogle = [] } = useQuery({
    queryKey: ["calendari-lavori", "squadre-google", effectiveCompany?.id],
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("id, name, color, google_calendar_id")
        .eq("company_id", effectiveCompany!.id)
        .not("google_calendar_id", "is", null);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; color: string | null; google_calendar_id: string | null }>;
    },
  });
  const { data: googleBusySlots = [] } = useQuery({
    queryKey: ["gcal-busy-slots", effectiveCompany?.id, permissions.onlyAssigned, user?.id, squadreGoogle.length > 0],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("google_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, google_calendar_id")
        .eq("company_id", effectiveCompany.id);
      // Ruolo ristretto (only_assigned): vede solo il proprio calendario Google.
      if (permissions.onlyAssigned && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as GoogleBusySlot[];
    },
    enabled: !!effectiveCompany?.id && (isGoogleConnected || squadreGoogle.length > 0) && showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Apple Calendar busy slots
  const { data: appleBusySlots = [] } = useQuery({
    queryKey: ["apple-busy-slots", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("apple_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, caldav_calendar_url")
        .eq("company_id", effectiveCompany.id);
      if (permissions.onlyAssigned && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((s: { id: string; start_at: string; end_at: string; summary: string | null; is_all_day: boolean; user_id: string; caldav_calendar_url: string }) => ({
        ...s,
        google_calendar_id: s.caldav_calendar_url,
        provider: "apple",
      })) as GoogleBusySlot[];
    },
    enabled: !!effectiveCompany?.id && isAppleConnected && showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Outlook Calendar busy slots (sola lettura: Microsoft → EiC)
  const { data: outlookBusySlots = [] } = useQuery({
    queryKey: ["outlook-busy-slots", effectiveCompany?.id, permissions.onlyAssigned, user?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("outlook_calendar_busy_slots")
        .select("id, start_at, end_at, summary, is_all_day, user_id, outlook_event_id")
        .eq("company_id", effectiveCompany.id);
      if (permissions.onlyAssigned && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((s: { id: string; start_at: string; end_at: string; summary: string | null; is_all_day: boolean; user_id: string; outlook_event_id: string | null }) => ({
        ...s,
        google_calendar_id: s.outlook_event_id,
        provider: "outlook",
      })) as GoogleBusySlot[];
    },
    enabled: !!effectiveCompany?.id && isOutlookConnected && showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  // 2026-05-26 (audit fix P2): memoizzato per evitare re-render cascata su
  // CalendarDayView/WeekView/MonthView ad ogni cambio filtri/toggle. Senza
  // memo, l'array veniva ricreato ad ogni render → reference inequality →
  // sub-components ri-render anche se i dati non cambiavano.
  const busySlots = useMemo(
    () => {
      const perCalendario = new Map(squadreGoogle.map(t => [t.google_calendar_id, t]));
      return [
        ...googleBusySlots.map(s => {
          const t = s.google_calendar_id ? perCalendario.get(s.google_calendar_id) : undefined;
          return t ? { ...s, team_name: t.name, team_color: t.color } : s;
        }),
        ...appleBusySlots,
        ...outlookBusySlots,
      ];
    },
    [googleBusySlots, appleBusySlots, outlookBusySlots, squadreGoogle],
  );

  // Fetch synced appointment IDs for badge display
  const { data: syncedAppointmentIds } = useQuery({
    queryKey: ["gcal-synced-ids", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return { synced: new Set<string>(), googleImported: new Set<string>() };
      const { data, error } = await supabase
        .from("google_calendar_event_map")
        .select("appointment_id, source")
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      const synced = new Set((data || []).map((r: { appointment_id: string; source: string }) => r.appointment_id));
      const googleImported = new Set((data || []).filter((r: { appointment_id: string; source: string }) => r.source === "google").map((r: { appointment_id: string; source: string }) => r.appointment_id));
      return { synced, googleImported };
    },
    enabled: !!effectiveCompany?.id && isGoogleConnected && showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color")
        .eq("company_id", effectiveCompany.id)
        .order("position");
      
      if (error) throw error;
      return (data || []) as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: companyEmployees = [] } = useQuery({
    queryKey: ["employees-filter", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, user_id, area, role_type")
        .eq("company_id", effectiveCompany.id)
        .eq("is_active", true)
        .order("last_name");
      if (error) {
        // Fallback if area column doesn't exist yet
        const { data: fallback, error: fallbackError } = await supabase
          .from("employees")
          .select("id, first_name, last_name, user_id, role_type")
          .eq("company_id", effectiveCompany.id)
          .eq("is_active", true)
          .order("last_name");
        if (fallbackError) throw fallbackError;
        return ((fallback || []) as CalendarEmployee[]).map((e) => ({
          ...e,
          area: e.role_type === "staff_interno" ? "amministrazione" : "cantiere",
        }));
      }
      return ((data || []) as CalendarEmployee[]).map((e) => ({
        ...e,
        area: e.area || (e.role_type === "staff_interno" ? "amministrazione" : "cantiere"),
      }));
    },
    enabled: !!effectiveCompany?.id,
  });

  // Filter employees by the user's visible_areas permission
  const filteredEmployees = useMemo(() => {
    const areas = permissions.visibleAreas;
    if (!areas || areas.length === 0) return companyEmployees; // Empty = all areas visible
    return companyEmployees.filter((e) => !!e.area && areas.includes(e.area));
  }, [companyEmployees, permissions.visibleAreas]);

  const workEmployees = useMemo(
    () => filteredEmployees.filter(isWorkCalendarEmployee),
    [filteredEmployees],
  );
  const workEmployeeIds = useMemo(
    () => new Set(workEmployees.map((employee) => employee.id)),
    [workEmployees],
  );
  const effectiveWorkVisibleEmployeeIds = useMemo(() => {
    if (!visibleEmployeeIds) return new Set(workEmployeeIds);
    const next = new Set(Array.from(visibleEmployeeIds).filter((id) => workEmployeeIds.has(id)));
    if (next.size === 0 && visibleEmployeeIds.size > 0 && workEmployeeIds.size > 0) {
      return new Set(workEmployeeIds);
    }
    return next;
  }, [visibleEmployeeIds, workEmployeeIds]);

  const { data: externalTeams = [] } = useQuery({
    queryKey: ["external-teams-filter", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      const { data, error } = await supabase
        .from("external_teams")
        .select("id, name, color")
        .eq("company_id", effectiveCompany.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Approved leaves for calendar
  // B11 — usa calendarRangeStart/End invece dell'anno solare fisso
  const { data: approvedLeaves = [] } = useQuery({
    queryKey: ["approved-leaves", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        // Fonte UNICA assenze: hr_richieste approvate (il sistema HR).
        // La vecchia leave_requests è rimasta vuota per sempre: il layer
        // ferie del calendario non ha mai mostrato un'assenza reale.
        const query = (supabase as any)
          .from("hr_richieste")
          .select("id, tipo, data_inizio, data_fine, ore_richieste, profilo:hr_profili!hr_richieste_profilo_id_fkey(id, nome, cognome, employee_id)")
          .eq("company_id", effectiveCompany.id)
          .eq("stato", "approvata")
          .lte("data_inizio", calendarRangeEnd)
          .gte("data_fine", calendarRangeStart)
          .order("data_inizio")
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(query, "Caricamento assenze calendario", 10_000);
        if (error) throw error;
        // Adattatore alla forma storica usata dal resto della pagina.
        return (data ?? []).map((r: any) => ({
          id: r.id,
          employee_id: r.profilo?.employee_id ?? r.profilo?.id ?? null,
          type: r.tipo,
          start_date: r.data_inizio,
          end_date: r.data_fine,
          total_days: null,
          total_hours: r.ore_richieste ?? null,
          employee: r.profilo ? { id: r.profilo.employee_id ?? r.profilo.id, first_name: r.profilo.nome, last_name: r.profilo.cognome } : null,
        }));
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id && showLeaves,
    staleTime: 5 * 60 * 1000,
  });

  // Warehouse items for enriched "Arrivo Merce" events
  const { data: warehouseItems = [] } = useQuery({
    queryKey: ["calendar-warehouse-items", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        const query = supabase
          .from("order_items")
          .select("id, name, status, order_id, order:orders!inner(company_id, warehouse_arrival_date)")
          .eq("order.company_id", effectiveCompany.id)
          .not("order_id", "is", null)
          .not("order.warehouse_arrival_date", "is", null)
          .gte("order.warehouse_arrival_date", calendarRangeStart)
          .lte("order.warehouse_arrival_date", calendarRangeEnd)
          .limit(2500)
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(query, "Caricamento merce calendario", 10_000);
        if (error) throw error;
        return ((data || []) as Array<CalendarWarehouseItem & { order?: { company_id: string; warehouse_arrival_date?: string | null } }>).map(({ order: _order, ...item }) => item);
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id && showMerce,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch interventi (tickets tipo=intervento with data_intervento_prevista in range)
  const { data: calInterventi = [] } = useQuery({
    queryKey: ["cal-interventi", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        const query = supabase
          .from("tickets")
          .select("id, subject, tipo, data_intervento_prevista, status, assigned_to")
          .eq("company_id", effectiveCompany.id)
          .in("tipo", ["intervento", "emergenza"])
          .not("data_intervento_prevista", "is", null)
          .gte("data_intervento_prevista", calendarRangeStart)
          .lte("data_intervento_prevista", calendarRangeEnd)
          .order("data_intervento_prevista")
          .limit(1000)
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(query, "Caricamento interventi calendario", 10_000);
        if (error) throw error;
        return (data ?? []) as CalendarIntervento[];
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id && showInterventi,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Fetch piani manutenzione con prossima_scadenza in range
  const { data: calManutenzioni = [] } = useQuery({
    queryKey: ["cal-manutenzioni", effectiveCompany?.id, calendarRangeStart, calendarRangeEnd],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        const query = supabase
          .from("piani_manutenzione")
          .select("id, titolo, prossima_scadenza, attivo")
          .eq("company_id", effectiveCompany.id)
          .not("prossima_scadenza", "is", null)
          .gte("prossima_scadenza", calendarRangeStart)
          .lte("prossima_scadenza", calendarRangeEnd)
          .order("prossima_scadenza")
          .limit(1000)
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(query, "Caricamento manutenzioni calendario", 10_000);
        if (error) throw error;
        return (data ?? []).map((piano) => ({
          id: piano.id,
          titolo: piano.titolo,
          prossima_scadenza: piano.prossima_scadenza,
          stato: piano.attivo === false ? "inattivo" : "attivo",
        })) as CalendarManutenzione[];
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id && showManutenzioni,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const uniqueCustomers = useMemo(() => {
    const customersMap = new Map<string, CustomerFilter>();
    orders.forEach(order => {
      if (!order.customer_id || !order.customer) return;
      if (!customersMap.has(order.customer_id)) {
        customersMap.set(order.customer_id, {
          id: order.customer_id,
          first_name: order.customer.first_name || "",
          last_name: order.customer.last_name || "Cliente senza nome",
        });
      }
    });
    return Array.from(customersMap.values()).sort((a, b) => 
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    );
  }, [orders]);

  // Build warehouse info map: orderId → CalendarWarehouseInfo
  const warehouseInfoByOrderId = useMemo(() => {
    const map = new Map<string, CalendarWarehouseInfo>();
    for (const item of warehouseItems) {
      if (!item.order_id) continue;
      const order = orders.find(o => o.id === item.order_id);
      if (!order) continue;
      const existing = map.get(item.order_id) ?? {
        orderId: item.order_id,
        orderCode: order.order_code,
        customerName: getPersonName(order.customer?.first_name, order.customer?.last_name, "Cliente non associato"),
        readyCount: 0,
        pendingCount: 0,
        items: [],
      };
      const isReady = item.status === "in_magazzino" || item.status === "installato";
      if (isReady) existing.readyCount++;
      else existing.pendingCount++;
      if (existing.items.length < 10) {
        existing.items.push({ id: item.id, name: item.name, status: item.status ?? "" });
      }
      map.set(item.order_id, existing);
    }
    return map;
  }, [warehouseItems, orders]);

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const { data: assignableUsers = [] } = useCompanyStaffUsers(effectiveCompany?.id);
  const assignableWorkUserIds = useMemo(
    () => new Set(workEmployees.map((employee) => employee.user_id).filter(Boolean) as string[]),
    [workEmployees],
  );
  const assignableWorkUsers = useMemo(
    () => assignableUsers.filter((user) => assignableWorkUserIds.has(user.id)),
    [assignableUsers, assignableWorkUserIds],
  );

  const resetFilters = () => {
    setStatusFilter("all");
    setCustomerFilter("all");
    setEmployeeFilter("all");
    setExternalTeamFilter("all");
    setAssignedToFilter("all");
  };

  const hasActiveFilters = statusFilter !== "all" || customerFilter !== "all" || employeeFilter !== "all" || externalTeamFilter !== "all" || assignedToFilter !== "all";

  // Filter orders that have at least one date
  const scheduledOrders = useMemo(() => {
    return orders
      .filter(order => order.work_start_date || order.expected_date || order.warehouse_arrival_date)
      .filter(order => {
        if (statusFilter !== "all" && order.current_status_id !== statusFilter) {
          return false;
        }
        if (customerFilter !== "all" && order.customer_id !== customerFilter) {
          return false;
        }
        if (employeeFilter !== "all") {
          const hasEmployee = order.order_employees?.some(
            ae => ae.employee?.id === employeeFilter
          );
          if (!hasEmployee) return false;
        }
        if (externalTeamFilter !== "all") {
          const hasTeam = order.order_external_teams?.some(
            aet => aet.external_team?.id === externalTeamFilter
          );
          if (!hasTeam) return false;
        }
        // Resource layer filtering
        const effectiveEmployeeIds = effectiveWorkVisibleEmployeeIds;
        const effectiveTeamIds = visibleTeamIds ?? new Set(externalTeams.map(t => t.id));
        const hasVisibleEmployee = !order.order_employees?.length || order.order_employees.some(ae => !!ae.employee?.id && effectiveEmployeeIds.has(ae.employee.id));
        const hasVisibleTeam = !order.order_external_teams?.length || order.order_external_teams.some(aet => !!aet.external_team?.id && effectiveTeamIds.has(aet.external_team.id));
        if (!hasVisibleEmployee && !hasVisibleTeam) return false;
        return true;
      });
  }, [orders, statusFilter, customerFilter, employeeFilter, externalTeamFilter, effectiveWorkVisibleEmployeeIds, visibleTeamIds, externalTeams]);

  // Enrich appointments with assigned profile names (using cached company profiles)
  const profilesById = useMemo(() => {
    return new Map(companyProfiles.map(p => [p.id, p]));
  }, [companyProfiles]);

  const enrichedAppointments = useMemo(() => {
    return appointments.map(apt => ({
      ...apt,
      assigned_profile: apt.assigned_to ? profilesById.get(apt.assigned_to) ?? null : null,
    }));
  }, [appointments, profilesById]);

  // 2026-05-27: l'array filteredAppointments alimenta tutte le view del
  // calendario operativo. Prima escludeva TUTTI gli appuntamenti senza
  // order_id → invisibili gli appuntamenti commerciali del calendario
  // marketing (lead, sopralluoghi pre-vendita). Per il caso "titolare
  // singolo che fa vendite + pose" servono visibili entrambi.
  //
  // Regola di inclusione:
  //   - Operativi: apt.order_id != null  → SEMPRE visibili (rispettando
  //     showAppuntamento layer).
  //   - Commerciali: apt.calendar_id != null && !order_id → visibili se
  //     showAppuntamentoCommerciale è on.
  // Il filtro assignedToFilter si applica a entrambi.
  const filteredAppointments = useMemo(() => {
    const filtered = enrichedAppointments.filter(apt => {
      const isOperativo = !!apt.order_id;
      const isCommerciale = !apt.order_id && !!apt.calendar_id;
      if (isOperativo) return true; // gestito dal layer showAppuntamento via hiddenEventTypes
      if (isCommerciale) return showAppuntamentoCommerciale;
      return false;
    });
    if (assignedToFilter === "all") return filtered;
    return filtered.filter(apt => apt.assigned_to === assignedToFilter);
  }, [enrichedAppointments, assignedToFilter, showAppuntamentoCommerciale]);

  // Compute hidden event types for views.
  // 2026-05-26 (audit fix P0): i toggle dei layer "Arrivo Merce", "Google Busy",
  // "Ferie/Assenze", "Interventi", "Manutenzioni" venivano SEMPRE aggiunti a
  // hidden, ignorando le flag show*. Le query si attivavano correttamente
  // (carregavano i dati dal DB) ma poi le view filtravano sempre via tutto →
  // l'utente vedeva loading→nulla. Solo posa/lavoro/appuntamento rispettavano
  // il toggle. Ora ogni layer ha il suo `if (!show...) hidden.add(...)`.
  const hiddenEventTypes = useMemo(() => {
    const hidden = new Set<string>();
    if (!showPosa) hidden.add("posa");
    if (!showLavoro) hidden.add("lavoro");
    if (!showAppuntamento) hidden.add("appuntamento");
    if (!showMerce) hidden.add("merce");
    if (!showGoogleBusy) hidden.add("google_busy");
    if (!showLeaves) hidden.add("leaves");
    if (!showInterventi) hidden.add("intervento");
    if (!showManutenzioni) hidden.add("manutenzione");
    return hidden;
  }, [showPosa, showLavoro, showAppuntamento, showMerce, showGoogleBusy, showLeaves, showInterventi, showManutenzioni]);

  // Effective visible sets for layer panel
  const effectiveVisibleEmployees = effectiveWorkVisibleEmployeeIds;
  const effectiveVisibleTeams = useMemo(() => visibleTeamIds ?? new Set(externalTeams.map(t => t.id)), [visibleTeamIds, externalTeams]);

  // M13 — ordini non pianificati con drawer
  const [unplannedOpen, setUnplannedOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [mobileLayerOpen, setMobileLayerOpen] = useState(false);
  const unplannedOrders = useMemo(() => {
    return orders.filter(order => !order.expected_date && !order.work_start_date);
  }, [orders]);
  const unplannedOrdersCount = unplannedOrders.length;

  // Build employee user_id → employee mapping for conflict detection bridge
  const employeeByUserId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const emp of workEmployees) {
      if (emp.user_id) {
        map.set(emp.user_id, { id: emp.id, name: getPersonName(emp.first_name, emp.last_name, "Operatore senza nome") });
      }
    }
    return map;
  }, [workEmployees]);

  // Conflict detection
  const { conflicts, conflictCount } = useConflictDetection(scheduledOrders, filteredAppointments, employeeByUserId);
  const conflictBreakdown = useMemo(() => ({
    employees: conflicts.filter((conflict) => conflict.resourceType === "employee").length,
    teams: conflicts.filter((conflict) => conflict.resourceType === "team").length,
    warnings: conflicts.filter((conflict) => conflict.severity === "warning").length,
  }), [conflicts]);

  const viewStats = useMemo(() => {
    const workDays = scheduledOrders.reduce((total, order) => {
      if (!order.work_start_date) return total;
      const start = new Date(order.work_start_date);
      const end = order.work_end_date ? new Date(order.work_end_date) : start;
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      return total + days;
    }, 0);
    const ordersWithoutTeam = scheduledOrders.filter((order) => {
      const internalCount = order.order_employees?.length ?? 0;
      const externalCount = order.order_external_teams?.length ?? 0;
      return internalCount + externalCount === 0;
    }).length;
    return {
      scheduled: scheduledOrders.length,
      appointments: filteredAppointments.length,
      workDays,
      unplanned: unplannedOrdersCount,
      conflicts: conflictCount,
      ordersWithoutTeam,
    };
  }, [conflictCount, filteredAppointments.length, scheduledOrders, unplannedOrdersCount]);

  const isStatsLoading = isLoading || isAppointmentsLoading;

  return (
    <div className="space-y-4">
      {/* Header compatto: titolo + toggle viste + azioni */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">Calendario Lavori</h1>
          {conflictCount > 0 && (
            <Badge
              variant="destructive"
              className="gap-1 cursor-pointer"
              onClick={() => setConflictsOpen(true)}
              title={`${conflictCount} conflitti di risorse rilevati`}
            >
              <AlertTriangle className="h-3 w-3" />
              {conflictCount} conflitti
            </Badge>
          )}
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => value && setView(value as CalendarViewType)}
          className="bg-muted rounded-lg p-1"
        >
          <ToggleGroupItem value="month" aria-label="Vista Mese" className="gap-1.5 px-2.5">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Mese</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="week" aria-label="Vista Settimana" className="gap-1.5 px-2.5">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Settimana</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="day" aria-label="Vista Giorno" className="gap-1.5 px-2.5">
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Giorno</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="heatmap" aria-label="Vista Carico" className="gap-1.5 px-2.5">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Carico</span>
          </ToggleGroupItem>
          {!isMobile && (
            <ToggleGroupItem value="gantt" aria-label="Vista Gantt" className="gap-1.5 px-2.5">
              <GanttChart className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Gantt</span>
            </ToggleGroupItem>
          )}
        </ToggleGroup>

        <div className="flex items-center gap-2">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 relative">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filtri</span>
                {hasActiveFilters && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {[statusFilter, customerFilter, employeeFilter, externalTeamFilter, assignedToFilter].filter(f => f !== "all").length}
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>

          <Button variant="outline" size="sm" onClick={goToToday} className="gap-1.5">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Oggi</span>
          </Button>

          <Button variant="default" size="sm" onClick={() => setAppointmentDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Appuntamento</span>
          </Button>

          {isGoogleConnected && (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-300 hidden sm:flex">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-xs">Google Sync</span>
            </Badge>
          )}
          {isAppleConnected && (
            <Badge variant="outline" className="gap-1 text-gray-600 border-gray-300 hidden sm:flex">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-xs">Apple Sync</span>
            </Badge>
          )}
          {isOutlookConnected && (
            <Badge variant="outline" className="gap-1 text-indigo-700 border-indigo-300 hidden sm:flex">
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-xs">Outlook Sync</span>
            </Badge>
          )}

          {/* Secondary actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => isMobile ? setMobileLayerOpen(true) : setLayerPanelOpen(!layerPanelOpen)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {layerPanelOpen && !isMobile ? "Nascondi Layer" : "Mostra Layer"}
              </DropdownMenuItem>
              {isGoogleConnected && (
                <DropdownMenuItem
                  disabled={syncing}
                  onSelect={async () => {
                    setSyncing(true);
                    try {
                      const result = await pullBusySlots();
                      queryClient.invalidateQueries({ queryKey: ["gcal-busy-slots"] });
                      queryClient.invalidateQueries({ queryKey: ["gcal-synced-ids"] });
                      queryClient.invalidateQueries({ queryKey: ["appointments"] });
                      const pulled = typeof result === "object" && result !== null && "pulled" in result
                        ? Number((result as { pulled?: unknown }).pulled ?? 0)
                        : 0;
                      toast.success("Sincronizzazione completata", {
                        description: `${pulled} eventi importati`,
                      });
                    } catch {
                      toast.error("Errore sincronizzazione Google Calendar");
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="gap-2"
                >
                  <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                  Sync Google Calendar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => exportAppointmentsIcal(filteredAppointments, scheduledOrders)}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Esporta iCal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filtri attivi come chip */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Stato: {statuses.find(s => s.id === statusFilter)?.name ?? statusFilter}
              <button onClick={() => setStatusFilter("all")} className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {customerFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Cliente: {uniqueCustomers.find(c => c.id === customerFilter)?.last_name ?? customerFilter}
              <button onClick={() => setCustomerFilter("all")} className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {employeeFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Operaio: {workEmployees.find(e => e.id === employeeFilter)?.last_name ?? employeeFilter}
              <button onClick={() => setEmployeeFilter("all")} className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {externalTeamFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Squadra: {externalTeams.find(t => t.id === externalTeamFilter)?.name ?? externalTeamFilter}
              <button onClick={() => setExternalTeamFilter("all")} className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {assignedToFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Assegnato: {assignableWorkUsers.find(u => u.id === assignedToFilter)?.last_name ?? assignedToFilter}
              <button onClick={() => setAssignedToFilter("all")} className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground underline">
            Resetta tutti
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lavori pianificati</p>
          {isStatsLoading ? <Skeleton className="mt-2 h-6 w-12" /> : <p className="mt-1 text-xl font-bold">{viewStats.scheduled}</p>}
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Giornate lavoro</p>
          {isStatsLoading ? <Skeleton className="mt-2 h-6 w-12" /> : <p className="mt-1 text-xl font-bold">{viewStats.workDays}</p>}
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Appuntamenti</p>
          {isStatsLoading ? <Skeleton className="mt-2 h-6 w-12" /> : <p className="mt-1 text-xl font-bold">{viewStats.appointments}</p>}
        </div>
        <button
          type="button"
          onClick={() => viewStats.unplanned > 0 && setUnplannedOpen(true)}
          className={cn(
            "rounded-lg border bg-card px-3 py-2 text-left transition-colors",
            viewStats.unplanned > 0 && "border-amber-200 bg-amber-50 hover:bg-amber-100"
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Da pianificare</p>
          {isStatsLoading ? <Skeleton className="mt-2 h-6 w-12" /> : <p className={cn("mt-1 text-xl font-bold", viewStats.unplanned > 0 && "text-amber-700")}>{viewStats.unplanned}</p>}
        </button>
        <button
          type="button"
          onClick={() => viewStats.conflicts > 0 && setConflictsOpen(true)}
          className={cn(
            "rounded-lg border bg-card px-3 py-2 text-left transition-colors",
            viewStats.conflicts > 0 && "border-red-200 bg-red-50 hover:bg-red-100"
          )}
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Conflitti</p>
          {isStatsLoading ? <Skeleton className="mt-2 h-6 w-12" /> : <p className={cn("mt-1 text-xl font-bold", viewStats.conflicts > 0 && "text-red-700")}>{viewStats.conflicts}</p>}
        </button>
      </div>

      {viewStats.ordersWithoutTeam > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{viewStats.ordersWithoutTeam} lavori pianificati non hanno ancora operai o subappaltatori assegnati.</span>
        </div>
      )}

      {/* Mobile Layer Sheet */}
      {isMobile && (
        <Sheet open={mobileLayerOpen} onOpenChange={setMobileLayerOpen}>
          <SheetContent side="bottom" className="h-[80dvh]">
            <SheetHeader>
              <SheetTitle>Gestisci visualizzazione</SheetTitle>
            </SheetHeader>
            <div className="mt-4 overflow-y-auto">
              <CalendarLayerPanel
                scope="work"
                employees={workEmployees}
                externalTeams={externalTeams}
                visibleEmployees={effectiveVisibleEmployees}
                visibleTeams={effectiveVisibleTeams}
                showPosa={showPosa}
                showLavoro={showLavoro}
                showAppuntamento={showAppuntamento}
                showAppuntamentoCommerciale={showAppuntamentoCommerciale}
                showMerce={showMerce}
                showGoogleBusy={showGoogleBusy}
                showLeaves={showLeaves}
                showWeather={showWeather}
                showInterventi={showInterventi}
                showManutenzioni={showManutenzioni}
                onToggleEmployee={(id) => {
                  const next = new Set(effectiveVisibleEmployees);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  setVisibleEmployeeIds(next);
                }}
                onToggleTeam={(id) => {
                  const next = new Set(effectiveVisibleTeams);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  setVisibleTeamIds(next);
                }}
                onToggleAllEmployees={(v) => {
                  setVisibleEmployeeIds(v ? new Set(workEmployees.map(e => e.id)) : new Set());
                }}
                onToggleAllTeams={(v) => {
                  setVisibleTeamIds(v ? new Set(externalTeams.map(t => t.id)) : new Set());
                }}
                onTogglePosa={(v) => setLayer("showPosa", v)}
                onToggleLavoro={(v) => setLayer("showLavoro", v)}
                onToggleAppuntamento={(v) => setLayer("showAppuntamento", v)}
                onToggleAppuntamentoCommerciale={(v) => setLayer("showAppuntamentoCommerciale", v)}
                onToggleMerce={(v) => setLayer("showMerce", v)}
                onToggleGoogleBusy={(v) => setLayer("showGoogleBusy", v)}
                onToggleLeaves={(v) => setLayer("showLeaves", v)}
                onToggleWeather={(v) => setLayer("showWeather", v)}
                onToggleInterventi={(v) => setLayer("showInterventi", v)}
                onToggleManutenzioni={(v) => setLayer("showManutenzioni", v)}
                eventColors={eventColors}
                onEventColorChange={setEventColor}
                onResetEventColors={() => setEventColors(DEFAULT_CALENDAR_EVENT_COLORS)}
                colorMode={colorMode}
                onColorModeChange={setColorMode}
                onTeamColorChange={onTeamColorChange}
                avvisiPagamento={avvisiPagamento}
                onAvvisiPagamentoChange={setAvvisiPagamento}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Pannello filtri collassabile */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[170px]">
                  <SelectValue placeholder="Tutti gli stati" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: status.color }} />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tutti i clienti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i clienti</SelectItem>
                  {uniqueCustomers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.last_name} {customer.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tutti gli operai" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli operai</SelectItem>
                  {workEmployees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.last_name} {emp.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={externalTeamFilter} onValueChange={setExternalTeamFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tutte le squadre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le squadre</SelectItem>
                  {externalTeams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Assegnato a" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli utenti</SelectItem>
                  {assignableWorkUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.last_name} {user.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5">
                  <RotateCcw className="h-4 w-4" />
                  Resetta
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {scheduledOrders.length} {scheduledOrders.length === 1 ? "ordine" : "ordini"}
              </Badge>
              {unplannedOrdersCount > 0 && (
                <Badge
                  variant="destructive"
                  className="gap-1 cursor-pointer"
                  onClick={() => setUnplannedOpen(true)}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {unplannedOrdersCount} non pianificati
                </Badge>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p>Errore nel caricamento dei dati del calendario</p>
              <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all })}>
                Riprova
              </Button>
            </div>
          ) : view === "month" ? (
            <CalendarMonthView
              orders={scheduledOrders}
              appointments={filteredAppointments}
              busySlots={showGoogleBusy ? busySlots : []}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              syncedAppointmentIds={syncedAppointmentIds?.synced}
              hiddenEventTypes={hiddenEventTypes}
              approvedLeaves={showLeaves ? approvedLeaves : []}
              warehouseInfo={warehouseInfoByOrderId}
              weatherForecast={showWeather ? weatherForecast : undefined}
              calendarWeatherMulti={showWeather ? calendarWeatherMulti : undefined}
              orderWeatherMap={showWeather ? orderWeatherMap : undefined}
              interventi={showInterventi ? calInterventi : []}
              manutenzioni={showManutenzioni ? calManutenzioni : []}
              eventColors={eventColors}
              orderColorFn={orderColorFn}
              onOpenDay={(date) => {
                setCurrentDate(date);
                setView("day");
              }}
            />
          ) : view === "week" ? (
            <CalendarWeekView
              orders={scheduledOrders}
              appointments={filteredAppointments}
              busySlots={showGoogleBusy ? busySlots : []}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              syncedAppointmentIds={syncedAppointmentIds?.synced}
              hiddenEventTypes={hiddenEventTypes}
              approvedLeaves={showLeaves ? approvedLeaves : []}
              warehouseInfo={warehouseInfoByOrderId}
              weatherForecast={showWeather ? weatherForecast : undefined}
              calendarWeatherMulti={showWeather ? calendarWeatherMulti : undefined}
              orderWeatherMap={showWeather ? orderWeatherMap : undefined}
              interventi={showInterventi ? calInterventi : []}
              manutenzioni={showManutenzioni ? calManutenzioni : []}
              eventColors={eventColors}
              orderColorFn={orderColorFn}
            />
          ) : view === "day" ? (
            <CalendarDayView
              orders={scheduledOrders}
              appointments={filteredAppointments}
              busySlots={showGoogleBusy ? busySlots : []}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              syncedAppointmentIds={syncedAppointmentIds?.synced}
              hiddenEventTypes={hiddenEventTypes}
              approvedLeaves={showLeaves ? approvedLeaves : []}
              warehouseInfo={warehouseInfoByOrderId}
              weatherForecast={showWeather ? weatherForecast : undefined}
              calendarWeatherMulti={showWeather ? calendarWeatherMulti : undefined}
              orderWeatherMap={showWeather ? orderWeatherMap : undefined}
              interventi={showInterventi ? calInterventi : []}
              manutenzioni={showManutenzioni ? calManutenzioni : []}
              eventColors={eventColors}
              orderColorFn={orderColorFn}
            />
          ) : view === "heatmap" ? (
            <CalendarHeatmapView
              orders={scheduledOrders}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              employees={workEmployees}
              appointments={filteredAppointments}
            />
          ) : (
            <CalendarGanttView
              orders={scheduledOrders}
              allOrders={orders}
              statuses={statuses}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              interventi={showInterventi ? calInterventi : []}
              manutenzioni={showManutenzioni ? calManutenzioni : []}
              appointments={filteredAppointments}
              orderColorFn={orderColorFn}
            />
          )}
        </div>

        {layerPanelOpen && !isMobile && (
          <CalendarLayerPanel
            scope="work"
            employees={workEmployees}
            externalTeams={externalTeams}
            visibleEmployees={effectiveVisibleEmployees}
            visibleTeams={effectiveVisibleTeams}
            showPosa={showPosa}
            showLavoro={showLavoro}
            showAppuntamento={showAppuntamento}
            showAppuntamentoCommerciale={showAppuntamentoCommerciale}
            showMerce={showMerce}
            showGoogleBusy={showGoogleBusy}
            showLeaves={showLeaves}
            showWeather={showWeather}
            showInterventi={showInterventi}
            showManutenzioni={showManutenzioni}
            onToggleEmployee={(id) => {
              const next = new Set(effectiveVisibleEmployees);
              if (next.has(id)) next.delete(id); else next.add(id);
              setVisibleEmployeeIds(next);
            }}
            onToggleTeam={(id) => {
              const next = new Set(effectiveVisibleTeams);
              if (next.has(id)) next.delete(id); else next.add(id);
              setVisibleTeamIds(next);
            }}
            onToggleAllEmployees={(v) => {
              setVisibleEmployeeIds(v ? new Set(workEmployees.map(e => e.id)) : new Set());
            }}
            onToggleAllTeams={(v) => {
              setVisibleTeamIds(v ? new Set(externalTeams.map(t => t.id)) : new Set());
            }}
            onTogglePosa={(v) => setLayer("showPosa", v)}
            onToggleLavoro={(v) => setLayer("showLavoro", v)}
            onToggleAppuntamento={(v) => setLayer("showAppuntamento", v)}
            onToggleAppuntamentoCommerciale={(v) => setLayer("showAppuntamentoCommerciale", v)}
            onToggleMerce={(v) => setLayer("showMerce", v)}
            onToggleGoogleBusy={(v) => setLayer("showGoogleBusy", v)}
            onToggleLeaves={(v) => setLayer("showLeaves", v)}
            onToggleWeather={(v) => setLayer("showWeather", v)}
            onToggleInterventi={(v) => setLayer("showInterventi", v)}
            onToggleManutenzioni={(v) => setLayer("showManutenzioni", v)}
            eventColors={eventColors}
            onEventColorChange={setEventColor}
            onResetEventColors={() => setEventColors(DEFAULT_CALENDAR_EVENT_COLORS)}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            onTeamColorChange={onTeamColorChange}
            avvisiPagamento={avvisiPagamento}
            onAvvisiPagamentoChange={setAvvisiPagamento}
          />
        )}
      </div>

      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        hideMarketingFields
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }}
        showOrderSelect={true}
      />

      {/* M13 — Drawer ordini non pianificati */}
      <Sheet open={unplannedOpen} onOpenChange={setUnplannedOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Da pianificare ({unplannedOrders.length})
            </SheetTitle>
            <SheetDescription>
              Questi ordini non hanno ancora una data di posa o inizio lavori.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2 overflow-y-auto flex-1">
            {unplannedOrders.map(order => (
              <div key={order.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {order.order_code ? `${order.order_code} · ` : ""}
                    {getPersonName(order.customer?.first_name, order.customer?.last_name, "Cliente non associato")}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{order.description}</p>
                </div>
                <Link
                  to={`/azienda/ordini/${order.id}`}
                  onClick={() => setUnplannedOpen(false)}
                  className="shrink-0"
                >
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Pianifica
                  </Button>
                </Link>
              </div>
            ))}
            {unplannedOrders.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                Tutti gli ordini hanno una data pianificata.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      {/* Conflicts Sheet */}
      <Sheet open={conflictsOpen} onOpenChange={setConflictsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Conflitti risorse ({conflictCount})
            </SheetTitle>
            <SheetDescription>
              Operai, squadre e appuntamenti collegati alle commesse con assegnazioni incoerenti.
            </SheetDescription>
          </SheetHeader>
          {conflicts.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border bg-card px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Operai</p>
                <p className="font-semibold">{conflictBreakdown.employees}</p>
              </div>
              <div className="rounded-lg border bg-card px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Squadre</p>
                <p className="font-semibold">{conflictBreakdown.teams}</p>
              </div>
              <div className="rounded-lg border bg-card px-2 py-1.5">
                <p className="text-[10px] uppercase text-muted-foreground">Avvisi</p>
                <p className="font-semibold">{conflictBreakdown.warnings}</p>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto space-y-3 mt-4">
            {conflicts.map((conflict, idx) => (
              <div
                key={`${conflict.date}-${conflict.resourceType}-${conflict.resourceId}-${idx}`}
                className={cn(
                  "border rounded-lg p-3 space-y-2",
                  conflict.severity === "warning"
                    ? "border-amber-300 bg-amber-50"
                    : "border-destructive/30 bg-destructive/5"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{conflict.resourceName}</p>
                      <Badge variant={conflict.severity === "warning" ? "secondary" : "destructive"} className="text-[10px]">
                        {conflict.resourceType === "team" ? "Squadra" : conflict.resourceType === "assignment" ? "Assegnazione" : "Operaio"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{conflict.date}</p>
                    <p className="text-xs text-muted-foreground mt-1">{conflict.reason}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs shrink-0"
                            disabled
                          >
                            Notifica
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Configura le email dei dipendenti per attivare le notifiche</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="space-y-1">
                  {conflict.events.map((evt, ei) => (
                    <div key={ei} className={`text-xs px-2 py-0.5 rounded flex items-center gap-1.5 ${evt.type === "order" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"}`}>
                      <span>{evt.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {conflicts.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                Nessun conflitto rilevato.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function Calendar() {
  return (
    <ErrorBoundary title="Errore nel calendario">
      <CalendarInner />
    </ErrorBoundary>
  );
}

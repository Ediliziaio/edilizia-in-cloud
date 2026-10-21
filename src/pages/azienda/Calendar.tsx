import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useCalendarLeaves } from "@/hooks/useCalendarLeaves";
import { CalendarTeamWeekView } from "@/components/calendar/CalendarTeamWeekView";
import { CalendarConflictsPanel } from "@/components/calendar/CalendarConflictsPanel";
import { groupCalendarConflicts } from "@/lib/calendar/conflicts";
import { useWorkCalendarData } from "@/hooks/useWorkCalendarData";
import {
  calendarPeriod,
  orderInCalendarPeriod,
  filterPlanningAppointments,
} from "@/lib/calendar/planning";
import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { useGoogleCalendarSync } from "@/hooks/useGoogleCalendarSync";
import { useAppleCalendarSync } from "@/hooks/useAppleCalendarSync";
import { useOutlookCalendarSync } from "@/hooks/useOutlookCalendarSync";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import {
  useCalendarWeather,
  type CalendarLocation,
  type WeatherDay,
} from "@/hooks/useWeatherForecast";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { campoDayWindow } from "@/lib/campo/timeSummary";
import { CalendarDayView } from "@/components/calendar/CalendarDayView";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";

import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import { useConflictDetection } from "@/hooks/useConflictDetection";
import { CalendarLayerPanel } from "@/components/calendar/CalendarLayerPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  RotateCcw,
  AlertTriangle,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Eye,
  Download,
  MoreHorizontal,
  X,
  CheckCircle2,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { exportAppointmentsIcal } from "@/lib/icalExport";
import { createTimeoutSignal, withClientTimeout } from "@/lib/query-timeout";
import { cn } from "@/lib/utils";
import type {
  GanttZoom,
  CalendarOrder,
  CalendarViewType,
  OrderStatus,
  CustomerFilter,
  GoogleBusySlot,
  CalendarWarehouseInfo,
  CalendarIntervento,
  CalendarManutenzione,
  CalendarScope,
} from "@/types/calendar";
import {
  AppointmentDialog,
  type AppointmentData,
} from "@/components/appointments/AppointmentDialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BottoneFiltri,
  PannelloFiltri,
} from "@/components/mobile/FiltriMobile";
import {
  DEFAULT_CALENDAR_EVENT_COLORS,
  mapAppointmentToEditData,
  normalizeCalendarEventColors,
  orderColor,
  type CalendarEventColorKey,
  type CalendarColorMode,
  type CalendarAvvisiPagamento,
} from "@/lib/calendarUtils";
import { messaggioRata } from "@/lib/orders/rateEventi";
import { CalendarPlanningResourcePanel } from "@/components/calendar/CalendarPlanningResourcePanel";
import { CalendarViewNavigation } from "@/components/calendar/CalendarViewNavigation";
import {
  isCalendarPlanningView,
  normalizeCalendarView,
} from "@/lib/calendar/viewModes";

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

const getPersonName = (
  firstName?: string | null,
  lastName?: string | null,
  fallback = "Senza nome",
) => {
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
  const canViewTeam =
    !permissions.onlyAssigned &&
    (permissions.isAdmin || permissions.canViewAllTeamCalendar);
  const companyId = effectiveCompany?.id;
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isGoogleConnected, pullBusySlots } = useGoogleCalendarSync();
  const { isAppleConnected } = useAppleCalendarSync();
  const { isOutlookConnected } = useOutlookCalendarSync();
  const [view, setViewState] = useState<CalendarViewType>(() =>
    normalizeCalendarView(searchParams.get("view"), isMobile, canViewTeam),
  );
  const planningView = isCalendarPlanningView(view);
  const [refreshingCalendar, setRefreshingCalendar] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [ganttZoom, setGanttZoom] = useState<GanttZoom>("quarter");
  const [search, setSearch] = useState("");
  const prefKey = `work-calendar-v2:${effectiveCompany?.id}:${user?.id}`;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [externalTeamFilter, setExternalTeamFilter] = useState<string>("all");
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [editingAppointment, setEditingAppointment] =
    useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  // Layer visibility state — initialize from localStorage (parse once)
  const savedPrefs = useMemo(() => {
    try {
      const value = JSON.parse(localStorage.getItem(prefKey) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch {
      return {};
    }
  }, [prefKey]);
  const [requestedScope, setRequestedScope] = useState<CalendarScope>(() =>
    canViewTeam && savedPrefs.calendarScope === "team" ? "team" : "personal",
  );
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({
    showPosa: savedPrefs.showPosa ?? true,
    showLavoro: savedPrefs.showLavoro ?? true,
    showAppuntamento: savedPrefs.showAppuntamento ?? true,
    // 2026-05-27: nuovo layer "Commerciale" = appuntamenti con
    // calendar_id (legati a marketing_calendars). Default ON così il
    // titolare singolo (che fa vendite + pose) vede tutto. Chi ha squadre
    // operative dedicate può spegnerlo per ridurre il rumore.
    showAppuntamentoCommerciale:
      savedPrefs.showAppuntamentoCommerciale ?? false,
    showMerce: savedPrefs.showMerce === true,
    showGoogleBusy: savedPrefs.showGoogleBusy === true,
    showLeaves: savedPrefs.showLeaves === true,
    showWeather: savedPrefs.showWeather === true,
    showInterventi: savedPrefs.showInterventi === true,
    showManutenzioni: savedPrefs.showManutenzioni === true,
  });
  const setLayer = useCallback(
    (layer: keyof typeof layerVisibility, v: boolean) => {
      setLayerVisibility((prev) => ({ ...prev, [layer]: v }));
    },
    [],
  );
  const [eventColors, setEventColors] = useState(() =>
    normalizeCalendarEventColors(savedPrefs.eventColors),
  );
  const setEventColor = useCallback(
    (key: CalendarEventColorKey, color: string) => {
      setEventColors((prev) => ({ ...prev, [key]: color }));
    },
    [],
  );
  // Colore delle barre lavoro: per COMMESSA (default: con 6 cantieri aperti
  // il verde unico non dice quale striscia è quale), per SQUADRA (chi ci
  // lavora), o per TIPO evento (il comportamento storico coi colori sotto).
  const [colorMode, setColorMode] = useState<CalendarColorMode>(() => {
    const m = savedPrefs.colorMode;
    if (m === "tipo" || m === "commessa" || m === "squadra") return m;
    return "commessa";
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
  const [avvisiPagamento, setAvvisiPagamento] =
    useState<CalendarAvvisiPagamento>(() => {
      const a = savedPrefs.avvisiPagamento;
      return a === "tutti" || a === "rossi" || a === "off" ? a : "off";
    });
  // Il colore squadra è dell'AZIENDA (tutti lo vedono uguale), quindi vive
  // su external_teams e non nelle preferenze locali del browser.
  const onTeamColorChange = useCallback(
    async (teamId: string, color: string) => {
      if (
        !companyId ||
        !permissions.canEditSettingsCustomization ||
        permissions.solaLettura
      ) {
        toast.error("Non puoi modificare i colori delle squadre");
        return;
      }
      const { error } = await supabase
        .from("external_teams")
        .update({ color } as never)
        .eq("id", teamId)
        .eq("company_id", companyId)
        .select("id")
        .single();
      if (error) {
        toast.error("Colore squadra non salvato");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["external-teams-filter"] });
      queryClient.invalidateQueries({
        queryKey: queryKeys.calendarOrders.list(companyId),
      });
    },
    [
      queryClient,
      companyId,
      permissions.canEditSettingsCustomization,
      permissions.solaLettura,
    ],
  );
  const {
    showPosa,
    showLavoro,
    showAppuntamento,
    showAppuntamentoCommerciale,
    showMerce,
    showGoogleBusy,
    showLeaves,
    showWeather,
    showInterventi,
    showManutenzioni,
  } = layerVisibility;
  // Robusto contro localStorage corrotto o di vecchie versioni: SOLO un array
  // diventa un Set; qualsiasi altro valore (stringa, numero, oggetto, ecc.)
  // viene trattato come null (= "mostra tutti"). Prima `new Set(valore)` su un
  // valore non iterabile lanciava "X is not iterable" durante l'init, mandando
  // l'intera pagina nell'ErrorBoundary ("il calendario non si apre").
  const [visibleEmployeeIds, setVisibleEmployeeIds] =
    useState<Set<string> | null>(() =>
      Array.isArray(savedPrefs.visibleEmployeeIds)
        ? new Set<string>(savedPrefs.visibleEmployeeIds.map(String))
        : null,
    );
  const [visibleTeamIds, setVisibleTeamIds] = useState<Set<string> | null>(
    () =>
      Array.isArray(savedPrefs.visibleTeamIds)
        ? new Set<string>(savedPrefs.visibleTeamIds.map(String))
        : null,
  );

  useEffect(() => {
    if (permissions.isLoading) return;
    const requestedView = searchParams.get("view");
    const nextView = normalizeCalendarView(
      requestedView,
      isMobile,
      canViewTeam,
    );
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled)
        setViewState((prev) => (prev === nextView ? prev : nextView));
    });
    if (requestedView && requestedView !== nextView) {
      const nextParams = new URLSearchParams(searchParams);
      if (nextView === "month") nextParams.delete("view");
      else nextParams.set("view", nextView);
      setSearchParams(nextParams, { replace: true });
    }
    return () => {
      cancelled = true;
    };
  }, [
    searchParams,
    isMobile,
    canViewTeam,
    setSearchParams,
    permissions.isLoading,
  ]);

  const setView = useCallback(
    (nextView: CalendarViewType) => {
      const safeView = normalizeCalendarView(nextView, isMobile, canViewTeam);
      setViewState(safeView);
      const nextParams = new URLSearchParams(searchParams);
      if (safeView === "month") nextParams.delete("view");
      else nextParams.set("view", safeView);
      setSearchParams(nextParams, { replace: true });
    },
    [isMobile, canViewTeam, searchParams, setSearchParams],
  );

  // Persist layer prefs to localStorage (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const prefs = {
        calendarScope: canViewTeam ? requestedScope : "personal",
        ...layerVisibility,
        visibleEmployeeIds: visibleEmployeeIds
          ? Array.from(visibleEmployeeIds)
          : null,
        visibleTeamIds: visibleTeamIds ? Array.from(visibleTeamIds) : null,
        eventColors,
        colorMode,
        avvisiPagamento,
      };
      try {
        localStorage.setItem(prefKey, JSON.stringify(prefs));
      } catch {
        /* Preferenza locale facoltativa. */
      }
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    prefKey,
    canViewTeam,
    requestedScope,
    layerVisibility,
    visibleEmployeeIds,
    visibleTeamIds,
    eventColors,
    colorMode,
    avvisiPagamento,
  ]);

  const visiblePeriod = useMemo(
    () => calendarPeriod(currentDate, view, ganttZoom),
    [currentDate, view, ganttZoom],
  );
  const calendarRangeStart =
    view === "month"
      ? format(
          startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        )
      : visiblePeriod.from;
  const calendarRangeEnd =
    view === "month"
      ? format(
          endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
          "yyyy-MM-dd",
        )
      : visiblePeriod.to;
  const calendarData = useWorkCalendarData(
    calendarRangeStart,
    calendarRangeEnd,
    requestedScope,
  );
  const { data: ordersRaw = [], isLoading, isError } = calendarData.orders;
  const { data: appointments = [], isLoading: isAppointmentsLoading } =
    calendarData.appointments;
  const { data: unplannedData = [] } = calendarData.unplanned;

  // Rate cliente NON incassate delle commesse in vista: alimentano l'avviso
  // "stai iniziando un lavoro ma il cliente non ha pagato" (acconto scoperto)
  // e "lavori chiusi, saldo da incassare". Solo i tipi cliente-dovuti:
  // il financing lo paga la finanziaria dopo la fine, non è un ritardo.
  const orderIdsKey = useMemo(
    () =>
      ordersRaw
        .map((o) => o.id)
        .sort()
        .join(","),
    [ordersRaw],
  );
  // Forma dei pagamenti scoperti per commessa, con la quota in preavviso.
  type ScopertiCommessa = {
    acconto_eur: number;
    saldo_eur: number;
    preavviso_eur?: number;
    preavviso_giorni?: number;
    preavviso_messaggio?: string;
  };
  type RigaRataScoperta = {
    order_id: string;
    type: string;
    amount: number | null;
    label: string | null;
    trigger_evento: string | null;
    stato_incasso: string | null;
    giorni_all_evento: number | null;
  };

  const { data: scopertiMap } = useQuery({
    queryKey: [
      "calendar-installments-scoperti",
      effectiveCompany?.id,
      orderIdsKey,
    ],
    enabled:
      !!effectiveCompany?.id &&
      !permissions.isLoading &&
      permissions.canViewScadenzario &&
      avvisiPagamento !== "off" &&
      ordersRaw.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const ids = ordersRaw.map((o) => o.id);
      const out = new Map<string, ScopertiCommessa>();
      // La vista sa quando la rata scade DAVVERO: se è agganciata a un evento
      // del cantiere (inizio lavori, arrivo merce…) la data la calcola lei e si
      // sposta insieme al cantiere.
      // Blocchi piccoli evitano URL troppo lunghi con molte commesse.
      for (let i = 0; i < ids.length; i += 400) {
        const { data, error } = await supabase
          .from("v_rate_commessa_stato")
          .select(
            "order_id, type, amount, label, trigger_evento, stato_incasso, giorni_all_evento",
          )
          .in("order_id", ids.slice(i, i + 400))
          .eq("is_paid", false)
          .in("type", ["deposit", "balance"]);
        if (error) throw error;
        for (const r of (data ?? []) as RigaRataScoperta[]) {
          const cur = out.get(r.order_id) ?? {
            acconto_eur: 0,
            saldo_eur: 0,
            preavviso_eur: 0,
          };
          const importo = Number(r.amount || 0);
          if (r.type === "deposit") cur.acconto_eur += importo;
          else cur.saldo_eur += importo;
          // Preavviso: evento vicino ma non ancora arrivato. Il messaggio lo
          // costruisce la rata più imminente, che è quella di cui parlare.
          if (r.stato_incasso === "preavviso") {
            cur.preavviso_eur = (cur.preavviso_eur ?? 0) + importo;
            const giorni = r.giorni_all_evento;
            if (
              cur.preavviso_giorni === undefined ||
              (giorni !== null && giorni < cur.preavviso_giorni)
            ) {
              cur.preavviso_giorni = giorni ?? undefined;
              cur.preavviso_messaggio =
                messaggioRata({
                  stato: "preavviso",
                  evento: r.trigger_evento,
                  giorni,
                  importoEur: importo,
                }) ?? undefined;
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
    if (
      !permissions.canViewScadenzario ||
      avvisiPagamento === "off" ||
      !scopertiMap ||
      scopertiMap.size === 0
    )
      return ordersRaw;
    return ordersRaw.map((o) => {
      const raw = scopertiMap.get(o.id);
      if (!raw) return o;
      // "Solo rossi": l'ambra nasce dal saldo → azzerandolo resta solo
      // l'avviso acconto (rosso), senza toccare la logica nelle viste.
      const sc =
        avvisiPagamento === "rossi"
          ? {
              acconto_eur: raw.acconto_eur,
              saldo_eur: 0,
              preavviso_eur: raw.preavviso_eur,
              preavviso_messaggio: raw.preavviso_messaggio,
            }
          : raw;
      return sc.acconto_eur > 0 ||
        sc.saldo_eur > 0 ||
        (sc.preavviso_eur ?? 0) > 0
        ? { ...o, pagamenti_scoperti: sc }
        : o;
    });
  }, [ordersRaw, scopertiMap, avvisiPagamento, permissions.canViewScadenzario]);

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
          if (!existing.address && apt.formatted_address)
            existing.address = apt.formatted_address;
          if (!existing.orderRef && apt.order?.order_code)
            existing.orderRef = apt.order.order_code;
          if (!existing.orderDesc && apt.order?.description)
            existing.orderDesc = apt.order.description;
          if (!existing.customerName && custName)
            existing.customerName = custName;
          if (!existing.city && apt.address_city)
            existing.city = apt.address_city;
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
        .select(
          "operational_lat, operational_lng, operational_city, legal_city",
        )
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
    if (!calendarWeatherMulti || calendarWeatherMulti.size === 0)
      return undefined;
    const map = new Map<
      string,
      import("@/hooks/useWeatherForecast").WeatherDay
    >();
    calendarWeatherMulti.forEach((entries, date) => {
      if (entries.length === 0) return;
      if (entries.length === 1) {
        map.set(date, entries[0]);
        return;
      }
      const worst = entries.reduce<WeatherDay>(
        (a, b) => ({
          maxTemp: Math.max(a.maxTemp, b.maxTemp),
          minTemp: Math.min(a.minTemp, b.minTemp),
          precip: Math.max(a.precip, b.precip),
          code: Math.max(a.code, b.code),
        }),
        entries[0],
      );
      map.set(date, worst);
    });
    return map;
  }, [calendarWeatherMulti]);

  // ── Mappa ordine → coordinate cantiere (dagli appuntamenti) ──
  const orderLocations = useMemo(() => {
    const map = new Map<
      string,
      { lat: number; lng: number; city?: string; address?: string }
    >();
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

  // I km salvati restano gli stessi della commessa. Il popup calcola su richiesta
  // il singolo indirizzo mancante, senza precaricare decine di percorsi.
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

    const weatherDate = format(currentDate, "yyyy-MM-dd");
    orderLocations.forEach((loc, orderId) => {
      // Distanza reale da OSRM
      const savedOrder = orders.find((o) => o.id === orderId);

      // Meteo per questa location
      let weather:
        | import("@/hooks/useWeatherForecast").LocationWeatherDay
        | undefined;
      if (showWeather && calendarWeatherMulti) {
        const dayEntries = calendarWeatherMulti.get(weatherDate);
        if (dayEntries) {
          const locKey = `${Math.round(loc.lat * 100)},${Math.round(loc.lng * 100)}`;
          weather = dayEntries.find(
            (e) =>
              `${Math.round(e.lat * 100)},${Math.round(e.lng * 100)}` ===
              locKey,
          );
        }
      }

      map.set(orderId, {
        weather,
        distanceKm: savedOrder?.distanza_sede_km ?? undefined,
        durationMin: savedOrder?.distanza_sede_minuti ?? undefined,
        address: loc.address,
      });
    });

    orders.forEach((o) => {
      if (!map.has(o.id))
        map.set(o.id, {
          address: o.indirizzo_lavori || o.work_address || undefined,
          distanceKm: o.distanza_sede_km ?? undefined,
          durationMin: o.distanza_sede_minuti ?? undefined,
        });
    });
    return map;
  }, [
    orderLocations,
    companyLoc,
    calendarWeatherMulti,
    currentDate,
    showWeather,
    orders,
  ]);

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
      return (data ?? []) as Array<{
        id: string;
        name: string;
        color: string | null;
        google_calendar_id: string | null;
      }>;
    },
  });
  const { data: googleBusySlots = [] } = useQuery({
    queryKey: [
      "gcal-busy-slots",
      effectiveCompany?.id,
      calendarData.teamAppointments,
      user?.id,
      squadreGoogle.length > 0,
    ],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("google_calendar_busy_slots")
        .select(
          "id, start_at, end_at, summary, is_all_day, user_id, google_calendar_id",
        )
        .eq("company_id", effectiveCompany.id);
      // Ruolo ristretto (only_assigned): vede solo il proprio calendario Google.
      if (!calendarData.teamAppointments && user?.id)
        q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as GoogleBusySlot[];
    },
    enabled:
      !!effectiveCompany?.id &&
      (isGoogleConnected || squadreGoogle.length > 0) &&
      showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Apple Calendar busy slots
  const { data: appleBusySlots = [] } = useQuery({
    queryKey: [
      "apple-busy-slots",
      effectiveCompany?.id,
      calendarData.teamAppointments,
      user?.id,
    ],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("apple_calendar_busy_slots")
        .select(
          "id, start_at, end_at, summary, is_all_day, user_id, caldav_calendar_url",
        )
        .eq("company_id", effectiveCompany.id);
      if (!calendarData.teamAppointments && user?.id)
        q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(
        (s: {
          id: string;
          start_at: string;
          end_at: string;
          summary: string | null;
          is_all_day: boolean;
          user_id: string;
          caldav_calendar_url: string;
        }) => ({
          ...s,
          google_calendar_id: s.caldav_calendar_url,
          provider: "apple",
        }),
      ) as GoogleBusySlot[];
    },
    enabled: !!effectiveCompany?.id && isAppleConnected && showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  // Fetch Outlook Calendar busy slots (sola lettura: Microsoft → EiC)
  const { data: outlookBusySlots = [] } = useQuery({
    queryKey: [
      "outlook-busy-slots",
      effectiveCompany?.id,
      calendarData.teamAppointments,
      user?.id,
    ],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      let q = supabase
        .from("outlook_calendar_busy_slots")
        .select(
          "id, start_at, end_at, summary, is_all_day, user_id, outlook_event_id",
        )
        .eq("company_id", effectiveCompany.id);
      if (!calendarData.teamAppointments && user?.id)
        q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(
        (s: {
          id: string;
          start_at: string;
          end_at: string;
          summary: string | null;
          is_all_day: boolean;
          user_id: string;
          outlook_event_id: string | null;
        }) => ({
          ...s,
          google_calendar_id: s.outlook_event_id,
          provider: "outlook",
        }),
      ) as GoogleBusySlot[];
    },
    enabled: !!effectiveCompany?.id && isOutlookConnected && showGoogleBusy,
    staleTime: 2 * 60 * 1000,
  });

  // 2026-05-26 (audit fix P2): memoizzato per evitare re-render cascata su
  // CalendarDayView/WeekView/MonthView ad ogni cambio filtri/toggle. Senza
  // memo, l'array veniva ricreato ad ogni render → reference inequality →
  // sub-components ri-render anche se i dati non cambiavano.
  const busySlots = useMemo(() => {
    const perCalendario = new Map(
      squadreGoogle.map((t) => [t.google_calendar_id, t]),
    );
    return [
      ...googleBusySlots.map((s) => {
        const t = s.google_calendar_id
          ? perCalendario.get(s.google_calendar_id)
          : undefined;
        return t ? { ...s, team_name: t.name, team_color: t.color } : s;
      }),
      ...appleBusySlots,
      ...outlookBusySlots,
    ];
  }, [googleBusySlots, appleBusySlots, outlookBusySlots, squadreGoogle]);

  // Fetch synced appointment IDs for badge display
  const { data: syncedAppointmentIds } = useQuery({
    queryKey: ["gcal-synced-ids", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id)
        return { synced: new Set<string>(), googleImported: new Set<string>() };
      const { data, error } = await supabase
        .from("google_calendar_event_map")
        .select("appointment_id, source")
        .eq("company_id", effectiveCompany.id);
      if (error) throw error;
      const synced = new Set(
        (data || []).map(
          (r: { appointment_id: string; source: string }) => r.appointment_id,
        ),
      );
      const googleImported = new Set(
        (data || [])
          .filter(
            (r: { appointment_id: string; source: string }) =>
              r.source === "google",
          )
          .map(
            (r: { appointment_id: string; source: string }) => r.appointment_id,
          ),
      );
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
          area:
            e.role_type === "staff_interno" ? "amministrazione" : "cantiere",
        }));
      }
      return ((data || []) as CalendarEmployee[]).map((e) => ({
        ...e,
        area:
          e.area ||
          (e.role_type === "staff_interno" ? "amministrazione" : "cantiere"),
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
    const next = new Set(
      Array.from(visibleEmployeeIds).filter((id) => workEmployeeIds.has(id)),
    );
    if (
      next.size === 0 &&
      visibleEmployeeIds.size > 0 &&
      workEmployeeIds.size > 0
    ) {
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

  const { data: approvedLeaves = [] } = useCalendarLeaves({
    company: companyId,
    user: user?.id,
    from: calendarRangeStart,
    to: calendarRangeEnd,
    team: calendarData.scope === "team" && permissions.canViewPersone,
    enabled:
      !permissions.isLoading && permissions.canViewCalendar && showLeaves,
  });

  // Warehouse items for enriched "Arrivo Merce" events
  const { data: warehouseItems = [] } = useQuery({
    queryKey: [
      "calendar-warehouse-items",
      effectiveCompany?.id,
      calendarRangeStart,
      calendarRangeEnd,
    ],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        const query = supabase
          .from("order_items")
          .select(
            "id, name, status, order_id, order:orders!inner(company_id, warehouse_arrival_date)",
          )
          .eq("order.company_id", effectiveCompany.id)
          .not("order_id", "is", null)
          .not("order.warehouse_arrival_date", "is", null)
          .gte("order.warehouse_arrival_date", calendarRangeStart)
          .lte("order.warehouse_arrival_date", calendarRangeEnd)
          .limit(2500)
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(
          query,
          "Caricamento merce calendario",
          10_000,
        );
        if (error) throw error;
        return (
          (data || []) as Array<
            CalendarWarehouseItem & {
              order?: {
                company_id: string;
                warehouse_arrival_date?: string | null;
              };
            }
          >
        ).map(({ order: _order, ...item }) => item);
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!effectiveCompany?.id && showMerce,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch interventi (tickets tipo=intervento with data_intervento_prevista in range)
  const { data: calInterventi = [] } = useQuery({
    queryKey: [
      "cal-interventi",
      effectiveCompany?.id,
      user?.id,
      calendarData.scope,
      calendarRangeStart,
      calendarRangeEnd,
    ],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        let query = supabase
          .from("tickets")
          .select(
            "id,subject,tipo,data_intervento_prevista,status,assigned_to,order_id,indirizzo_intervento,lat_intervento,lng_intervento,durata_ore,note_tecnico",
          )
          .eq("company_id", effectiveCompany.id)
          .in("tipo", ["intervento", "emergenza"])
          .not("data_intervento_prevista", "is", null)
          .gte(
            "data_intervento_prevista",
            campoDayWindow(calendarRangeStart).start.toISOString(),
          )
          .lt(
            "data_intervento_prevista",
            campoDayWindow(calendarRangeEnd).end.toISOString(),
          )
          .order("data_intervento_prevista")
          .limit(1000)
          .abortSignal(timeout.signal);
        if (calendarData.scope === "personal")
          query = query.eq("assigned_to", user!.id);
        const { data, error } = await withClientTimeout(
          query,
          "Caricamento interventi calendario",
          10_000,
        );
        if (error) throw error;
        return (data ?? []) as CalendarIntervento[];
      } finally {
        timeout.dispose();
      }
    },
    enabled:
      !!effectiveCompany?.id &&
      !!user?.id &&
      permissions.canViewCalendar &&
      !permissions.isLoading &&
      showInterventi &&
      (permissions.canViewTickets || permissions.canViewInterventi),
    staleTime: 5 * 60 * 1000,
  });

  const namedInterventi = useMemo(
    () =>
      calInterventi.map((t) => ({
        ...t,
        assigned_profile:
          companyProfiles.find((p) => p.id === t.assigned_to) ?? null,
      })),
    [calInterventi, companyProfiles],
  );

  // Fetch piani manutenzione con prossima_scadenza in range
  const { data: calManutenzioni = [] } = useQuery({
    queryKey: [
      "cal-manutenzioni",
      effectiveCompany?.id,
      user?.id,
      calendarData.scope,
      calendarRangeStart,
      calendarRangeEnd,
    ],
    queryFn: async ({ signal }) => {
      if (!effectiveCompany?.id) return [];
      const timeout = createTimeoutSignal(10_000, signal);
      try {
        const query = supabase
          .from("piani_manutenzione")
          .select(
            "id,titolo,prossima_scadenza,attivo,frequenza_tipo,ultima_esecuzione,tecnico_preferito,contratto:contratti_manutenzione(impianto:impianti_cliente(id,order_id,tipo_impianto,marca,modello,commessa:orders(indirizzo_lavori,work_address,work_lat,work_lng)))",
          )
          .eq("company_id", effectiveCompany.id)
          .not("prossima_scadenza", "is", null)
          .gte("prossima_scadenza", calendarRangeStart)
          .lte("prossima_scadenza", calendarRangeEnd)
          .order("prossima_scadenza")
          .limit(1000)
          .abortSignal(timeout.signal);
        const { data, error } = await withClientTimeout(
          query,
          "Caricamento manutenzioni calendario",
          10_000,
        );
        if (error) throw error;
        return (data ?? []).map((piano) => ({
          id: piano.id,
          titolo: piano.titolo,
          prossima_scadenza: piano.prossima_scadenza,
          stato: piano.attivo === false ? "inattivo" : "attivo",
          impianto_id: piano.contratto?.impianto?.id ?? null,
          order_id: piano.contratto?.impianto?.order_id ?? null,
          impianto: [
            piano.contratto?.impianto?.tipo_impianto,
            piano.contratto?.impianto?.marca,
            piano.contratto?.impianto?.modello,
          ]
            .filter(Boolean)
            .join(" · "),
          indirizzo:
            piano.contratto?.impianto?.commessa?.indirizzo_lavori ||
            piano.contratto?.impianto?.commessa?.work_address ||
            null,
          lat: piano.contratto?.impianto?.commessa?.work_lat ?? null,
          lng: piano.contratto?.impianto?.commessa?.work_lng ?? null,
          frequenza_tipo: piano.frequenza_tipo,
          ultima_esecuzione: piano.ultima_esecuzione,
          assigned_to: piano.tecnico_preferito,
        })) as CalendarManutenzione[];
      } finally {
        timeout.dispose();
      }
    },
    enabled:
      !!effectiveCompany?.id &&
      !!user?.id &&
      !permissions.isLoading &&
      permissions.canViewCalendar &&
      calendarData.scope === "team" &&
      showManutenzioni &&
      permissions.canViewManutenzione,
    staleTime: 5 * 60 * 1000,
  });

  const namedManutenzioni = useMemo(
    () =>
      calManutenzioni.map((m) => ({
        ...m,
        assigned_profile:
          companyProfiles.find((p) => p.id === m.assigned_to) ?? null,
      })),
    [calManutenzioni, companyProfiles],
  );

  const uniqueCustomers = useMemo(() => {
    const customersMap = new Map<string, CustomerFilter>();
    orders.forEach((order) => {
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
      `${a.last_name} ${a.first_name}`.localeCompare(
        `${b.last_name} ${b.first_name}`,
      ),
    );
  }, [orders]);

  // Build warehouse info map: orderId → CalendarWarehouseInfo
  const warehouseInfoByOrderId = useMemo(() => {
    const map = new Map<string, CalendarWarehouseInfo>();
    for (const item of warehouseItems) {
      if (!item.order_id) continue;
      const order = orders.find((o) => o.id === item.order_id);
      if (!order) continue;
      const existing = map.get(item.order_id) ?? {
        orderId: item.order_id,
        orderCode: order.order_code,
        customerName: getPersonName(
          order.customer?.first_name,
          order.customer?.last_name,
          "Cliente non associato",
        ),
        readyCount: 0,
        pendingCount: 0,
        items: [],
      };
      const isReady =
        item.status === "in_magazzino" || item.status === "installato";
      if (isReady) existing.readyCount++;
      else existing.pendingCount++;
      if (existing.items.length < 10) {
        existing.items.push({
          id: item.id,
          name: item.name,
          status: item.status ?? "",
        });
      }
      map.set(item.order_id, existing);
    }
    return map;
  }, [warehouseItems, orders]);

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const { data: assignableUsers = [] } = useCompanyStaffUsers(
    effectiveCompany?.id,
  );
  const assignableWorkUsers = useMemo(
    () =>
      assignableUsers.filter(
        (member) => calendarData.teamAppointments || member.id === user?.id,
      ),
    [assignableUsers, calendarData.teamAppointments, user?.id],
  );

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setCustomerFilter("all");
    setEmployeeFilter("all");
    setExternalTeamFilter("all");
    setAssignedToFilter("all");
  };

  const activeFilterCount = [
    statusFilter,
    customerFilter,
    employeeFilter,
    externalTeamFilter,
    assignedToFilter,
  ].filter((f) => f !== "all").length;
  const hasActiveFilters = activeFilterCount > 0;

  // Filter orders that have at least one date
  const scheduledOrders = useMemo(() => {
    return orders
      .filter(
        (order) =>
          order.work_start_date ||
          order.expected_date ||
          order.warehouse_arrival_date ||
          order.work_phases?.some((p) => p.start_date),
      )
      .filter((order) => {
        if (
          statusFilter !== "all" &&
          order.current_status_id !== statusFilter
        ) {
          return false;
        }
        if (customerFilter !== "all" && order.customer_id !== customerFilter) {
          return false;
        }
        if (employeeFilter !== "all") {
          const hasEmployee = order.order_employees?.some(
            (ae) => ae.employee?.id === employeeFilter,
          );
          if (!hasEmployee) return false;
        }
        if (externalTeamFilter !== "all") {
          const hasTeam = order.order_external_teams?.some(
            (aet) => aet.external_team?.id === externalTeamFilter,
          );
          if (!hasTeam) return false;
        }
        if (
          search.trim() &&
          ![
            order.order_code,
            order.description,
            order.customer?.first_name,
            order.customer?.last_name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase())
        )
          return false;
        // Resource layer filtering
        const effectiveEmployeeIds = effectiveWorkVisibleEmployeeIds;
        const effectiveTeamIds =
          visibleTeamIds ?? new Set(externalTeams.map((t) => t.id));
        const hasVisibleEmployee = order.order_employees?.some(
          (ae) => !!ae.employee?.id && effectiveEmployeeIds.has(ae.employee.id),
        );
        const hasVisibleTeam = order.order_external_teams?.some(
          (aet) =>
            !!aet.external_team?.id &&
            effectiveTeamIds.has(aet.external_team.id),
        );
        if (
          (visibleEmployeeIds !== null || visibleTeamIds !== null) &&
          (order.order_employees?.length ||
            order.order_external_teams?.length) &&
          !hasVisibleEmployee &&
          !hasVisibleTeam
        )
          return false;
        return true;
      })
      .map((order) => {
        const restricted =
          employeeFilter !== "all" ||
          externalTeamFilter !== "all" ||
          visibleEmployeeIds !== null ||
          visibleTeamIds !== null;
        if (!restricted) return order;
        return {
          ...order,
          planning_resource_filter: {
            employeeIds:
              employeeFilter !== "all"
                ? [employeeFilter]
                : externalTeamFilter !== "all"
                  ? []
                  : [...effectiveWorkVisibleEmployeeIds],
            teamIds:
              externalTeamFilter !== "all"
                ? [externalTeamFilter]
                : employeeFilter !== "all"
                  ? []
                  : [
                      ...(visibleTeamIds ??
                        new Set(externalTeams.map((t) => t.id))),
                    ],
          },
        };
      });
  }, [
    orders,
    search,
    statusFilter,
    customerFilter,
    employeeFilter,
    externalTeamFilter,
    effectiveWorkVisibleEmployeeIds,
    visibleEmployeeIds,
    visibleTeamIds,
    externalTeams,
  ]);

  // Enrich appointments with assigned profile names (using cached company profiles)
  const profilesById = useMemo(() => {
    return new Map(companyProfiles.map((p) => [p.id, p]));
  }, [companyProfiles]);

  const enrichedAppointments = useMemo(() => {
    return appointments.map((apt) => ({
      ...apt,
      assigned_profile: apt.assigned_to
        ? (profilesById.get(apt.assigned_to) ?? null)
        : null,
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
  const filteredAppointments = useMemo(
    () =>
      filterPlanningAppointments(
        enrichedAppointments,
        showAppuntamento,
        showAppuntamentoCommerciale,
        assignedToFilter,
        search,
      ),
    [
      enrichedAppointments,
      showAppuntamento,
      showAppuntamentoCommerciale,
      assignedToFilter,
      search,
    ],
  );

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
    if (!showAppuntamento && !showAppuntamentoCommerciale)
      hidden.add("appuntamento");
    if (!showMerce) hidden.add("merce");
    if (!showGoogleBusy) hidden.add("google_busy");
    if (!showLeaves) hidden.add("leaves");
    if (!showInterventi) hidden.add("intervento");
    if (!showManutenzioni || calendarData.scope !== "team")
      hidden.add("manutenzione");
    return hidden;
  }, [
    showPosa,
    showLavoro,
    showAppuntamento,
    showAppuntamentoCommerciale,
    showMerce,
    showGoogleBusy,
    showLeaves,
    showInterventi,
    showManutenzioni,
    calendarData.scope,
  ]);

  // Effective visible sets for layer panel
  const effectiveVisibleEmployees = effectiveWorkVisibleEmployeeIds;
  const effectiveVisibleTeams = useMemo(
    () => visibleTeamIds ?? new Set(externalTeams.map((t) => t.id)),
    [visibleTeamIds, externalTeams],
  );

  // M13 — ordini non pianificati con drawer
  const [unplannedOpen, setUnplannedOpen] = useState(false);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [mobileLayerOpen, setMobileLayerOpen] = useState(false);
  const pendingPlanning = [
    ...new Map(
      [
        ...unplannedData,
        ...orders.filter((o) =>
          o.work_phases?.some(
            (p) => !p.start_date && p.status !== "completata",
          ),
        ),
      ].map((o) => [o.id, o]),
    ).values(),
  ];
  const unplannedOrders = pendingPlanning.filter(
    (order) =>
      (statusFilter === "all" || order.current_status_id === statusFilter) &&
      (customerFilter === "all" || order.customer_id === customerFilter),
  );
  const unplannedOrdersCount = unplannedOrders.length;

  // Build employee user_id → employee mapping for conflict detection bridge
  const employeeByUserId = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const emp of workEmployees) {
      if (emp.user_id) {
        map.set(emp.user_id, {
          id: emp.id,
          name: getPersonName(
            emp.first_name,
            emp.last_name,
            "Operatore senza nome",
          ),
        });
      }
    }
    return map;
  }, [workEmployees]);

  // Conflict detection
  const { conflicts } = useConflictDetection(
    scheduledOrders,
    filteredAppointments,
    employeeByUserId,
    visiblePeriod,
  );
  const conflictGroups = useMemo(
    () => groupCalendarConflicts(conflicts),
    [conflicts],
  );

  const viewStats = useMemo(() => {
    const inPeriod = scheduledOrders.filter((order) =>
      orderInCalendarPeriod(order, visiblePeriod.from, visiblePeriod.to, {
        work: planningView || showLavoro,
        installation: planningView || showPosa,
        warehouse: !planningView && showMerce,
      }),
    );
    return {
      scheduled: inPeriod.length,
      appointments: filteredAppointments.filter(
        (a) =>
          a.appointment_date >= visiblePeriod.from &&
          a.appointment_date <= visiblePeriod.to,
      ).length,
      unplanned: unplannedOrdersCount,
      conflicts: conflictGroups.length,
      ordersWithoutTeam: inPeriod.filter(
        (order) =>
          !order.order_employees?.length && !order.order_external_teams?.length,
      ).length,
    };
  }, [
    conflictGroups.length,
    filteredAppointments,
    scheduledOrders,
    unplannedOrdersCount,
    visiblePeriod,
    showLavoro,
    showPosa,
    showMerce,
    planningView,
  ]);
  const sourceMode =
    showPosa && showLavoro && showAppuntamento && !showAppuntamentoCommerciale
      ? "work"
      : !showPosa &&
          !showLavoro &&
          showAppuntamento &&
          showAppuntamentoCommerciale
        ? "appointments"
        : showPosa &&
            showLavoro &&
            showAppuntamento &&
            showAppuntamentoCommerciale
          ? "all"
          : "custom";
  const selectSourceMode = (mode: "work" | "appointments" | "all") =>
    setLayerVisibility((prev) => ({
      ...prev,
      showPosa: mode !== "appointments",
      showLavoro: mode !== "appointments",
      showAppuntamento: true,
      showAppuntamentoCommerciale: mode !== "work",
    }));

  const isStatsLoading = isLoading || (!planningView && isAppointmentsLoading);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight max-sm:text-xl">
            {view === "gantt"
              ? "Gantt lavori"
              : view === "teams"
                ? "Squadre e persone"
                : view === "heatmap"
                  ? "Carico lavori"
                  : "Calendario lavori"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground max-sm:text-[11px]">
            {calendarData.scope === "personal"
              ? planningView
                ? "Le tue commesse e le risorse assegnate"
                : "Commesse assegnate a te · Appuntamenti personali"
              : "Pianificazione del team secondo i tuoi accessi"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Aggiorna dati del calendario"
            disabled={refreshingCalendar || permissions.isLoading}
            onClick={async () => {
              if (!companyId || !user?.id) return;
              setRefreshingCalendar(true);
              try {
                await queryClient.invalidateQueries({
                  predicate: ({ queryKey }) =>
                    (queryKey[0] === "calendar-orders" &&
                      queryKey[2] === companyId) ||
                    (queryKey[0] === "appointments" &&
                      queryKey[1] === "work-planning-v3" &&
                      queryKey[2] === companyId &&
                      queryKey[3] === user.id) ||
                    ([
                      "company-profiles",
                      "order-statuses",
                      "employees-filter",
                      "external-teams-filter",
                      "cal-interventi",
                      "cal-manutenzioni",
                    ].includes(String(queryKey[0])) &&
                      queryKey[1] === companyId),
                });
              } finally {
                setRefreshingCalendar(false);
              }
            }}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshingCalendar && "animate-spin")}
            />
          </Button>
          <BottoneFiltri
            className="sm:hidden"
            attivi={activeFilterCount}
            onClick={() => setFiltriMobileAperti(true)}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="gap-1.5 tap-compact max-sm:h-9 max-sm:w-9 max-sm:p-0"
            aria-label="Oggi"
          >
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Oggi</span>
          </Button>

          {/* In sola lettura il calendario si consulta: la policy su appointments rifiuta le scritture. */}
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setEditingAppointment(null);
              setAppointmentDialogOpen(true);
            }}
            disabled={permissions.solaLettura}
            title={permissions.solaLettura ? "Sei in sola lettura" : undefined}
            className={cn("gap-1.5 max-sm:hidden", planningView && "hidden")}
          >
            <Plus className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Appuntamento</span>
          </Button>

          {/* Bollini «Sync» solo da 1536: altrove rubavano posto alle azioni. */}
          {isGoogleConnected && (
            <Badge
              variant="outline"
              className="gap-1 text-green-600 border-green-300 hidden 2xl:flex"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-xs">Google Sync</span>
            </Badge>
          )}
          {isAppleConnected && (
            <Badge
              variant="outline"
              className="gap-1 text-gray-600 border-gray-300 hidden 2xl:flex"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-xs">Apple Sync</span>
            </Badge>
          )}
          {isOutlookConnected && (
            <Badge
              variant="outline"
              className="gap-1 text-indigo-700 border-indigo-300 hidden 2xl:flex"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span className="text-xs">Outlook Sync</span>
            </Badge>
          )}

          {/* Secondary actions dropdown. Mobile no: l'export iCal e la sync
              manuale restano al computer, i livelli si aprono dai filtri. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="max-sm:hidden"
                aria-label="Altre azioni del calendario"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to="/azienda/attivita" className="gap-2">
                  <CalendarDays className="h-4 w-4" />
                  La mia agenda
                </Link>
              </DropdownMenuItem>
              {permissions.canViewEmployees && (
                <DropdownMenuItem asChild>
                  <Link to="/azienda/manodopera" className="gap-2">
                    <Users className="h-4 w-4" />
                    Squadre e mezzi
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  isMobile
                    ? setMobileLayerOpen(true)
                    : setLayerPanelOpen(!layerPanelOpen)
                }
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                Fonti e risorse
              </DropdownMenuItem>
              {isGoogleConnected && (
                <DropdownMenuItem
                  disabled={syncing || permissions.solaLettura}
                  onSelect={async () => {
                    setSyncing(true);
                    try {
                      const result = await pullBusySlots();
                      queryClient.invalidateQueries({
                        queryKey: ["gcal-busy-slots"],
                      });
                      queryClient.invalidateQueries({
                        queryKey: ["gcal-synced-ids"],
                      });
                      queryClient.invalidateQueries({
                        queryKey: ["appointments"],
                      });
                      const pulled =
                        typeof result === "object" &&
                        result !== null &&
                        "pulled" in result
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
                  <RefreshCw
                    className={cn("h-4 w-4", syncing && "animate-spin")}
                  />
                  Sync Google Calendar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  exportAppointmentsIcal(filteredAppointments, scheduledOrders)
                }
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Esporta iCal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Filtri attivi come chip (mobile: il numero è sul bottone dei filtri) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5 max-sm:hidden">
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Stato:{" "}
              {statuses.find((s) => s.id === statusFilter)?.name ??
                statusFilter}
              <button
                onClick={() => setStatusFilter("all")}
                className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {customerFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Cliente:{" "}
              {uniqueCustomers.find((c) => c.id === customerFilter)
                ?.last_name ?? customerFilter}
              <button
                onClick={() => setCustomerFilter("all")}
                className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {employeeFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Operaio:{" "}
              {workEmployees.find((e) => e.id === employeeFilter)?.last_name ??
                employeeFilter}
              <button
                onClick={() => setEmployeeFilter("all")}
                className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {externalTeamFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Squadra:{" "}
              {externalTeams.find((t) => t.id === externalTeamFilter)?.name ??
                externalTeamFilter}
              <button
                onClick={() => setExternalTeamFilter("all")}
                className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {assignedToFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 pl-2 pr-1 py-1">
              Assegnato:{" "}
              {assignableWorkUsers.find((u) => u.id === assignedToFilter)
                ?.last_name ?? assignedToFilter}
              <button
                onClick={() => setAssignedToFilter("all")}
                className="tap-compact ml-0.5 p-1 -m-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <button
            onClick={resetFilters}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Resetta tutti
          </button>
        </div>
      )}

      {canViewTeam && (
        <div
          className="flex items-center gap-1 text-xs"
          aria-label="Visibilità del calendario"
        >
          {(
            [
              ["personal", "Il mio calendario"],
              ["team", "Pianificazione team"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={calendarData.scope === value}
              onClick={() => {
                resetFilters();
                setVisibleEmployeeIds(null);
                setVisibleTeamIds(null);
                setRequestedScope(value);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors",
                calendarData.scope === value
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <CalendarViewNavigation
        view={view}
        onViewChange={setView}
        isMobile={isMobile}
        canViewTeam={canViewTeam}
      />
      <div
        className="flex flex-wrap items-center gap-2 border-b pb-3"
        aria-label="Comandi del calendario"
      >
        {planningView ? (
          <span className="px-1 text-xs font-medium text-muted-foreground">
            Lavorazioni e risorse delle commesse
          </span>
        ) : isMobile ? (
          <Select
            value={sourceMode}
            onValueChange={(value) => {
              if (value !== "custom")
                selectSourceMode(value as "work" | "appointments" | "all");
            }}
          >
            <SelectTrigger
              className="h-9 w-[120px] shrink-0"
              aria-label="Contenuti del calendario"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="work">Cantieri</SelectItem>
              <SelectItem value="appointments">Appuntamenti</SelectItem>
              <SelectItem value="all">Tutto</SelectItem>
              {sourceMode === "custom" && (
                <SelectItem value="custom">Personalizzato</SelectItem>
              )}
            </SelectContent>
          </Select>
        ) : (
          <div
            className="flex shrink-0 gap-1 rounded-lg bg-muted/60 p-1"
            aria-label="Contenuto del calendario"
          >
            {(
              [
                ["work", "Cantieri"],
                ["appointments", "Appuntamenti"],
                ["all", "Tutto"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => selectSourceMode(value)}
                aria-pressed={sourceMode === value}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs transition-colors",
                  sourceMode === value
                    ? "bg-background font-semibold shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="relative min-w-0 flex-1 max-sm:order-last max-sm:basis-full">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 min-w-0 bg-background pl-9 pr-8 text-sm"
            aria-label="Cerca nel calendario"
            placeholder={
              planningView
                ? "Cerca cliente o commessa…"
                : "Cerca cliente, commessa o appuntamento…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              aria-label="Cancella ricerca"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 max-sm:w-9 max-sm:px-0"
          aria-label={planningView ? "Risorse e colori" : "Fonti e risorse"}
          onClick={() =>
            isMobile ? setMobileLayerOpen(true) : setLayerPanelOpen(true)
          }
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {planningView ? "Risorse" : "Fonti"}
          </span>
          {!planningView && sourceMode === "custom" && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary"
              title="Fonti personalizzate"
            />
          )}
        </Button>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 relative max-sm:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filtri</span>
              {hasActiveFilters && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>
      {isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 text-sm"
        >
          <span>
            Commesse non disponibili. Gli appuntamenti restano consultabili.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => calendarData.orders.refetch()}
          >
            Riprova commesse
          </Button>
        </div>
      )}
      {calendarData.appointments.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 text-sm"
        >
          <span>
            Appuntamenti non disponibili. Le commesse restano consultabili.
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => calendarData.appointments.refetch()}
          >
            Riprova appuntamenti
          </Button>
        </div>
      )}
      {calendarData.unplanned.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3 text-sm"
        >
          <span>Non riesco a verificare le commesse da pianificare.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => calendarData.unplanned.refetch()}
          >
            Riprova pianificazione
          </Button>
        </div>
      )}
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground"
        aria-label="Riepilogo del periodo"
      >
        <p
          className="hidden sm:block"
          title={`Dal ${format(new Date(`${visiblePeriod.from}T12:00:00`), "d MMM yyyy", { locale: it })} al ${format(new Date(`${visiblePeriod.to}T12:00:00`), "d MMM yyyy", { locale: it })}`}
        >
          {isStatsLoading ? (
            "Caricamento del periodo…"
          ) : (
            <>
              <span className="font-semibold tabular-nums text-foreground">
                {isError ? "—" : viewStats.scheduled}
              </span>{" "}
              cantieri{" "}
              {planningView ? (
                "nel periodo"
              ) : (
                <>
                  <span className="mx-1.5">·</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {calendarData.appointments.isError
                      ? "—"
                      : viewStats.appointments}
                  </span>{" "}
                  appuntamenti nel periodo
                </>
              )}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {viewStats.unplanned > 0 && (
            <button
              type="button"
              onClick={() => setUnplannedOpen(true)}
              className="inline-flex items-center gap-1.5 text-amber-700 hover:underline"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {viewStats.unplanned} da pianificare
            </button>
          )}
          {viewStats.conflicts > 0 && (
            <button
              type="button"
              onClick={() => setConflictsOpen(true)}
              className="inline-flex items-center gap-1.5 text-amber-700 hover:underline"
              title="Persone o squadre su più lavori nello stesso giorno con orari che si accavallano (o senza orari), oppure assegnate fuori dalla squadra della commessa. Clicca per l'elenco."
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {viewStats.conflicts} verifiche sulle assegnazioni
            </button>
          )}
          {viewStats.ordersWithoutTeam > 0 && (
            <span className="hidden sm:inline">
              {viewStats.ordersWithoutTeam}{" "}
              {viewStats.ordersWithoutTeam === 1
                ? "cantiere senza squadra"
                : "cantieri senza squadra"}
            </span>
          )}
        </div>
      </div>

      {!isStatsLoading &&
        !isError &&
        !calendarData.appointments.isError &&
        calendarData.scope === "personal" &&
        !scheduledOrders.length &&
        !filteredAppointments.length &&
        !search &&
        !hasActiveFilters && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-3 text-sm">
            <p>Non hai commesse o appuntamenti assegnati in questo periodo.</p>
            <Link
              to="/azienda/attivita"
              className="text-xs font-medium text-primary hover:underline"
            >
              Apri le mie attività
            </Link>
          </div>
        )}

      {/* Mobile Layer Sheet */}
      {isMobile && (
        <Sheet open={mobileLayerOpen} onOpenChange={setMobileLayerOpen}>
          <SheetContent side="bottom" className="h-[80dvh]">
            <SheetHeader>
              <SheetTitle>
                {planningView
                  ? "Risorse della pianificazione"
                  : "Fonti e risorse"}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 overflow-y-auto">
              {planningView ? (
                <CalendarPlanningResourcePanel
                  employees={workEmployees}
                  teams={externalTeams}
                  visibleEmployees={effectiveVisibleEmployees}
                  visibleTeams={effectiveVisibleTeams}
                  onEmployee={(id) => {
                    const selected = new Set(effectiveVisibleEmployees);
                    if (selected.has(id)) selected.delete(id);
                    else selected.add(id);
                    setVisibleEmployeeIds(selected);
                  }}
                  onTeam={(id) => {
                    const selected = new Set(effectiveVisibleTeams);
                    if (selected.has(id)) selected.delete(id);
                    else selected.add(id);
                    setVisibleTeamIds(selected);
                  }}
                  onAllEmployees={(value) =>
                    setVisibleEmployeeIds(value ? null : new Set())
                  }
                  onAllTeams={(value) =>
                    setVisibleTeamIds(value ? null : new Set())
                  }
                  colorMode={colorMode}
                  onColorMode={setColorMode}
                  showColors={view === "gantt"}
                  canManageResources={permissions.canViewPersone}
                />
              ) : (
                <CalendarLayerPanel
                  allowInterventions={
                    permissions.canViewTickets || permissions.canViewInterventi
                  }
                  allowMaintenance={permissions.canViewManutenzione}
                  allowCompanySources={calendarData.scope === "team"}
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
                  showManutenzioni={
                    showManutenzioni &&
                    permissions.canViewManutenzione &&
                    calendarData.scope === "team"
                  }
                  onToggleEmployee={(id) => {
                    const next = new Set(effectiveVisibleEmployees);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setVisibleEmployeeIds(next);
                  }}
                  onToggleTeam={(id) => {
                    const next = new Set(effectiveVisibleTeams);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setVisibleTeamIds(next);
                  }}
                  onToggleAllEmployees={(v) => {
                    setVisibleEmployeeIds(v ? null : new Set());
                  }}
                  onToggleAllTeams={(v) => {
                    setVisibleTeamIds(v ? null : new Set());
                  }}
                  onTogglePosa={(v) => setLayer("showPosa", v)}
                  onToggleLavoro={(v) => setLayer("showLavoro", v)}
                  onToggleAppuntamento={(v) => setLayer("showAppuntamento", v)}
                  onToggleAppuntamentoCommerciale={(v) =>
                    setLayer("showAppuntamentoCommerciale", v)
                  }
                  onToggleMerce={(v) => setLayer("showMerce", v)}
                  onToggleGoogleBusy={(v) => setLayer("showGoogleBusy", v)}
                  onToggleLeaves={(v) => setLayer("showLeaves", v)}
                  onToggleWeather={(v) => setLayer("showWeather", v)}
                  onToggleInterventi={(v) => setLayer("showInterventi", v)}
                  onToggleManutenzioni={(v) => setLayer("showManutenzioni", v)}
                  eventColors={eventColors}
                  onEventColorChange={setEventColor}
                  onResetEventColors={() =>
                    setEventColors(DEFAULT_CALENDAR_EVENT_COLORS)
                  }
                  colorMode={colorMode}
                  onColorModeChange={setColorMode}
                  onTeamColorChange={
                    permissions.canEditSettingsCustomization &&
                    !permissions.solaLettura
                      ? onTeamColorChange
                      : undefined
                  }
                  avvisiPagamento={
                    permissions.canViewScadenzario ? avvisiPagamento : "off"
                  }
                  onAvvisiPagamentoChange={
                    permissions.canViewScadenzario
                      ? setAvvisiPagamento
                      : undefined
                  }
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Filtri su telefono: gli stessi del pannello desktop, in un foglio dal
          basso; da qui si aprono anche livelli e colori. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={activeFilterCount}
        onAzzera={resetFilters}
      >
        <div className="grid grid-cols-2 gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={customerFilter} onValueChange={setCustomerFilter}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Cliente" />
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
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Operaio" />
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
          <Select
            value={externalTeamFilter}
            onValueChange={setExternalTeamFilter}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Squadra" />
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
            <SelectTrigger className="col-span-2 h-9 text-xs">
              <SelectValue placeholder="Responsabile appuntamenti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                Appuntamenti: tutti gli utenti visibili
              </SelectItem>
              {assignableWorkUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.last_name} {u.first_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => {
            setFiltriMobileAperti(false);
            setMobileLayerOpen(true);
          }}
        >
          <Eye className="h-4 w-4" /> Livelli e colori
        </Button>
      </PannelloFiltri>

      {/* Pannello filtri collassabile. Da 640 è una riga di filtri senza
          riquadro, larghi quanto il testo: a 180px l'uno andavano su due righe
          anche a 1024. */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleContent>
          <div className="rounded-lg border bg-card p-4 space-y-3 sm:space-y-0 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-3 sm:gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:h-9 sm:w-auto sm:gap-2">
                  <SelectValue placeholder="Tutti gli stati" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-full sm:h-9 sm:w-auto sm:gap-2">
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
                <SelectTrigger className="w-full sm:h-9 sm:w-auto sm:gap-2">
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

              <Select
                value={externalTeamFilter}
                onValueChange={setExternalTeamFilter}
              >
                <SelectTrigger className="w-full sm:h-9 sm:w-auto sm:gap-2">
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

              <Select
                value={assignedToFilter}
                onValueChange={setAssignedToFilter}
              >
                <SelectTrigger className="w-full sm:h-9 sm:w-auto sm:gap-2">
                  <SelectValue placeholder="Responsabile appuntamenti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Appuntamenti: tutti gli utenti visibili
                  </SelectItem>
                  {assignableWorkUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.last_name} {user.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-4 w-4" />
                  Resetta
                </Button>
              )}
            </div>

            {/* Da 640 i due conteggi ripetevano i riquadri «Lavori
                pianificati» e «Da pianificare» qui sopra. */}
            <div className="flex items-center gap-2 sm:hidden">
              <Badge variant="secondary" className="font-normal">
                {scheduledOrders.length}{" "}
                {scheduledOrders.length === 1 ? "ordine" : "ordini"}
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
          {isLoading && view !== "month" && view !== "agenda" ? (
            <div className="flex items-center justify-center h-96">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : view === "teams" && canViewTeam ? (
            <CalendarTeamWeekView
              key={`${effectiveCompany?.id}:${user?.id}:${calendarData.scope}`}
              orders={scheduledOrders}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              calendarScope={calendarData.scope}
              canViewPayments={permissions.canViewScadenzario}
              orderColorFn={orderColorFn}
              employees={workEmployees
                .filter(
                  (e) =>
                    effectiveWorkVisibleEmployeeIds.has(e.id) &&
                    (employeeFilter === "all" || employeeFilter === e.id),
                )
                .map((e) => ({
                  id: e.id,
                  name:
                    [e.first_name, e.last_name].filter(Boolean).join(" ") ||
                    "Persona",
                }))}
              teams={externalTeams.filter(
                (t) =>
                  effectiveVisibleTeams.has(t.id) &&
                  (externalTeamFilter === "all" || externalTeamFilter === t.id),
              )}
            />
          ) : view === "month" || view === "agenda" ? (
            <CalendarMonthView
              isLoading={isLoading || isAppointmentsLoading}
              calendarScope={calendarData.scope}
              key={`${view}:${calendarData.scope}:${view === "agenda" ? visiblePeriod.from : "month"}`}
              presentation={view === "agenda" ? "agenda" : "month"}
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
              calendarWeatherMulti={
                showWeather ? calendarWeatherMulti : undefined
              }
              orderWeatherMap={orderWeatherMap}
              interventi={
                showInterventi &&
                (permissions.canViewTickets || permissions.canViewInterventi)
                  ? namedInterventi
                  : []
              }
              manutenzioni={
                showManutenzioni &&
                permissions.canViewManutenzione &&
                calendarData.scope === "team"
                  ? namedManutenzioni
                  : []
              }
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
              calendarWeatherMulti={
                showWeather ? calendarWeatherMulti : undefined
              }
              orderWeatherMap={orderWeatherMap}
              interventi={
                showInterventi &&
                (permissions.canViewTickets || permissions.canViewInterventi)
                  ? namedInterventi
                  : []
              }
              manutenzioni={
                showManutenzioni &&
                permissions.canViewManutenzione &&
                calendarData.scope === "team"
                  ? namedManutenzioni
                  : []
              }
              eventColors={eventColors}
              orderColorFn={orderColorFn}
            />
          ) : view === "day" ? (
            <CalendarDayView
              calendarScope={calendarData.scope}
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
              calendarWeatherMulti={
                showWeather ? calendarWeatherMulti : undefined
              }
              orderWeatherMap={orderWeatherMap}
              interventi={
                showInterventi &&
                (permissions.canViewTickets || permissions.canViewInterventi)
                  ? namedInterventi
                  : []
              }
              manutenzioni={
                showManutenzioni &&
                permissions.canViewManutenzione &&
                calendarData.scope === "team"
                  ? namedManutenzioni
                  : []
              }
              eventColors={eventColors}
              orderColorFn={orderColorFn}
            />
          ) : view === "heatmap" ? (
            <CalendarHeatmapView
              key={`${effectiveCompany?.id}:${user?.id}:${calendarData.scope}`}
              orders={scheduledOrders}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              orderColorFn={orderColorFn}
              employees={workEmployees.filter(
                (e) =>
                  effectiveWorkVisibleEmployeeIds.has(e.id) &&
                  (employeeFilter === "all" || employeeFilter === e.id),
              )}
              calendarScope={calendarData.scope}
              teams={externalTeams.filter(
                (t) =>
                  effectiveVisibleTeams.has(t.id) &&
                  (externalTeamFilter === "all" || externalTeamFilter === t.id),
              )}
            />
          ) : (
            <CalendarGanttView
              zoom={ganttZoom}
              onZoomChange={setGanttZoom}
              orders={scheduledOrders}
              currentDate={currentDate}
              onDateChange={setCurrentDate}
              orderColorFn={orderColorFn}
              calendarScope={calendarData.scope}
            />
          )}
        </div>

        {!isMobile && (
          <Sheet open={layerPanelOpen} onOpenChange={setLayerPanelOpen}>
            <SheetContent
              side="right"
              className="w-full sm:max-w-md overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>
                  {planningView
                    ? "Risorse della pianificazione"
                    : "Fonti e risorse"}
                </SheetTitle>
                <SheetDescription>
                  Scegli cosa mostrare. I filtri rispettano sempre i tuoi
                  permessi.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                {planningView ? (
                  <CalendarPlanningResourcePanel
                    employees={workEmployees}
                    teams={externalTeams}
                    visibleEmployees={effectiveVisibleEmployees}
                    visibleTeams={effectiveVisibleTeams}
                    onEmployee={(id) => {
                      const selected = new Set(effectiveVisibleEmployees);
                      if (selected.has(id)) selected.delete(id);
                      else selected.add(id);
                      setVisibleEmployeeIds(selected);
                    }}
                    onTeam={(id) => {
                      const selected = new Set(effectiveVisibleTeams);
                      if (selected.has(id)) selected.delete(id);
                      else selected.add(id);
                      setVisibleTeamIds(selected);
                    }}
                    onAllEmployees={(value) =>
                      setVisibleEmployeeIds(value ? null : new Set())
                    }
                    onAllTeams={(value) =>
                      setVisibleTeamIds(value ? null : new Set())
                    }
                    colorMode={colorMode}
                    onColorMode={setColorMode}
                    showColors={view === "gantt"}
                    canManageResources={permissions.canViewPersone}
                  />
                ) : (
                  <CalendarLayerPanel
                    allowCompanySources={calendarData.scope === "team"}
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
                    showManutenzioni={
                      showManutenzioni &&
                      permissions.canViewManutenzione &&
                      calendarData.scope === "team"
                    }
                    onToggleEmployee={(id) => {
                      const next = new Set(effectiveVisibleEmployees);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setVisibleEmployeeIds(next);
                    }}
                    onToggleTeam={(id) => {
                      const next = new Set(effectiveVisibleTeams);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      setVisibleTeamIds(next);
                    }}
                    onToggleAllEmployees={(v) => {
                      setVisibleEmployeeIds(v ? null : new Set());
                    }}
                    onToggleAllTeams={(v) => {
                      setVisibleTeamIds(v ? null : new Set());
                    }}
                    onTogglePosa={(v) => setLayer("showPosa", v)}
                    onToggleLavoro={(v) => setLayer("showLavoro", v)}
                    onToggleAppuntamento={(v) =>
                      setLayer("showAppuntamento", v)
                    }
                    onToggleAppuntamentoCommerciale={(v) =>
                      setLayer("showAppuntamentoCommerciale", v)
                    }
                    onToggleMerce={(v) => setLayer("showMerce", v)}
                    onToggleGoogleBusy={(v) => setLayer("showGoogleBusy", v)}
                    onToggleLeaves={(v) => setLayer("showLeaves", v)}
                    onToggleWeather={(v) => setLayer("showWeather", v)}
                    onToggleInterventi={(v) => setLayer("showInterventi", v)}
                    onToggleManutenzioni={(v) =>
                      setLayer("showManutenzioni", v)
                    }
                    eventColors={eventColors}
                    onEventColorChange={setEventColor}
                    onResetEventColors={() =>
                      setEventColors(DEFAULT_CALENDAR_EVENT_COLORS)
                    }
                    colorMode={colorMode}
                    onColorModeChange={setColorMode}
                    onTeamColorChange={
                      permissions.canEditSettingsCustomization &&
                      !permissions.solaLettura
                        ? onTeamColorChange
                        : undefined
                    }
                    avvisiPagamento={
                      permissions.canViewScadenzario ? avvisiPagamento : "off"
                    }
                    onAvvisiPagamentoChange={
                      permissions.canViewScadenzario
                        ? setAvvisiPagamento
                        : undefined
                    }
                  />
                )}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={(open) => {
          setAppointmentDialogOpen(open);
          if (!open) setEditingAppointment(null);
        }}
        appointment={editingAppointment}
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
              Commesse senza date operative o con lavorazioni ancora da
              pianificare.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2 overflow-y-auto flex-1">
            {unplannedOrders.map((order) => (
              <div
                key={order.id}
                className="border rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {order.order_code ? `${order.order_code} · ` : ""}
                    {getPersonName(
                      order.customer?.first_name,
                      order.customer?.last_name,
                      "Cliente non associato",
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {order.description}
                  </p>
                  {order.work_phases?.some(
                    (p) => !p.start_date && p.status !== "completata",
                  ) && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {
                        order.work_phases.filter(
                          (p) => !p.start_date && p.status !== "completata",
                        ).length
                      }{" "}
                      lavorazioni senza data
                    </p>
                  )}
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
      <CalendarConflictsPanel
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        groups={conflictGroups}
        onAppointment={(id) => {
          const appointment = enrichedAppointments.find((a) => a.id === id);
          if (!appointment || appointment.riservato) return;
          setEditingAppointment(mapAppointmentToEditData(appointment));
          setAppointmentDialogOpen(true);
        }}
      />
    </div>
  );
}

export default function Calendar() {
  const { user, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  if (!user?.id || permissions.isLoading)
    return <Skeleton className="h-72 w-full" />;
  if (!effectiveCompany?.id)
    return (
      <p className="text-sm text-muted-foreground">
        Seleziona un’azienda per aprire il calendario.
      </p>
    );
  if (!permissions.canViewCalendar)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Non hai accesso al calendario aziendale.
      </p>
    );
  return (
    <ErrorBoundary title="Errore nel calendario">
      <CalendarInner key={`${effectiveCompany.id}:${user.id}`} />
    </ErrorBoundary>
  );
}

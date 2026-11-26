import { ProgrammaDelGiorno } from "@/components/programmazione/ProgrammazioneNelCalendario";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HardHat,
  MapPin,
  Search,
  Users,
  Video,
  Plus,
  AlertTriangle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { calendarWorkLocation } from "@/lib/calendar/navigation";
import {
  calendarEventGroup,
  calendarEventKey,
  calendarEventKind,
  calendarEventResources,
  calendarEventStatus,
  calendarEventTime,
  calendarEventTitle,
} from "@/lib/calendar/eventDetails";
import {
  etichettaCommessa,
  hasLogisticRisk,
  rischioPagamenti,
} from "@/lib/calendarUtils";
import type { CalendarEvent } from "@/lib/calendar/events";
import { CalendarEventTravel } from "./CalendarEventTravel";
import { CalendarSiteWeather } from "./CalendarSiteWeather";
import {
  CalendarEventPayments,
  CalendarEventPresence,
} from "./CalendarEventPanels";
import type { CalendarScope, CalendarWarehouseInfo } from "@/types/calendar";
import {
  weatherCodeToLabel,
  type WeatherDay,
  type LocationWeatherDay,
} from "@/hooks/useWeatherForecast";
import { dateFnsCampo, intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  contextLabel?: string;
  isLoading?: boolean;
  calendarScope?: CalendarScope;
  initialEventKey?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  events: CalendarEvent[];
  isMobile: boolean;
  readOnly: boolean;
  canEditOrders: boolean;
  canViewPayments: boolean;
  onCreateAppointment: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onOpenDay?: () => void;
  syncedAppointmentIds?: Set<string>;
  warehouseInfo?: Map<string, CalendarWarehouseInfo>;
  forecast?: WeatherDay;
  orderWeatherMap?: Map<
    string,
    {
      weather?: LocationWeatherDay;
      distanceKm?: number;
      durationLabel?: string;
      address?: string;
    }
  >;
}

const groups = [
  {
    id: "appointments",
    title: "Appuntamenti e impegni",
    label: "Appuntamenti",
  },
  { id: "work", title: "Cantieri e consegne", label: "Cantieri" },
  { id: "other", title: "Altri eventi", label: "Altri" },
] as const;

function DetailField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-3">
      <span
        className="mt-0.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 space-y-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="break-words text-sm leading-relaxed">{children}</dd>
      </div>
    </div>
  );
}

const dateLabel = (value: string) =>
  format(parseISO(value), "d MMM yyyy", { locale: dateFnsCampo() });
const dateRange = (from: string, to?: string | null) =>
  !to || from === to
    ? dateLabel(from)
    : `${dateLabel(from)} — ${dateLabel(to)}`;
const safeMeetingUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};

export function CalendarDayDetailsDialog(props: Props) {
  // Remount a ogni apertura/data: ricerca e dettaglio non rimangono sul giorno precedente.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && (
        <DayDetails key={format(props.date, "yyyy-MM-dd")} {...props} />
      )}
    </Dialog>
  );
}

function DayDetails({
  contextLabel,
  isLoading = false,
  calendarScope = "personal",
  initialEventKey,
  date,
  events,
  isMobile,
  readOnly,
  canEditOrders,
  canViewPayments,
  onOpenChange,
  onCreateAppointment,
  onEditEvent,
  onOpenDay,
  syncedAppointmentIds,
  warehouseInfo,
  forecast,
  orderWeatherMap,
}: Props) {
  const t = useT();
  const permissions = usePermissions();
  const canOpenIntervention =
    !permissions.isLoading && permissions.canViewTickets;
  const canOpenMaintenance =
    !permissions.isLoading && permissions.canViewManutenzione;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialEventKey ?? null,
  );
  const [showMobileDetail, setShowMobileDetail] = useState(
    isMobile && !!initialEventKey,
  );
  const [tabState, setTabState] = useState({ key: "", tab: "details" });
  const dateKey = format(date, "yyyy-MM-dd");
  const search = query.trim().toLocaleLowerCase("it");
  const ordered = [...events].sort(
    (a, b) =>
      (calendarEventTime(a) || "99:99").localeCompare(
        calendarEventTime(b) || "99:99",
      ) || calendarEventTitle(a).localeCompare(calendarEventTitle(b), "it"),
  );
  const filtered = ordered.filter((event) => {
    if (filter !== "all" && calendarEventGroup(event) !== filter) return false;
    const a = event.appointment;
    return [
      calendarEventTitle(event),
      event.order?.order_code,
      event.order && etichettaCommessa(event.order),
      event.order?.description,
      a?.order?.order_code,
      a?.description,
      a?.formatted_address,
      event.order?.indirizzo_lavori,
      a?.assigned_profile?.first_name,
      a?.assigned_profile?.last_name,
      a?.contact?.first_name,
      a?.contact?.last_name,
      event.busySlot?.team_name,
      event.leave?.employee?.first_name,
      event.leave?.employee?.last_name,
      ...calendarEventResources(event, dateKey),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("it")
      .includes(search);
  });
  const selected =
    filtered.find((event) => calendarEventKey(event) === selectedKey) ??
    filtered[0];
  const selectedIdentity = selected ? calendarEventKey(selected) : "";
  const requestedTab =
    tabState.key === selectedIdentity ? tabState.tab : "details";
  const detailTab =
    requestedTab === "payments" && !canViewPayments ? "details" : requestedTab;
  const detailTabs = [
    { id: "details", label: t("Dettagli") },
    { id: "presence", label: t("Presenze") },
    ...(canViewPayments ? [{ id: "payments", label: t("Incassi e SAL") }] : []),
  ];
  const detailOrderId =
    selected?.order?.id ||
    selected?.appointment?.order_id ||
    selected?.intervento?.order_id ||
    selected?.manutenzione?.order_id;
  const order = selected?.order;
  const appointment = selected?.appointment;
  const work = selected?.work;
  const busy = selected?.busySlot;
  const leave = selected?.leave;
  const resources = selected ? calendarEventResources(selected, dateKey) : [];
  const assignee =
    appointment?.assigned_profile ??
    appointment?.assigned ??
    selected?.intervento?.assigned_profile ??
    selected?.manutenzione?.assigned_profile;
  const person = assignee
    ? [assignee.first_name, assignee.last_name].filter(Boolean).join(" ")
    : "";
  const contact = appointment?.contact
    ? [appointment.contact.first_name, appointment.contact.last_name]
        .filter(Boolean)
        .join(" ")
    : "";
  const weather = order && orderWeatherMap?.get(order.id);
  const address =
    order?.indirizzo_lavori ||
    order?.work_address ||
    selected?.intervento?.indirizzo_intervento ||
    selected?.manutenzione?.indirizzo ||
    weather?.address ||
    appointment?.formatted_address ||
    [
      appointment?.address_line,
      appointment?.address_postal_code,
      appointment?.address_city,
      appointment?.address_province,
    ]
      .filter(Boolean)
      .join(", ");
  const payment = canViewPayments && order ? rischioPagamenti(order) : null;
  const warehouse = order && warehouseInfo?.get(order.id);
  const meetingUrl = safeMeetingUrl(appointment?.meeting_url);
  const status = selected && calendarEventStatus(selected);
  const endTime =
    appointment?.appointment_end_time?.slice(0, 5) ||
    work?.end_time?.slice(0, 5) ||
    (busy && !busy.is_all_day ? format(parseISO(busy.end_at), "HH:mm") : "");
  const startTime = selected && calendarEventTime(selected);
  const period = work
    ? dateRange(work.start_date, work.end_date)
    : leave
      ? dateRange(leave.start_date, leave.end_date)
      : busy
        ? `${format(parseISO(busy.start_at), "d MMM", { locale: dateFnsCampo() })} — ${format(parseISO(busy.end_at).getTime() - (busy.is_all_day ? 1 : 0), "d MMM yyyy", { locale: dateFnsCampo() })}`
        : dateLabel(dateKey);

  return (
    <DialogContent
      aria-labelledby={undefined}
      aria-label={t("Eventi del {data}", { data: format(date, "d MMMM yyyy", { locale: dateFnsCampo() }) })}
      className="flex h-[min(780px,90dvh)] max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden rounded-2xl p-0 max-sm:top-[50%] max-sm:h-[94dvh] max-sm:max-h-[94dvh] max-sm:w-[calc(100%_-_1rem)] max-sm:rounded-xl [&>button:last-child]:flex [&>button:last-child]:h-9 [&>button:last-child]:w-9 [&>button:last-child]:items-center [&>button:last-child]:justify-center"
    >
      <section
        className="flex min-h-0 flex-1 flex-col"
        aria-label={t("Dettaglio del giorno")}
      >
        <header className="shrink-0 border-b bg-muted/20 px-5 pb-4 pt-5 sm:px-6">
          <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            {t("Agenda del giorno")}
          </p>
          <DialogTitle className="pr-7 text-xl font-semibold capitalize sm:text-2xl">
            {format(date, "EEEE d MMMM", { locale: dateFnsCampo() })}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs">
            {contextLabel && <span>{contextLabel} · </span>}
            {isLoading
              ? t("Caricamento degli eventi…")
              : t("{n} eventi dalle fonti attive", { n: events.length })}{" "}
            · {format(date, "yyyy")}
          </DialogDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!readOnly && (
              <Button
                size="sm"
                className="h-9"
                aria-label={t("Nuovo appuntamento nel giorno selezionato")}
                onClick={onCreateAppointment}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {t("Appuntamento")}
              </Button>
            )}
            {onOpenDay && !isMobile && (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={onOpenDay}
              >
                {t("Agenda oraria")}
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
            {forecast && (
              <p className="text-xs text-muted-foreground sm:ml-auto">
                {t(weatherCodeToLabel(forecast.code))} · {forecast.minTemp}°–
                {forecast.maxTemp}°
              </p>
            )}
          </div>
          {/* La Programmazione del giorno (26/11/2026): chi va dove, a che ora. */}
          <div className="mt-3 max-h-48 overflow-y-auto">
            <ProgrammaDelGiorno giorno={date} onNaviga={() => onOpenChange(false)} />
          </div>
        </header>
        {isLoading ? (
          <div
            className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
            role="status"
          >
            {t("Caricamento del giorno…")}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <div
              aria-hidden={isMobile && showMobileDetail && !!selected}
              className={cn(
                "flex min-h-0 min-w-0 flex-col border-r bg-muted/10",
                isMobile && showMobileDetail && selected && "hidden",
              )}
            >
              <div className="shrink-0 space-y-3 border-b p-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus={false}
                    aria-label={t("Cerca negli eventi del giorno")}
                    placeholder={t("Cerca evento, commessa o persona…")}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setShowMobileDetail(false);
                    }}
                    className="h-10 bg-background pl-9"
                  />
                </div>
                <div
                  className="flex flex-wrap gap-1.5"
                  aria-label={t("Filtra eventi del giorno")}
                >
                  {[{ id: "all", label: "Tutti" }, ...groups].map((group) => {
                    const count =
                      group.id === "all"
                        ? events.length
                        : events.filter(
                            (e) => calendarEventGroup(e) === group.id,
                          ).length;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        aria-pressed={filter === group.id}
                        className={cn(
                          "rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary max-sm:min-h-10",
                          filter === group.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted",
                        )}
                        onClick={() => {
                          setFilter(group.id);
                          setSelectedKey(null);
                        }}
                      >
                        {t(group.label)}{" "}
                        <span className="ml-1 opacity-80">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground" role="status">
                  {filtered.length === events.length
                    ? t("Seleziona una voce per vedere tutti i dettagli.")
                    : t("{n} di {totale} eventi", { n: filtered.length, totale: events.length })}
                </p>
              </div>
              <nav
                aria-label={t("Eventi del giorno")}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
              >
                {groups.map((group) => {
                  const entries = filtered.filter(
                    (e) => calendarEventGroup(e) === group.id,
                  );
                  return (
                    entries.length > 0 && (
                      <div key={group.id} className="mb-3">
                        <h4 className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(group.title)}{" "}
                          <span className="ml-1">{entries.length}</span>
                        </h4>
                        <div className="space-y-1">
                          {entries.map((event) => {
                            const key = calendarEventKey(event),
                              active =
                                selected && calendarEventKey(selected) === key;
                            const code =
                              event.order?.order_code ||
                              event.appointment?.order?.order_code;
                            const title = calendarEventTitle(event);
                            return (
                              <button
                                key={key}
                                type="button"
                                aria-label={t("Mostra dettagli: {titolo}", { titolo: title + (code ? ` · ${code}` : "") })}
                                aria-pressed={Boolean(active)}
                                onClick={() => {
                                  setSelectedKey(key);
                                  setShowMobileDetail(true);
                                }}
                                className={cn(
                                  "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                                  active
                                    ? "border-primary/30 bg-primary/5"
                                    : "border-transparent hover:bg-muted/60",
                                )}
                              >
                                <span
                                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: event.color }}
                                />
                                <div className="min-w-0 flex-1">
                                  <span dir="auto" className="block break-words text-sm font-medium leading-snug">
                                    {title}
                                  </span>
                                  <span className="mt-1 block text-[11px] text-muted-foreground">
                                    {code ? `${code} · ` : ""}
                                    {event.order
                                      ? etichettaCommessa(event.order)
                                      : calendarEventKind(event)}
                                  </span>
                                  {calendarEventStatus(event) && (
                                    <span className="mt-1 block text-[10px] text-muted-foreground">
                                      {calendarEventStatus(event)}
                                    </span>
                                  )}
                                </div>
                                <span className="flex shrink-0 flex-col items-end gap-1.5 text-[11px] font-medium tabular-nums">
                                  <span>
                                    {calendarEventTime(event) ||
                                      (event.busySlot?.is_all_day || event.leave
                                        ? t("Giornata")
                                        : "—")}
                                  </span>
                                  <CalendarSiteWeather
                                    event={event}
                                    day={dateKey}
                                    compact
                                  />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-3 py-10 text-center">
                    <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      {events.length
                        ? t("Nessun evento corrisponde alla ricerca.")
                        : t("Nessun evento per questo giorno.")}
                    </p>
                    {events.length > 0 && (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                        }}
                      >
                        {t("Mostra tutti gli eventi")}
                      </Button>
                    )}
                  </div>
                )}
              </nav>
            </div>
            <article
              aria-label={t("Dettagli dell’evento selezionato")}
              aria-hidden={isMobile && (!showMobileDetail || !selected)}
              className={cn(
                "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background",
                isMobile && (!showMobileDetail || !selected) && "hidden",
              )}
            >
              {selected ? (
                <>
                  {isMobile && (
                    <div className="shrink-0 border-b px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10"
                        onClick={() => setShowMobileDetail(false)}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        {t("Torna agli eventi")}
                      </Button>
                    </div>
                  )}
                  <div className="shrink-0 border-b px-5 pt-4 sm:px-6">
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                          {calendarEventKind(selected)}
                        </span>
                        {status && (
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1",
                              status.startsWith("Complet") ||
                                status === "Approvata"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-blue-50 text-blue-700",
                            )}
                          >
                            {status}
                          </span>
                        )}
                      </div>
                      <h3 dir="auto" className="break-words text-xl font-semibold leading-snug">
                        {calendarEventTitle(selected)}
                      </h3>
                      {order && (
                        <Link
                          className="mt-2 inline-block break-words text-sm font-medium text-primary hover:underline"
                          to={`/azienda/ordini/${order.id}`}
                          onClick={() => onOpenChange(false)}
                        >
                          {order.order_code || t("Commessa")} ·{" "}
                          {etichettaCommessa(order)}
                        </Link>
                      )}
                    </div>

                    {detailOrderId && (
                      <div
                        role="tablist"
                        aria-label={t("Informazioni della commessa")}
                        className="mt-4 flex gap-3"
                      >
                        {detailTabs.map((tab, index) => (
                          <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={detailTab === tab.id}
                            tabIndex={detailTab === tab.id ? 0 : -1}
                            onKeyDown={(event) => {
                              const next =
                                event.key === "ArrowRight"
                                  ? (index + 1) % detailTabs.length
                                  : event.key === "ArrowLeft"
                                    ? (index + detailTabs.length - 1) %
                                      detailTabs.length
                                    : event.key === "Home"
                                      ? 0
                                      : event.key === "End"
                                        ? detailTabs.length - 1
                                        : null;
                              if (next === null) return;
                              event.preventDefault();
                              setTabState({
                                key: selectedIdentity,
                                tab: detailTabs[next].id,
                              });
                              const buttons =
                                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                                  "button",
                                );
                              buttons?.item(next)?.focus();
                            }}
                            className={cn(
                              "min-h-11 border-b-2 py-2 text-xs font-medium",
                              detailTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground",
                            )}
                            onClick={() =>
                              setTabState({
                                key: selectedIdentity,
                                tab: tab.id,
                              })
                            }
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    key={calendarEventKey(selected)}
                    role="tabpanel"
                    aria-label={
                      detailTab === "details"
                        ? t("Dettagli")
                        : detailTab === "payments"
                          ? t("Incassi e SAL")
                          : t("Presenze")
                    }
                    className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-6"
                  >
                    {detailTab === "details" ? (
                      <>
                        {" "}
                        <dl className="space-y-5">
                          <DetailField
                            icon={<Clock3 className="h-4 w-4" />}
                            label={t("Quando")}
                          >
                            <p>{period}</p>
                            <p className="font-medium">
                              {startTime
                                ? `${startTime}${endTime ? `–${endTime}` : ""}`
                                : busy?.is_all_day || leave
                                  ? t("Tutta la giornata")
                                  : t("Orario da definire")}
                            </p>
                          </DetailField>
                          {(order ||
                            appointment ||
                            selected.intervento ||
                            selected.manutenzione) && (
                            <DetailField
                              icon={<MapPin className="h-4 w-4" />}
                              label={order ? t("Cantiere") : t("Luogo")}
                            >
                              <p dir="auto">{address || t("Indirizzo non impostato")}</p>
                              {appointment?.address_notes && (
                                <p className="text-xs text-muted-foreground">
                                  {appointment.address_notes}
                                </p>
                              )}
                              <div className="mt-3 space-y-3">
                                <CalendarSiteWeather
                                  event={selected}
                                  day={dateKey}
                                />
                                <CalendarEventTravel
                                  key={selectedIdentity}
                                  event={selected}
                                  fallbackAddress={
                                    order ? weather?.address : undefined
                                  }
                                />
                              </div>
                            </DetailField>
                          )}
                          {work?.progress != null && (
                            <DetailField
                              icon={<HardHat className="h-4 w-4" />}
                              label={t("Avanzamento dichiarato della fase")}
                            >
                              {work.progress}%
                              {work.completed_date && (
                                <p className="text-xs text-muted-foreground">
                                  {t("Completata il {data}", { data: dateLabel(work.completed_date) })}
                                </p>
                              )}
                            </DetailField>
                          )}
                          {order && (
                            <DetailField
                              icon={<Users className="h-4 w-4" />}
                              label={t("Risorse pianificate per il giorno")}
                            >
                              {resources.length ? (
                                <ul className="space-y-1">
                                  {resources.map((name) => (
                                    <li key={name}>
                                      {name}
                                      {[
                                        ...new Set(
                                          (
                                            work?.resources ??
                                            order.resource_bookings ??
                                            []
                                          )
                                            .filter(
                                              (b) =>
                                                b.resourceName === name &&
                                                b.start_date <= dateKey &&
                                                b.end_date >= dateKey &&
                                                b.start_time,
                                            )
                                            .map(
                                              (b) =>
                                                `${b.start_time?.slice(0, 5)}${b.end_time ? `–${b.end_time.slice(0, 5)}` : ""}`,
                                            ),
                                        ),
                                      ].map((time) => (
                                        <span
                                          key={time}
                                          className="ml-2 text-xs text-muted-foreground"
                                        >
                                          {t("{orario} previsti", { orario: time })}
                                        </span>
                                      ))}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-muted-foreground">
                                  {t("Nessuna risorsa pianificata per questa data")}
                                </span>
                              )}
                            </DetailField>
                          )}
                          {(appointment ||
                            selected.intervento ||
                            selected.manutenzione) && (
                            <DetailField
                              icon={<Users className="h-4 w-4" />}
                              label={t("Responsabile")}
                            >
                              {person ||
                                (appointment?.assigned_to ||
                                selected.intervento?.assigned_to
                                  ? t("Responsabile assegnato, nome non disponibile")
                                  : t("Nessun responsabile assegnato"))}
                            </DetailField>
                          )}
                          {selected.intervento?.durata_ore != null && (
                            <DetailField
                              icon={<Clock3 className="h-4 w-4" />}
                              label={t("Durata prevista dell’intervento")}
                            >
                              {t("{n} h", { n: selected.intervento.durata_ore.toLocaleString(intlCampo()) })}
                            </DetailField>
                          )}
                          {selected.manutenzione && (
                            <DetailField
                              icon={<HardHat className="h-4 w-4" />}
                              label={t("Impianto e manutenzione")}
                            >
                              <p>
                                {selected.manutenzione.impianto ||
                                  t("Impianto non collegato")}
                              </p>
                              {selected.manutenzione.frequenza_tipo && (
                                <p className="text-xs text-muted-foreground">
                                  {t("Periodicità:")}{" "}
                                  {selected.manutenzione.frequenza_tipo.replaceAll(
                                    "_",
                                    " ",
                                  )}
                                </p>
                              )}
                              {selected.manutenzione.ultima_esecuzione && (
                                <p className="text-xs text-muted-foreground">
                                  {t("Ultima esecuzione {data}", {
                                    data: dateLabel(selected.manutenzione.ultima_esecuzione),
                                  })}
                                </p>
                              )}
                            </DetailField>
                          )}
                          {contact && (
                            <DetailField
                              icon={<Users className="h-4 w-4" />}
                              label={t("Contatto")}
                            >
                              {contact}
                            </DetailField>
                          )}
                          {appointment?.order_id && (
                            <DetailField
                              icon={<HardHat className="h-4 w-4" />}
                              label={t("Commessa collegata")}
                            >
                              <Link
                                to={calendarWorkLocation(appointment.order_id)}
                                onClick={() => onOpenChange(false)}
                                className="font-medium text-primary hover:underline"
                              >
                                {appointment.order?.order_code ||
                                  t("Apri commessa")}
                              </Link>
                              {appointment.order?.description && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {appointment.order.description}
                                </p>
                              )}
                            </DetailField>
                          )}
                          {busy?.team_name && (
                            <DetailField
                              icon={<Users className="h-4 w-4" />}
                              label={t("Squadra")}
                            >
                              {busy.team_name}
                            </DetailField>
                          )}
                          {leave?.employee && (
                            <DetailField
                              icon={<Users className="h-4 w-4" />}
                              label={t("Persona")}
                            >
                              {leave.employee.first_name}{" "}
                              {leave.employee.last_name}
                            </DetailField>
                          )}
                          {meetingUrl && (
                            <DetailField
                              icon={<Video className="h-4 w-4" />}
                              label={t("Videoriunione")}
                            >
                              <a
                                href={meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                              >
                                {t("Apri collegamento")}
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </a>
                            </DetailField>
                          )}
                        </dl>
                        {work?.phase_notes && (
                          <section className="space-y-2 rounded-xl border bg-muted/20 p-4">
                            <h4 className="text-xs font-semibold">
                              {t("Note della lavorazione")}
                            </h4>
                            <p dir="auto" className="whitespace-pre-wrap break-words text-sm">
                              {work.phase_notes}
                            </p>
                          </section>
                        )}
                        {(appointment?.description ||
                          order?.description ||
                          selected.intervento?.note_tecnico) && (
                          <section className="space-y-2 border-t pt-5">
                            <h4 className="text-xs font-semibold text-muted-foreground">
                              {appointment
                                ? t("Note e descrizione")
                                : selected.intervento
                                  ? t("Note dell’intervento")
                                  : t("Descrizione della commessa")}
                            </h4>
                            <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                              {appointment?.description ||
                                order?.description ||
                                selected.intervento?.note_tecnico}
                            </p>
                          </section>
                        )}
                        {((order && hasLogisticRisk(order)) ||
                          payment ||
                          warehouse ||
                          weather?.distanceKm != null ||
                          weather?.durationLabel) && (
                          <section className="space-y-3 rounded-xl border bg-muted/20 p-4">
                            <h4 className="text-xs font-semibold">{t("Da sapere")}</h4>
                            {order && hasLogisticRisk(order) && (
                              <p className="flex gap-2 text-xs leading-relaxed text-amber-700">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                {order.warehouse_arrival_date
                                  ? t("Arrivo merce dopo la posa")
                                  : t("Arrivo merce da confermare")}
                              </p>
                            )}
                            {payment && (
                              <p className="text-xs leading-relaxed text-amber-700">
                                {t("Consulta rate, incassi e SAL nella scheda Incassi e SAL.")}
                              </p>
                            )}
                            {warehouse && (
                              <p className="text-xs">
                                {t("Materiali: {pronti} pronti · {attesa} in attesa", {
                                  pronti: warehouse.readyCount,
                                  attesa: warehouse.pendingCount,
                                })}
                              </p>
                            )}
                            {(weather?.distanceKm != null ||
                              weather?.durationLabel) && (
                              <p className="text-xs text-muted-foreground">
                                {weather.distanceKm != null &&
                                  t("{km} km dalla sede", { km: weather.distanceKm })}
                                {weather.durationLabel &&
                                  ` · ${weather.durationLabel}`}
                              </p>
                            )}
                          </section>
                        )}
                        {appointment &&
                          syncedAppointmentIds?.has(appointment.id) && (
                            <p className="flex items-center gap-2 text-xs text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              {t("Sincronizzato con Google")}
                            </p>
                          )}
                      </>
                    ) : detailOrderId && detailTab === "payments" ? (
                      <CalendarEventPayments
                        orderId={detailOrderId}
                        onNavigate={() => onOpenChange(false)}
                      />
                    ) : detailOrderId ? (
                      <CalendarEventPresence
                        orderId={detailOrderId}
                        day={dateKey}
                        scope={calendarScope}
                        onNavigate={() => onOpenChange(false)}
                      />
                    ) : null}
                  </div>
                  {(order ||
                    (appointment && !readOnly) ||
                    (selected.intervento && canOpenIntervention) ||
                    (selected.manutenzione && canOpenMaintenance)) && (
                    <div className="flex shrink-0 flex-wrap gap-2 border-t bg-background px-5 py-3 sm:px-6">
                      {order && (
                        <Button size="sm" asChild>
                          <Link
                            to={calendarWorkLocation(order.id)}
                            onClick={() => onOpenChange(false)}
                          >
                            {t("Apri lavorazioni")}
                            <ArrowUpRight className="ml-1.5 h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      {selected.intervento && canOpenIntervention && (
                        <Button size="sm" asChild>
                          <Link
                            to={`/azienda/assistenza/${selected.intervento.id}`}
                            onClick={() => onOpenChange(false)}
                          >
                            {t("Apri intervento")}
                          </Link>
                        </Button>
                      )}
                      {selected.manutenzione && canOpenMaintenance && (
                        <Button size="sm" asChild>
                          <Link
                            to={
                              selected.manutenzione.impianto_id
                                ? `/azienda/manutenzione/impianto/${selected.manutenzione.impianto_id}`
                                : "/azienda/assistenza?vista=manutenzioni"
                            }
                            onClick={() => onOpenChange(false)}
                          >
                            {selected.manutenzione.impianto_id
                              ? t("Apri impianto")
                              : t("Apri manutenzioni")}
                          </Link>
                        </Button>
                      )}
                      {appointment && !readOnly && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEditEvent(selected)}
                        >
                          {t("Modifica appuntamento")}
                        </Button>
                      )}
                      {order &&
                        !work?.phase_id &&
                        canEditOrders &&
                        !readOnly && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onEditEvent(selected)}
                          >
                            {selected.type === "merce" && warehouse
                              ? t("Verifica materiali")
                              : t("Gestisci date")}
                          </Button>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                  <CalendarDays className="h-8 w-8" />
                  <p className="text-sm">
                    {events.length
                      ? t("Cambia i filtri per consultare un evento.")
                      : t("La giornata è libera dalle fonti selezionate.")}
                  </p>
                </div>
              )}
            </article>
          </div>
        )}
      </section>
    </DialogContent>
  );
}

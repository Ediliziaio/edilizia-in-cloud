import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  addDays,
  startOfDay,
} from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  HardHat,
  Clock3,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buildCalendarEvents, type CalendarEvent } from "@/lib/calendar/events";
import { calendarEventTime } from "@/lib/calendar/eventDetails";
import { CalendarDayDetailsDialog } from "./CalendarDayDetailsDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DEFAULT_CALENDAR_EVENT_COLORS,
  etichettaCommessa,
  WEEK_DAYS_IT,
  mapAppointmentToEditData,
  type CalendarEventColors,
} from "@/lib/calendarUtils";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import type {
  CalendarScope,
  CalendarOrder,
  CalendarAppointment,
  GoogleBusySlot,
  ApprovedLeave,
  CalendarWarehouseInfo,
  CalendarIntervento,
  CalendarManutenzione,
} from "@/types/calendar";
import {
  weatherCodeToEmoji,
  type WeatherDay,
  type MultiLocationWeather,
  type LocationWeatherDay,
} from "@/hooks/useWeatherForecast";
import {
  AppointmentDialog,
  type AppointmentData,
} from "@/components/appointments/AppointmentDialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface CalendarMonthViewProps {
  isLoading?: boolean;
  calendarScope?: CalendarScope;
  presentation?: "month" | "agenda";
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  approvedLeaves?: ApprovedLeave[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  syncedAppointmentIds?: Set<string>;
  hiddenEventTypes?: Set<string>;
  warehouseInfo?: Map<string, CalendarWarehouseInfo>;
  weatherForecast?: Map<string, WeatherDay>;
  calendarWeatherMulti?: MultiLocationWeather;
  orderWeatherMap?: Map<
    string,
    {
      weather?: LocationWeatherDay;
      distanceKm?: number;
      durationMin?: number;
      durationLabel?: string;
      address?: string;
    }
  >;
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
  onOpenDay?: (date: Date) => void;
  eventColors?: CalendarEventColors;
  /** Colore per COMMESSA (toggle "un colore per commessa"): se presente, le
   *  strisce lavoro lo usano al posto del verde unico di tipo. */
  orderColorFn?: (order: CalendarOrder) => string;
}

export function CalendarMonthView({
  isLoading = false,
  calendarScope = "personal",
  presentation = "month",
  orders,
  appointments = [],
  busySlots = [],
  approvedLeaves = [],
  currentDate,
  onDateChange,
  syncedAppointmentIds,
  hiddenEventTypes = new Set(),
  warehouseInfo,
  weatherForecast,
  calendarWeatherMulti,
  orderWeatherMap,
  interventi = [],
  manutenzioni = [],
  onOpenDay,
  eventColors = DEFAULT_CALENDAR_EVENT_COLORS,
  orderColorFn,
}: CalendarMonthViewProps) {
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] =
    useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState<
    string | undefined
  >();
  const [dayDetailsOpen, setDayDetailsOpen] = useState(false);
  const [warehouseDrawer, setWarehouseDrawer] =
    useState<CalendarWarehouseInfo | null>(null);

  const [agendaDay, setAgendaDay] = useState<Date | null>(null);
  const days = useMemo(() => {
    if (presentation === "agenda")
      return Array.from({ length: 7 }, (_, i) =>
        addDays(startOfDay(currentDate), i),
      );
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate, presentation]);

  const eventsByDate = useMemo(
    () =>
      buildCalendarEvents(days, {
        orders,
        appointments,
        busySlots,
        approvedLeaves,
        interventi,
        manutenzioni,
        hiddenEventTypes,
        eventColors,
        orderColorFn,
      }),
    [
      orders,
      appointments,
      busySlots,
      approvedLeaves,
      interventi,
      manutenzioni,
      hiddenEventTypes,
      days,
      eventColors,
      orderColorFn,
    ],
  );

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return eventsByDate.get(format(day, "yyyy-MM-dd")) || [];
  };

  const weekDays = WEEK_DAYS_IT;

  // Su mobile le celle restano compatte; il tap apre lo stesso dettaglio del giorno.
  const isMobile = useIsMobile();
  const selectedDate =
    presentation === "agenda" ? (agendaDay ?? currentDate) : currentDate;

  /** Riga d'agenda leggibile da un CalendarEvent (etichetta + azione). */
  const describeEvent = (
    event: CalendarEvent,
  ): { label: string; color: string; onClick?: () => void } => {
    if (event.type === "google_busy" && event.busySlot) {
      return {
        label: event.busySlot.team_name
          ? `${event.busySlot.team_name} · ${event.busySlot.summary || "impegno"}`
          : event.busySlot.summary || "Occupato (Google)",
        color: event.busySlot.team_color || event.color,
      };
    }
    if (event.type === "leave" && event.leave) {
      return {
        label:
          `Ferie/permesso · ${[event.leave.employee?.first_name, event.leave.employee?.last_name].filter(Boolean).join(" ")}`.trim(),
        color: event.color,
      };
    }
    if (event.type === "intervento" && event.intervento) {
      return { label: event.intervento.subject, color: event.color };
    }
    if (event.type === "manutenzione" && event.manutenzione) {
      return { label: event.manutenzione.titolo, color: event.color };
    }
    if (event.type === "appointment" && event.appointment) {
      return {
        label: event.appointment.title || "Appuntamento",
        color: event.color,
        onClick: () => {
          // Appuntamento commerciale di un collega: si vede che è occupato, non si apre.
          if (event.appointment!.riservato) return;
          setDayDetailsOpen(false);
          setEditingAppointment(mapAppointmentToEditData(event.appointment!));
          setAppointmentDialogOpen(true);
        },
      };
    }
    if (event.order) {
      const kind =
        event.type === "posa"
          ? "Posa"
          : event.type === "lavoro"
            ? "Lavoro"
            : "Merce";
      return {
        label:
          `${event.work?.phase_id ? event.work.name : kind} · ${etichettaCommessa(event.order)}`.trim(),
        color: event.color,
        onClick: () => {
          setDayDetailsOpen(false);
          if (event.type === "merce" && warehouseInfo?.get(event.order!.id)) {
            setWarehouseDrawer(warehouseInfo.get(event.order!.id)!);
          } else {
            setEditingOrder(event.order!);
          }
        },
      };
    }
    return { label: "Evento", color: event.color };
  };

  const selectedEvents = getEventsForDay(selectedDate);
  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const selectedForecast =
    calendarWeatherMulti?.get(selectedDateKey)?.[0] ??
    weatherForecast?.get(selectedDateKey);
  const eventTime = calendarEventTime;
  const previewLabel = (event: CalendarEvent) =>
    event.order
      ? `${event.work?.phase_id ? `${event.work.name} · ` : event.type === "posa" ? "Posa · " : event.type === "merce" ? "Merce · " : ""}${etichettaCommessa(event.order) || event.order.order_code || "Commessa"}`
      : describeEvent(event).label;
  const previewPriority = (event: CalendarEvent) =>
    event.appointment
      ? 0
      : event.type === "posa" || event.type === "merce"
        ? 1
        : event.type === "lavoro"
          ? 3
          : 2;

  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl border bg-card max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent"
      data-testid="work-calendar-month"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 max-sm:px-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold capitalize">
            {presentation === "agenda"
              ? `${format(days[0], "d MMM", { locale: it })} — ${format(days[6], "d MMM yyyy", { locale: it })}`
              : format(currentDate, "MMMM yyyy", { locale: it })}
          </h2>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={
                presentation === "agenda"
                  ? "Sette giorni precedenti"
                  : "Mese precedente"
              }
              onClick={() =>
                onDateChange(
                  presentation === "agenda"
                    ? addDays(currentDate, -7)
                    : subMonths(currentDate, 1),
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={
                presentation === "agenda"
                  ? "Sette giorni successivi"
                  : "Mese successivo"
              }
              onClick={() =>
                onDateChange(
                  presentation === "agenda"
                    ? addDays(currentDate, 7)
                    : addMonths(currentDate, 1),
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {!isMobile && (
          <div className="flex items-center gap-4">
            <div
              className="hidden items-center gap-3 text-[11px] text-muted-foreground lg:flex"
              aria-label="Legenda degli eventi"
            >
              <span className="flex items-center gap-1.5">
                <HardHat className="h-3.5 w-3.5" />
                Cantieri
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                Appuntamenti
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 text-xs"
              aria-label="Apri dettaglio del giorno selezionato"
              onClick={() => setDayDetailsOpen(true)}
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              {format(selectedDate, "d MMM", { locale: it })} ·{" "}
              {selectedEvents.length} eventi
            </Button>
          </div>
        )}
      </div>
      {presentation === "agenda" ? (
        <div
          className="divide-y border-t"
          role="region"
          aria-label="Prossimi sette giorni"
        >
          {days.map((day) => {
            const events = getEventsForDay(day);
            const ordered = [...events].sort(
              (a, b) =>
                previewPriority(a) - previewPriority(b) ||
                eventTime(a).localeCompare(eventTime(b)),
            );
            const open = () => {
              setAgendaDay(day);
              setDayDetailsOpen(true);
            };
            return (
              <section
                key={format(day, "yyyy-MM-dd")}
                className="grid gap-3 px-4 py-4 sm:grid-cols-[130px_minmax(0,1fr)]"
              >
                <div>
                  <h3 className="text-sm font-semibold capitalize">
                    {format(day, "EEEE d MMM", { locale: it })}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {events.length
                      ? `${events.length} eventi`
                      : "Nessun impegno"}
                  </p>
                </div>
                <div className="space-y-1">
                  {ordered.slice(0, 3).map((event, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={open}
                      className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/40"
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: event.color }}
                      />
                      <span className="w-10 shrink-0 text-xs font-semibold tabular-nums">
                        {eventTime(event) || "Giorno"}
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="line-clamp-2">
                          {previewLabel(event)}
                        </span>
                        {event.order?.order_code && (
                          <span className="text-[11px] text-muted-foreground">
                            {event.order.order_code}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                  {events.length > 3 && (
                    <button
                      type="button"
                      onClick={open}
                      className="px-2 py-2 text-xs font-medium text-primary hover:underline"
                    >
                      Apri tutti i {events.length} eventi
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden border-t bg-background max-sm:rounded-xl max-sm:border">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekDays.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7" aria-label="Giorni del calendario">
            {days.map((day) => {
              const date = format(day, "yyyy-MM-dd");
              const events = getEventsForDay(day);
              const selected = isSameDay(day, selectedDate);
              const today = isSameDay(day, new Date());
              const work = new Set(
                events.filter((e) => e.order).map((e) => e.order!.id),
              ).size;
              const meetings = events.filter((e) => e.appointment).length;
              const other =
                events.length - events.filter((e) => e.order).length - meetings;
              const colors = [...new Set(events.map((e) => e.color))].slice(
                0,
                3,
              );
              const previews = [...events]
                .sort(
                  (a, b) =>
                    previewPriority(a) - previewPriority(b) ||
                    eventTime(a).localeCompare(eventTime(b)) ||
                    previewLabel(a).localeCompare(previewLabel(b)),
                )
                .slice(0, 2);
              return (
                <button
                  key={date}
                  type="button"
                  aria-pressed={selected}
                  aria-current={today ? "date" : undefined}
                  aria-label={`${format(day, "EEEE d MMMM yyyy", { locale: it })}: ${work} cantieri, ${meetings} appuntamenti, ${other} altri eventi`}
                  title={previews
                    .map(
                      (e) =>
                        `${eventTime(e)} ${previewLabel(e)}${e.order?.order_code ? ` · ${e.order.order_code}` : ""}`,
                    )
                    .join("\n")}
                  onClick={() => {
                    onDateChange(day);
                    setDayDetailsOpen(true);
                  }}
                  className={cn(
                    "flex min-w-0 flex-col items-stretch justify-start border-b border-r p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:bg-muted/30",
                    isMobile ? "h-14 text-center" : "h-[144px]",
                    !isSameMonth(day, currentDate) &&
                      "text-muted-foreground bg-muted/15",
                    selected && "bg-primary/5 ring-1 ring-inset ring-primary",
                    day.getDay() % 6 === 0 && !selected && "bg-muted/20",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex items-center gap-1",
                      isMobile && "justify-center",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs",
                        today && "bg-primary font-bold text-primary-foreground",
                        selected && !today && "font-bold text-primary",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {!isMobile && weatherForecast?.get(date) && (
                      <span className="text-[10px]">
                        {weatherCodeToEmoji(weatherForecast.get(date)!.code)}
                      </span>
                    )}
                  </div>
                  {isMobile ? (
                    <div className="flex items-center justify-center gap-0.5">
                      {colors.map((c) => (
                        <span
                          key={c}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      {events.length > 0 && (
                        <span className="ml-1 text-[9px] text-muted-foreground">
                          {events.length}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {previews.map((event, index) => (
                        <div
                          key={`${event.type}:${event.order?.id || event.appointment?.id || index}`}
                          className={cn(
                            "flex min-w-0 items-start gap-1.5 rounded px-1.5 py-0.5 text-[11px] leading-4",
                            event.order && "bg-muted/60",
                          )}
                          title={`${eventTime(event)} ${previewLabel(event)}${event.order?.order_code ? ` · ${event.order.order_code}` : ""}`}
                        >
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: event.color }}
                          />
                          {eventTime(event) && (
                            <span className="shrink-0 text-[10px] font-semibold tabular-nums">
                              {eventTime(event)}
                            </span>
                          )}
                          <span className="line-clamp-2 min-w-0 flex-1">
                            {previewLabel(event)}
                          </span>
                          {event.order?.order_code && (
                            <span
                              className="ml-auto shrink-0 text-[9px] tabular-nums text-muted-foreground"
                              aria-hidden="true"
                            >
                              {event.order.order_code
                                .split("-")
                                .at(-1)
                                ?.slice(-8)}
                            </span>
                          )}
                        </div>
                      ))}
                      {events.length > previews.length && (
                        <span className="block px-2 pt-0.5 text-[10px] font-medium text-muted-foreground">
                          +{events.length - previews.length} altri eventi
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="px-4 py-2.5 text-[11px] text-muted-foreground max-sm:px-0">
        Seleziona un giorno per consultare l’agenda completa e le risorse
        assegnate.
      </p>
      <CalendarDayDetailsDialog
        isLoading={isLoading}
        calendarScope={calendarScope}
        open={dayDetailsOpen}
        onOpenChange={setDayDetailsOpen}
        date={selectedDate}
        events={selectedEvents}
        isMobile={isMobile}
        readOnly={permissions.solaLettura}
        canEditOrders={permissions.canEditOrders}
        canViewPayments={permissions.canViewScadenzario}
        syncedAppointmentIds={syncedAppointmentIds}
        warehouseInfo={warehouseInfo}
        forecast={selectedForecast}
        orderWeatherMap={orderWeatherMap}
        onCreateAppointment={() => {
          setDayDetailsOpen(false);
          setEditingAppointment(null);
          setNewAppointmentDate(selectedDateKey);
          setAppointmentDialogOpen(true);
        }}
        onEditEvent={(event) => describeEvent(event).onClick?.()}
        onOpenDay={
          onOpenDay
            ? () => {
                setDayDetailsOpen(false);
                onOpenDay(selectedDate);
              }
            : undefined
        }
      />

      {editingOrder && (
        <EditOrderDatesDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => !open && setEditingOrder(null)}
          orderWeatherInfo={orderWeatherMap?.get(editingOrder.id)}
        />
      )}

      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={(open) => {
          setAppointmentDialogOpen(open);
          if (!open) {
            setEditingAppointment(null);
            setNewAppointmentDate(undefined);
          }
        }}
        appointment={editingAppointment}
        defaultDate={newAppointmentDate}
        onSaved={() => {
          setEditingAppointment(null);
          setNewAppointmentDate(undefined);
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        }}
        showOrderSelect={true}
        hideMarketingFields={true}
      />

      {/* Warehouse mini-drawer */}
      {warehouseDrawer && (
        <Sheet
          open={!!warehouseDrawer}
          onOpenChange={(open) => !open && setWarehouseDrawer(null)}
        >
          <SheetContent side="right" className="w-full sm:max-w-sm">
            <SheetHeader>
              <SheetTitle className="text-sm">
                {warehouseDrawer.orderCode
                  ? `${warehouseDrawer.orderCode} · `
                  : ""}
                {warehouseDrawer.customerName}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  ✅ {warehouseDrawer.readyCount} pronti
                </span>
                <span className="text-amber-600 font-medium">
                  ⏳ {warehouseDrawer.pendingCount} in attesa
                </span>
              </div>
              <div className="space-y-1">
                {warehouseDrawer.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-xs border rounded px-2 py-1"
                  >
                    <span className="truncate">{item.name}</span>
                    <span
                      className={`ml-2 shrink-0 font-medium ${item.status === "in_magazzino" || item.status === "installato" ? "text-green-600" : "text-amber-600"}`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                to={`/azienda/ordini/${warehouseDrawer.orderId}`}
                className="block w-full text-center text-xs text-primary hover:underline mt-2"
                onClick={() => setWarehouseDrawer(null)}
              >
                Vai all'ordine completo →
              </Link>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

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
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Hammer, MapPin, Package, Wrench, AlertTriangle, Users, UsersRound, CalendarClock, Check, Settings } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hasLogisticRisk, getEmployeeInitials, WEEK_DAYS_IT, APPOINTMENT_ICONS, mapAppointmentToEditData } from "@/lib/calendarUtils";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import type { CalendarOrder, CalendarAppointment, GoogleBusySlot, ApprovedLeave, CalendarWarehouseInfo, CalendarIntervento, CalendarManutenzione } from "@/types/calendar";
import { weatherCodeToEmoji, weatherCodeToLabel, type WeatherDay, type MultiLocationWeather, type LocationWeatherDay } from "@/hooks/useWeatherForecast";
import { WeatherBadgeMulti } from "./WeatherBadge";
import { Navigation } from "lucide-react";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface CalendarEvent {
  type: "posa" | "merce" | "lavoro" | "appointment" | "google_busy" | "leave" | "intervento" | "manutenzione";
  order?: CalendarOrder;
  appointment?: CalendarAppointment;
  busySlot?: GoogleBusySlot;
  leave?: ApprovedLeave;
  intervento?: CalendarIntervento;
  manutenzione?: CalendarManutenzione;
  color: string;
}


interface CalendarMonthViewProps {
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
  orderWeatherMap?: Map<string, { weather?: LocationWeatherDay; distanceKm?: number; durationMin?: number; durationLabel?: string; address?: string }>;
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
}

export function CalendarMonthView({
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
}: CalendarMonthViewProps) {
  const queryClient = useQueryClient();
  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [newAppointmentDate, setNewAppointmentDate] = useState<string | undefined>();
  const [warehouseDrawer, setWarehouseDrawer] = useState<CalendarWarehouseInfo | null>(null);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Pre-compute events by date string for O(1) lookups per day instead of O(orders * days)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const addEvent = (dateStr: string, event: CalendarEvent) => {
      const existing = map.get(dateStr);
      if (existing) existing.push(event);
      else map.set(dateStr, [event]);
    };
    const addEventForRange = (start: Date, end: Date, event: CalendarEvent) => {
      // Clamp range to visible calendar days to avoid iterating huge ranges
      const rangeStart = days.length > 0 && start < days[0] ? days[0] : start;
      const rangeEnd = days.length > 0 && end > days[days.length - 1] ? days[days.length - 1] : end;
      const cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        addEvent(format(cursor, "yyyy-MM-dd"), { ...event });
        cursor.setDate(cursor.getDate() + 1);
      }
    };

    orders.forEach((order) => {
      if (!hiddenEventTypes.has("posa") && order.expected_date) {
        addEvent(order.expected_date, { type: "posa", order, color: "#3B82F6" });
      }
      if (!hiddenEventTypes.has("merce") && order.warehouse_arrival_date) {
        addEvent(order.warehouse_arrival_date, { type: "merce", order, color: "#F59E0B" });
      }
      if (!hiddenEventTypes.has("lavoro") && order.work_start_date) {
        const workStart = parseISO(order.work_start_date);
        const workEnd = order.work_end_date ? parseISO(order.work_end_date) : workStart;
        addEventForRange(workStart, workEnd, { type: "lavoro", order, color: "#22C55E" });
      }
    });
    if (!hiddenEventTypes.has("appuntamento")) {
      appointments.forEach((apt) => {
        addEvent(apt.appointment_date, { type: "appointment", appointment: apt, color: "#6366F1" });
      });
    }
    if (!hiddenEventTypes.has("google_busy")) {
      busySlots.forEach((slot) => {
        const slotStart = parseISO(slot.start_at);
        if (slot.is_all_day) {
          addEvent(format(slotStart, "yyyy-MM-dd"), { type: "google_busy", busySlot: slot, color: "#9CA3AF" });
        } else {
          const slotEnd = parseISO(slot.end_at);
          addEventForRange(slotStart, slotEnd, { type: "google_busy", busySlot: slot, color: "#9CA3AF" });
        }
      });
    }
    if (!hiddenEventTypes.has("leaves")) {
      approvedLeaves.forEach((lr) => {
        addEventForRange(parseISO(lr.start_date), parseISO(lr.end_date), { type: "leave", leave: lr, color: "#F59E0B" });
      });
    }
    if (!hiddenEventTypes.has("intervento")) {
      interventi.forEach((iv) => {
        if (iv.data_intervento_prevista) {
          addEvent(iv.data_intervento_prevista, { type: "intervento", intervento: iv, color: "#E87722" });
        }
      });
    }
    if (!hiddenEventTypes.has("manutenzione")) {
      manutenzioni.forEach((mn) => {
        if (mn.prossima_scadenza) {
          addEvent(mn.prossima_scadenza, { type: "manutenzione", manutenzione: mn, color: "#3B82F6" });
        }
      });
    }
    return map;
  }, [orders, appointments, busySlots, approvedLeaves, interventi, manutenzioni, hiddenEventTypes, days]);

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return eventsByDate.get(format(day, "yyyy-MM-dd")) || [];
  };

  const weekDays = WEEK_DAYS_IT;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => onDateChange(subMonths(currentDate, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize">
          {format(currentDate, "MMMM yyyy", { locale: it })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => onDateChange(addMonths(currentDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
          {weekDays.map((day) => (
            <div
              key={day}
              className="bg-muted-foreground/5 p-2 text-center text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}

          {days.map((day, dayIdx) => {
            const dayEvents = getEventsForDay(day);
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);

            return (
              <div
                key={dayIdx}
                onClick={() => {
                  setEditingAppointment(null);
                  setNewAppointmentDate(format(day, "yyyy-MM-dd"));
                  setAppointmentDialogOpen(true);
                }}
                className={cn(
                  "min-h-[100px] bg-background p-1 transition-colors cursor-pointer hover:bg-muted/30",
                  !isCurrentMonth && "bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <div
                    className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                      isToday && "bg-primary text-primary-foreground",
                      !isCurrentMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  {(() => {
                    const dateKey = format(day, "yyyy-MM-dd");
                    // Preferisci multi-location se disponibile
                    if (calendarWeatherMulti) {
                      const locs = calendarWeatherMulti.get(dateKey);
                      if (locs && locs.length > 0) return <WeatherBadgeMulti locations={locs} size="sm" />;
                    }
                    // Fallback al meteo singolo
                    if (weatherForecast) {
                      const w = weatherForecast.get(dateKey);
                      return w ? <span className="text-[10px] leading-none">{weatherCodeToEmoji(w.code)}</span> : null;
                    }
                    return null;
                  })()}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 5).map((event, eventIdx) => {
                    if (event.type === "google_busy" && event.busySlot) {
                      return (
                        <Tooltip key={`busy-${event.busySlot.id}-${eventIdx}`}>
                          <TooltipTrigger asChild>
                            <div className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/40 bg-muted/60 text-muted-foreground truncate cursor-default">
                              <CalendarClock className="h-3 w-3 flex-shrink-0 opacity-60" />
                              <span className="truncate">{event.busySlot.summary || "Occupato"}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-semibold">Slot occupato Google</p>
                            {event.busySlot.summary && <p className="text-xs">{event.busySlot.summary}</p>}
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    if (event.type === "appointment" && event.appointment) {
                      const apt = event.appointment;
                      const AptIcon = APPOINTMENT_ICONS[apt.appointment_type] || CalendarClock;
                      const isSynced = syncedAppointmentIds?.has(apt.id);
                      return (
                        <Tooltip key={`apt-${apt.id}-${eventIdx}`}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAppointment(mapAppointmentToEditData(apt));
                                setNewAppointmentDate(undefined);
                                setAppointmentDialogOpen(true);
                              }}
                              className={cn("w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white transition-opacity hover:opacity-80 truncate", apt.is_completed && "opacity-50")}
                              style={{ backgroundColor: event.color }}
                            >
                              <AptIcon className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate font-medium">{apt.title}</span>
                              {isSynced && <Check className="h-3 w-3 flex-shrink-0 text-green-200" />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-semibold">{apt.title}</p>
                            {apt.appointment_time && <p className="text-xs">Ore: {apt.appointment_time.slice(0, 5)}</p>}
                            {apt.description && <p className="text-xs text-muted-foreground">{apt.description}</p>}
                            {apt.assigned_profile && <p className="text-xs flex items-center gap-1"><Users className="h-3 w-3" />Assegnato a: {apt.assigned_profile.first_name} {apt.assigned_profile.last_name}</p>}
                            {apt.formatted_address && (
                              <a
                                href={apt.lat && apt.lng ? `https://www.google.com/maps/search/?api=1&query=${apt.lat},${apt.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(apt.formatted_address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{apt.formatted_address}</span>
                              </a>
                            )}
                            {isSynced && <p className="text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Sincronizzato con Google</p>}
                            <p className="text-xs text-primary mt-1">Clicca per modificare</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    if (event.type === "leave" && event.leave) {
                      const emp = event.leave.employee;
                      const empName = emp ? `${emp.first_name} ${emp.last_name}` : "";
                      return (
                        <Tooltip key={`leave-${event.leave.id}-${eventIdx}`}>
                          <TooltipTrigger asChild>
                            <div className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/20 border-l-2 border-amber-500 text-amber-900 dark:text-amber-200 truncate cursor-default">
                              <span className="truncate">🏖 {empName}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-semibold">{event.leave.type === "ferie" ? "Ferie" : "Permesso"}</p>
                            <p className="text-sm">{empName}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    if (event.type === "intervento" && event.intervento) {
                      return (
                        <Tooltip key={`iv-${event.intervento.id}-${eventIdx}`}>
                          <TooltipTrigger asChild>
                            <div
                              className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white truncate cursor-default"
                              style={{ backgroundColor: event.color }}
                            >
                              <Wrench className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate font-medium">{event.intervento.subject}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-semibold">Intervento</p>
                            <p className="text-sm">{event.intervento.subject}</p>
                            <p className="text-xs text-muted-foreground capitalize">{event.intervento.status}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    if (event.type === "manutenzione" && event.manutenzione) {
                      return (
                        <Tooltip key={`mn-${event.manutenzione.id}-${eventIdx}`}>
                          <TooltipTrigger asChild>
                            <div
                              className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white truncate cursor-default"
                              style={{ backgroundColor: event.color }}
                            >
                              <Settings className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate font-medium">{event.manutenzione.titolo}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-semibold">Manutenzione</p>
                            <p className="text-sm">{event.manutenzione.titolo}</p>
                            <p className="text-xs text-muted-foreground capitalize">{event.manutenzione.stato}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    if (!event.order) return null;
                    const logisticRisk = event.type === "posa" && hasLogisticRisk(event.order);
                    const initials = getEmployeeInitials(event.order);
                    const whInfo = event.type === "merce" && warehouseInfo ? warehouseInfo.get(event.order.id) : undefined;

                    return (
                      <Tooltip key={`${event.order.id}-${event.type}-${eventIdx}`}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (event.type === "merce" && whInfo) {
                                setWarehouseDrawer(whInfo);
                              } else {
                                setEditingOrder(event.order!);
                              }
                            }}
                            className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white transition-opacity hover:opacity-80 truncate"
                            style={{ backgroundColor: event.color }}
                          >
                            {event.order.status && (
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: event.order.status.color }} />
                            )}
                            {event.type === "posa" ? <Hammer className="h-3 w-3 flex-shrink-0" /> : event.type === "lavoro" ? <Wrench className="h-3 w-3 flex-shrink-0" /> : <Package className="h-3 w-3 flex-shrink-0" />}
                            <span className="truncate font-medium">
                              {event.order.order_code || "Ordine"} - {event.order.customer.last_name}
                            </span>
                            {logisticRisk && <AlertTriangle className="h-3 w-3 flex-shrink-0 text-yellow-200" />}
                            {(event.type === "posa" || event.type === "lavoro") && (() => {
                              const empCount = event.order!.order_employees?.length ?? 0;
                              if (empCount === 0) return (
                                <span className="ml-auto shrink-0 text-[9px] bg-red-500/80 rounded px-0.5">!</span>
                              );
                              return (
                                <span className="ml-auto shrink-0 text-[9px] bg-white/20 rounded px-0.5">{empCount}op</span>
                              );
                            })()}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          {(() => {
                            const owInfo = orderWeatherMap?.get(event.order!.id);
                            const orderAddress = event.order!.indirizzo_lavori || owInfo?.address;
                            return (
                              <div className="space-y-1">
                                <p className="font-semibold">{event.order!.order_code || "N/A"} - {event.type === "posa" ? "Data Posa" : event.type === "lavoro" ? "Lavori in corso" : "Arrivo Merce"}</p>
                                <p className="text-sm">{event.order!.customer.first_name} {event.order!.customer.last_name}</p>
                                {event.order!.description && <p className="text-xs text-muted-foreground line-clamp-2">{event.order!.description}</p>}
                                {orderAddress && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{orderAddress}</span>
                                  </div>
                                )}
                                {event.order!.status && (
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: event.order!.status.color }} />
                                    <span className="text-xs">{event.order!.status.name}</span>
                                  </div>
                                )}
                                {initials ? (
                                  <div className="flex items-center gap-1 text-xs"><Users className="h-3 w-3" /><span>{initials}</span></div>
                                ) : (
                                  <div className="flex items-center gap-1 text-xs text-amber-500"><Users className="h-3 w-3" /><span>Nessuna squadra</span></div>
                                )}
                                {(() => {
                                  const extNames = event.order!.order_external_teams?.map((aet) => aet.external_team.name).join(", ");
                                  return extNames ? (<div className="flex items-center gap-1 text-xs"><UsersRound className="h-3 w-3" /><span>{extNames}</span></div>) : null;
                                })()}
                                {/* Meteo + Distanza cantiere */}
                                {owInfo && (owInfo.weather || owInfo.distanceKm != null) && (
                                  <div className="mt-1 pt-1 border-t border-border/50 space-y-0.5">
                                    {owInfo.distanceKm != null && (
                                      <div className="flex items-center gap-1 text-xs">
                                        <Navigation className="h-3 w-3 text-blue-500 shrink-0" />
                                        <span className="font-medium">{owInfo.distanceKm} km</span>
                                        {owInfo.durationLabel && (
                                          <span className="text-muted-foreground">· {owInfo.durationLabel} dalla sede</span>
                                        )}
                                      </div>
                                    )}
                                    {owInfo.weather && (
                                      <div className="flex items-center gap-1.5 text-xs">
                                        <span className="text-base leading-none">{weatherCodeToEmoji(owInfo.weather.code)}</span>
                                        <span className="font-medium">{weatherCodeToLabel(owInfo.weather.code)}</span>
                                        <span>{owInfo.weather.minTemp}°–{owInfo.weather.maxTemp}°</span>
                                        {owInfo.weather.precip > 0 && <span className="text-blue-600">{owInfo.weather.precip}mm</span>}
                                        {owInfo.weather.precip > 20 && <span className="text-red-500 font-medium">⚠️</span>}
                                        {owInfo.weather.precip > 5 && owInfo.weather.precip <= 20 && <span className="text-orange-500">⚠️</span>}
                                      </div>
                                    )}
                                  </div>
                                )}
                                {logisticRisk && (
                                  <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                                    <AlertTriangle className="h-3 w-3" />
                                    {!event.order!.warehouse_arrival_date ? "Merce non confermata" : "Merce arriva dopo la posa"}
                                  </div>
                                )}
                                {event.type === "merce" && whInfo && (
                                  <div className="mt-1 space-y-1 border-t pt-1">
                                    <div className="flex gap-3 text-xs">
                                      <span className="text-green-600 font-medium">✅ {whInfo.readyCount} pronti</span>
                                      <span className="text-amber-600 font-medium">⏳ {whInfo.pendingCount} in attesa</span>
                                    </div>
                                    {whInfo.items.slice(0, 3).map(item => (
                                      <div key={item.id} className="flex items-center justify-between text-xs">
                                        <span className="truncate">{item.name}</span>
                                        <span className={`ml-2 shrink-0 font-medium ${item.status === "in_magazzino" || item.status === "installato" ? "text-green-600" : "text-amber-600"}`}>{item.status}</span>
                                      </div>
                                    ))}
                                    <p className="text-xs text-primary cursor-pointer" onClick={(e) => { e.stopPropagation(); setWarehouseDrawer(whInfo); }}>Vedi dettaglio →</p>
                                  </div>
                                )}
                                <p className="text-xs text-primary mt-1">{event.type === "merce" && whInfo ? "Clicca per i dettagli magazzino" : "Clicca per modificare le date"}</p>
                              </div>
                            );
                          })()}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {dayEvents.length > 5 && (
                    <div className="text-xs text-muted-foreground text-center">+{dayEvents.length - 5} altri</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      {editingOrder && (
        <EditOrderDatesDialog order={editingOrder} open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)} orderWeatherInfo={orderWeatherMap?.get(editingOrder.id)} />
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
        <Sheet open={!!warehouseDrawer} onOpenChange={(open) => !open && setWarehouseDrawer(null)}>
          <SheetContent side="right" className="w-full sm:max-w-sm">
            <SheetHeader>
              <SheetTitle className="text-sm">
                {warehouseDrawer.orderCode ? `${warehouseDrawer.orderCode} · ` : ""}
                {warehouseDrawer.customerName}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">✅ {warehouseDrawer.readyCount} pronti</span>
                <span className="text-amber-600 font-medium">⏳ {warehouseDrawer.pendingCount} in attesa</span>
              </div>
              <div className="space-y-1">
                {warehouseDrawer.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-xs border rounded px-2 py-1">
                    <span className="truncate">{item.name}</span>
                    <span className={`ml-2 shrink-0 font-medium ${item.status === "in_magazzino" || item.status === "installato" ? "text-green-600" : "text-amber-600"}`}>
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
    </Card>
  );
}

import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Hammer, Package, AlertTriangle, Users, UsersRound, CalendarClock, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { hasLogisticRisk, getEmployeeInitials, WEEK_DAYS_IT, APPOINTMENT_ICONS, mapAppointmentToEditData } from "@/lib/calendarUtils";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import type { CalendarOrder, CalendarAppointment, GoogleBusySlot } from "@/types/calendar";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";

interface CalendarEvent {
  type: "posa" | "merce" | "appointment" | "google_busy";
  order?: CalendarOrder;
  appointment?: CalendarAppointment;
  busySlot?: GoogleBusySlot;
  color: string;
}



interface CalendarMonthViewProps {
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  syncedAppointmentIds?: Set<string>;
  hiddenEventTypes?: Set<string>;
}

export function CalendarMonthView({
  orders,
  appointments = [],
  busySlots = [],
  currentDate,
  onDateChange,
  syncedAppointmentIds,
  hiddenEventTypes = new Set(),
}: CalendarMonthViewProps) {
  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    const events: CalendarEvent[] = [];
    orders.forEach((order) => {
      if (!hiddenEventTypes.has("posa") && order.expected_date && isSameDay(parseISO(order.expected_date), day)) {
        events.push({ type: "posa", order, color: "#3B82F6" });
      }
      if (!hiddenEventTypes.has("merce") && order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day)) {
        events.push({ type: "merce", order, color: "#F59E0B" });
      }
    });
    if (!hiddenEventTypes.has("appuntamento")) {
      appointments.forEach((apt) => {
        if (isSameDay(parseISO(apt.appointment_date), day)) {
          events.push({ type: "appointment", appointment: apt, color: "#6366F1" });
        }
      });
    }
    if (!hiddenEventTypes.has("google_busy")) {
      busySlots.forEach((slot) => {
        const slotStart = parseISO(slot.start_at);
        const slotEnd = parseISO(slot.end_at);
        if (slot.is_all_day ? isSameDay(slotStart, day) : (day >= slotStart && day <= slotEnd) || isSameDay(slotStart, day)) {
          events.push({ type: "google_busy", busySlot: slot, color: "#9CA3AF" });
        }
      });
    }
    return events;
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
                className={cn(
                  "min-h-[100px] bg-background p-1 transition-colors",
                  !isCurrentMonth && "bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground",
                    !isCurrentMonth && "text-muted-foreground"
                  )}
                >
                  {format(day, "d")}
                </div>

                <div className="space-y-1">
                  {dayEvents.slice(0, 4).map((event, eventIdx) => {
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
                              onClick={() => {
                                setEditingAppointment(mapAppointmentToEditData(apt));
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
                            {isSynced && <p className="text-xs text-green-500 flex items-center gap-1"><Check className="h-3 w-3" />Sincronizzato con Google</p>}
                            <p className="text-xs text-primary mt-1">Clicca per modificare</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    if (!event.order) return null;
                    const logisticRisk = event.type === "posa" && hasLogisticRisk(event.order);
                    const initials = getEmployeeInitials(event.order);

                    return (
                      <Tooltip key={`${event.order.id}-${event.type}-${eventIdx}`}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setEditingOrder(event.order!)}
                            className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white transition-opacity hover:opacity-80 truncate"
                            style={{ backgroundColor: event.color }}
                          >
                            {event.order.status && (
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: event.order.status.color }} />
                            )}
                            {event.type === "posa" ? <Hammer className="h-3 w-3 flex-shrink-0" /> : <Package className="h-3 w-3 flex-shrink-0" />}
                            <span className="truncate font-medium">
                              {event.order.order_code || "Ordine"} - {event.order.customer.last_name}
                            </span>
                            {logisticRisk && <AlertTriangle className="h-3 w-3 flex-shrink-0 text-yellow-200" />}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold">{event.order.order_code || "N/A"} - {event.type === "posa" ? "Data Posa" : "Arrivo Merce"}</p>
                            <p className="text-sm">{event.order.customer.first_name} {event.order.customer.last_name}</p>
                            {event.order.description && <p className="text-xs text-muted-foreground line-clamp-2">{event.order.description}</p>}
                            {event.order.status && (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: event.order.status.color }} />
                                <span className="text-xs">{event.order.status.name}</span>
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
                            {logisticRisk && (
                              <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                                <AlertTriangle className="h-3 w-3" />
                                {!event.order!.warehouse_arrival_date ? "Merce non confermata" : "Merce arriva dopo la posa"}
                              </div>
                            )}
                            <p className="text-xs text-primary mt-1">Clicca per modificare le date</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  {dayEvents.length > 4 && (
                    <div className="text-xs text-muted-foreground text-center">+{dayEvents.length - 4} altri</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center"><Hammer className="h-2.5 w-2.5 text-white" /></div>
          <span className="text-muted-foreground">Data Posa Prevista</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center"><Package className="h-2.5 w-2.5 text-white" /></div>
          <span className="text-muted-foreground">Arrivo Merce</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="text-muted-foreground">Rischio logistico</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-indigo-500 flex items-center justify-center"><CalendarClock className="h-2.5 w-2.5 text-white" /></div>
          <span className="text-muted-foreground">Appuntamenti</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded border border-dashed border-muted-foreground/40 bg-muted/60" />
          <span className="text-muted-foreground">Google Calendar (occupato)</span>
        </div>
      </div>

      {editingOrder && (
        <EditOrderDatesDialog order={editingOrder} open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)} />
      )}

      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        appointment={editingAppointment}
        onSaved={() => { setEditingAppointment(null); }}
        showOrderSelect={true}
      />
    </Card>
  );
}

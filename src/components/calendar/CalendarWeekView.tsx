import { Fragment, useMemo, useState } from "react";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  addWeeks,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Hammer, Package, Wrench, CalendarClock, Check, Loader2, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { APPOINTMENT_ICONS, DEFAULT_CALENDAR_EVENT_COLORS, getCalendarEventStyle, mapAppointmentToEditData, type CalendarEventColors } from "@/lib/calendarUtils";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CalendarOrder, CalendarAppointment, GoogleBusySlot, ApprovedLeave, CalendarIntervento, CalendarManutenzione } from "@/types/calendar";
import { WeatherBadge, WeatherBadgeMulti } from "./WeatherBadge";
import type { WeatherDay, MultiLocationWeather, LocationWeatherDay } from "@/hooks/useWeatherForecast";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 – 20:00
const SLOT_MINUTES = 15;
const TIME_SLOTS = HOURS.flatMap((hour) =>
  Array.from({ length: 60 / SLOT_MINUTES }, (_, index) => {
    const minutes = index * SLOT_MINUTES;
    return {
      hour,
      minutes,
      label: `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      isHourStart: minutes === 0,
    };
  })
);
const WEEK_DAYS_IT_FULL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function floorToSlot(time?: string | null) {
  if (!time) return "";
  const [hourRaw, minuteRaw] = time.slice(0, 5).split(":").map(Number);
  if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) return "";
  const minute = Math.floor(minuteRaw / SLOT_MINUTES) * SLOT_MINUTES;
  return `${String(hourRaw).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

interface CalendarWeekViewProps {
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  approvedLeaves?: ApprovedLeave[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  syncedAppointmentIds?: Set<string>;
  hiddenEventTypes?: Set<string>;
  warehouseInfo?: Map<string, import("@/types/calendar").CalendarWarehouseInfo>;
  weatherForecast?: Map<string, WeatherDay>;
  calendarWeatherMulti?: MultiLocationWeather;
  orderWeatherMap?: Map<string, { weather?: LocationWeatherDay; distanceKm?: number; durationMin?: number; durationLabel?: string; address?: string }>;
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
  eventColors?: CalendarEventColors;
  orderColorFn?: (order: CalendarOrder) => string;
}

// ── Draggable wrapper ──
function DraggableEvent({ id, children, data }: { id: string; children: React.ReactNode; data: Record<string, unknown> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn("cursor-grab", isDragging && "opacity-40")}>
      {children}
    </div>
  );
}

// ── Droppable day column ──
function DroppableDay({ dateStr, children }: { dateStr: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-${dateStr}` });
  return (
    <div ref={setNodeRef} className={cn("min-h-full", isOver && "bg-primary/5")}>
      {children}
    </div>
  );
}

export function CalendarWeekView({
  orders,
  appointments = [],
  busySlots = [],
  approvedLeaves = [],
  currentDate,
  onDateChange,
  syncedAppointmentIds,
  hiddenEventTypes = new Set(),
  weatherForecast,
  calendarWeatherMulti,
  orderWeatherMap,
  interventi = [],
  manutenzioni = [],
  eventColors = DEFAULT_CALENDAR_EVENT_COLORS,
  orderColorFn,
}: CalendarWeekViewProps) {
  const queryClient = useQueryClient();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [newAppointmentSlot, setNewAppointmentSlot] = useState<{ date: string; time: string } | null>(null);
  // DnD confirmation
  const [pendingDrop, setPendingDrop] = useState<{
    type: "appointment" | "order";
    id: string;
    label: string;
    fromDate: string;
    toDate: string;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Group all-day events per day
  const allDayByDate = useMemo(() => {
    type AllDayEvent = { type: string; order?: CalendarOrder; appointment?: CalendarAppointment; busySlot?: GoogleBusySlot; leave?: ApprovedLeave; intervento?: CalendarIntervento; manutenzione?: CalendarManutenzione };
    const map = new Map<string, AllDayEvent[]>();
    const addEvent = (dateStr: string, evt: AllDayEvent) => {
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(evt);
    };

    const posaEnabled = !hiddenEventTypes.has("posa");
    const merceEnabled = !hiddenEventTypes.has("merce");
    if (posaEnabled) {
      orders.forEach(o => o.expected_date && addEvent(o.expected_date, { type: "posa", order: o }));
    }
    if (merceEnabled) {
      orders.forEach(o => o.warehouse_arrival_date && addEvent(o.warehouse_arrival_date, { type: "merce", order: o }));
    }
    if (!hiddenEventTypes.has("lavoro")) {
      orders.forEach(o => {
        // Con un orario la posa sta nella griglia delle ore (timedOrdersByDate).
        if (o.work_start_date && !o.work_start_time) {
          const start = new Date(o.work_start_date);
          const end = o.work_end_date ? new Date(o.work_end_date) : start;
          const cur = new Date(start);
          // Evita doppione "lavoro" sul giorno in cui l'ordine è già visibile come posa o merce.
          const posaDate = posaEnabled ? o.expected_date : null;
          const merceDate = merceEnabled ? o.warehouse_arrival_date : null;
          while (cur <= end) {
            const dateStr = format(cur, "yyyy-MM-dd");
            if (dateStr !== posaDate && dateStr !== merceDate) {
              addEvent(dateStr, { type: "lavoro", order: o });
            }
            cur.setDate(cur.getDate() + 1);
          }
        }
      });
    }
    if (!hiddenEventTypes.has("google_busy")) {
      busySlots.filter(s => s.is_all_day).forEach(s => {
        const d = s.start_at.split("T")[0];
        addEvent(d, { type: "google_busy", busySlot: s });
      });
    }
    if (!hiddenEventTypes.has("leaves")) {
      approvedLeaves.forEach(lr => {
        const start = new Date(lr.start_date);
        const end = new Date(lr.end_date);
        const cur = new Date(start);
        while (cur <= end) {
          addEvent(format(cur, "yyyy-MM-dd"), { type: "leave", leave: lr });
          cur.setDate(cur.getDate() + 1);
        }
      });
    }
    if (!hiddenEventTypes.has("intervento")) {
      interventi.forEach(iv => {
        if (iv.data_intervento_prevista) addEvent(iv.data_intervento_prevista.split("T")[0], { type: "intervento", intervento: iv });
      });
    }
    if (!hiddenEventTypes.has("manutenzione")) {
      manutenzioni.forEach(mn => {
        if (mn.prossima_scadenza) addEvent(mn.prossima_scadenza.split("T")[0], { type: "manutenzione", manutenzione: mn });
      });
    }

    return map;
  }, [orders, busySlots, approvedLeaves, hiddenEventTypes, interventi, manutenzioni]);

  // Group timed appointments per day
  // Lavori con orario (08/09/2026): un blocco all'ora di inizio, per ogni
  // giorno del periodo. Due mezze giornate della stessa squadra si vedono
  // una sotto l'altra invece di fondersi in una riga tutto-il-giorno.
  const timedOrdersByDate = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    if (hiddenEventTypes.has("lavoro")) return map;
    orders.forEach(o => {
      if (!o.work_start_date || !o.work_start_time) return;
      const start = new Date(o.work_start_date);
      const end = o.work_end_date ? new Date(o.work_end_date) : start;
      const cur = new Date(start);
      while (cur <= end) {
        const dateStr = format(cur, "yyyy-MM-dd");
        if (!map.has(dateStr)) map.set(dateStr, []);
        map.get(dateStr)!.push(o);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [orders, hiddenEventTypes]);
  const timedByDate = useMemo(() => {
    if (hiddenEventTypes.has("appuntamento")) return new Map<string, CalendarAppointment[]>();
    const map = new Map<string, CalendarAppointment[]>();
    appointments.forEach(apt => {
      const d = apt.appointment_date;
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(apt);
    });
    return map;
  }, [appointments, hiddenEventTypes]);

  // DnD handlers
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const toDate = (over.id as string).replace("day-", "");
    const data = active.data.current as { eventType: string; id: string; label: string; date: string } | undefined;
    if (!data || data.date === toDate) return;

    setPendingDrop({
      type: data.eventType,
      id: data.id,
      label: data.label,
      fromDate: data.date,
      toDate,
    });
  };

  const confirmDrop = async () => {
    if (!pendingDrop) return;
    setIsConfirming(true);
    try {
      if (pendingDrop.type === "appointment") {
        const { error } = await supabase
          .from("appointments")
          .update({ appointment_date: pendingDrop.toDate })
          .eq("id", pendingDrop.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      } else {
        // Order — shift expected_date
        const { error } = await supabase
          .from("orders")
          .update({ expected_date: pendingDrop.toDate })
          .eq("id", pendingDrop.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      }
      toast("Evento spostato");
      setPendingDrop(null);
    } catch (e: unknown) {
      toast.error(`Errore: ${e instanceof Error ? e.message : String(e)}`);
      setPendingDrop(null);
    } finally {
      setIsConfirming(false);
    }
  };

  const renderAllDayEvent = (evt: { type: string; order?: CalendarOrder; appointment?: CalendarAppointment; busySlot?: GoogleBusySlot; leave?: ApprovedLeave; intervento?: CalendarIntervento; manutenzione?: CalendarManutenzione }, idx: number) => {
    const o = evt.order as CalendarOrder | undefined;
    const lr = evt.leave as ApprovedLeave | undefined;
    const label = lr
      ? `🏖 ${lr.employee?.first_name ?? ""} ${lr.employee?.last_name ?? ""}`
      : o
        ? (o.order_code || o.description?.slice(0, 20) || "Ordine")
        : evt.busySlot?.team_name
          ? `${evt.busySlot.team_name} · ${evt.busySlot.summary || "impegno"}`
          : evt.busySlot?.summary || "Occupato";
    // Handle intervento and manutenzione types
    if (evt.type === "intervento" && evt.intervento) {
      return (
        <div key={`iv-${evt.intervento.id}-${idx}`} className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 border-l-2 text-foreground" style={getCalendarEventStyle(eventColors.intervento)}>
          <Wrench className="h-3 w-3 shrink-0" />
          <span className="truncate">{evt.intervento.subject}</span>
        </div>
      );
    }
    if (evt.type === "manutenzione" && evt.manutenzione) {
      return (
        <div key={`mn-${evt.manutenzione.id}-${idx}`} className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 border-l-2 text-foreground" style={getCalendarEventStyle(eventColors.manutenzione)}>
          <Settings className="h-3 w-3 shrink-0" />
          <span className="truncate">{evt.manutenzione.titolo}</span>
        </div>
      );
    }
    const colorMap: Record<string, string> = {
      posa: eventColors.posa,
      lavoro: eventColors.lavoro,
      merce: eventColors.merce,
      google_busy: eventColors.google_busy,
      leave: eventColors.leave,
    };
    const IconMap: Record<string, React.ComponentType<{ className?: string }>> = { posa: Hammer, lavoro: Wrench, merce: Package };
    const Icon = IconMap[evt.type];
    const dateStr = o?.expected_date || o?.work_start_date || o?.warehouse_arrival_date || "";
    const dragId = o ? `order-${o.id}-${evt.type}-${dateStr}` : `busy-${idx}`;

    // Colore: la commessa per i lavori, la squadra per gli impegni Google del
    // suo calendario, altrimenti quello del tipo di evento.
    const coloreEvento =
      (evt.type === "lavoro" && o ? orderColorFn?.(o) : undefined) ||
      (evt.type === "google_busy" ? evt.busySlot?.team_color : undefined) ||
      colorMap[evt.type] ||
      eventColors.appuntamento;
    const content = (
      <div
        className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 cursor-pointer border-l-2 text-foreground"
        style={getCalendarEventStyle(coloreEvento)}
        onClick={() => o && setEditingOrder(o)}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span className="truncate">{label}</span>
        {o && (evt.type === "posa" || evt.type === "lavoro") && (() => {
          const empCount = o.order_employees?.length ?? 0;
          if (empCount === 0) return <span className="ml-auto shrink-0 text-[9px] font-bold text-red-600">!</span>;
          return <span className="ml-auto shrink-0 text-[9px]">{empCount}op</span>;
        })()}
      </div>
    );

    if (o) {
      return (
        <DraggableEvent
          key={dragId}
          id={dragId}
          data={{ eventType: "order", id: o.id, date: dateStr, label }}
        >
          {content}
        </DraggableEvent>
      );
    }
    return <div key={dragId}>{content}</div>;
  };

  const renderTimedAppointment = (apt: CalendarAppointment) => {
    const Icon = APPOINTMENT_ICONS[apt.appointment_type] || CalendarClock;
    const isSynced = syncedAppointmentIds?.has(apt.id);

    return (
      <DraggableEvent
        key={`apt-${apt.id}`}
        id={`apt-${apt.id}`}
        data={{ eventType: "appointment", id: apt.id, date: apt.appointment_date, label: apt.title }}
      >
        <div
          className={cn(
            "text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 cursor-pointer border-l-2 text-foreground",
            apt.is_completed && "opacity-60 line-through"
          )}
          style={getCalendarEventStyle(eventColors.appuntamento)}
          onClick={(event) => {
            event.stopPropagation();
            setEditingAppointment(mapAppointmentToEditData(apt));
            setNewAppointmentSlot(null);
            setAppointmentDialogOpen(true);
          }}
        >
          <Icon className="h-3 w-3 shrink-0" />
          {apt.appointment_time && (
            <span className="font-medium">{apt.appointment_time.slice(0, 5)}</span>
          )}
          <span className="truncate">{apt.title}</span>
          {isSynced && <Check className="h-3 w-3 shrink-0 text-green-600" />}
          {apt.is_completed && <Check className="h-3 w-3 shrink-0 text-green-600" />}
        </div>
      </DraggableEvent>
    );
  };

  return (
    <Card className="p-3 overflow-x-auto">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" onClick={() => onDateChange(subWeeks(currentDate, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-sm">
          {format(weekDays[0], "d MMM", { locale: it })} – {format(weekDays[6], "d MMM yyyy", { locale: it })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => onDateChange(addWeeks(currentDate, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-[56px_repeat(7,minmax(112px,1fr))] min-w-[880px]">
          {/* Header row */}
          <div className="border-b border-r bg-muted/50 p-1" />
          {weekDays.map((day, i) => (
            <div
              key={i}
              className={cn(
                "border-b p-1.5 text-center text-xs font-medium",
                isSameDay(day, new Date()) && "bg-primary/10",
                day.getDay() === 0 && "bg-muted/30"
              )}
            >
              <div>{WEEK_DAYS_IT_FULL[i]}</div>
              <div className="text-lg font-bold">{format(day, "d")}</div>
              {(() => {
                const dateKey = format(day, "yyyy-MM-dd");
                if (calendarWeatherMulti) {
                  const locs = calendarWeatherMulti.get(dateKey);
                  if (locs && locs.length > 0) return <WeatherBadgeMulti locations={locs} size="sm" showTemp />;
                }
                if (weatherForecast) {
                  const w = weatherForecast.get(dateKey);
                  return w ? <WeatherBadge weather={w} size="sm" showTemp /> : null;
                }
                return null;
              })()}
            </div>
          ))}

          {/* All-day row */}
          <div className="border-r bg-muted/50 text-[10px] text-muted-foreground p-1 flex items-start justify-center pt-2">
            Giorno
          </div>
          {weekDays.map((day, i) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const events = allDayByDate.get(dateStr) || [];
            return (
              <DroppableDay key={`allday-${i}`} dateStr={dateStr}>
                <div className={cn("border-b border-r p-1 space-y-0.5 min-h-[54px] max-h-[116px] overflow-y-auto", day.getDay() === 0 && "bg-muted/20")}>
                  {events.map((evt, idx) => renderAllDayEvent(evt, idx))}
                </div>
              </DroppableDay>
            );
          })}

          {/* 15-minute rows */}
          {TIME_SLOTS.map((slot) => (
            <Fragment key={`slot-${slot.label}`}>
              <div className={cn(
                "border-r border-border/50 text-[10px] text-muted-foreground text-right pr-1 h-4",
                slot.isHourStart && "pt-0.5"
              )}>
                {slot.isHourStart ? `${String(slot.hour).padStart(2, "0")}:00` : ""}
              </div>
              {weekDays.map((day, i) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayApts = (timedByDate.get(dateStr) || []).filter(apt => {
                  if (!apt.appointment_time) return false;
                  return floorToSlot(apt.appointment_time) === slot.label;
                });
                const dayLavori = (timedOrdersByDate.get(dateStr) || []).filter(
                  o => floorToSlot(o.work_start_time!.slice(0, 5)) === slot.label,
                );

                // Google busy non-allday
                const hourBusy = !hiddenEventTypes.has("google_busy")
                  ? busySlots.filter(s => {
                      if (s.is_all_day) return false;
                      const start = new Date(s.start_at);
                      return format(start, "yyyy-MM-dd") === dateStr && floorToSlot(format(start, "HH:mm")) === slot.label;
                    })
                  : [];

                return (
                  <DroppableDay key={`cell-${slot.label}-${i}`} dateStr={dateStr}>
                    <button
                      type="button"
                      aria-label={`Crea appuntamento ${format(day, "dd/MM/yyyy")} alle ${slot.label}`}
                      className={cn(
                        "group block w-full border-r border-border/50 px-1 text-left transition-colors hover:bg-blue-50/70 focus:outline-none focus:ring-1 focus:ring-blue-400",
                        "h-4",
                        slot.isHourStart && "border-t border-border/50",
                        day.getDay() === 0 && "bg-muted/20"
                      )}
                      onClick={() => {
                        setEditingAppointment(null);
                        setNewAppointmentSlot({ date: dateStr, time: slot.label });
                        setAppointmentDialogOpen(true);
                      }}
                    >
                      <div className="space-y-0.5 overflow-visible">
                      {dayApts.map(apt => renderTimedAppointment(apt))}
                      {dayLavori.map(o => (
                        <div
                          key={`lav-${o.id}-${slot.label}`}
                          role="button"
                          tabIndex={0}
                          className="text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 border-l-2 text-foreground cursor-pointer"
                          style={getCalendarEventStyle(orderColorFn?.(o) || eventColors.lavoro)}
                          title={`${o.order_code || o.description} · ${o.work_start_time!.slice(0, 5)}–${(o.work_end_time ?? "").slice(0, 5)}`}
                          onClick={(e) => { e.stopPropagation(); setEditingOrder(o); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditingOrder(o); } }}
                        >
                          <Wrench className="h-3 w-3 shrink-0" />
                          <span className="truncate">
                            {o.work_start_time!.slice(0, 5)}–{(o.work_end_time ?? "").slice(0, 5)} · {o.order_code || o.description?.slice(0, 16) || "Lavori"}
                          </span>
                        </div>
                      ))}
                      {hourBusy.map((s, idx) => (
                        <div
                          key={`busy-${idx}`}
                          className="text-[10px] bg-muted px-1 rounded truncate text-muted-foreground border-l-2"
                          style={s.team_color ? { borderLeftColor: s.team_color } : undefined}
                        >
                          {s.team_name ? `${s.team_name} · ` : ""}{s.summary || "Occupato"}
                        </div>
                      ))}
                      </div>
                    </button>
                  </DroppableDay>
                );
              })}
            </Fragment>
          ))}
        </div>
      </DndContext>

      {/* Confirm drop dialog */}
      <Dialog open={!!pendingDrop} onOpenChange={() => setPendingDrop(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conferma spostamento</DialogTitle>
            <DialogDescription>
              Spostare "{pendingDrop?.label}" dal{" "}
              {pendingDrop?.fromDate && format(parseISO(pendingDrop.fromDate), "dd/MM/yyyy")} al{" "}
              {pendingDrop?.toDate && format(parseISO(pendingDrop.toDate), "dd/MM/yyyy")}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDrop(null)} disabled={isConfirming}>Annulla</Button>
            <Button onClick={confirmDrop} disabled={isConfirming}>
              {isConfirming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order edit dialog */}
      {editingOrder && (
        <EditOrderDatesDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => !open && setEditingOrder(null)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
            setEditingOrder(null);
          }}
          orderWeatherInfo={orderWeatherMap?.get(editingOrder.id)}
        />
      )}

      {/* Appointment edit dialog */}
      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={(open) => {
          setAppointmentDialogOpen(open);
          if (!open) {
            setEditingAppointment(null);
            setNewAppointmentSlot(null);
          }
        }}
        appointment={editingAppointment}
        hideMarketingFields
        showOrderSelect
        defaultDate={newAppointmentSlot?.date}
        defaultTime={newAppointmentSlot?.time}
        requireTime
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
          setEditingAppointment(null);
          setNewAppointmentSlot(null);
        }}
      />
    </Card>
  );
}

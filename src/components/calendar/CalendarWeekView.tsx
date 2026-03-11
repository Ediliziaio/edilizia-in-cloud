import { useMemo, useState } from "react";
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
import { DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Hammer, Package, Wrench, CalendarClock, Check, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { hasLogisticRisk, getEmployeeInitials, APPOINTMENT_ICONS, mapAppointmentToEditData } from "@/lib/calendarUtils";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CalendarOrder, CalendarAppointment, GoogleBusySlot } from "@/types/calendar";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 – 20:00
const WEEK_DAYS_IT_FULL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface ApprovedLeave {
  id: string;
  employee_id: string;
  type: string;
  start_date: string;
  end_date: string;
  total_days: number | null;
  total_hours: number | null;
  employee: { id: string; first_name: string; last_name: string } | null;
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
}

// ── Draggable wrapper ──
function DraggableEvent({ id, children, data }: { id: string; children: React.ReactNode; data: any }) {
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
}: CalendarWeekViewProps) {
  const queryClient = useQueryClient();
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  // DnD confirmation
  const [pendingDrop, setPendingDrop] = useState<{
    type: "appointment" | "order";
    id: string;
    label: string;
    fromDate: string;
    toDate: string;
  } | null>(null);

  // Group all-day events per day
  const allDayByDate = useMemo(() => {
    const map = new Map<string, Array<{ type: string; order?: CalendarOrder; appointment?: CalendarAppointment; busySlot?: GoogleBusySlot }>>();
    const addEvent = (dateStr: string, evt: any) => {
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(evt);
    };

    if (!hiddenEventTypes.has("posa")) {
      orders.forEach(o => o.expected_date && addEvent(o.expected_date, { type: "posa", order: o }));
    }
    if (!hiddenEventTypes.has("lavoro")) {
      orders.forEach(o => {
        if (o.work_start_date) {
          const start = new Date(o.work_start_date);
          const end = o.work_end_date ? new Date(o.work_end_date) : start;
          const cur = new Date(start);
          while (cur <= end) {
            addEvent(cur.toISOString().split("T")[0], { type: "lavoro", order: o });
            cur.setDate(cur.getDate() + 1);
          }
        }
      });
    }
    if (!hiddenEventTypes.has("merce")) {
      orders.forEach(o => o.warehouse_arrival_date && addEvent(o.warehouse_arrival_date, { type: "merce", order: o }));
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
          addEvent(cur.toISOString().split("T")[0], { type: "leave", leave: lr });
          cur.setDate(cur.getDate() + 1);
        }
      });
    }

    return map;
  }, [orders, busySlots, approvedLeaves, hiddenEventTypes]);

  // Group timed appointments per day
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
    const data = active.data.current as any;
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
      toast({ title: "Evento spostato" });
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    }
    setPendingDrop(null);
  };

  const renderAllDayEvent = (evt: any, idx: number) => {
    const o = evt.order as CalendarOrder | undefined;
    const lr = evt.leave as ApprovedLeave | undefined;
    const label = lr
      ? `🏖 ${lr.employee?.first_name ?? ""} ${lr.employee?.last_name ?? ""}`
      : o
        ? (o.order_code || o.description?.slice(0, 20) || "Ordine")
        : evt.busySlot?.summary || "Occupato";
    const colorMap: Record<string, string> = {
      posa: "bg-orange-500/20 border-l-2 border-orange-500 text-orange-900 dark:text-orange-200",
      lavoro: "bg-blue-500/20 border-l-2 border-blue-500 text-blue-900 dark:text-blue-200",
      merce: "bg-emerald-500/20 border-l-2 border-emerald-500 text-emerald-900 dark:text-emerald-200",
      google_busy: "bg-muted border-l-2 border-muted-foreground/50 text-muted-foreground",
      leave: "bg-amber-500/20 border-l-2 border-amber-500 text-amber-900 dark:text-amber-200",
    };
    const IconMap: Record<string, any> = { posa: Hammer, lavoro: Wrench, merce: Package };
    const Icon = IconMap[evt.type];
    const dateStr = o?.expected_date || o?.work_start_date || o?.warehouse_arrival_date || "";
    const dragId = o ? `order-${o.id}-${evt.type}-${dateStr}` : `busy-${idx}`;

    const content = (
      <div
        className={cn("text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 cursor-pointer", colorMap[evt.type])}
        onClick={() => o && setEditingOrder(o)}
      >
        {Icon && <Icon className="h-3 w-3 shrink-0" />}
        <span className="truncate">{label}</span>
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
            "text-[10px] leading-tight px-1.5 py-0.5 rounded truncate flex items-center gap-1 cursor-pointer",
            "bg-purple-500/20 border-l-2 border-purple-500 text-purple-900 dark:text-purple-200",
            apt.is_completed && "opacity-60 line-through"
          )}
          onClick={() => {
            setEditingAppointment(mapAppointmentToEditData(apt));
            setAppointmentDialogOpen(true);
          }}
        >
          <Icon className="h-3 w-3 shrink-0" />
          {apt.appointment_time && (
            <span className="font-medium">{apt.appointment_time.slice(0, 5)}</span>
          )}
          <span className="truncate">{apt.title}</span>
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
        <div className="grid grid-cols-[50px_repeat(7,1fr)] min-w-[700px]">
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
                <div className={cn("border-b border-r p-1 space-y-0.5 min-h-[40px]", day.getDay() === 0 && "bg-muted/20")}>
                  {events.map((evt, idx) => renderAllDayEvent(evt, idx))}
                </div>
              </DroppableDay>
            );
          })}

          {/* Hourly rows */}
          {HOURS.map(hour => (
            <>
              <div key={`label-${hour}`} className="border-r text-[10px] text-muted-foreground text-right pr-1 pt-0.5 h-10">
                {String(hour).padStart(2, "0")}:00
              </div>
              {weekDays.map((day, i) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const hourStr = String(hour).padStart(2, "0");
                const dayApts = (timedByDate.get(dateStr) || []).filter(apt => {
                  if (!apt.appointment_time) return false;
                  return apt.appointment_time.startsWith(hourStr);
                });

                // Google busy non-allday
                const hourBusy = !hiddenEventTypes.has("google_busy")
                  ? busySlots.filter(s => {
                      if (s.is_all_day) return false;
                      const start = new Date(s.start_at);
                      return format(start, "yyyy-MM-dd") === dateStr && start.getHours() === hour;
                    })
                  : [];

                return (
                  <DroppableDay key={`cell-${hour}-${i}`} dateStr={dateStr}>
                    <div className={cn("border-b border-r h-10 p-0.5 space-y-0.5", day.getDay() === 0 && "bg-muted/20")}>
                      {dayApts.map(apt => renderTimedAppointment(apt))}
                      {hourBusy.map((s, idx) => (
                        <div key={`busy-${idx}`} className="text-[10px] bg-muted px-1 rounded truncate text-muted-foreground">
                          {s.summary || "Occupato"}
                        </div>
                      ))}
                    </div>
                  </DroppableDay>
                );
              })}
            </>
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
            <Button variant="outline" onClick={() => setPendingDrop(null)}>Annulla</Button>
            <Button onClick={confirmDrop}>Conferma</Button>
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
        />
      )}

      {/* Appointment edit dialog */}
      <AppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        appointment={editingAppointment}
        hideMarketingFields
        showOrderSelect
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
          setEditingAppointment(null);
        }}
      />
    </Card>
  );
}

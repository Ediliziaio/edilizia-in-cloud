import { useMemo, useState } from "react";
import {
  format,
  isSameDay,
  parseISO,
  addDays,
  subDays,
} from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Hammer, Package, Wrench, CalendarClock, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPOINTMENT_ICONS, mapAppointmentToEditData } from "@/lib/calendarUtils";
import { AppointmentDialog, type AppointmentData } from "@/components/appointments/AppointmentDialog";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CalendarOrder, CalendarAppointment, GoogleBusySlot } from "@/types/calendar";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00 – 20:00

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

interface CalendarDayViewProps {
  orders: CalendarOrder[];
  appointments?: CalendarAppointment[];
  busySlots?: GoogleBusySlot[];
  approvedLeaves?: ApprovedLeave[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  syncedAppointmentIds?: Set<string>;
  hiddenEventTypes?: Set<string>;
}

export function CalendarDayView({
  orders,
  appointments = [],
  busySlots = [],
  approvedLeaves = [],
  currentDate,
  onDateChange,
  syncedAppointmentIds,
  hiddenEventTypes = new Set(),
}: CalendarDayViewProps) {
  const queryClient = useQueryClient();
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const isToday = isSameDay(currentDate, new Date());

  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentData | null>(null);
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);

  // All-day events for this day
  const allDayEvents = useMemo(() => {
    const events: Array<{ type: string; order?: CalendarOrder; leave?: ApprovedLeave; busySlot?: GoogleBusySlot }> = [];

    if (!hiddenEventTypes.has("posa")) {
      orders.filter(o => o.expected_date === dateStr).forEach(o => events.push({ type: "posa", order: o }));
    }
    if (!hiddenEventTypes.has("lavoro")) {
      orders.forEach(o => {
        if (!o.work_start_date) return;
        const start = new Date(o.work_start_date);
        const end = o.work_end_date ? new Date(o.work_end_date) : start;
        if (currentDate >= start && currentDate <= end) events.push({ type: "lavoro", order: o });
      });
    }
    if (!hiddenEventTypes.has("merce")) {
      orders.filter(o => o.warehouse_arrival_date === dateStr).forEach(o => events.push({ type: "merce", order: o }));
    }
    if (!hiddenEventTypes.has("google_busy")) {
      busySlots.filter(s => s.is_all_day && s.start_at.split("T")[0] === dateStr).forEach(s => events.push({ type: "google_busy", busySlot: s }));
    }
    if (!hiddenEventTypes.has("leaves")) {
      approvedLeaves.forEach(lr => {
        const start = new Date(lr.start_date);
        const end = new Date(lr.end_date);
        if (currentDate >= start && currentDate <= end) events.push({ type: "leave", leave: lr });
      });
    }
    return events;
  }, [orders, busySlots, approvedLeaves, hiddenEventTypes, dateStr, currentDate]);

  // Timed appointments for this day
  const timedAppointments = useMemo(() => {
    if (hiddenEventTypes.has("appuntamento")) return [];
    return appointments.filter(apt => apt.appointment_date === dateStr);
  }, [appointments, hiddenEventTypes, dateStr]);

  const colorMap: Record<string, string> = {
    posa: "bg-orange-500/20 border-l-2 border-orange-500 text-orange-900 dark:text-orange-200",
    lavoro: "bg-blue-500/20 border-l-2 border-blue-500 text-blue-900 dark:text-blue-200",
    merce: "bg-emerald-500/20 border-l-2 border-emerald-500 text-emerald-900 dark:text-emerald-200",
    google_busy: "bg-muted border-l-2 border-muted-foreground/50 text-muted-foreground",
    leave: "bg-amber-500/20 border-l-2 border-amber-500 text-amber-900 dark:text-amber-200",
  };
  const IconMap: Record<string, any> = { posa: Hammer, lavoro: Wrench, merce: Package };

  const handleCreateAppointment = (hour: number) => {
    const time = `${String(hour).padStart(2, "0")}:00`;
    setEditingAppointment({
      id: undefined,
      title: "",
      appointment_type: "appuntamento_cliente",
      appointment_date: dateStr,
      appointment_time: time,
      duration_minutes: 60,
      notes: "",
      technician_id: null,
      calendar_id: null,
    });
    setAppointmentDialogOpen(true);
  };

  return (
    <Card className="p-3">
      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="icon" onClick={() => onDateChange(subDays(currentDate, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold text-lg capitalize", isToday && "text-primary")}>
            {format(currentDate, "EEEE d MMMM yyyy", { locale: it })}
          </span>
          {isToday && <Badge variant="secondary" className="text-xs">Oggi</Badge>}
        </div>
        <Button variant="ghost" size="icon" onClick={() => onDateChange(addDays(currentDate, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="mb-3 p-2 bg-muted/30 rounded-lg border space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Tutto il giorno</p>
          {allDayEvents.map((evt, idx) => {
            const o = evt.order;
            const lr = evt.leave;
            const label = lr
              ? `🏖 ${lr.employee?.first_name ?? ""} ${lr.employee?.last_name ?? ""}`
              : o
                ? (o.order_code || o.description?.slice(0, 30) || "Ordine")
                : evt.busySlot?.summary || "Occupato";
            const Icon = IconMap[evt.type];
            return (
              <div
                key={idx}
                className={cn("text-xs px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer", colorMap[evt.type])}
                onClick={() => o && setEditingOrder(o)}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Hourly grid */}
      <div className="divide-y border rounded-lg overflow-hidden">
        {HOURS.map(hour => {
          const hourStr = String(hour).padStart(2, "0");
          const hourApts = timedAppointments.filter(apt => apt.appointment_time?.startsWith(hourStr));
          const hourBusy = !hiddenEventTypes.has("google_busy")
            ? busySlots.filter(s => {
                if (s.is_all_day) return false;
                const start = new Date(s.start_at);
                return format(start, "yyyy-MM-dd") === dateStr && start.getHours() === hour;
              })
            : [];

          return (
            <div
              key={hour}
              className={cn(
                "flex min-h-[56px] group",
                isToday && new Date().getHours() === hour && "bg-primary/5"
              )}
            >
              {/* Time label */}
              <div className="w-14 flex-shrink-0 p-2 text-xs text-muted-foreground text-right border-r bg-muted/20">
                {hourStr}:00
              </div>
              {/* Content */}
              <div
                className="flex-1 p-1.5 space-y-1 cursor-pointer hover:bg-muted/20 transition-colors"
                onClick={() => handleCreateAppointment(hour)}
              >
                {hourApts.map(apt => {
                  const Icon = APPOINTMENT_ICONS[apt.appointment_type] || CalendarClock;
                  return (
                    <div
                      key={apt.id}
                      className={cn(
                        "text-xs px-2 py-1 rounded flex items-center gap-1.5 cursor-pointer",
                        "bg-purple-500/20 border-l-2 border-purple-500 text-purple-900 dark:text-purple-200",
                        apt.is_completed && "opacity-60 line-through"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingAppointment(mapAppointmentToEditData(apt));
                        setAppointmentDialogOpen(true);
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium">{apt.appointment_time?.slice(0, 5)}</span>
                      <span className="truncate">{apt.title}</span>
                      {apt.is_completed && <Check className="h-3.5 w-3.5 shrink-0 text-green-600 ml-auto" />}
                    </div>
                  );
                })}
                {hourBusy.map((s, idx) => (
                  <div key={idx} className="text-xs bg-muted px-2 py-1 rounded truncate text-muted-foreground">
                    {s.summary || "Occupato"}
                  </div>
                ))}
                {hourApts.length === 0 && hourBusy.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors">
                    + Nuovo appuntamento
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Appointment dialog */}
      {appointmentDialogOpen && (
        <AppointmentDialog
          open={appointmentDialogOpen}
          onOpenChange={(open) => {
            setAppointmentDialogOpen(open);
            if (!open) setEditingAppointment(null);
          }}
          initialData={editingAppointment ?? undefined}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
            setAppointmentDialogOpen(false);
            setEditingAppointment(null);
          }}
          onDeleted={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
            setAppointmentDialogOpen(false);
            setEditingAppointment(null);
          }}
        />
      )}

      {/* Order dates edit dialog */}
      {editingOrder && (
        <EditOrderDatesDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => !open && setEditingOrder(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
            setEditingOrder(null);
            toast({ title: "Date aggiornate" });
          }}
        />
      )}
    </Card>
  );
}

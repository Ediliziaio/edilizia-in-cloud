import { useMemo, useState, useRef } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
  format,
} from "date-fns";
import { DndContext, DragOverlay, PointerSensor, useSensors, useSensor, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { MarketingAppointment } from "@/types/marketingCalendar";
import { buildColorMap } from "@/lib/marketingCalendarConstants";
import DraggableAppointment from "./DraggableAppointment";
import DroppableSlot from "./DroppableSlot";

const DAY_NAMES = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

interface Props {
  currentDate: Date;
  appointments: MarketingAppointment[];
  calendarIds: string[];
  onClickAppointment: (apt: MarketingAppointment) => void;
  onClickDay: (date: Date) => void;
  onDropAppointment?: (id: string, newDate: string) => void;
}

export default function MarketingCalendarMonthView({
  currentDate,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickDay,
  onDropAppointment,
}: Props) {
  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);
  const justDragged = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const result: Date[][] = [];
    let day = calStart;
    while (day <= calEnd) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(day);
        day = addDays(day, 1);
      }
      result.push(week);
    }
    return result;
  }, [currentDate]);

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, MarketingAppointment[]>();

    appointments.forEach((appointment) => {
      if (!appointment.appointment_date) return;
      const dateKey = appointment.appointment_date.slice(0, 10);
      const dayAppointments = grouped.get(dateKey) ?? [];
      dayAppointments.push(appointment);
      grouped.set(dateKey, dayAppointments);
    });

    grouped.forEach((dayAppointments) => {
      dayAppointments.sort((a, b) =>
        (a.appointment_time || "23:59").localeCompare(b.appointment_time || "23:59")
      );
    });

    return grouped;
  }, [appointments]);

  const handleDragStart = (event: DragStartEvent) => {
    const apt = (event.active.data.current as any)?.appointment as MarketingAppointment;
    setActiveApt(apt || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveApt(null);
    const { active, over } = event;
    if (!over || !onDropAppointment) return;
    justDragged.current = true;
    setTimeout(() => { justDragged.current = false; }, 200);
    const aptId = (active.id as string).replace("apt-", "");
    const overId = over.id as string;
    if (!overId.startsWith("day-")) return;
    const newDate = overId.replace("day-", "");
    onDropAppointment(aptId, newDate);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
        {/* Header */}
        <div className="grid shrink-0 grid-cols-7 border-b bg-muted/30">
          {DAY_NAMES.map((name) => (
            <div key={name} className="border-r p-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground last:border-r-0">
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid min-h-0 grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const inMonth = isSameMonth(day, currentDate);
                const maxShow = 3;
                const dateKey = format(day, "yyyy-MM-dd");
                const dayApts = appointmentsByDate.get(dateKey) ?? [];

                return (
                  <DroppableSlot
                    key={day.toISOString()}
                    id={`day-${dateKey}`}
                    className={cn(
                      "min-h-[84px] cursor-pointer overflow-hidden border-r p-2 transition-colors last:border-r-0 hover:bg-muted/30",
                      !inMonth && "bg-muted/20 text-muted-foreground/70",
                      isToday(day) && "bg-primary/5"
                    )}
                    onClick={() => { if (!justDragged.current) onClickDay(day); }}
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                          isToday(day)
                            ? "bg-primary text-primary-foreground"
                            : inMonth
                              ? "text-foreground"
                              : "text-muted-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </div>
                      {dayApts.length > 0 && (
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {dayApts.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayApts.slice(0, maxShow).map((apt) => (
                        <DraggableAppointment key={apt.id} appointment={apt}>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onClickAppointment(apt);
                            }}
                            className={cn(
                              "cursor-pointer truncate rounded border-l-2 px-1.5 py-1 text-[11px] leading-tight shadow-sm hover:opacity-85",
                              apt.is_blocked_slot
                                ? "border-dashed border-muted-foreground/50 bg-muted/60 text-muted-foreground italic"
                                : apt.calendar_id && colorMap[apt.calendar_id]
                                  ? colorMap[apt.calendar_id]
                                  : "border-muted-foreground/40 bg-muted text-foreground"
                            )}
                            title={apt.title}
                          >
                            {apt.appointment_time && (
                              <span className="font-semibold">{apt.appointment_time.slice(0, 5)} </span>
                            )}
                            {apt.title}
                          </div>
                        </DraggableAppointment>
                      ))}
                      {dayApts.length > maxShow && (
                        <div className="px-1 text-[10px] font-medium text-muted-foreground">
                          +{dayApts.length - maxShow} altri
                        </div>
                      )}
                    </div>
                  </DroppableSlot>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <DragOverlay>
        {activeApt && (
          <div className="bg-primary/90 text-primary-foreground text-xs px-2 py-1 rounded shadow-lg max-w-[200px] truncate">
            {activeApt.appointment_time && (
              <span className="font-medium">{activeApt.appointment_time.slice(0, 5)} </span>
            )}
            {activeApt.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

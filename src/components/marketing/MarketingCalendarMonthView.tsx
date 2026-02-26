import { useMemo, useState, useRef } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  format,
  parseISO,
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

  const getAppointmentsForDay = (day: Date) =>
    appointments.filter((a) => isSameDay(parseISO(a.appointment_date), day));

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
      <div className="flex-1 overflow-auto border rounded-lg bg-background">
        {/* Header */}
        <div className="grid grid-cols-7 border-b sticky top-0 z-10 bg-background">
          {DAY_NAMES.map((name) => (
            <div key={name} className="p-2 text-center text-xs font-medium text-muted-foreground uppercase border-r last:border-r-0">
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((day) => {
              const inMonth = isSameMonth(day, currentDate);
              const dayApts = getAppointmentsForDay(day);
              const maxShow = 3;
              const dateKey = format(day, "yyyy-MM-dd");

              return (
                <DroppableSlot
                  key={day.toISOString()}
                  id={`day-${dateKey}`}
                  className={cn(
                    "border-r last:border-r-0 min-h-[100px] p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                    !inMonth && "opacity-40",
                    isToday(day) && "bg-primary/5"
                  )}
                  onClick={() => { if (!justDragged.current) onClickDay(day); }}
                >
                  <div
                    className={cn(
                      "text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full",
                      isToday(day) && "bg-primary text-primary-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="space-y-0.5">
                    {dayApts.slice(0, maxShow).map((apt) => (
                      <DraggableAppointment key={apt.id} appointment={apt}>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            onClickAppointment(apt);
                          }}
                          className={cn(
                            "text-[10px] leading-tight px-1 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80",
                            apt.is_blocked_slot
                              ? "bg-muted/60 border-dashed border-muted-foreground/50 text-muted-foreground italic"
                              : apt.calendar_id && colorMap[apt.calendar_id]
                                ? colorMap[apt.calendar_id]
                                : "bg-muted border-muted-foreground/40 text-foreground"
                          )}
                          title={apt.title}
                        >
                          {apt.appointment_time && (
                            <span className="font-medium">{apt.appointment_time.slice(0, 5)} </span>
                          )}
                          {apt.title}
                        </div>
                      </DraggableAppointment>
                    ))}
                    {dayApts.length > maxShow && (
                      <div className="text-[10px] text-muted-foreground pl-1">
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

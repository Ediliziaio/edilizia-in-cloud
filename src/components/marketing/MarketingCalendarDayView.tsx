import { useMemo, useState } from "react";
import { format, isSameDay, parseISO, isToday } from "date-fns";
import { it } from "date-fns/locale";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff } from "lucide-react";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import { HALF_HOURS, buildColorMap } from "@/lib/marketingCalendarConstants";
import DraggableAppointment from "./DraggableAppointment";
import DroppableSlot from "./DroppableSlot";

interface Props {
  date: Date;
  appointments: MarketingAppointment[];
  calendarIds: string[];
  onClickAppointment: (apt: MarketingAppointment) => void;
  onClickSlot: (date: Date, hour: number, minute?: number) => void;
  travelLegs?: TravelLeg[];
  onDropAppointment?: (id: string, newDate: string, newTime: string) => void;
}

export default function MarketingCalendarDayView({
  date,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickSlot,
  travelLegs = [],
  onDropAppointment,
}: Props) {
  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);

  const dayAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(parseISO(a.appointment_date), date)),
    [appointments, date]
  );

  const travelLegMap = useMemo(() => {
    const map: Record<string, TravelLeg> = {};
    travelLegs.forEach((leg) => {
      map[leg.toId] = leg;
    });
    return map;
  }, [travelLegs]);

  const getAppointmentsForSlot = (slotTime: string) => {
    const [slotH, slotM] = slotTime.split(":").map(Number);
    const slotStart = slotH * 60 + slotM;
    const slotEnd = slotStart + 30;
    return dayAppointments.filter((a) => {
      if (!a.appointment_time) return slotTime === "09:00";
      const [ah, am] = a.appointment_time.split(":").map(Number);
      const aptMin = ah * 60 + (am || 0);
      return aptMin >= slotStart && aptMin < slotEnd;
    });
  };

  const todayFlag = isToday(date);
  const dateStr = format(date, "yyyy-MM-dd");

  const handleDragStart = (event: DragStartEvent) => {
    const apt = (event.active.data.current as any)?.appointment as MarketingAppointment;
    setActiveApt(apt || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveApt(null);
    const { active, over } = event;
    if (!over || !onDropAppointment) return;
    const aptId = (active.id as string).replace("apt-", "");
    const overId = over.id as string;
    if (!overId.startsWith("slot-")) return;
    const match = overId.match(/^slot-\d{4}-\d{2}-\d{2}-(\d{2}:\d{2})$/);
    if (!match) return;
    onDropAppointment(aptId, dateStr, match[1]);
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto border rounded-lg bg-background">
        {/* Header */}
        <div className="grid grid-cols-[60px_1fr] border-b sticky top-0 z-10 bg-background">
          <div className="p-2 border-r text-xs text-muted-foreground" />
          <div className={cn("p-2 text-center", todayFlag && "bg-primary/5")}>
            <div className="text-xs text-muted-foreground uppercase">
              {format(date, "EEEE", { locale: it })}
            </div>
            <div
              className={cn(
                "text-sm font-semibold mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full",
                todayFlag && "bg-primary text-primary-foreground"
              )}
            >
              {format(date, "d")}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-[60px_1fr]">
          {HALF_HOURS.map((slotTime) => {
            const isHour = slotTime.endsWith(":00");
            const [h, m] = slotTime.split(":").map(Number);
            const slotApts = getAppointmentsForSlot(slotTime);
            return (
              <div key={slotTime} className="contents">
                <div className={cn(
                  "p-1 pr-2 text-right text-xs text-muted-foreground border-r h-8 flex items-start justify-end pt-0",
                )}>
                  {isHour && <span className="-mt-2">{slotTime}</span>}
                </div>
                <DroppableSlot
                  id={`slot-${dateStr}-${slotTime}`}
                  className={cn(
                    "h-8 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors",
                    isHour ? "border-b" : "border-b border-dashed border-border/40",
                    todayFlag && "bg-primary/[0.02]"
                  )}
                  onClick={() => onClickSlot(date, h, m)}
                >
                  {slotApts.map((apt) => {
                    const leg = travelLegMap[apt.id];
                    const hasNoCoords = apt.lat == null || apt.lng == null;

                    return (
                      <DraggableAppointment key={apt.id} appointment={apt}>
                        <div>
                          {leg && (
                            <div
                              className={cn(
                                "flex items-center gap-1 text-[10px] leading-tight px-1.5 py-0.5 rounded mb-0.5",
                                leg.isLate
                                  ? "bg-destructive/10 text-destructive border border-destructive/30"
                                  : "bg-muted/50 text-muted-foreground"
                              )}
                            >
                              <Car className="h-3 w-3 shrink-0" />
                              <span>{leg.duration_text} • {leg.distance_text}</span>
                              {leg.isLate && (
                                <span className="flex items-center gap-0.5 ml-auto font-medium">
                                  <AlertTriangle className="h-3 w-3" />
                                  +{leg.delayMinutes} min
                                </span>
                              )}
                            </div>
                          )}
                          {hasNoCoords && !apt.is_blocked_slot && (
                            <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mb-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700">
                              <MapPinOff className="h-3 w-3" />
                              <span>Indirizzo mancante</span>
                            </div>
                          )}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              onClickAppointment(apt);
                            }}
                            className={cn(
                              "text-[11px] leading-tight px-1.5 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80 mb-0.5",
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
                        </div>
                      </DraggableAppointment>
                    );
                  })}
                </DroppableSlot>
              </div>
            );
          })}
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

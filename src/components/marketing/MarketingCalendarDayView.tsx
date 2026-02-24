import { useMemo, useState } from "react";
import { format, isSameDay, parseISO, isToday } from "date-fns";
import { it } from "date-fns/locale";
import { DndContext, DragOverlay, PointerSensor, useSensors, useSensor, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff } from "lucide-react";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import { buildTimeSlots, buildColorMap } from "@/lib/marketingCalendarConstants";
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
  slotDurationMinutes?: number;
  onResizeAppointment?: (id: string, newEndTime: string) => void;
}

const SLOT_HEIGHT: Record<number, { className: string; px: number }> = {
  60: { className: "h-16", px: 64 },
  30: { className: "h-8", px: 32 },
  15: { className: "h-6", px: 24 },
};

function getSlotHeight(minutes: number) {
  return SLOT_HEIGHT[minutes] || SLOT_HEIGHT[30];
}

function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export default function MarketingCalendarDayView({
  date,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickSlot,
  travelLegs = [],
  onDropAppointment,
  slotDurationMinutes = 30,
  onResizeAppointment,
}: Props) {
  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);
  const slotInfo = getSlotHeight(slotDurationMinutes);
  const pxPerMinute = slotInfo.px / slotDurationMinutes;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const timeSlots = useMemo(() => buildTimeSlots(slotDurationMinutes), [slotDurationMinutes]);

  const dayAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(parseISO(a.appointment_date), date)),
    [appointments, date]
  );

  const travelLegMap = useMemo(() => {
    const map: Record<string, TravelLeg> = {};
    travelLegs.forEach((leg) => { map[leg.toId] = leg; });
    return map;
  }, [travelLegs]);

  const getAppointmentsForSlot = (slotTime: string) => {
    const slotStart = timeToMin(slotTime);
    const slotEnd = slotStart + slotDurationMinutes;
    return dayAppointments.filter((a) => {
      if (!a.appointment_time) return slotTime === "09:00";
      const aptMin = timeToMin(a.appointment_time);
      return aptMin >= slotStart && aptMin < slotEnd;
    });
  };

  /** Get precise height in px based on actual duration */
  const getHeightPx = (apt: MarketingAppointment): number | undefined => {
    if (!apt.appointment_time) return undefined;
    const startMin = timeToMin(apt.appointment_time);
    if (apt.appointment_end_time) {
      const endMin = timeToMin(apt.appointment_end_time);
      if (endMin > startMin) {
        const durationMin = endMin - startMin;
        const height = durationMin * pxPerMinute;
        // Only return explicit height if it exceeds one slot
        if (durationMin > slotDurationMinutes) return height;
        return height;
      }
    }
    return undefined;
  };

  /** Get top offset within the slot in px */
  const getTopOffsetPx = (apt: MarketingAppointment, slotTime: string): number => {
    if (!apt.appointment_time) return 0;
    const aptMin = timeToMin(apt.appointment_time);
    const slotMin = timeToMin(slotTime);
    const offset = aptMin - slotMin;
    if (offset <= 0) return 0;
    return offset * pxPerMinute;
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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
          {timeSlots.map((slotTime) => {
            const isHour = slotTime.endsWith(":00");
            const [h, m] = slotTime.split(":").map(Number);
            const slotApts = getAppointmentsForSlot(slotTime);
            const showLabel = slotDurationMinutes >= 60 || isHour;
            return (
              <div key={slotTime} className="contents">
                <div className={cn(
                  "p-1 pr-2 text-right text-xs text-muted-foreground border-r flex items-start justify-end pt-0",
                  slotInfo.className,
                )}>
                  {showLabel && <span className="-mt-2">{slotTime}</span>}
                </div>
                <DroppableSlot
                  id={`slot-${dateStr}-${slotTime}`}
                  className={cn(
                    "p-0.5 cursor-pointer hover:bg-muted/30 transition-colors relative",
                    slotInfo.className,
                    isHour ? "border-b" : "border-b border-dashed border-border/40",
                    todayFlag && "bg-primary/[0.02]"
                  )}
                  onClick={() => onClickSlot(date, h, m)}
                >
                  {slotApts.map((apt) => {
                    const leg = travelLegMap[apt.id];
                    const hasNoCoords = apt.lat == null || apt.lng == null;
                    const heightPx = getHeightPx(apt);
                    const topOffset = getTopOffsetPx(apt, slotTime);

                    return (
                      <DraggableAppointment
                        key={apt.id}
                        appointment={apt}
                        onResize={onResizeAppointment}
                        slotDurationMinutes={slotDurationMinutes}
                        slotHeightPx={slotInfo.px}
                        startTime={apt.appointment_time?.slice(0, 5)}
                        spanHeight={heightPx}
                        topOffsetPx={topOffset}
                      >
                        <div className="h-full relative">
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
                              heightPx ? "h-full overflow-hidden" : "",
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
                            {apt.appointment_end_time && (
                              <span className="text-[10px] opacity-70"> – {apt.appointment_end_time.slice(0, 5)}</span>
                            )}
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

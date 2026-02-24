import { useMemo, useState } from "react";
import { format, addDays, isSameDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import { buildTimeSlots, buildColorMap } from "@/lib/marketingCalendarConstants";
import DraggableAppointment from "./DraggableAppointment";
import DroppableSlot from "./DroppableSlot";

interface Props {
  weekStart: Date;
  appointments: MarketingAppointment[];
  calendarIds: string[];
  onClickAppointment: (apt: MarketingAppointment) => void;
  onClickSlot: (date: Date, hour: number, minute?: number) => void;
  travelLegs?: Record<string, TravelLeg[]>;
  onDropAppointment?: (id: string, newDate: string, newTime: string) => void;
  slotDurationMinutes?: number;
}

export default function MarketingCalendarWeekView({
  weekStart,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickSlot,
  travelLegs = {},
  onDropAppointment,
  slotDurationMinutes = 30,
}: Props) {
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);
  const timeSlots = useMemo(() => buildTimeSlots(slotDurationMinutes), [slotDurationMinutes]);

  const travelLegMaps = useMemo(() => {
    const maps: Record<string, Record<string, TravelLeg>> = {};
    Object.entries(travelLegs).forEach(([dateKey, legs]) => {
      const m: Record<string, TravelLeg> = {};
      legs.forEach((leg) => { m[leg.toId] = leg; });
      maps[dateKey] = m;
    });
    return maps;
  }, [travelLegs]);

  const getAppointmentsForSlot = (day: Date, slotTime: string) => {
    const [slotH, slotM] = slotTime.split(":").map(Number);
    const slotStart = slotH * 60 + slotM;
    const slotEnd = slotStart + slotDurationMinutes;
    return appointments.filter((a) => {
      if (!isSameDay(parseISO(a.appointment_date), day)) return false;
      if (!a.appointment_time) return slotTime === "09:00";
      const [ah, am] = a.appointment_time.split(":").map(Number);
      const aptMin = ah * 60 + (am || 0);
      return aptMin >= slotStart && aptMin < slotEnd;
    });
  };

  const today = new Date();
  const slotHeight = slotDurationMinutes >= 60 ? "h-16" : slotDurationMinutes >= 30 ? "h-8" : "h-6";

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
    const match = overId.match(/^slot-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/);
    if (!match) return;
    onDropAppointment(aptId, match[1], match[2]);
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto border rounded-lg bg-background relative isolate">
        <div className="min-w-[900px]">
          {/* Header */}
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b sticky top-0 z-10 bg-background">
            <div className="p-2 border-r text-xs text-muted-foreground" />
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={cn(
                  "p-2 text-center border-r last:border-r-0 min-w-0",
                  isSameDay(day, today) && "bg-primary/5"
                )}
              >
                <div className="text-xs text-muted-foreground uppercase">
                  {format(day, "EEE", { locale: it })}
                </div>
                <div
                  className={cn(
                    "text-sm font-semibold mt-0.5 w-7 h-7 flex items-center justify-center mx-auto rounded-full",
                    isSameDay(day, today) && "bg-primary text-primary-foreground"
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))]">
            {timeSlots.map((slotTime) => {
              const isHour = slotTime.endsWith(":00");
              const [h, m] = slotTime.split(":").map(Number);
              const showLabel = slotDurationMinutes >= 60 || isHour;
              return (
                <div key={slotTime} className="contents">
                  <div className={cn(
                    "p-1 pr-2 text-right text-xs text-muted-foreground border-r flex items-start justify-end pt-0",
                    slotHeight,
                  )}>
                    {showLabel && <span className="-mt-2">{slotTime}</span>}
                  </div>
                  {days.map((day) => {
                    const slotApts = getAppointmentsForSlot(day, slotTime);
                    const dateKey = format(day, "yyyy-MM-dd");
                    const dayLegMap = travelLegMaps[dateKey] || {};

                    return (
                      <DroppableSlot
                        key={`${dateKey}-${slotTime}`}
                        id={`slot-${dateKey}-${slotTime}`}
                        className={cn(
                          "border-r last:border-r-0 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors relative min-w-0",
                          slotHeight,
                          isHour ? "border-b" : "border-b border-dashed border-border/40",
                          isSameDay(day, today) && "bg-primary/[0.02]"
                        )}
                        onClick={() => onClickSlot(day, h, m)}
                      >
                        {slotApts.map((apt) => {
                          const leg = dayLegMap[apt.id];
                          const hasNoCoords = apt.lat == null || apt.lng == null;

                          const tooltipLines: string[] = [apt.title];
                          if (apt.appointment_time) tooltipLines.unshift(apt.appointment_time.slice(0, 5));
                          if (apt.formatted_address) tooltipLines.push(apt.formatted_address);
                          if (leg) {
                            tooltipLines.push(`${leg.duration_text} • ${leg.distance_text}`);
                            if (leg.isLate) tooltipLines.push(`Ritardo stimato: +${leg.delayMinutes} min`);
                          }
                          if (hasNoCoords && !apt.is_blocked_slot && !leg) {
                            tooltipLines.push("Indirizzo mancante");
                          }

                          return (
                            <DraggableAppointment key={apt.id} appointment={apt}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClickAppointment(apt);
                                    }}
                                    className={cn(
                                      "flex items-center gap-1 text-[11px] leading-tight px-1.5 py-0.5 rounded border-l-2 cursor-pointer hover:opacity-80 mb-0.5 min-w-0",
                                      apt.is_blocked_slot
                                        ? "bg-muted/60 border-dashed border-muted-foreground/50 text-muted-foreground italic"
                                        : apt.calendar_id && colorMap[apt.calendar_id]
                                          ? colorMap[apt.calendar_id]
                                          : "bg-muted border-muted-foreground/40 text-foreground"
                                    )}
                                  >
                                    {hasNoCoords && !apt.is_blocked_slot && !leg && (
                                      <MapPinOff className="h-2.5 w-2.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                                    )}
                                    <span className="truncate">
                                      {apt.appointment_time && (
                                        <span className="font-medium">{apt.appointment_time.slice(0, 5)} </span>
                                      )}
                                      {apt.title}
                                    </span>
                                    {leg && (
                                      <span
                                        className={cn(
                                          "ml-auto shrink-0 flex items-center gap-0.5 text-[9px] leading-none px-1 py-px rounded",
                                          leg.isLate
                                            ? "bg-destructive/15 text-destructive"
                                            : "bg-muted/80 text-muted-foreground"
                                        )}
                                      >
                                        {leg.isLate ? (
                                          <AlertTriangle className="h-2.5 w-2.5" />
                                        ) : (
                                          <Car className="h-2.5 w-2.5" />
                                        )}
                                        {leg.duration_text}
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[250px]">
                                  {tooltipLines.map((line, i) => (
                                    <p key={i} className={cn(
                                      i === 0 && "font-medium",
                                      line.startsWith("Ritardo") && "text-destructive font-medium"
                                    )}>{line}</p>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            </DraggableAppointment>
                          );
                        })}
                      </DroppableSlot>
                    );
                  })}
                </div>
              );
            })}
          </div>
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

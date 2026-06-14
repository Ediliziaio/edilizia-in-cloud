import { useMemo, useState, useRef, useEffect } from "react";
import { format, isSameDay, parseISO, isToday } from "date-fns";
import { it } from "date-fns/locale";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensors, useSensor, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff, User, Calendar as CalendarIcon } from "lucide-react";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import type { GoogleBusySlot } from "@/types/calendar";
import { buildTimeSlots, buildColorMap, timeToMin } from "@/lib/marketingCalendarConstants";
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
  busySlots?: GoogleBusySlot[];
  onClickBusySlot?: (slot: GoogleBusySlot) => void;
}

const SLOT_HEIGHT: Record<number, { className: string; px: number }> = {
  60: { className: "h-16", px: 64 },
  30: { className: "h-8", px: 32 },
  15: { className: "h-6", px: 24 },
};

function getSlotHeight(minutes: number) {
  return SLOT_HEIGHT[minutes] || SLOT_HEIGHT[30];
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
  busySlots = [],
  onClickBusySlot,
}: Props) {
  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);
  const justDragged = useRef(false);
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);
  const slotInfo = getSlotHeight(slotDurationMinutes);
  const pxPerMinute = slotInfo.px / slotDurationMinutes;

  // Mouse 5px + Touch long-press 180ms (vedi MonthView): lo scroll col dito
  // sopra un appuntamento non deve riprogrammarlo.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
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

  const getBusySlotsForHour = (slotTime: string): GoogleBusySlot[] => {
    const slotStart = timeToMin(slotTime);
    const slotEnd = slotStart + slotDurationMinutes;
    const dayStr = format(date, "yyyy-MM-dd");
    return busySlots.filter((s) => {
      if (s.is_all_day) return false;
      if (s.start_at.slice(0, 10) !== dayStr) return false;
      const sMin = timeToMin(s.start_at.slice(11, 16));
      const eMin = timeToMin(s.end_at.slice(11, 16));
      return sMin < slotEnd && eMin > slotStart;
    });
  };

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
    return (endMin - startMin) * pxPerMinute;
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

  // Current time indicator (Google Calendar red line)
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const nowMinutes = nowTick.getHours() * 60 + nowTick.getMinutes();
  const firstSlotMinutes = useMemo(() => {
    if (timeSlots.length === 0) return 0;
    const [h, m] = timeSlots[0].split(":").map(Number);
    return h * 60 + (m || 0);
  }, [timeSlots]);
  const totalSlotMinutes = timeSlots.length * slotDurationMinutes;
  const isNowInRange = todayFlag && nowMinutes >= firstSlotMinutes && nowMinutes <= firstSlotMinutes + totalSlotMinutes;
  const nowTopPx = isNowInRange ? (nowMinutes - firstSlotMinutes) * pxPerMinute : -1;

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
            <div className={cn(
              "text-[10px] uppercase tracking-wide font-medium",
              todayFlag ? "text-primary" : "text-muted-foreground"
            )}>
              {format(date, "EEEE", { locale: it })}
            </div>
            <div
              className={cn(
                "text-base font-semibold mt-0.5 w-9 h-9 flex items-center justify-center mx-auto rounded-full transition-colors",
                todayFlag
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-foreground"
              )}
            >
              {format(date, "d")}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-[60px_1fr] relative">
          {/* Current time indicator (Google Calendar red line) */}
          {isNowInRange && (
            <>
              <div
                className="absolute pointer-events-none z-20"
                style={{
                  top: `${nowTopPx}px`,
                  left: "60px",
                  right: 0,
                  height: "2px",
                }}
              >
                <div className="relative h-full">
                  <span
                    aria-hidden
                    className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_0_2px_rgba(239,68,68,0.25)]"
                  />
                  <div className="h-full w-full bg-red-500" />
                </div>
              </div>
              <div
                className="absolute pointer-events-none z-20 text-[10px] font-semibold text-red-500 tabular-nums bg-background px-1 rounded"
                style={{
                  top: `${nowTopPx - 7}px`,
                  left: "2px",
                }}
              >
                {format(nowTick, "HH:mm")}
              </div>
            </>
          )}
          {timeSlots.map((slotTime) => {
            const isHour = slotTime.endsWith(":00");
            const [h, m] = slotTime.split(":").map(Number);
            const slotApts = getAppointmentsForSlot(slotTime);
            const slotBusy = getBusySlotsForHour(slotTime);
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
                  onClick={() => { if (!justDragged.current) onClickSlot(date, h, m); }}
                >
                  {/* 2026-05-27: busy slots Google in blu (brand) + Apple in zinc.
                      2026-06-14: ora cliccabili e con etichetta visibile (icona +
                      fascia oraria + titolo) — prima erano solo una velatura senza
                      testo, illeggibili in vista giorno/settimana. Il click apre il
                      dettaglio dell'evento esterno. */}
                  {slotBusy.map((busy, bi) => {
                    const isApple = busy.provider === "apple";
                    const startHM = busy.start_at.slice(11, 16);
                    const endHM = busy.end_at.slice(11, 16);
                    // L'etichetta va mostrata solo nella cella in cui l'evento INIZIA,
                    // così un evento multi-slot non ripete il titolo in ogni sotto-cella.
                    const sMin = timeToMin(startHM);
                    const cellMin = timeToMin(slotTime);
                    const isStartCell = sMin >= cellMin && sMin < cellMin + slotDurationMinutes;
                    const label = busy.summary || (isApple ? "Occupato (Apple)" : "Occupato (Google)");
                    return (
                      <button
                        type="button"
                        key={`busy-${busy.id}-${bi}`}
                        onClick={(e) => { e.stopPropagation(); onClickBusySlot?.(busy); }}
                        title={`${busy.summary || "Occupato"} · ${startHM}–${endHM} (${isApple ? "Apple" : "Google"} Calendar)`}
                        className={cn(
                          "absolute inset-0 z-0 flex flex-col items-start overflow-hidden border-l-2 px-1 py-0.5 text-left transition-colors",
                          isApple
                            ? "border-zinc-400/70 bg-zinc-100/70 hover:bg-zinc-200/80 dark:bg-zinc-800/30"
                            : "border-blue-500/70 bg-blue-100/70 hover:bg-blue-200/80 dark:bg-blue-900/30"
                        )}
                      >
                        {isStartCell && (
                          <span className={cn(
                            "flex max-w-full items-center gap-1 text-[10px] font-medium leading-tight",
                            isApple ? "text-zinc-700 dark:text-zinc-300" : "text-blue-800 dark:text-blue-200"
                          )}>
                            <CalendarIcon className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{startHM}–{endHM} · {label}</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
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
                        onResizeEnd={() => { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 200); }}
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
                              "flex flex-col text-[11px] leading-tight px-2 py-1 rounded-md border-l-[3px] cursor-pointer hover:brightness-95 transition-all mb-0.5 shadow-sm",
                              heightPx ? "h-full overflow-hidden" : "",
                              apt.is_blocked_slot
                                ? "bg-muted/60 border-dashed border-muted-foreground/50 text-muted-foreground italic"
                                : apt.calendar_id && colorMap[apt.calendar_id]
                                  ? colorMap[apt.calendar_id]
                                  : "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100"
                            )}
                            title={apt.title}
                          >
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="truncate min-w-0 flex-1">
                                {apt.appointment_time && (
                                  <span className="font-semibold">{apt.appointment_time.slice(0, 5)} </span>
                                )}
                                <span className="font-medium">{apt.title}</span>
                                {apt.appointment_end_time && (
                                  <span className="text-[10px] opacity-70"> – {apt.appointment_end_time.slice(0, 5)}</span>
                                )}
                              </span>
                            </div>
                            {!apt.is_blocked_slot && (apt as any).contact_name && (heightPx == null || heightPx >= 40) && (
                              <div className="flex items-center gap-1 mt-0.5 opacity-80 truncate">
                                <User className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate text-[10px] font-medium">
                                  {(apt as any).contact_name}
                                </span>
                              </div>
                            )}
                            {!apt.is_blocked_slot && (apt as any).assigned_name && (heightPx == null || heightPx >= 55) && (
                              <div className="flex items-center gap-1 opacity-70 truncate">
                                <span className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-current/15 text-[8px] font-bold shrink-0">
                                  {(apt as any).assigned_name.charAt(0).toUpperCase()}
                                </span>
                                <span className="truncate text-[10px]">
                                  {(apt as any).assigned_name}
                                </span>
                              </div>
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

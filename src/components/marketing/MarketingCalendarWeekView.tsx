import { useMemo, useState, useRef, useEffect } from "react";
import { format, addDays, isSameDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { DndContext, DragOverlay, PointerSensor, useSensors, useSensor, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff, User } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import type { GoogleBusySlot } from "@/types/calendar";
import { buildTimeSlots, buildColorMap, timeToMin } from "@/lib/marketingCalendarConstants";
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
  onResizeAppointment?: (id: string, newEndTime: string) => void;
  busySlots?: GoogleBusySlot[];
}

const SLOT_HEIGHT: Record<number, { className: string; px: number }> = {
  60: { className: "h-16", px: 64 },
  30: { className: "h-8", px: 32 },
  15: { className: "h-6", px: 24 },
};

function getSlotHeight(minutes: number) {
  return SLOT_HEIGHT[minutes] || SLOT_HEIGHT[30];
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
  onResizeAppointment,
  busySlots = [],
}: Props) {
  const justDragged = useRef(false);
  const [activeApt, setActiveApt] = useState<MarketingAppointment | null>(null);
  const slotInfo = getSlotHeight(slotDurationMinutes);
  const pxPerMinute = slotInfo.px / slotDurationMinutes;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const getBusySlotsForDayHour = (day: Date, slotTime: string): GoogleBusySlot[] => {
    const slotStart = timeToMin(slotTime);
    const slotEnd = slotStart + slotDurationMinutes;
    const dayStr = format(day, "yyyy-MM-dd");
    return busySlots.filter((s) => {
      if (s.is_all_day) return false;
      const sDate = s.start_at.slice(0, 10);
      if (sDate !== dayStr) return false;
      const sMin = timeToMin(s.start_at.slice(11, 16));
      const eMin = timeToMin(s.end_at.slice(11, 16));
      return sMin < slotEnd && eMin > slotStart;
    });
  };

  const getAppointmentsForSlot = (day: Date, slotTime: string) => {
    const slotStart = timeToMin(slotTime);
    const slotEnd = slotStart + slotDurationMinutes;
    return appointments.filter((a) => {
      if (!isSameDay(parseISO(a.appointment_date), day)) return false;
      if (!a.appointment_time) return slotTime === "09:00";
      const aptMin = timeToMin(a.appointment_time);
      return aptMin >= slotStart && aptMin < slotEnd;
    });
  };

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

  const getTopOffsetPx = (apt: MarketingAppointment, slotTime: string): number => {
    if (!apt.appointment_time) return 0;
    const aptMin = timeToMin(apt.appointment_time);
    const slotMin = timeToMin(slotTime);
    const offset = aptMin - slotMin;
    if (offset <= 0) return 0;
    return offset * pxPerMinute;
  };

  const today = new Date();

  // Current time indicator (Google Calendar red line) — tick each minute
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
  const isNowInRange = nowMinutes >= firstSlotMinutes && nowMinutes <= firstSlotMinutes + totalSlotMinutes;
  const nowTopPx = isNowInRange ? (nowMinutes - firstSlotMinutes) * pxPerMinute : -1;
  const todayColumnIndex = useMemo(() => days.findIndex((d) => isSameDay(d, nowTick)), [days, nowTick]);

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
    const match = overId.match(/^slot-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/);
    if (!match) return;
    onDropAppointment(aptId, match[1], match[2]);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                <div className={cn(
                  "text-[10px] uppercase tracking-wide font-medium",
                  isSameDay(day, today) ? "text-primary" : "text-muted-foreground"
                )}>
                  {format(day, "EEE", { locale: it })}
                </div>
                <div
                  className={cn(
                    "text-base font-semibold mt-0.5 w-9 h-9 flex items-center justify-center mx-auto rounded-full transition-colors",
                    isSameDay(day, today)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground hover:bg-muted/60"
                  )}
                >
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] relative">
            {/* Current time indicator line (Google Calendar style) */}
            {isNowInRange && todayColumnIndex >= 0 && (
              <>
                {/* Linea orizzontale rossa solo nella colonna oggi */}
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    top: `${nowTopPx}px`,
                    left: `calc(60px + ${todayColumnIndex} * ((100% - 60px) / 7))`,
                    width: `calc((100% - 60px) / 7)`,
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
                {/* Etichetta ora corrente a sinistra */}
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
              const showLabel = slotDurationMinutes >= 60 || isHour;
              return (
                <div key={slotTime} className="contents">
                  <div className={cn(
                    "p-1 pr-2 text-right text-xs text-muted-foreground border-r flex items-start justify-end pt-0",
                    slotInfo.className,
                  )}>
                    {showLabel && <span className="-mt-2">{slotTime}</span>}
                  </div>
                  {days.map((day) => {
                    const slotApts = getAppointmentsForSlot(day, slotTime);
                    const dateKey = format(day, "yyyy-MM-dd");
                    const dayLegMap = travelLegMaps[dateKey] || {};
                    const slotBusy = getBusySlotsForDayHour(day, slotTime);

                    return (
                      <DroppableSlot
                        key={`${dateKey}-${slotTime}`}
                        id={`slot-${dateKey}-${slotTime}`}
                        className={cn(
                          "border-r last:border-r-0 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors relative min-w-0",
                          slotInfo.className,
                          isHour ? "border-b" : "border-b border-dashed border-border/40",
                          isSameDay(day, today) && "bg-primary/[0.02]"
                        )}
                        onClick={() => { if (!justDragged.current) onClickSlot(day, h, m); }}
                      >
                        {/* 2026-05-27: Google blu (brand), Apple zinc — coerenti
                            con MonthView. Rimosso rosso (era confondibile con conflitto). */}
                        {slotBusy.map((busy, bi) => (
                          <Tooltip key={`busy-${bi}`}>
                            <TooltipTrigger asChild>
                              <div className={`absolute inset-0 pointer-events-none z-0 border-l-2 ${
                                busy.provider === "apple"
                                  ? "bg-zinc-100/60 dark:bg-zinc-800/20 border-zinc-400/60"
                                  : "bg-blue-100/60 dark:bg-blue-900/20 border-blue-500/60"
                              }`} />
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              <span className="text-xs">{busy.summary || (busy.provider === "apple" ? "Occupato (Apple Calendar)" : "Occupato (Google Calendar)")}</span>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                        {slotApts.map((apt) => {
                          const leg = dayLegMap[apt.id];
                          const hasNoCoords = apt.lat == null || apt.lng == null;
                          const heightPx = getHeightPx(apt);
                          const topOffset = getTopOffsetPx(apt, slotTime);

                          // Tooltip strutturato: titolo, orario, cliente, venditore, indirizzo, tragitto
                          const tooltipLines: string[] = [apt.title];
                          if (apt.appointment_time) tooltipLines.unshift(apt.appointment_time.slice(0, 5));
                          if (apt.appointment_end_time) tooltipLines[0] += ` – ${apt.appointment_end_time.slice(0, 5)}`;
                          if ((apt as any).contact_name) tooltipLines.push(`👤 Cliente: ${(apt as any).contact_name}`);
                          if ((apt as any).assigned_name) tooltipLines.push(`🧑‍💼 Venditore: ${(apt as any).assigned_name}`);
                          if (apt.formatted_address) tooltipLines.push(`📍 ${apt.formatted_address}`);
                          if (leg) {
                            tooltipLines.push(`🚗 ${leg.duration_text} • ${leg.distance_text}`);
                            if (leg.isLate) tooltipLines.push(`⚠️ Ritardo stimato: +${leg.delayMinutes} min`);
                          }
                          if (hasNoCoords && !apt.is_blocked_slot && !leg) {
                            tooltipLines.push("📍 Indirizzo mancante");
                          }
                          const clientName = (apt as any).contact_name as string | null;
                          const sellerName = (apt as any).assigned_name as string | null;
                          // Mostra dettagli solo se l'altezza della card è sufficiente
                          const showDetails = (heightPx ?? 0) >= 40;

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
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onClickAppointment(apt);
                                    }}
                                    className={cn(
                                      "flex flex-col text-[11px] leading-tight px-1.5 py-1 rounded-md border-l-[3px] cursor-pointer hover:brightness-95 transition-all mb-0.5 min-w-0 h-full shadow-sm",
                                      apt.is_blocked_slot
                                        ? "bg-muted/60 border-dashed border-muted-foreground/50 text-muted-foreground italic"
                                        : apt.calendar_id && colorMap[apt.calendar_id]
                                          ? colorMap[apt.calendar_id]
                                          : "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-900 dark:text-blue-100"
                                    )}
                                  >
                                    {/* Riga 1: orario + titolo + travel/alert */}
                                    <div className="flex items-center gap-1 min-w-0">
                                      {hasNoCoords && !apt.is_blocked_slot && !leg && (
                                        <MapPinOff className="h-2.5 w-2.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                                      )}
                                      <span className="truncate min-w-0 flex-1">
                                        {apt.appointment_time && (
                                          <span className="font-semibold">{apt.appointment_time.slice(0, 5)} </span>
                                        )}
                                        <span className={cn(!showDetails && "font-medium")}>{apt.title}</span>
                                      </span>
                                      {leg && (
                                        <span
                                          className={cn(
                                            "shrink-0 flex items-center gap-0.5 text-[9px] leading-none px-1 py-px rounded",
                                            leg.isLate
                                              ? "bg-destructive/15 text-destructive"
                                              : "bg-white/60 dark:bg-black/20 text-current/80"
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
                                    {/* Riga 2: cliente (distinto dal venditore) */}
                                    {showDetails && clientName && !apt.is_blocked_slot && (
                                      <div className="flex items-center gap-1 truncate mt-0.5 opacity-80">
                                        <User className="h-2.5 w-2.5 shrink-0" />
                                        <span className="truncate text-[10px] font-medium">{clientName}</span>
                                      </div>
                                    )}
                                    {/* Riga 3: venditore (pallino iniziale) */}
                                    {showDetails && sellerName && !apt.is_blocked_slot && (
                                      <div className="flex items-center gap-1 truncate opacity-70">
                                        <span className="inline-flex items-center justify-center h-3 w-3 rounded-full bg-current/15 text-[8px] font-bold shrink-0">
                                          {sellerName.charAt(0).toUpperCase()}
                                        </span>
                                        <span className="truncate text-[10px]">{sellerName}</span>
                                      </div>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[280px] space-y-0.5">
                                  {tooltipLines.map((line, i) => (
                                    <p key={i} className={cn(
                                      i === 0 && "font-semibold text-sm",
                                      line.startsWith("⚠️") && "text-destructive font-medium"
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

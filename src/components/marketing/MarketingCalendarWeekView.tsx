import { useMemo } from "react";
import { format, addDays, isSameDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import { HOURS, buildColorMap } from "@/lib/marketingCalendarConstants";

interface Props {
  weekStart: Date;
  appointments: MarketingAppointment[];
  calendarIds: string[];
  onClickAppointment: (apt: MarketingAppointment) => void;
  onClickSlot: (date: Date, hour: number) => void;
  travelLegs?: Record<string, TravelLeg[]>;
}

export default function MarketingCalendarWeekView({
  weekStart,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickSlot,
  travelLegs = {},
}: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);

  const travelLegMaps = useMemo(() => {
    const maps: Record<string, Record<string, TravelLeg>> = {};
    Object.entries(travelLegs).forEach(([dateKey, legs]) => {
      const m: Record<string, TravelLeg> = {};
      legs.forEach((leg) => { m[leg.toId] = leg; });
      maps[dateKey] = m;
    });
    return maps;
  }, [travelLegs]);

  const getAppointmentsForSlot = (day: Date, hour: number) =>
    appointments.filter((a) => {
      if (!isSameDay(parseISO(a.appointment_date), day)) return false;
      if (!a.appointment_time) return hour === 9;
      const h = parseInt(a.appointment_time.split(":")[0], 10);
      return h === hour;
    });

  const today = new Date();

  return (
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
          {HOURS.map((hour) => (
            <div key={hour} className="contents">
              <div className="p-1 pr-2 text-right text-xs text-muted-foreground border-r h-16 flex items-start justify-end pt-0">
                <span className="-mt-2">{String(hour).padStart(2, "0")}:00</span>
              </div>
              {days.map((day) => {
                const slotApts = getAppointmentsForSlot(day, hour);
                const dateKey = format(day, "yyyy-MM-dd");
                const dayLegMap = travelLegMaps[dateKey] || {};

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={cn(
                      "border-b border-r last:border-r-0 h-16 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors relative min-w-0",
                      isSameDay(day, today) && "bg-primary/[0.02]"
                    )}
                    onClick={() => onClickSlot(day, hour)}
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
                        <Tooltip key={apt.id}>
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
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

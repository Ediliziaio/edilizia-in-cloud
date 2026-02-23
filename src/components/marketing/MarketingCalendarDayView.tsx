import { useMemo } from "react";
import { format, isSameDay, parseISO, isToday } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Car, AlertTriangle, MapPinOff } from "lucide-react";
import type { MarketingAppointment, TravelLeg } from "@/types/marketingCalendar";
import { HOURS, buildColorMap } from "@/lib/marketingCalendarConstants";

interface Props {
  date: Date;
  appointments: MarketingAppointment[];
  calendarIds: string[];
  onClickAppointment: (apt: MarketingAppointment) => void;
  onClickSlot: (date: Date, hour: number) => void;
  travelLegs?: TravelLeg[];
}

export default function MarketingCalendarDayView({
  date,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickSlot,
  travelLegs = [],
}: Props) {
  const colorMap = useMemo(() => buildColorMap(calendarIds), [calendarIds]);

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

  const getAppointmentsForHour = (hour: number) =>
    dayAppointments.filter((a) => {
      if (!a.appointment_time) return hour === 9;
      return parseInt(a.appointment_time.split(":")[0], 10) === hour;
    });

  const todayFlag = isToday(date);

  return (
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
        {HOURS.map((hour) => {
          const slotApts = getAppointmentsForHour(hour);
          return (
            <div key={hour} className="contents">
              <div className="p-1 pr-2 text-right text-xs text-muted-foreground border-r h-16 flex items-start justify-end pt-0">
                <span className="-mt-2">{String(hour).padStart(2, "0")}:00</span>
              </div>
              <div
                className={cn(
                  "border-b h-16 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors",
                  todayFlag && "bg-primary/[0.02]"
                )}
                onClick={() => onClickSlot(date, hour)}
              >
                {slotApts.map((apt) => {
                  const leg = travelLegMap[apt.id];
                  const hasNoCoords = apt.lat == null || apt.lng == null;

                  return (
                    <div key={apt.id}>
                      {/* Travel time pill before appointment */}
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
                      {/* Missing address badge */}
                      {hasNoCoords && !apt.is_blocked_slot && (
                        <div className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded mb-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700">
                          <MapPinOff className="h-3 w-3" />
                          <span>Indirizzo mancante</span>
                        </div>
                      )}
                      {/* Appointment block */}
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
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

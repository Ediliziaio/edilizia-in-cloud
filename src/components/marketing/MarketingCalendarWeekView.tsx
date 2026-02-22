import { useMemo } from "react";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 - 21:00

const CALENDAR_COLORS = [
  "bg-blue-500/20 border-blue-500 text-blue-900 dark:text-blue-200",
  "bg-green-500/20 border-green-500 text-green-900 dark:text-green-200",
  "bg-purple-500/20 border-purple-500 text-purple-900 dark:text-purple-200",
  "bg-orange-500/20 border-orange-500 text-orange-900 dark:text-orange-200",
  "bg-pink-500/20 border-pink-500 text-pink-900 dark:text-pink-200",
  "bg-cyan-500/20 border-cyan-500 text-cyan-900 dark:text-cyan-200",
];

interface Appointment {
  id: string;
  title: string;
  appointment_date: string;
  appointment_time: string | null;
  appointment_type: string;
  status: string;
  calendar_id: string | null;
  assigned_to: string | null;
  contact_id: string | null;
  description: string | null;
  is_completed: boolean;
}

interface Props {
  weekStart: Date;
  appointments: Appointment[];
  calendarIds: string[];
  onClickAppointment: (apt: Appointment) => void;
  onClickSlot: (date: Date, hour: number) => void;
}

export default function MarketingCalendarWeekView({
  weekStart,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickSlot,
}: Props) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    calendarIds.forEach((id, i) => {
      map[id] = CALENDAR_COLORS[i % CALENDAR_COLORS.length];
    });
    return map;
  }, [calendarIds]);

  const getAppointmentsForSlot = (day: Date, hour: number) =>
    appointments.filter((a) => {
      if (!isSameDay(parseISO(a.appointment_date), day)) return false;
      if (!a.appointment_time) return hour === 9; // default to 9am
      const h = parseInt(a.appointment_time.split(":")[0], 10);
      return h === hour;
    });

  const today = new Date();

  return (
    <div className="flex-1 overflow-auto border rounded-lg bg-background">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b sticky top-0 z-10 bg-background">
        <div className="p-2 border-r text-xs text-muted-foreground" />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "p-2 text-center border-r last:border-r-0",
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
      <div className="grid grid-cols-[60px_repeat(7,1fr)]">
        {HOURS.map((hour) => (
          <div key={hour} className="contents">
            <div className="p-1 pr-2 text-right text-xs text-muted-foreground border-r h-16 flex items-start justify-end pt-0">
              <span className="-mt-2">{String(hour).padStart(2, "0")}:00</span>
            </div>
            {days.map((day) => {
              const slotApts = getAppointmentsForSlot(day, hour);
              return (
                <div
                  key={`${day.toISOString()}-${hour}`}
                  className={cn(
                    "border-b border-r last:border-r-0 h-16 p-0.5 cursor-pointer hover:bg-muted/30 transition-colors relative",
                    isSameDay(day, today) && "bg-primary/[0.02]"
                  )}
                  onClick={() => onClickSlot(day, hour)}
                >
                  {slotApts.map((apt) => (
                    <div
                      key={apt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickAppointment(apt);
                      }}
                      className={cn(
                        "text-[11px] leading-tight px-1.5 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80 mb-0.5",
                        apt.calendar_id && colorMap[apt.calendar_id]
                          ? colorMap[apt.calendar_id]
                          : "bg-muted border-muted-foreground/40 text-foreground"
                      )}
                      title={apt.title}
                    >
                      {apt.appointment_time && (
                        <span className="font-medium">
                          {apt.appointment_time.slice(0, 5)}{" "}
                        </span>
                      )}
                      {apt.title}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

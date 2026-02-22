import { useMemo } from "react";
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
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

const CALENDAR_COLORS = [
  "bg-blue-500/20 border-blue-500 text-blue-900 dark:text-blue-200",
  "bg-green-500/20 border-green-500 text-green-900 dark:text-green-200",
  "bg-purple-500/20 border-purple-500 text-purple-900 dark:text-purple-200",
  "bg-orange-500/20 border-orange-500 text-orange-900 dark:text-orange-200",
  "bg-pink-500/20 border-pink-500 text-pink-900 dark:text-pink-200",
  "bg-cyan-500/20 border-cyan-500 text-cyan-900 dark:text-cyan-200",
];

const DAY_NAMES = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

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
  currentDate: Date;
  appointments: Appointment[];
  calendarIds: string[];
  onClickAppointment: (apt: Appointment) => void;
  onClickDay: (date: Date) => void;
}

export default function MarketingCalendarMonthView({
  currentDate,
  appointments,
  calendarIds,
  onClickAppointment,
  onClickDay,
}: Props) {
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    calendarIds.forEach((id, i) => {
      map[id] = CALENDAR_COLORS[i % CALENDAR_COLORS.length];
    });
    return map;
  }, [calendarIds]);

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

  return (
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

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "border-r last:border-r-0 min-h-[100px] p-1 cursor-pointer hover:bg-muted/30 transition-colors",
                  !inMonth && "opacity-40",
                  isToday(day) && "bg-primary/5"
                )}
                onClick={() => onClickDay(day)}
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
                    <div
                      key={apt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onClickAppointment(apt);
                      }}
                      className={cn(
                        "text-[10px] leading-tight px-1 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80",
                        apt.calendar_id && colorMap[apt.calendar_id]
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
                  ))}
                  {dayApts.length > maxShow && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayApts.length - maxShow} altri
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

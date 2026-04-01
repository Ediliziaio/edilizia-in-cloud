import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  parseISO,
  addMonths,
  subMonths,
  isWithinInterval,
  getDay,
} from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, TrendingUp, CalendarOff, AlertTriangle, BarChart3 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hammer, Wrench, Users, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasLogisticRisk, getEmployeeInitials, WEEK_DAYS_IT } from "@/lib/calendarUtils";
import type { CalendarOrder } from "@/types/calendar";

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

interface CalendarHeatmapViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  employees?: Employee[];
}

interface DayWorkload {
  orders: CalendarOrder[];
  total: number;
}

interface EmployeeWorkload {
  employeeId: string;
  employeeName: string;
  dayEvents: Map<string, Array<{ orderId: string; type: string; label: string }>>;
  totalDays: number;
}

function getWorkloadForDay(
  orders: CalendarOrder[],
  day: Date
): DayWorkload {
  const filteredOrders = orders.filter((order) => {
    const start = order.work_start_date ? parseISO(order.work_start_date) : null;
    const end = order.work_end_date ? parseISO(order.work_end_date) : start;

    // Check posa
    if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) {
      return true;
    }

    // Check lavoro (range)
    if (start && end) {
      if (isWithinInterval(day, { start, end })) {
        // Avoid double-counting if this day is already counted as posa
        const isPosaDay = order.expected_date && isSameDay(parseISO(order.expected_date), day);
        if (!isPosaDay) return true;
      }
    }

    return false;
  });

  return {
    orders: filteredOrders,
    total: filteredOrders.length,
  };
}

function getHeatColor(count: number): string {
  if (count === 0) return "bg-muted";
  if (count <= 2) return "bg-green-200 dark:bg-green-900/40";
  if (count <= 4) return "bg-yellow-200 dark:bg-yellow-900/40";
  if (count <= 6) return "bg-orange-300 dark:bg-orange-900/40";
  return "bg-red-400 dark:bg-red-900/50";
}

function getHeatTextColor(count: number): string {
  if (count === 0) return "text-muted-foreground";
  if (count <= 2) return "text-green-800 dark:text-green-300";
  if (count <= 4) return "text-yellow-800 dark:text-yellow-300";
  if (count <= 6) return "text-orange-800 dark:text-orange-300";
  return "text-red-900 dark:text-red-200";
}

export function CalendarHeatmapView({ orders, currentDate, onDateChange, employees = [] }: CalendarHeatmapViewProps) {
  const navigate = useNavigate();
  const [heatmapMode, setHeatmapMode] = useState<"day" | "employee">("day");

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const dayWorkloads = useMemo(() => {
    const map = new Map<string, DayWorkload>();
    days.forEach((day) => {
      map.set(format(day, "yyyy-MM-dd"), getWorkloadForDay(orders, day));
    });
    return map;
  }, [days, orders]);

  const stats = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const weekdays = monthDays.filter((d) => getDay(d) !== 0);

    let totalWork = 0;
    let peakCount = 0;
    let peakDay: Date | null = null;
    let emptyDays = 0;
    let criticalDays = 0;

    weekdays.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      const count = dayWorkloads.get(key)?.total ?? 0;
      totalWork += count;
      if (count === 0) emptyDays++;
      if (count >= 5) criticalDays++;
      if (count > peakCount) {
        peakCount = count;
        peakDay = day;
      }
    });

    return {
      avg: weekdays.length > 0 ? (totalWork / weekdays.length).toFixed(1) : "0",
      peakCount,
      peakDay,
      emptyDays,
      criticalDays,
    };
  }, [currentDate, dayWorkloads]);

  const employeeWorkloads = useMemo((): EmployeeWorkload[] => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return employees.map(emp => {
      const dayEventsMap = new Map<string, Array<{ orderId: string; type: string; label: string }>>();
      for (const day of monthDays) {
        const key = format(day, "yyyy-MM-dd");
        const events: Array<{ orderId: string; type: string; label: string }> = [];
        for (const order of orders) {
          const hasEmployee = order.order_employees?.some(ae => ae.employee.id === emp.id);
          if (!hasEmployee) continue;
          if (order.expected_date === key) {
            events.push({ orderId: order.id, type: "posa", label: order.order_code || order.description?.slice(0, 20) || "Ordine" });
          } else if (order.work_start_date) {
            const start = parseISO(order.work_start_date);
            const end = order.work_end_date ? parseISO(order.work_end_date) : start;
            if (isWithinInterval(day, { start, end })) {
              events.push({ orderId: order.id, type: "lavoro", label: order.order_code || order.description?.slice(0, 20) || "Ordine" });
            }
          }
        }
        if (events.length > 0) dayEventsMap.set(key, events);
      }
      return {
        employeeId: emp.id,
        employeeName: `${emp.first_name} ${emp.last_name}`,
        dayEvents: dayEventsMap,
        totalDays: dayEventsMap.size,
      };
    });
  }, [employees, orders, currentDate]);

  const monthDaysOnly = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [currentDate]);

  const weekDays = WEEK_DAYS_IT;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => onDateChange(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold capitalize">
              {format(currentDate, "MMMM yyyy", { locale: it })}
            </h2>
            {employees.length > 0 && (
              <div className="flex rounded-md border overflow-hidden text-xs">
                <button
                  className={cn("px-2 py-1 transition-colors", heatmapMode === "day" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  onClick={() => setHeatmapMode("day")}
                >
                  Per giorno
                </button>
                <button
                  className={cn("px-2 py-1 transition-colors border-l", heatmapMode === "employee" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                  onClick={() => setHeatmapMode("employee")}
                >
                  Per operaio
                </button>
              </div>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => onDateChange(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {heatmapMode === "day" ? (
          <>
            <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
                {weekDays.map((day) => (
                  <div key={day} className="bg-muted-foreground/5 p-2 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}

                {days.map((day, idx) => {
                  const key = format(day, "yyyy-MM-dd");
                  const workload = dayWorkloads.get(key) ?? { orders: [], total: 0 };
                  const count = workload.total;
                  const isToday = isSameDay(day, new Date());
                  const isCurrentMonth = isSameMonth(day, currentDate);

                  const cellContent = (
                    <div
                      className={cn(
                        "min-h-[80px] p-2 transition-colors flex flex-col items-center",
                      isCurrentMonth ? getHeatColor(count) : "bg-muted/30",
                        !isCurrentMonth && "opacity-40",
                        isCurrentMonth && getDay(day) === 0 && "opacity-60 ring-1 ring-inset ring-muted-foreground/20",
                        isCurrentMonth && count > 0 && "cursor-pointer hover:opacity-80"
                      )}
                    >
                      <div
                        className={cn(
                          "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full mb-1",
                          isToday && "bg-primary text-primary-foreground",
                          !isToday && !isCurrentMonth && "text-muted-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </div>
                      {isCurrentMonth && count > 0 && (() => {
                        const hasPosa = workload.orders.some(o => o.expected_date && isSameDay(parseISO(o.expected_date), day));
                        const hasLavoro = workload.orders.some(o => o.work_start_date);
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className={cn("text-xl font-bold", getHeatTextColor(count))}>
                                {count}
                              </span>
                              {count >= 5 && (
                                <AlertTriangle className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div className="flex gap-0.5">
                              {hasPosa && <Hammer className="h-2.5 w-2.5 text-blue-500" />}
                              {hasLavoro && <Wrench className="h-2.5 w-2.5 text-green-500" />}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );

                  if (!isCurrentMonth || count === 0) {
                    return <div key={idx}>{cellContent}</div>;
                  }

                  return (
                    <Popover key={idx}>
                      <PopoverTrigger asChild>
                        {cellContent}
                      </PopoverTrigger>
                      <PopoverContent side="right" align="start" className="w-72 p-0">
                        <div className="px-4 py-3 border-b">
                          <p className="font-semibold capitalize">
                            {format(day, "EEEE d MMMM", { locale: it })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {count} {count === 1 ? "attività" : "attività"} attive
                          </p>
                        </div>
                        <ScrollArea className={count > 5 ? "h-60" : ""}>
                          <div className="p-2 space-y-1">
                            {workload.orders.map((order) => {
                              const isPosa = order.expected_date && isSameDay(parseISO(order.expected_date), day);

                              return (
                                <button
                                  key={order.id}
                                  onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                                  className="w-full flex items-center gap-2 p-2 rounded-md text-left text-sm hover:bg-accent transition-colors"
                                >
                                  <div className="flex-shrink-0">
                                    {isPosa ? (
                                      <Hammer className="h-4 w-4 text-blue-500" />
                                    ) : (
                                      <Wrench className="h-4 w-4 text-green-500" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">
                                      {order.order_code || "N/A"} — {order.customer.last_name}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {order.description}
                                    </p>
                                    {(() => {
                                      const initials = getEmployeeInitials(order);
                                      const extTeam = order.order_external_teams?.map(aet => aet.external_team.name).join(", ");
                                      const risk = isPosa && hasLogisticRisk(order);
                                      return (
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {initials && (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                              <Users className="h-2.5 w-2.5" />{initials}
                                            </span>
                                          )}
                                          {extTeam && (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                              <UsersRound className="h-2.5 w-2.5" />{extTeam}
                                            </span>
                                          )}
                                          {risk && (
                                            <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                                              <AlertTriangle className="h-2.5 w-2.5" />Rischio
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  {order.status && (
                                    <div
                                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: order.status.color }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>

            {/* Legenda */}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {[
                { label: "0", cls: "bg-muted" },
                { label: "1-2", cls: "bg-green-200 dark:bg-green-900/40" },
                { label: "3-4", cls: "bg-yellow-200 dark:bg-yellow-900/40" },
                { label: "5-6", cls: "bg-orange-300 dark:bg-orange-900/40" },
                { label: "7+", cls: "bg-red-400 dark:bg-red-900/50" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={cn("w-4 h-4 rounded border", item.cls)} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Per-employee view */
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Header row with day numbers */}
              <div className="flex gap-px mb-px">
                <div className="w-32 shrink-0 text-xs text-muted-foreground font-medium px-1">Operaio</div>
                {monthDaysOnly.map(day => (
                  <div key={format(day, "d")} className={cn("w-7 text-center text-[10px] text-muted-foreground", getDay(day) === 0 && "opacity-40")}>
                    {format(day, "d")}
                  </div>
                ))}
                <div className="w-12 text-center text-[10px] text-muted-foreground font-medium">Totale</div>
              </div>
              {/* Employee rows */}
              {employeeWorkloads.map(emp => (
                <div key={emp.employeeId} className="flex gap-px mb-px items-center">
                  <div className="w-32 shrink-0 text-xs truncate pr-1">{emp.employeeName}</div>
                  {monthDaysOnly.map(day => {
                    const key = format(day, "yyyy-MM-dd");
                    const events = emp.dayEvents.get(key) ?? [];
                    const count = events.length;
                    const isToday = isSameDay(day, new Date());
                    return (
                      <Popover key={key}>
                        <PopoverTrigger asChild>
                          <div className={cn(
                            "w-7 h-7 rounded-sm flex items-center justify-center text-[10px] cursor-pointer transition-colors",
                            count === 0 ? "bg-muted/40" : count === 1 ? "bg-green-200 dark:bg-green-900/40" : count >= 2 ? "bg-orange-300 dark:bg-orange-900/40" : "",
                            isToday && "ring-1 ring-primary",
                            getDay(day) === 0 && "opacity-40",
                            count > 0 && "font-medium"
                          )}>
                            {count > 0 ? count : ""}
                          </div>
                        </PopoverTrigger>
                        {count > 0 && (
                          <PopoverContent side="right" align="start" className="w-48 p-2 text-xs space-y-1">
                            <p className="font-semibold">{format(day, "d MMM", { locale: it })}</p>
                            {events.map((evt, i) => (
                              <div key={i} className="flex items-center gap-1">
                                {evt.type === "posa" ? <Hammer className="h-3 w-3 text-blue-500 shrink-0" /> : <Wrench className="h-3 w-3 text-green-500 shrink-0" />}
                                <span className="truncate">{evt.label}</span>
                              </div>
                            ))}
                          </PopoverContent>
                        )}
                      </Popover>
                    );
                  })}
                  <div className={cn("w-12 text-center text-xs font-medium", emp.totalDays >= 20 ? "text-red-500" : emp.totalDays >= 15 ? "text-orange-500" : "text-muted-foreground")}>
                    {emp.totalDays}gg
                  </div>
                </div>
              ))}
              {employeeWorkloads.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nessun operaio nel filtro corrente.</p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Statistiche */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Media/giorno</p>
            <p className="text-lg font-bold">{stats.avg}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <TrendingUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Picco</p>
            <p className="text-lg font-bold">
              {stats.peakDay ? `${stats.peakCount} (${format(stats.peakDay, "d MMM", { locale: it })})` : "—"}
            </p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <CalendarOff className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Giorni vuoti</p>
            <p className="text-lg font-bold">{stats.emptyDays}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Giorni critici (5+)</p>
            <p className={cn("text-lg font-bold", stats.criticalDays > 0 && "text-destructive")}>{stats.criticalDays}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}

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
  isWeekend,
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
import { Hammer, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarOrder } from "@/types/calendar";

interface CalendarHeatmapViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

function getWorkloadForDay(orders: CalendarOrder[], day: Date): CalendarOrder[] {
  return orders.filter((order) => {
    const start = order.work_start_date ? parseISO(order.work_start_date) : null;
    const end = order.work_end_date ? parseISO(order.work_end_date) : start;

    if (start && end) {
      if (isWithinInterval(day, { start, end })) return true;
    } else if (start && isSameDay(day, start)) {
      return true;
    }

    if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) return true;
    if (order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day)) return true;

    return false;
  });
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

export function CalendarHeatmapView({ orders, currentDate, onDateChange }: CalendarHeatmapViewProps) {
  const navigate = useNavigate();

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const dayWorkloads = useMemo(() => {
    const map = new Map<string, CalendarOrder[]>();
    days.forEach((day) => {
      map.set(format(day, "yyyy-MM-dd"), getWorkloadForDay(orders, day));
    });
    return map;
  }, [days, orders]);

  const stats = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const weekdays = monthDays.filter((d) => !isWeekend(d));

    let totalWork = 0;
    let peakCount = 0;
    let peakDay: Date | null = null;
    let emptyDays = 0;
    let criticalDays = 0;

    weekdays.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      const count = dayWorkloads.get(key)?.length ?? 0;
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

  const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => onDateChange(subMonths(currentDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize">
            {format(currentDate, "MMMM yyyy", { locale: it })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => onDateChange(addMonths(currentDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
            {weekDays.map((day) => (
              <div key={day} className="bg-muted-foreground/5 p-2 text-center text-sm font-medium text-muted-foreground">
                {day}
              </div>
            ))}

            {days.map((day, idx) => {
              const key = format(day, "yyyy-MM-dd");
              const dayOrders = dayWorkloads.get(key) ?? [];
              const count = dayOrders.length;
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentDate);

              const cellContent = (
                <div
                  className={cn(
                    "min-h-[80px] p-2 transition-colors flex flex-col items-center",
                    isCurrentMonth ? getHeatColor(count) : "bg-muted/30",
                    !isCurrentMonth && "opacity-40",
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
                  {isCurrentMonth && count > 0 && (
                    <div className="flex items-center gap-1">
                      <span className={cn("text-xl font-bold", getHeatTextColor(count))}>
                        {count}
                      </span>
                      {count >= 5 && (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  )}
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
                        {count} {count === 1 ? "lavoro" : "lavori"} attivi
                      </p>
                    </div>
                    <ScrollArea className={count > 5 ? "h-60" : ""}>
                      <div className="p-2 space-y-1">
                        {dayOrders.map((order) => {
                          const isPosa = order.expected_date && isSameDay(parseISO(order.expected_date), day);
                          const isMerce = order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day);

                          return (
                            <button
                              key={order.id}
                              onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                              className="w-full flex items-center gap-2 p-2 rounded-md text-left text-sm hover:bg-accent transition-colors"
                            >
                              <div className="flex-shrink-0">
                                {isPosa ? (
                                  <Hammer className="h-4 w-4 text-blue-500" />
                                ) : isMerce ? (
                                  <Package className="h-4 w-4 text-amber-500" />
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

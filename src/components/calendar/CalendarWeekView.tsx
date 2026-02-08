import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isToday,
  isSameDay,
  parseISO,
  addWeeks,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Hammer, Package, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarOrder } from "@/types/calendar";

interface CalendarWeekViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export function CalendarWeekView({
  orders,
  currentDate,
  onDateChange,
}: CalendarWeekViewProps) {
  const navigate = useNavigate();

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const getOrderEventsForDay = (day: Date) => {
    const events: Array<{
      order: CalendarOrder;
      type: "posa" | "merce" | "lavoro";
    }> = [];

    orders.forEach((order) => {
      // Evento puntuale: data posa prevista
      if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) {
        events.push({ order, type: "posa" });
      }

      // Evento puntuale: arrivo merce
      if (order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day)) {
        events.push({ order, type: "merce" });
      }

      // Lavori in corso: range work_start - work_end
      if (order.work_start_date) {
        const workStart = parseISO(order.work_start_date);
        const workEnd = order.work_end_date
          ? parseISO(order.work_end_date)
          : workStart;

        if (day >= workStart && day <= workEnd) {
          // Evita duplicati se expected_date == work_start_date
          const alreadyHasPosa = events.some(
            (e) => e.order.id === order.id && e.type === "posa"
          );
          if (!alreadyHasPosa) {
            events.push({ order, type: "lavoro" });
          }
        }
      }
    });

    return events;
  };

  const getWorkloadColor = (count: number): string => {
    if (count === 0) return "bg-muted text-muted-foreground";
    if (count <= 2) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (count <= 4) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  };

  const getEventStyle = (type: "posa" | "merce" | "lavoro") => {
    switch (type) {
      case "posa":
        return {
          bg: "bg-blue-100 dark:bg-blue-900/40",
          text: "text-blue-700 dark:text-blue-300",
          icon: Hammer,
        };
      case "merce":
        return {
          bg: "bg-orange-100 dark:bg-orange-900/40",
          text: "text-orange-700 dark:text-orange-300",
          icon: Package,
        };
      case "lavoro":
        return {
          bg: "bg-green-100 dark:bg-green-900/40",
          text: "text-green-700 dark:text-green-300",
          icon: Wrench,
        };
    }
  };

  const handlePrevWeek = () => onDateChange(subWeeks(currentDate, 1));
  const handleNextWeek = () => onDateChange(addWeeks(currentDate, 1));

  const handleOrderClick = (orderId: string) => {
    navigate(`/azienda/ordini/${orderId}`);
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* Header navigazione */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="outline" size="icon" onClick={handlePrevWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold">
            {format(weekStart, "d MMM", { locale: it })} -{" "}
            {format(weekEnd, "d MMM yyyy", { locale: it })}
          </h2>
          <Button variant="outline" size="icon" onClick={handleNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Griglia giorni */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((day) => {
            const events = getOrderEventsForDay(day);
            const workloadCount = events.length;
            const today = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "border rounded-lg p-2 min-h-[180px] flex flex-col",
                  today && "ring-2 ring-primary"
                )}
              >
                {/* Header giorno */}
                <div className="text-center mb-2">
                  <div
                    className={cn(
                      "text-xs font-medium uppercase",
                      today ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {format(day, "EEE", { locale: it })}
                  </div>
                  <div
                    className={cn(
                      "text-lg font-bold",
                      today && "text-primary"
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  {/* Badge capacità */}
                  <Badge
                    variant="secondary"
                    className={cn(
                      "mt-1 text-xs font-medium",
                      getWorkloadColor(workloadCount)
                    )}
                  >
                    {workloadCount} {workloadCount === 1 ? "lavoro" : "lavori"}
                  </Badge>
                </div>

                {/* Eventi del giorno */}
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {events.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      Nessun lavoro
                    </div>
                  ) : (
                    events.map((event, idx) => {
                      const style = getEventStyle(event.type);
                      const Icon = style.icon;

                      return (
                        <button
                          key={`${event.order.id}-${event.type}-${idx}`}
                          onClick={() => handleOrderClick(event.order.id)}
                          className={cn(
                            "w-full text-left p-2 rounded text-xs transition-colors hover:opacity-80",
                            style.bg,
                            style.text
                          )}
                        >
                          <div className="flex items-center gap-1 font-medium">
                            <Icon className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {event.order.order_code || "N/A"}
                            </span>
                          </div>
                          <div className="truncate mt-0.5 opacity-80">
                            {event.order.customer.last_name}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/40" />
            <Hammer className="h-3 w-3 text-blue-600" />
            <span className="text-muted-foreground">Posa prevista</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-orange-100 dark:bg-orange-900/40" />
            <Package className="h-3 w-3 text-orange-600" />
            <span className="text-muted-foreground">Arrivo merce</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/40" />
            <Wrench className="h-3 w-3 text-green-600" />
            <span className="text-muted-foreground">Lavori in corso</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

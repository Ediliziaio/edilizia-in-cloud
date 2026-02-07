import { useMemo } from "react";
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
  isWithinInterval,
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarOrder } from "@/types/calendar";

interface CalendarMonthViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export function CalendarMonthView({
  orders,
  currentDate,
  onDateChange,
}: CalendarMonthViewProps) {
  const navigate = useNavigate();

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const getOrdersForDay = (day: Date) => {
    return orders.filter((order) => {
      const startDate = order.work_start_date
        ? parseISO(order.work_start_date)
        : order.expected_date
        ? parseISO(order.expected_date)
        : null;
      
      if (!startDate) return false;

      const endDate = order.work_end_date
        ? parseISO(order.work_end_date)
        : startDate;

      return isWithinInterval(day, { start: startDate, end: endDate });
    });
  };

  const getOrderColor = (order: CalendarOrder) => {
    if (order.status?.color) {
      return order.status.color;
    }
    return "#3B82F6"; // default blue
  };

  const isOrderStart = (order: CalendarOrder, day: Date) => {
    const startDate = order.work_start_date
      ? parseISO(order.work_start_date)
      : order.expected_date
      ? parseISO(order.expected_date)
      : null;
    return startDate && isSameDay(startDate, day);
  };

  const isOrderEnd = (order: CalendarOrder, day: Date) => {
    const endDate = order.work_end_date
      ? parseISO(order.work_end_date)
      : order.work_start_date
      ? parseISO(order.work_start_date)
      : order.expected_date
      ? parseISO(order.expected_date)
      : null;
    return endDate && isSameDay(endDate, day);
  };

  const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDateChange(subMonths(currentDate, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold capitalize">
          {format(currentDate, "MMMM yyyy", { locale: it })}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDateChange(addMonths(currentDate, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-px bg-muted rounded-lg overflow-hidden">
        {weekDays.map((day) => (
          <div
            key={day}
            className="bg-muted-foreground/5 p-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {days.map((day, dayIdx) => {
          const dayOrders = getOrdersForDay(day);
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentDate);

          return (
            <div
              key={dayIdx}
              className={cn(
                "min-h-[100px] bg-background p-1 transition-colors",
                !isCurrentMonth && "bg-muted/50"
              )}
            >
              <div
                className={cn(
                  "text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-full",
                  isToday && "bg-primary text-primary-foreground",
                  !isCurrentMonth && "text-muted-foreground"
                )}
              >
                {format(day, "d")}
              </div>

              <div className="space-y-1">
                {dayOrders.slice(0, 3).map((order) => {
                  const isStart = isOrderStart(order, day);
                  const isEnd = isOrderEnd(order, day);
                  const color = getOrderColor(order);

                  return (
                    <button
                      key={order.id}
                      onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                      className={cn(
                        "w-full text-left text-xs px-1.5 py-0.5 truncate text-white transition-opacity hover:opacity-80",
                        isStart && isEnd && "rounded",
                        isStart && !isEnd && "rounded-l",
                        !isStart && isEnd && "rounded-r",
                        !isStart && !isEnd && "rounded-none"
                      )}
                      style={{ backgroundColor: color }}
                      title={`${order.order_code || "N/A"} - ${order.customer.first_name} ${order.customer.last_name}`}
                    >
                      {isStart ? (
                        <span className="font-medium">{order.order_code || "Ordine"}</span>
                      ) : (
                        <span className="opacity-75">&nbsp;</span>
                      )}
                    </button>
                  );
                })}
                {dayOrders.length > 3 && (
                  <div className="text-xs text-muted-foreground text-center">
                    +{dayOrders.length - 3} altri
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span className="text-muted-foreground">Completato</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-muted-foreground">In corso</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-orange-500" />
          <span className="text-muted-foreground">Futuro</span>
        </div>
      </div>
    </Card>
  );
}

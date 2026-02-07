import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  isToday,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { WarehouseItem } from "@/types/warehouse";

interface OrderGroup {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  expectedDate: string;
  items: WarehouseItem[];
  readyCount: number;
  pendingCount: number;
}

interface WarehouseCalendarViewProps {
  items: WarehouseItem[];
}

export default function WarehouseCalendarView({ items }: WarehouseCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Group items by expected date
  const ordersByDate = useMemo(() => {
    const grouped = new Map<string, OrderGroup[]>();

    // First, group items by order
    const orderMap = new Map<string, OrderGroup>();
    items.forEach((item) => {
      const expectedDate = item.order.expected_date || item.order.work_start_date;
      if (!expectedDate) return;

      const orderId = item.order.id;
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          orderId,
          orderCode: item.order.order_code,
          customerName: `${item.order.customer.first_name} ${item.order.customer.last_name}`,
          expectedDate,
          items: [],
          readyCount: 0,
          pendingCount: 0,
        });
      }

      const order = orderMap.get(orderId)!;
      order.items.push(item);
      if (item.status === "in_magazzino" || item.status === "installato") {
        order.readyCount++;
      } else {
        order.pendingCount++;
      }
    });

    // Then group by date
    orderMap.forEach((order) => {
      const dateKey = order.expectedDate;
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(order);
    });

    return grouped;
  }, [items]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: it });
  const calendarEnd = endOfWeek(monthEnd, { locale: it });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  const goToPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {format(currentMonth, "MMMM yyyy", { locale: it })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Oggi
            </Button>
            <Button variant="outline" size="icon" onClick={goToPrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Week days header */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {weekDays.map((day) => (
            <div
              key={day}
              className="text-center text-sm font-medium text-muted-foreground py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const ordersForDay = ordersByDate.get(dateKey) || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isCurrentDay = isToday(day);

            return (
              <div
                key={dateKey}
                className={cn(
                  "min-h-[100px] p-1 border rounded-md",
                  !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                  isCurrentDay && "border-primary border-2",
                  ordersForDay.length > 0 && isCurrentMonth && "bg-primary/5"
                )}
              >
                <div
                  className={cn(
                    "text-sm font-medium mb-1",
                    isCurrentDay && "text-primary"
                  )}
                >
                  {format(day, "d")}
                </div>

                <div className="space-y-1">
                  {ordersForDay.slice(0, 3).map((order) => (
                    <TooltipProvider key={order.orderId}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link to={`/azienda/ordini/${order.orderId}`}>
                            <div
                              className={cn(
                                "text-xs p-1 rounded truncate cursor-pointer hover:opacity-80",
                                order.pendingCount > 0
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-green-100 text-green-800"
                              )}
                            >
                              <div className="font-medium truncate">
                                {order.orderCode || "Ordine"}
                              </div>
                              <div className="flex gap-1">
                                {order.readyCount > 0 && (
                                  <span className="text-green-600">
                                    🟢{order.readyCount}
                                  </span>
                                )}
                                {order.pendingCount > 0 && (
                                  <span className="text-amber-600">
                                    🟠{order.pendingCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[250px]">
                          <div className="space-y-1">
                            <p className="font-medium">
                              {order.orderCode || "Ordine"} - {order.customerName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {order.readyCount} pronti, {order.pendingCount} in attesa
                            </p>
                            <div className="text-xs">
                              {order.items.slice(0, 5).map((item) => (
                                <div key={item.id} className="flex items-center gap-1">
                                  <span>
                                    {item.status === "in_magazzino" || item.status === "installato"
                                      ? "🟢"
                                      : item.status === "ordinato"
                                      ? "🔵"
                                      : "🟠"}
                                  </span>
                                  <span className="truncate">{item.name}</span>
                                </div>
                              ))}
                              {order.items.length > 5 && (
                                <div className="text-muted-foreground">
                                  +{order.items.length - 5} altri
                                </div>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                  {ordersForDay.length > 3 && (
                    <div className="text-xs text-muted-foreground text-center">
                      +{ordersForDay.length - 3} altri
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground justify-center">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-100"></span>
            <span>Tutti pronti</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100"></span>
            <span>Articoli in attesa</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🟢</span>
            <span>Pronto</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🔵</span>
            <span>Ordinato</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🟠</span>
            <span>Da ordinare</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

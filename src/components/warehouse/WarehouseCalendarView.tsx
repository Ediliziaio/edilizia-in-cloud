import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  format,
  parseISO,
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
import { WEEK_DAYS_IT } from "@/lib/calendarUtils";
import type { WarehouseItem, OrderWithItems } from "@/types/warehouse";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface CalendarOrderGroup extends OrderWithItems {
  expectedDate: string; // override: non-null in calendar context
  readyCount: number;
  pendingCount: number;
}

interface WarehouseCalendarViewProps {
  items: WarehouseItem[];
}

export default function WarehouseCalendarView({ items }: WarehouseCalendarViewProps) {
  const t = useT();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Group items by expected date
  const ordersByDate = useMemo(() => {
    const grouped = new Map<string, CalendarOrderGroup[]>();

    // First, group items by order
    const orderMap = new Map<string, CalendarOrderGroup>();
    items.forEach((item) => {
      const expectedDate = item.order.expected_date || item.order.work_start_date;
      if (!expectedDate) return;

      const orderId = item.order.id;
      if (!orderMap.has(orderId)) {
        orderMap.set(orderId, {
          orderId,
          orderCode: item.order.order_code,
          customerName: `${item.order.customer?.first_name ?? ""} ${item.order.customer?.last_name ?? ""}`.trim() || "Cliente non disponibile",
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

    // B8 — group by date range (work_start_date → work_end_date, multi-day span)
    orderMap.forEach((order, orderId) => {
      const rawItem = items.find(i => i.order.id === orderId);
      const startDate = rawItem?.order.work_start_date || rawItem?.order.expected_date || order.expectedDate;
      const endDate = rawItem?.order.work_end_date || startDate;
      if (!startDate) return;

      const start = parseISO(startDate);
      const end = parseISO(endDate);
      eachDayOfInterval({ start, end }).forEach(day => {
        const dateKey = format(day, "yyyy-MM-dd");
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        if (!grouped.get(dateKey)!.find(o => o.orderId === orderId)) {
          grouped.get(dateKey)!.push({ ...order, expectedDate: dateKey });
        }
      });
    });

    return grouped;
  }, [items]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { locale: dateFnsCampo() });
  const calendarEnd = endOfWeek(monthEnd, { locale: dateFnsCampo() });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = WEEK_DAYS_IT;

  const goToPrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const goToToday = () => setCurrentMonth(new Date());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {format(currentMonth, "MMMM yyyy", { locale: dateFnsCampo() })}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              {t("Oggi")}
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
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              )}
                            >
                              <div className="font-medium truncate">
                                {order.orderCode || t("Ordine")}
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
                              {order.orderCode || t("Ordine")} - {order.customerName === "Cliente non disponibile" ? t("Cliente non disponibile") : order.customerName}
                            </p>
                            <p className="text-xs text-muted-foreground">{t("{readyCount} pronti, {pendingCount} in attesa", { readyCount: String(order.readyCount ?? ""), pendingCount: String(order.pendingCount ?? "") })}</p>
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
                                <div className="text-muted-foreground">{t("+{n} altri", { n: order.items.length - 5 })}</div>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                  {ordersForDay.length > 3 && (
                    <div className="text-xs text-muted-foreground text-center">{t("+{n} altri", { n: ordersForDay.length - 3 })}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground justify-center">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30"></span>
            <span>{t("Tutti pronti")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30"></span>
            <span>{t("Articoli in attesa")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🟢</span>
            <span>{t("Pronto")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🔵</span>
            <span>{t("Ordinato")}</span>
          </div>
          <div className="flex items-center gap-1">
            <span>🟠</span>
            <span>{t("Da ordinare")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  differenceInDays,
  parseISO,
  isSameDay,
  startOfQuarter,
  endOfQuarter,
  startOfMonth,
  endOfMonth,
  addYears,
  subYears,
} from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarOrder, GanttZoom } from "@/types/calendar";

interface CalendarGanttViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const ZOOM_CONFIG: Record<GanttZoom, { dayWidth: number; label: string }> = {
  year: { dayWidth: 3, label: "Anno" },
  quarter: { dayWidth: 8, label: "Trimestre" },
  month: { dayWidth: 25, label: "Mese" },
};

const ROW_HEIGHT = 50;

export function CalendarGanttView({
  orders,
  currentDate,
  onDateChange,
}: CalendarGanttViewProps) {
  const navigate = useNavigate();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<GanttZoom>("quarter");

  const { dayWidth } = ZOOM_CONFIG[zoom];

  const { startDate, endDate, days, months } = useMemo(() => {
    let start: Date;
    let end: Date;

    switch (zoom) {
      case "year":
        start = startOfYear(currentDate);
        end = endOfYear(currentDate);
        break;
      case "quarter":
        start = startOfQuarter(currentDate);
        end = endOfQuarter(currentDate);
        break;
      case "month":
        start = startOfMonth(currentDate);
        end = endOfMonth(currentDate);
        break;
    }

    const days = eachDayOfInterval({ start, end });
    const months = eachMonthOfInterval({ start, end });

    return { startDate: start, endDate: end, days, months };
  }, [currentDate, zoom]);

  const todayOffset = useMemo(() => {
    const today = new Date();
    if (today < startDate || today > endDate) return null;
    return differenceInDays(today, startDate) * dayWidth;
  }, [startDate, endDate, dayWidth]);

  // Scroll to today on mount
  useEffect(() => {
    if (scrollContainerRef.current && todayOffset !== null) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      scrollContainerRef.current.scrollLeft = todayOffset - containerWidth / 2;
    }
  }, [todayOffset]);

  const getOrderBar = (order: CalendarOrder) => {
    const orderStart = order.work_start_date
      ? parseISO(order.work_start_date)
      : order.expected_date
      ? parseISO(order.expected_date)
      : null;

    if (!orderStart) return null;

    const orderEnd = order.work_end_date
      ? parseISO(order.work_end_date)
      : orderStart;

    // Check if order is within visible range
    if (orderEnd < startDate || orderStart > endDate) return null;

    const visibleStart = orderStart < startDate ? startDate : orderStart;
    const visibleEnd = orderEnd > endDate ? endDate : orderEnd;

    const left = differenceInDays(visibleStart, startDate) * dayWidth;
    const width = (differenceInDays(visibleEnd, visibleStart) + 1) * dayWidth;

    return { left, width, orderStart, orderEnd };
  };

  const getOrderColor = (order: CalendarOrder) => {
    if (order.status?.color) {
      return order.status.color;
    }
    const today = new Date();
    const orderStart = order.work_start_date
      ? parseISO(order.work_start_date)
      : order.expected_date
      ? parseISO(order.expected_date)
      : null;

    if (!orderStart) return "#3B82F6";
    return orderStart > today ? "#F59E0B" : "#3B82F6";
  };

  const handlePrev = () => {
    switch (zoom) {
      case "year":
        onDateChange(subYears(currentDate, 1));
        break;
      case "quarter":
        onDateChange(new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000));
        break;
      case "month":
        onDateChange(new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000));
        break;
    }
  };

  const handleNext = () => {
    switch (zoom) {
      case "year":
        onDateChange(addYears(currentDate, 1));
        break;
      case "quarter":
        onDateChange(new Date(currentDate.getTime() + 90 * 24 * 60 * 60 * 1000));
        break;
      case "month":
        onDateChange(new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000));
        break;
    }
  };

  const getPeriodLabel = () => {
    switch (zoom) {
      case "year":
        return format(currentDate, "yyyy");
      case "quarter":
        const q = Math.floor(currentDate.getMonth() / 3) + 1;
        return `Q${q} ${format(currentDate, "yyyy")}`;
      case "month":
        return format(currentDate, "MMMM yyyy", { locale: it });
    }
  };

  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[120px] text-center capitalize">
            {getPeriodLabel()}
          </h2>
          <Button variant="ghost" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <ToggleGroup
          type="single"
          value={zoom}
          onValueChange={(value) => value && setZoom(value as GanttZoom)}
          className="bg-muted rounded-lg p-1"
        >
          <ToggleGroupItem value="month" className="text-xs px-2">
            <ZoomIn className="h-3 w-3 mr-1" />
            Mese
          </ToggleGroupItem>
          <ToggleGroupItem value="quarter" className="text-xs px-2">
            Trimestre
          </ToggleGroupItem>
          <ToggleGroupItem value="year" className="text-xs px-2">
            <ZoomOut className="h-3 w-3 mr-1" />
            Anno
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {orders.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          Nessun lavoro programmato
        </div>
      ) : (
        <div className="flex border rounded-lg overflow-hidden">
          {/* Fixed left column - Client names */}
          <div className="flex-shrink-0 bg-muted/30 border-r min-w-[180px]">
            <div className="h-12 border-b bg-muted/50 flex items-center px-3">
              <span className="text-sm font-medium text-muted-foreground">
                Cliente / Ordine
              </span>
            </div>
            {orders.map((order) => (
              <div
                key={order.id}
                className="border-b flex flex-col justify-center px-3 cursor-pointer hover:bg-muted/50 transition-colors"
                style={{ height: ROW_HEIGHT }}
                onClick={() => navigate(`/azienda/ordini/${order.id}`)}
              >
                <span className="text-sm font-medium truncate">
                  {order.customer.first_name} {order.customer.last_name}
                </span>
                <span className="text-xs text-muted-foreground truncate">
                  {order.order_code || "N/A"}
                </span>
              </div>
            ))}
          </div>

          {/* Scrollable timeline */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-x-auto relative"
          >
            {/* Month headers */}
            <div
              className="h-12 border-b bg-muted/50 flex sticky top-0 z-10"
              style={{ width: days.length * dayWidth }}
            >
              {months.map((month, idx) => {
                const monthDays = days.filter(
                  (d) => d.getMonth() === month.getMonth()
                );
                const monthWidth = monthDays.length * dayWidth;
                
                return (
                  <div
                    key={idx}
                    className="border-r flex items-center justify-center text-sm font-medium text-muted-foreground"
                    style={{ width: monthWidth }}
                  >
                    {format(month, zoom === "year" ? "MMM" : "MMMM", { locale: it })}
                  </div>
                );
              })}
            </div>

            {/* Rows with bars */}
            <div className="relative" style={{ width: days.length * dayWidth }}>
              {/* Today indicator */}
              {todayOffset !== null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                  style={{ left: todayOffset + dayWidth / 2 }}
                />
              )}

              {/* Day grid lines (only show for month zoom) */}
              {zoom === "month" && (
                <div className="absolute inset-0 flex">
                  {days.map((day, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "border-r border-muted/50 flex-shrink-0",
                        isSameDay(day, new Date()) && "bg-primary/5"
                      )}
                      style={{ width: dayWidth, height: orders.length * ROW_HEIGHT }}
                    />
                  ))}
                </div>
              )}

              {orders.map((order) => {
                const bar = getOrderBar(order);
                
                return (
                  <div
                    key={order.id}
                    className="border-b relative"
                    style={{ height: ROW_HEIGHT }}
                  >
                    {bar && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="absolute top-2 bottom-2 rounded shadow-sm hover:shadow-md transition-shadow flex items-center px-2 overflow-hidden"
                            style={{
                              left: bar.left,
                              width: Math.max(bar.width, dayWidth),
                              backgroundColor: getOrderColor(order),
                            }}
                            onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                          >
                            {bar.width > 60 && (
                              <span className="text-xs text-white font-medium truncate">
                                {order.order_code || order.description.slice(0, 20)}
                              </span>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[250px]">
                          <div className="space-y-1">
                            <p className="font-medium">{order.order_code || "Ordine"}</p>
                            <p className="text-sm text-muted-foreground">
                              {order.customer.first_name} {order.customer.last_name}
                            </p>
                            <p className="text-sm truncate">{order.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(bar.orderStart, "d MMM", { locale: it })}
                              {!isSameDay(bar.orderStart, bar.orderEnd) && (
                                <> - {format(bar.orderEnd, "d MMM", { locale: it })}</>
                              )}
                            </p>
                            {order.status && (
                              <p className="text-xs">
                                Stato: <span style={{ color: order.status.color }}>{order.status.name}</span>
                              </p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-0.5 h-4 bg-red-500" />
          <span className="text-muted-foreground">Oggi</span>
        </div>
      </div>
    </Card>
  );
}

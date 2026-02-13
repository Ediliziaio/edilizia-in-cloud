import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
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
  startOfWeek,
  endOfWeek,
  addYears,
  subYears,
  addDays,
  addWeeks,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarOrder, GanttZoom, OrderStatus } from "@/types/calendar";
import { DraggableOrderBar } from "./DraggableOrderBar";
import { LeadTimeStats, calculateLeadTime, getLeadTimeColor } from "./LeadTimeStats";
import { AlertTriangle } from "lucide-react";

interface CalendarGanttViewProps {
  orders: CalendarOrder[];
  allOrders: CalendarOrder[];
  statuses: OrderStatus[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const ZOOM_CONFIG: Record<GanttZoom, { dayWidth: number; label: string }> = {
  year: { dayWidth: 3, label: "Anno" },
  quarter: { dayWidth: 8, label: "Trimestre" },
  month: { dayWidth: 25, label: "Mese" },
  week: { dayWidth: 80, label: "Settimana" },
};

const ROW_HEIGHT = 50;

export function CalendarGanttView({
  orders,
  allOrders,
  statuses,
  currentDate,
  onDateChange,
}: CalendarGanttViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<GanttZoom>("quarter");

  const { dayWidth } = ZOOM_CONFIG[zoom];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

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
      case "week":
        start = startOfWeek(currentDate, { weekStartsOn: 1 });
        end = endOfWeek(currentDate, { weekStartsOn: 1 });
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, delta } = event;
    if (!delta?.x || Math.abs(delta.x) < dayWidth / 2) return;

    const orderData = active.data.current as { order: CalendarOrder; bar: { orderStart: Date; orderEnd: Date } };
    const daysMoved = Math.round(delta.x / dayWidth);

    if (daysMoved === 0) return;

    const order = orderData.order;
    const currentStart = orderData.bar.orderStart;
    const currentEnd = orderData.bar.orderEnd;

    const newStart = addDays(currentStart, daysMoved);
    const newEnd = addDays(currentEnd, daysMoved);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          work_start_date: format(newStart, "yyyy-MM-dd"),
          work_end_date: format(newEnd, "yyyy-MM-dd"),
        })
        .eq("id", order.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["calendar-orders"] });
      toast.success("Date lavoro aggiornate");
    } catch (error) {
      console.error("Error updating order dates:", error);
      toast.error("Errore nell'aggiornamento delle date");
    }
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
      case "week":
        onDateChange(subWeeks(currentDate, 1));
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
      case "week":
        onDateChange(addWeeks(currentDate, 1));
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
      case "week":
        return `${format(startDate, "d MMM", { locale: it })} - ${format(endDate, "d MMM yyyy", { locale: it })}`;
    }
  };

  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center capitalize">
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
          <ToggleGroupItem value="week" className="text-xs px-2">
            <Calendar className="h-3 w-3 mr-1" />
            Settimana
          </ToggleGroupItem>
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex border rounded-lg overflow-hidden">
            {/* Fixed left column - Client names + Lead Time */}
            <div className="flex-shrink-0 bg-muted/30 border-r min-w-[220px]">
              <div className="h-12 border-b bg-muted/50 flex">
                <div className="flex-1 flex items-center px-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    Cliente / Ordine
                  </span>
                </div>
                <div className="w-16 flex items-center justify-center border-l">
                  <span className="text-xs font-medium text-muted-foreground">LT</span>
                </div>
              </div>
              {orders.map((order) => {
                const leadTime = calculateLeadTime(order);
                return (
                  <div
                    key={order.id}
                    className="border-b flex cursor-pointer hover:bg-muted/50 transition-colors"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                  >
                    <div className="flex-1 flex flex-col justify-center px-3 min-w-0">
                      <span className="text-sm font-medium truncate">
                        {order.customer.first_name} {order.customer.last_name}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground truncate">
                          {order.order_code || "N/A"}
                        </span>
                        {(!order.assigned_employees || order.assigned_employees.length === 0) && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1 rounded">
                            No squadra
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-16 flex items-center justify-center border-l">
                      {leadTime !== null ? (
                        <span className={cn("text-xs font-medium", getLeadTimeColor(leadTime))}>
                          {leadTime}g
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Scrollable timeline */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-x-auto relative"
            >
              {/* Header */}
              <div
                className="h-12 border-b bg-muted/50 flex sticky top-0 z-10"
                style={{ width: days.length * dayWidth }}
              >
                {zoom === "week" ? (
                  // Week view: show day names + numbers
                  days.map((day, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "border-r flex flex-col items-center justify-center",
                        isSameDay(day, new Date()) && "bg-primary/10"
                      )}
                      style={{ width: dayWidth }}
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {format(day, "EEE", { locale: it })}
                      </span>
                      <span className="text-sm font-semibold">
                        {format(day, "d")}
                      </span>
                    </div>
                  ))
                ) : (
                  // Other views: show months
                  months.map((month, idx) => {
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
                  })
                )}
              </div>

              {/* Rows with bars */}
              <div className="relative" style={{ width: days.length * dayWidth }}>
                {/* Today indicator */}
                {todayOffset !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-destructive z-20"
                    style={{ left: todayOffset + dayWidth / 2 }}
                  />
                )}

                {/* Day grid lines (show for month and week zoom) */}
                {(zoom === "month" || zoom === "week") && (
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
                        <DraggableOrderBar
                          order={order}
                          bar={bar}
                          dayWidth={dayWidth}
                          color={getOrderColor(order)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DndContext>
      )}

      {/* Legend with actual order statuses */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {statuses.slice(0, 5).map((status) => (
          <div key={status.id} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded" 
              style={{ backgroundColor: status.color }}
            />
            <span className="text-muted-foreground">{status.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-0.5 h-4 bg-destructive" />
          <span className="text-muted-foreground">Oggi</span>
        </div>
      </div>

      <LeadTimeStats orders={orders} />

      {/* Unplanned orders section */}
      {(() => {
        const unplannedOrders = allOrders.filter(
          (order) => !order.work_start_date && !order.expected_date
        );
        if (unplannedOrders.length === 0) return null;

        return (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed">
            <div className="flex items-center gap-2 text-muted-foreground mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="font-medium">Ordini non pianificati ({unplannedOrders.length})</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {unplannedOrders.slice(0, 6).map((order) => (
                <button
                  key={order.id}
                  onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                  className="flex items-center gap-2 p-2 bg-background rounded border hover:border-primary transition-colors text-left"
                >
                  <div 
                    className="w-2 h-2 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: order.status?.color || "#6B7280" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {order.order_code || "N/A"} - {order.customer.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {order.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {unplannedOrders.length > 6 && (
              <p className="text-xs text-muted-foreground mt-2">
                +{unplannedOrders.length - 6} altri ordini non pianificati
              </p>
            )}
          </div>
        );
      })()}
    </Card>
  );
}

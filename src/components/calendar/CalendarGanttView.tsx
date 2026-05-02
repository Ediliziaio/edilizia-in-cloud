import { useMemo, useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
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
  addYears,
  subYears,
  addDays,
  isWeekend,
  getISOWeek,
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
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, AlertTriangle, Wrench, Settings, CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { CalendarAppointment, CalendarOrder, GanttZoom, OrderStatus, CalendarIntervento, CalendarManutenzione } from "@/types/calendar";
import { DraggableOrderBar } from "./DraggableOrderBar";
import { LeadTimeStats, calculateLeadTime, getLeadTimeColor } from "./LeadTimeStats";

interface CalendarGanttViewProps {
  orders: CalendarOrder[];
  allOrders: CalendarOrder[];
  statuses: OrderStatus[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  interventi?: CalendarIntervento[];
  manutenzioni?: CalendarManutenzione[];
  appointments?: CalendarAppointment[];
}

const ZOOM_CONFIG: Record<GanttZoom, { dayWidth: number; minBarWidth: number; label: string }> = {
  year: { dayWidth: 3.5, minBarWidth: 18, label: "Anno" },
  quarter: { dayWidth: 10, minBarWidth: 24, label: "Trimestre" },
  month: { dayWidth: 28, minBarWidth: 34, label: "Mese" },
};

const ROW_HEIGHT = 54;
const LEFT_COL_WIDTH = 250;

function getOrderProgress(order: CalendarOrder): number | undefined {
  if (!order.work_start_date || !order.work_end_date) return undefined;
  const start = parseISO(order.work_start_date);
  const end = parseISO(order.work_end_date);
  const total = differenceInDays(end, start);
  if (total <= 0) return undefined;
  const elapsed = differenceInDays(new Date(), start);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

export function CalendarGanttView({
  orders,
  allOrders,
  statuses,
  currentDate,
  onDateChange,
  interventi = [],
  manutenzioni = [],
  appointments = [],
}: CalendarGanttViewProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<GanttZoom>("quarter");
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);

  const { dayWidth: baseDayWidth, minBarWidth } = ZOOM_CONFIG[zoom];

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Sort orders: by work_start_date (or expected_date), then by customer last_name. No dates = bottom.
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const dateA = a.work_start_date || a.expected_date || null;
      const dateB = b.work_start_date || b.expected_date || null;
      if (!dateA && !dateB) return a.customer.last_name.localeCompare(b.customer.last_name);
      if (!dateA) return 1;
      if (!dateB) return -1;
      const cmp = dateA.localeCompare(dateB);
      return cmp !== 0 ? cmp : a.customer.last_name.localeCompare(b.customer.last_name);
    });
  }, [orders]);

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

  const dayWidth = useMemo(() => {
    if (!days.length || timelineViewportWidth <= 0) return baseDayWidth;
    return Math.max(baseDayWidth, timelineViewportWidth / days.length);
  }, [baseDayWidth, days.length, timelineViewportWidth]);

  const timelineWidth = useMemo(
    () => Math.max(days.length * dayWidth, timelineViewportWidth),
    [dayWidth, days.length, timelineViewportWidth]
  );

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;

    const updateViewport = () => setTimelineViewportWidth(node.clientWidth);
    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, [zoom]);

  const todayOffset = useMemo(() => {
    const today = new Date();
    if (today < startDate || today > endDate) return null;
    return differenceInDays(today, startDate) * dayWidth;
  }, [startDate, endDate, dayWidth]);

  // Scroll to today when todayOffset changes (mount, zoom change, period change)
  useEffect(() => {
    if (scrollContainerRef.current && todayOffset !== null) {
      const containerWidth = scrollContainerRef.current.clientWidth;
      scrollContainerRef.current.scrollLeft = todayOffset - containerWidth / 2;
    }
  }, [todayOffset]);

  const handleGoToToday = () => {
    onDateChange(new Date());
  };

  // Capacity: count active orders per day
  const capacityPerDay = useMemo(() => {
    return days.map((day) => {
      let count = 0;
      for (const order of sortedOrders) {
        const s = order.work_start_date ? parseISO(order.work_start_date) : order.expected_date ? parseISO(order.expected_date) : null;
        if (!s) continue;
        const e = order.work_end_date ? parseISO(order.work_end_date) : s;
        if (day >= s && day <= e) count++;
      }
      return count;
    });
  }, [days, sortedOrders]);

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

    if (orderEnd < startDate || orderStart > endDate) return null;

    const visibleStart = orderStart < startDate ? startDate : orderStart;
    const visibleEnd = orderEnd > endDate ? endDate : orderEnd;

    const left = differenceInDays(visibleStart, startDate) * dayWidth;
    const width = (differenceInDays(visibleEnd, visibleStart) + 1) * dayWidth;

    return { left, width, orderStart, orderEnd };
  };

  const getOrderColor = (order: CalendarOrder) => {
    if (order.status?.color) return order.status.color;
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
    const newStart = addDays(orderData.bar.orderStart, daysMoved);
    const newEnd = addDays(orderData.bar.orderEnd, daysMoved);

    try {
      const { error } = await supabase
        .from("orders")
        .update({
          work_start_date: format(newStart, "yyyy-MM-dd"),
          work_end_date: format(newEnd, "yyyy-MM-dd"),
        })
        .eq("id", order.id);

      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast.success("Date lavoro aggiornate");
    } catch (error) {
      logger.error("Error updating order dates:", error);
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
      case "quarter": {
        const q = Math.floor(currentDate.getMonth() / 3) + 1;
        return `Q${q} ${format(currentDate, "yyyy")}`;
      }
      case "month":
        return format(currentDate, "MMMM yyyy", { locale: it });
    }
  };

  // Unique week numbers for quarter view sub-header
  const weekNumbers = useMemo(() => {
    if (zoom !== "quarter") return [];
    const seen = new Map<number, { start: number; count: number }>();
    days.forEach((day, idx) => {
      const wn = getISOWeek(day);
      if (!seen.has(wn)) {
        seen.set(wn, { start: idx, count: 0 });
      }
      seen.get(wn)!.count++;
    });
    return Array.from(seen.entries()).map(([wn, { start, count }]) => ({ wn, start, count }));
  }, [days, zoom]);

  const capacityColor = (count: number) => {
    if (count === 0) return "bg-muted/30";
    if (count <= 2) return "bg-green-500/60";
    if (count <= 4) return "bg-yellow-500/60";
    return "bg-red-500/60";
  };

  const ganttStats = useMemo(() => {
    const visibleAppointmentCount = appointments.filter((appointment) => {
      const date = parseISO(appointment.appointment_date);
      return date >= startDate && date <= endDate;
    }).length;
    const peak = capacityPerDay.reduce((max, count) => Math.max(max, count), 0);
    const overloadedDays = capacityPerDay.filter((count) => count >= 5).length;
    return {
      orders: sortedOrders.length,
      appointments: visibleAppointmentCount,
      peak,
      overloadedDays,
    };
  }, [appointments, capacityPerDay, endDate, sortedOrders.length, startDate]);

  return (
    <Card className="p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center">
            <h2 className="text-lg font-semibold capitalize leading-tight">
              {getPeriodLabel()}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {format(startDate, "d MMM", { locale: it })} - {format(endDate, "d MMM yyyy", { locale: it })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={todayOffset !== null ? "outline" : "default"}
            size="sm"
            onClick={handleGoToToday}
            className="text-xs"
          >
            Oggi
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

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Commesse</p>
          <p className="text-lg font-bold">{ganttStats.orders}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Appuntamenti</p>
          <p className="text-lg font-bold">{ganttStats.appointments}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Picco carico</p>
          <p className="text-lg font-bold">{ganttStats.peak}</p>
        </div>
        <div className="rounded-lg border bg-card px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Giorni saturi</p>
          <p className={cn("text-lg font-bold", ganttStats.overloadedDays > 0 && "text-destructive")}>{ganttStats.overloadedDays}</p>
        </div>
      </div>

      {sortedOrders.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          Nessun lavoro programmato
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex overflow-hidden rounded-lg border bg-background">
            {/* Fixed left column - Client names + Lead Time */}
            <div
              className="flex-shrink-0 border-r bg-muted/30"
              style={{ width: LEFT_COL_WIDTH }}
            >
              {/* Left header must match dual-level header height */}
              <div className={cn("sticky top-0 z-30 border-b bg-muted/80 backdrop-blur flex", zoom === "month" || zoom === "quarter" ? "h-16" : "h-12")}>
                <div className="flex-1 flex items-center px-3">
                  <span className="text-sm font-semibold text-muted-foreground">
                    Cliente / Ordine
                  </span>
                </div>
                <div className="w-16 flex items-center justify-center border-l">
                  <span className="text-xs font-medium text-muted-foreground">LT</span>
                </div>
              </div>
              {sortedOrders.map((order, idx) => {
                const leadTime = calculateLeadTime(order);
                const initials = order.order_employees
                  ?.map((ae) => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`)
                  .join(", ");
                const extTeam = order.order_external_teams
                  ?.map((aet) => aet.external_team.name)
                  .join(", ");
                return (
                  <div
                    key={order.id}
                    className={cn(
                      "border-b flex cursor-pointer hover:bg-muted/50 transition-colors",
                      idx % 2 === 0 && "bg-muted/20"
                    )}
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => navigate(`/azienda/ordini/${order.id}`)}
                  >
                    <div className="flex-1 flex flex-col justify-center px-3 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {order.status && (
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: order.status.color }} />
                        )}
                        <span className="text-sm font-semibold truncate">
                          {order.customer.last_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span>{order.order_code || "N/A"}</span>
                        {initials && <span>| {initials}</span>}
                        {extTeam && <span>| {extTeam}</span>}
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
              {/* Interventi labels */}
              {interventi.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border-y border-orange-200">
                    <Wrench className="h-3.5 w-3.5 text-orange-600" />
                    <span className="text-xs font-semibold text-orange-700">Interventi ({interventi.length})</span>
                  </div>
                  {interventi.map((iv) => (
                    <div key={iv.id} className="border-b flex items-center px-3" style={{ height: ROW_HEIGHT }}>
                      <span className="text-xs font-medium truncate text-orange-700">{iv.subject}</span>
                    </div>
                  ))}
                </>
              )}
              {/* Manutenzioni labels */}
              {manutenzioni.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-y border-blue-200">
                    <Settings className="h-3.5 w-3.5 text-blue-600" />
                    <span className="text-xs font-semibold text-blue-700">Manutenzioni ({manutenzioni.length})</span>
                  </div>
                  {manutenzioni.map((mn) => (
                    <div key={mn.id} className="border-b flex items-center px-3" style={{ height: ROW_HEIGHT }}>
                      <span className="text-xs font-medium truncate text-blue-700">{mn.titolo}</span>
                    </div>
                  ))}
                </>
              )}
              {/* Capacity row label */}
              <div className="h-9 flex items-center px-3 bg-muted/40 border-t">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Carico</span>
              </div>
            </div>

            {/* Scrollable timeline */}
            <div
              ref={scrollContainerRef}
              className="relative flex-1 overflow-x-auto overflow-y-hidden"
            >
              {/* Dual-level header */}
              <div
                className={cn("sticky top-0 z-20 border-b bg-muted/80 backdrop-blur", zoom === "month" || zoom === "quarter" ? "h-16" : "h-12")}
                style={{ width: timelineWidth }}
              >
                {/* Level 1: Months or quarters */}
                <div className="flex h-1/2">
                  {zoom === "year"
                    ? [0, 1, 2, 3].map((quarter) => {
                        const quarterDays = days.filter((day) => Math.floor(day.getMonth() / 3) === quarter);
                        return (
                          <div
                            key={`q-${quarter}`}
                            className="border-r border-b flex items-center justify-center text-xs font-semibold text-muted-foreground"
                            style={{ width: quarterDays.length * dayWidth }}
                          >
                            Q{quarter + 1} {format(currentDate, "yyyy")}
                          </div>
                        );
                      })
                    : months.map((month, idx) => {
                        const monthDays = days.filter((d) => d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear());
                        const monthWidth = monthDays.length * dayWidth;
                        return (
                          <div
                            key={idx}
                            className="border-r border-b flex items-center justify-center text-xs font-semibold text-muted-foreground"
                            style={{ width: monthWidth }}
                          >
                            {format(month, "MMMM yyyy", { locale: it })}
                          </div>
                        );
                      })}
                </div>
                {/* Level 2: Days (month zoom) or Week numbers (quarter zoom) */}
                {zoom === "month" && (
                  <div className="flex h-1/2">
                    {days.map((day, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "border-r flex items-center justify-center text-[10px]",
                          isWeekend(day) && "bg-muted/60 text-muted-foreground/60",
                          isSameDay(day, new Date()) && "bg-primary/15 font-bold text-primary"
                        )}
                        style={{ width: dayWidth }}
                      >
                        {format(day, "d")}
                      </div>
                    ))}
                  </div>
                )}
                {zoom === "quarter" && (
                  <div className="flex h-1/2">
                    {weekNumbers.map(({ wn, start, count }) => (
                      <div
                        key={`w${wn}-${start}`}
                        className="border-r flex items-center justify-center text-[10px] text-muted-foreground"
                        style={{ width: count * dayWidth }}
                      >
                        W{wn}
                      </div>
                    ))}
                  </div>
                )}
                {zoom === "year" && (
                  <div className="flex h-1/2">
                    {months.map((month, idx) => {
                      const monthDays = days.filter((d) => d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear());
                      return (
                        <div
                          key={`year-${idx}`}
                          className="border-r flex items-center justify-center text-[10px] text-muted-foreground/70"
                          style={{ width: monthDays.length * dayWidth }}
                        >
                          {format(month, "MMM", { locale: it })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rows with bars */}
              <div className="relative" style={{ width: timelineWidth }}>
                {/* Today indicator */}
                {todayOffset !== null && (
                  <div
                    className="absolute top-0 bottom-0 z-20 w-0.5 bg-destructive shadow-[0_0_0_1px_rgba(255,255,255,0.65)]"
                    style={{ left: todayOffset + dayWidth / 2 }}
                  />
                )}

                {/* Day grid lines + weekend shading */}
                {(zoom === "month" || zoom === "quarter" || zoom === "year") && (
                  <div className="absolute inset-0 flex">
                    {days.map((day, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex-shrink-0 border-r",
                          idx === 0 || day.getDate() === 1 ? "border-r-border" : "border-muted/45",
                          isWeekend(day) && zoom !== "year" && "bg-muted/40 border-r-muted-foreground/20",
                          isSameDay(day, new Date()) && "bg-primary/5"
                        )}
                        style={{ width: dayWidth, height: (sortedOrders.length * ROW_HEIGHT) + 32 }}
                      />
                    ))}
                  </div>
                )}

                {sortedOrders.map((order, idx) => {
                  const bar = getOrderBar(order);
                  const progress = getOrderProgress(order);

                  // Milestone positions
                  const expectedPos = order.expected_date
                    ? differenceInDays(parseISO(order.expected_date), startDate) * dayWidth
                    : null;
                  const warehousePos = order.warehouse_arrival_date
                    ? differenceInDays(parseISO(order.warehouse_arrival_date), startDate) * dayWidth
                    : null;
                  const totalWidth = days.length * dayWidth;

                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "border-b relative hover:bg-muted/30 transition-colors",
                        idx % 2 === 0 && "bg-muted/20"
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {bar && (
                        <DraggableOrderBar
                          order={order}
                          bar={bar}
                          dayWidth={dayWidth}
                          minBarWidth={minBarWidth}
                          color={getOrderColor(order)}
                          progress={progress}
                        />
                      )}
                      {/* Milestone: expected_date (blue diamond) */}
                      {expectedPos !== null && expectedPos >= 0 && expectedPos <= totalWidth && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-background z-10"
                              style={{ left: expectedPos + dayWidth / 2 - 6 }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">Data posa prevista</p>
                            <p>{format(parseISO(order.expected_date!), "d MMMM yyyy", { locale: it })}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {/* Milestone: warehouse_arrival_date (amber dot) */}
                      {warehousePos !== null && warehousePos >= 0 && warehousePos <= totalWidth && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-500 border-2 border-background z-10"
                              style={{ left: warehousePos + dayWidth / 2 - 6 }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">Arrivo merce</p>
                            <p>{format(parseISO(order.warehouse_arrival_date!), "d MMMM yyyy", { locale: it })}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}

                {/* ── Sezione Interventi ──────────────────────────────── */}
                {interventi.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border-y border-orange-200">
                      <Wrench className="h-3.5 w-3.5 text-orange-600" />
                      <span className="text-xs font-semibold text-orange-700">Interventi ({interventi.length})</span>
                    </div>
                    {interventi.map((iv) => {
                      if (!iv.data_intervento_prevista) return null;
                      const ivDate = parseISO(iv.data_intervento_prevista);
                      const dayOffset = differenceInDays(ivDate, days[0]);
                      if (dayOffset < 0 || dayOffset >= days.length) return null;
                      return (
                        <div key={iv.id} className="relative border-b border-muted" style={{ height: ROW_HEIGHT }}>
                          <div
                            className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1"
                            style={{ left: dayOffset * dayWidth }}
                          >
                            <div className={`h-5 px-2 rounded text-[10px] font-semibold text-white flex items-center gap-1 ${iv.tipo === "emergenza" ? "bg-red-500" : "bg-orange-500"}`}>
                              <Wrench className="h-2.5 w-2.5" />
                              {iv.tipo === "emergenza" ? "Urg." : "Int."}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {/* ── Sezione Manutenzioni ────────────────────────────── */}
                {manutenzioni.length > 0 && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-y border-blue-200">
                      <Settings className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-semibold text-blue-700">Manutenzioni in scadenza ({manutenzioni.length})</span>
                    </div>
                    {manutenzioni.map((mn) => {
                      if (!mn.prossima_scadenza) return null;
                      const mnDate = parseISO(mn.prossima_scadenza);
                      const dayOffset = differenceInDays(mnDate, days[0]);
                      if (dayOffset < 0 || dayOffset >= days.length) return null;
                      return (
                        <div key={mn.id} className="relative border-b border-muted" style={{ height: ROW_HEIGHT }}>
                          <div
                            className="absolute top-1/2 -translate-y-1/2"
                            style={{ left: dayOffset * dayWidth }}
                          >
                            <div className="h-5 px-2 rounded bg-blue-500 text-[10px] font-semibold text-white flex items-center gap-1">
                              <Settings className="h-2.5 w-2.5" />
                              Manut.
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
                {/* Capacity row */}
                <div className="flex h-9 border-t bg-muted/20">
                  {capacityPerDay.map((count, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex-shrink-0 flex items-center justify-center text-[9px] font-semibold border-r border-muted/30",
                        capacityColor(count),
                        count > 0 && "text-foreground"
                      )}
                      style={{ width: dayWidth }}
                    >
                      {count > 0 && (zoom !== "year" ? count : "")}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </DndContext>
      )}

      {/* Legend with actual order statuses */}
      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2 font-medium text-muted-foreground">
          <CalendarRange className="h-4 w-4" />
          <span>{ZOOM_CONFIG[zoom].label}</span>
        </div>
        {statuses.slice(0, 5).map((status) => (
          <div key={status.id} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: status.color }}
            />
            <span className="text-muted-foreground">{status.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-background" />
          <span className="text-muted-foreground">Data posa</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500 border-2 border-background" />
          <span className="text-muted-foreground">Arrivo merce</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-0.5 h-4 bg-destructive" />
          <span className="text-muted-foreground">Oggi</span>
        </div>
      </div>

      <LeadTimeStats orders={sortedOrders} />

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

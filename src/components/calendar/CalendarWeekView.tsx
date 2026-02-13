import { useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Hammer, Package, Wrench, AlertTriangle, Users, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { EditOrderDatesDialog } from "./EditOrderDatesDialog";
import type { CalendarOrder } from "@/types/calendar";

interface CalendarWeekViewProps {
  orders: CalendarOrder[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

function getEmployeeInitials(order: CalendarOrder): string {
  if (!order.assigned_employees || order.assigned_employees.length === 0) return "";
  return order.assigned_employees
    .map((ae) => `${ae.employee.first_name[0]}${ae.employee.last_name[0]}`)
    .join(", ");
}

function hasLogisticRisk(order: CalendarOrder): boolean {
  if (!order.expected_date) return false;
  if (!order.warehouse_arrival_date) return true;
  return order.warehouse_arrival_date > order.expected_date;
}

interface WeekEvent {
  order: CalendarOrder;
  type: "posa" | "merce" | "lavoro";
}

export function CalendarWeekView({
  orders,
  currentDate,
  onDateChange,
}: CalendarWeekViewProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [editingOrder, setEditingOrder] = useState<CalendarOrder | null>(null);

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  const getOrderEventsForDay = (day: Date): WeekEvent[] => {
    const events: WeekEvent[] = [];
    orders.forEach((order) => {
      if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) {
        events.push({ order, type: "posa" });
      }
      if (order.warehouse_arrival_date && isSameDay(parseISO(order.warehouse_arrival_date), day)) {
        events.push({ order, type: "merce" });
      }
      if (order.work_start_date) {
        const workStart = parseISO(order.work_start_date);
        const workEnd = order.work_end_date ? parseISO(order.work_end_date) : workStart;
        if (day >= workStart && day <= workEnd) {
          const alreadyHasPosa = events.some((e) => e.order.id === order.id && e.type === "posa");
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
        return { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300", icon: Hammer };
      case "merce":
        return { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", icon: Package };
      case "lavoro":
        return { bg: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300", icon: Wrench };
    }
  };

  const handlePrevWeek = () => onDateChange(subWeeks(currentDate, 1));
  const handleNextWeek = () => onDateChange(addWeeks(currentDate, 1));

  const renderEventCard = (event: WeekEvent, idx: number) => {
    const style = getEventStyle(event.type);
    const Icon = style.icon;
    const logisticRisk = event.type === "posa" && hasLogisticRisk(event.order);
    const initials = getEmployeeInitials(event.order);

    return (
      <button
        key={`${event.order.id}-${event.type}-${idx}`}
        onClick={() => setEditingOrder(event.order)}
        className={cn(
          "w-full text-left p-2 rounded text-xs transition-colors hover:opacity-80",
          style.bg,
          style.text
        )}
      >
        <div className="flex items-center gap-1 font-medium">
          <Icon className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{event.order.order_code || "N/A"}</span>
          {logisticRisk && <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-500" />}
        </div>
        <div className="truncate mt-0.5 opacity-80">
          {event.order.customer.last_name}
        </div>
        {initials && (
          <div className="flex items-center gap-0.5 mt-0.5 opacity-70">
            <Users className="h-2.5 w-2.5" />
            <span className="text-[10px]">{initials}</span>
          </div>
        )}
      </button>
    );
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

        {/* Mobile: lista verticale collassabile */}
        {isMobile ? (
          <div className="space-y-2">
            {weekDays.map((day) => {
              const events = getOrderEventsForDay(day);
              const workloadCount = events.length;
              const today = isToday(day);

              return (
                <Collapsible key={day.toISOString()} defaultOpen={today || workloadCount > 0}>
                  <CollapsibleTrigger className="w-full">
                    <div
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border transition-colors",
                        today && "ring-2 ring-primary"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-semibold capitalize", today && "text-primary")}>
                          {format(day, "EEEE d", { locale: it })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn("text-xs font-medium", getWorkloadColor(workloadCount))}
                        >
                          {workloadCount} {workloadCount === 1 ? "lavoro" : "lavori"}
                        </Badge>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-2 pl-2 space-y-1">
                      {events.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">Nessun lavoro</p>
                      ) : (
                        events.map((event, idx) => renderEventCard(event, idx))
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          /* Desktop: Griglia 7 colonne */
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
                  <div className="text-center mb-2">
                    <div className={cn("text-xs font-medium uppercase", today ? "text-primary" : "text-muted-foreground")}>
                      {format(day, "EEE", { locale: it })}
                    </div>
                    <div className={cn("text-lg font-bold", today && "text-primary")}>
                      {format(day, "d")}
                    </div>
                    <Badge variant="secondary" className={cn("mt-1 text-xs font-medium", getWorkloadColor(workloadCount))}>
                      {workloadCount} {workloadCount === 1 ? "lavoro" : "lavori"}
                    </Badge>
                  </div>
                  <div className="flex-1 space-y-1 overflow-y-auto">
                    {events.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-4">Nessun lavoro</div>
                    ) : (
                      events.map((event, idx) => renderEventCard(event, idx))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

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
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-amber-500" />
            <span className="text-muted-foreground">Rischio logistico</span>
          </div>
        </div>
      </CardContent>

      {editingOrder && (
        <EditOrderDatesDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => !open && setEditingOrder(null)}
        />
      )}
    </Card>
  );
}

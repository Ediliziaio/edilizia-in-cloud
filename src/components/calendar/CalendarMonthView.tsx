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
  parseISO,
  addMonths,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Hammer, Package } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CalendarOrder } from "@/types/calendar";

interface CalendarEvent {
  type: "posa" | "merce";
  order: CalendarOrder;
  color: string;
}

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

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    const events: CalendarEvent[] = [];

    orders.forEach((order) => {
      // Evento Posa (expected_date)
      if (order.expected_date && isSameDay(parseISO(order.expected_date), day)) {
        events.push({
          type: "posa",
          order,
          color: "#3B82F6", // blu
        });
      }

      // Evento Arrivo Merce (warehouse_arrival_date)
      if (
        order.warehouse_arrival_date &&
        isSameDay(parseISO(order.warehouse_arrival_date), day)
      ) {
        events.push({
          type: "merce",
          order,
          color: "#F59E0B", // arancione
        });
      }
    });

    return events;
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

      <TooltipProvider delayDuration={200}>
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
            const dayEvents = getEventsForDay(day);
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
                  {dayEvents.slice(0, 4).map((event, eventIdx) => (
                    <Tooltip key={`${event.order.id}-${event.type}-${eventIdx}`}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => navigate(`/azienda/ordini/${event.order.id}`)}
                          className="w-full flex items-center gap-1 text-xs px-1.5 py-0.5 rounded text-white transition-opacity hover:opacity-80 truncate"
                          style={{ backgroundColor: event.color }}
                        >
                          {event.type === "posa" ? (
                            <Hammer className="h-3 w-3 flex-shrink-0" />
                          ) : (
                            <Package className="h-3 w-3 flex-shrink-0" />
                          )}
                          <span className="truncate font-medium">
                            {event.order.order_code || "Ordine"} - {event.order.customer.last_name}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1">
                          <p className="font-semibold">
                            {event.order.order_code || "N/A"} - {event.type === "posa" ? "Data Posa" : "Arrivo Merce"}
                          </p>
                          <p className="text-sm">
                            {event.order.customer.first_name} {event.order.customer.last_name}
                          </p>
                          {event.order.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {event.order.description}
                            </p>
                          )}
                          {event.order.status && (
                            <div className="flex items-center gap-2 mt-1">
                              <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: event.order.status.color }}
                              />
                              <span className="text-xs">{event.order.status.name}</span>
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {dayEvents.length > 4 && (
                    <div className="text-xs text-muted-foreground text-center">
                      +{dayEvents.length - 4} altri
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500 flex items-center justify-center">
            <Hammer className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-muted-foreground">Data Posa Prevista</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-500 flex items-center justify-center">
            <Package className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="text-muted-foreground">Arrivo Merce</span>
        </div>
      </div>
    </Card>
  );
}

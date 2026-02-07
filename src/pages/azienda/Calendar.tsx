import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CalendarDays, GanttChart, Calendar as CalendarIcon } from "lucide-react";
import type { CalendarOrder, CalendarViewType } from "@/types/calendar";

export default function Calendar() {
  const { effectiveCompany } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarViewType>(isMobile ? "month" : "gantt");
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["calendar-orders", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_code,
          description,
          expected_date,
          work_start_date,
          work_end_date,
          current_status_id,
          customer:profiles!orders_customer_id_fkey(first_name, last_name),
          status:order_statuses!orders_current_status_id_fkey(name, color)
        `)
        .eq("company_id", effectiveCompany.id)
        .order("work_start_date", { ascending: true });
      
      if (error) throw error;
      return (data || []) as CalendarOrder[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Filter orders that have at least one date
  const scheduledOrders = orders.filter(
    (order) => order.work_start_date || order.expected_date
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calendario Lavori</h1>
        <p className="text-muted-foreground">
          Pianifica e visualizza i lavori programmati
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(value) => value && setView(value as CalendarViewType)}
          className="bg-muted rounded-lg p-1"
        >
          <ToggleGroupItem value="month" aria-label="Vista Mese" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Mese</span>
          </ToggleGroupItem>
          {!isMobile && (
            <ToggleGroupItem value="gantt" aria-label="Vista Gantt" className="gap-2">
              <GanttChart className="h-4 w-4" />
              <span className="hidden sm:inline">Gantt</span>
            </ToggleGroupItem>
          )}
        </ToggleGroup>

        <Button variant="outline" size="sm" onClick={goToToday}>
          <CalendarDays className="h-4 w-4 mr-2" />
          Oggi
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : view === "month" ? (
        <CalendarMonthView
          orders={scheduledOrders}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      ) : (
        <CalendarGanttView
          orders={scheduledOrders}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      )}
    </div>
  );
}

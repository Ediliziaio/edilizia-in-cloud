import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { CalendarMonthView } from "@/components/calendar/CalendarMonthView";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, GanttChart, Calendar as CalendarIcon, RotateCcw, AlertTriangle, CalendarRange, BarChart3 } from "lucide-react";
import type { CalendarOrder, CalendarViewType, OrderStatus, CustomerFilter } from "@/types/calendar";

export default function Calendar() {
  const { effectiveCompany } = useAuth();
  const isMobile = useIsMobile();
  const [view, setView] = useState<CalendarViewType>(isMobile ? "month" : "gantt");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [externalTeamFilter, setExternalTeamFilter] = useState<string>("all");

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
          warehouse_arrival_date,
          created_at,
          customer_id,
          current_status_id,
          customer:profiles!orders_customer_id_fkey(first_name, last_name),
          status:order_statuses!orders_current_status_id_fkey(name, color),
          order_employees(employee:employees(id, first_name, last_name)),
          order_external_teams(external_team:external_teams(id, name))
        `)
        .eq("company_id", effectiveCompany.id)
        .order("work_start_date", { ascending: true });
      
      if (error) throw error;
      return (data || []) as CalendarOrder[];
    },
    enabled: !!effectiveCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["order-statuses", effectiveCompany?.id],
    queryFn: async () => {
      if (!effectiveCompany?.id) return [];
      
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name, color")
        .eq("company_id", effectiveCompany.id)
        .order("position");
      
      if (error) throw error;
      return (data || []) as OrderStatus[];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: companyEmployees = [] } = useQuery({
    queryKey: ["employees-filter", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("last_name");
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const { data: externalTeams = [] } = useQuery({
    queryKey: ["external-teams-filter", effectiveCompany?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!effectiveCompany?.id,
  });

  const uniqueCustomers = useMemo(() => {
    const customersMap = new Map<string, CustomerFilter>();
    orders.forEach(order => {
      if (!customersMap.has(order.customer_id)) {
        customersMap.set(order.customer_id, {
          id: order.customer_id,
          first_name: order.customer.first_name,
          last_name: order.customer.last_name,
        });
      }
    });
    return Array.from(customersMap.values()).sort((a, b) => 
      `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    );
  }, [orders]);

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setCustomerFilter("all");
    setEmployeeFilter("all");
    setExternalTeamFilter("all");
  };

  const hasActiveFilters = statusFilter !== "all" || customerFilter !== "all" || employeeFilter !== "all" || externalTeamFilter !== "all";

  // Filter orders that have at least one date
  const scheduledOrders = useMemo(() => {
    return orders
      .filter(order => order.work_start_date || order.expected_date || order.warehouse_arrival_date)
      .filter(order => {
        if (statusFilter !== "all" && order.current_status_id !== statusFilter) {
          return false;
        }
        if (customerFilter !== "all" && order.customer_id !== customerFilter) {
          return false;
        }
        if (employeeFilter !== "all") {
          const hasEmployee = order.assigned_employees?.some(
            ae => ae.employee.id === employeeFilter
          );
          if (!hasEmployee) return false;
        }
        if (externalTeamFilter !== "all") {
          const hasTeam = order.assigned_external_teams?.some(
            aet => aet.external_team.id === externalTeamFilter
          );
          if (!hasTeam) return false;
        }
        return true;
      });
  }, [orders, statusFilter, customerFilter, employeeFilter, externalTeamFilter]);

  // Count orders without important dates
  const unplannedOrdersCount = useMemo(() => {
    return orders.filter(order => !order.expected_date && !order.work_start_date).length;
  }, [orders]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Calendario Lavori</h1>
        <p className="text-muted-foreground">
          Pianifica e visualizza i lavori programmati
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tutti gli stati" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.id} value={status.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: status.color }}
                  />
                  {status.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tutti i clienti" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i clienti</SelectItem>
            {uniqueCustomers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.last_name} {customer.first_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tutti gli operai" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli operai</SelectItem>
            {companyEmployees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.last_name} {emp.first_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={externalTeamFilter} onValueChange={setExternalTeamFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tutte le squadre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le squadre</SelectItem>
            {externalTeams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Resetta Filtri
          </Button>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Badge variant="secondary" className="font-normal">
            {scheduledOrders.length} {scheduledOrders.length === 1 ? "ordine" : "ordini"}
          </Badge>
          {unplannedOrdersCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {unplannedOrdersCount} non pianificati
            </Badge>
          )}
        </div>
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
          <ToggleGroupItem value="week" aria-label="Vista Settimana" className="gap-2">
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline">Settimana</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="heatmap" aria-label="Vista Carico" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Carico</span>
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
      ) : view === "week" ? (
        <CalendarWeekView
          orders={scheduledOrders}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      ) : view === "heatmap" ? (
        <CalendarHeatmapView
          orders={scheduledOrders}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      ) : (
        <CalendarGanttView
          orders={scheduledOrders}
          allOrders={orders}
          statuses={statuses}
          currentDate={currentDate}
          onDateChange={setCurrentDate}
        />
      )}
    </div>
  );
}

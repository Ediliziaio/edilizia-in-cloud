import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Filter,
  Check,
  X
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface WorkLog {
  id: string;
  work_date: string;
  hours_worked: number;
  description: string | null;
  activity_type: string;
  is_approved: boolean;
  approved_at: string | null;
  order_id: string | null;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    gross_salary: number;
    monthly_hours: number;
  };
  order?: {
    order_code: string | null;
    description: string;
  } | null;
}

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
}

const ACTIVITY_LABELS: Record<string, string> = {
  lavoro: "Lavoro",
  trasferta: "Trasferta",
  formazione: "Formazione",
  malattia: "Malattia",
  ferie: "Ferie",
  permesso: "Permesso",
};

export function WorkLogsAdminTab() {
  const { user, effectiveCompany } = useAuth();
  
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");

  // Generate month options
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = subMonths(now, i);
      options.push({
        value: format(date, "yyyy-MM"),
        label: format(date, "MMMM yyyy", { locale: it }),
      });
    }
    return options;
  }, []);

  const monthDate = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [selectedMonth]);

  // Fetch employees
  const { data: employees = [] } = useQuery({
    queryKey: queryKeys.employees.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .eq("company_id", companyId!)
        .order("last_name");
      
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch work logs
  const { data: workLogs = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-work-logs", companyId, selectedMonth, selectedEmployee],
    queryFn: async () => {
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      let query = supabase
        .from("work_logs")
        .select(`
          *,
          employee:employees!inner(id, first_name, last_name, gross_salary, monthly_hours),
          order:orders(order_code, description)
        `)
        .eq("employee.company_id", companyId!)
        .gte("work_date", format(monthStart, "yyyy-MM-dd"))
        .lte("work_date", format(monthEnd, "yyyy-MM-dd"))
        .order("work_date", { ascending: false });

      if (selectedEmployee !== "all") {
        query = query.eq("employee_id", selectedEmployee);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return data as unknown as WorkLog[];
    },
    enabled: !!companyId,
    staleTime: 1 * 60 * 1000,
  });

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (statusFilter === "all") return workLogs;
    if (statusFilter === "approved") return workLogs.filter(log => log.is_approved);
    return workLogs.filter(log => !log.is_approved);
  }, [workLogs, statusFilter]);

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ logId, approve }: { logId: string; approve: boolean }) => {
      const { error } = await supabase
        .from("work_logs")
        .update({
          is_approved: approve,
          approved_by: approve ? user!.id : null,
          approved_at: approve ? new Date().toISOString() : null,
        })
        .eq("id", logId);
      
      if (error) throw error;
    },
    onSuccess: (_, { approve }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-logs"] });
      toast.success(approve ? "Rapportino approvato" : "Approvazione rimossa");
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare lo stato." });
    },
  });

  // Batch approve mutation
  const batchApproveMutation = useMutation({
    mutationFn: async (logIds: string[]) => {
      const { error } = await supabase
        .from("work_logs")
        .update({
          is_approved: true,
          approved_by: user!.id,
          approved_at: new Date().toISOString(),
        })
        .in("id", logIds);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-work-logs"] });
      toast.success("Rapportini approvati", { description: "Tutti i rapportini selezionati sono stati approvati." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile approvare i rapportini." });
    },
  });

  // Calculate hourly cost
  const calculateHourlyCost = (grossSalary: number, monthlyHours: number) => {
    return monthlyHours > 0 ? grossSalary / monthlyHours : 0;
  };

  // Stats
  const stats = useMemo(() => {
    const pending = workLogs.filter(l => !l.is_approved);
    const approved = workLogs.filter(l => l.is_approved);
    
    const totalHours = workLogs.reduce((sum, l) => sum + Number(l.hours_worked), 0);
    const pendingHours = pending.reduce((sum, l) => sum + Number(l.hours_worked), 0);
    
    // Calcola costo totale
    const totalCost = workLogs.reduce((sum, l) => {
      const hourlyRate = calculateHourlyCost(l.employee.gross_salary, l.employee.monthly_hours);
      return sum + (Number(l.hours_worked) * hourlyRate);
    }, 0);

    return {
      total: workLogs.length,
      pending: pending.length,
      approved: approved.length,
      totalHours,
      pendingHours,
      totalCost,
    };
  }, [workLogs]);

  const pendingLogIds = workLogs.filter(l => !l.is_approved).map(l => l.id);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.totalHours}h</p>
              <p className="text-sm text-muted-foreground">Ore totali</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
              <Calendar className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-500">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">Da approvare</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
              <p className="text-sm text-muted-foreground">Approvati</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/30">
              <Clock className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(stats.totalCost)}</p>
              <p className="text-sm text-muted-foreground">Costo stimato</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <CardTitle>Rapportini Dipendenti</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Tutti i dipendenti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i dipendenti</SelectItem>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="pending">Da approvare</SelectItem>
                  <SelectItem value="approved">Approvati</SelectItem>
                </SelectContent>
              </Select>

              {pendingLogIds.length > 0 && (
                <Button
                  onClick={() => batchApproveMutation.mutate(pendingLogIds)}
                  disabled={batchApproveMutation.isPending}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approva tutti ({pendingLogIds.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Caricamento...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessun rapportino per il periodo selezionato</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Dipendente</TableHead>
                    <TableHead>Ore</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="hidden md:table-cell">Ordine</TableHead>
                    <TableHead className="hidden lg:table-cell">Note</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const hourlyRate = calculateHourlyCost(
                      log.employee.gross_salary, 
                      log.employee.monthly_hours
                    );
                    const cost = Number(log.hours_worked) * hourlyRate;
                    
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(new Date(log.work_date), "EEE d MMM", { locale: it })}
                        </TableCell>
                        <TableCell>
                          {log.employee.first_name} {log.employee.last_name}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">{log.hours_worked}h</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatCurrency(cost)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {ACTIVITY_LABELS[log.activity_type] || log.activity_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {log.order ? (
                            <span className="text-sm">
                              {log.order.order_code || log.order.description.substring(0, 20)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell max-w-[150px]">
                          <span className="text-sm text-muted-foreground line-clamp-1">
                            {log.description || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline"
                            className={cn(
                              log.is_approved 
                                ? "border-green-500 text-green-700 bg-green-50 dark:bg-green-900/20" 
                                : "border-orange-500 text-orange-700 bg-orange-50 dark:bg-orange-900/20"
                            )}
                          >
                            {log.is_approved ? "Approvato" : "In attesa"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {!log.is_approved ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => approveMutation.mutate({ logId: log.id, approve: true })}
                                disabled={approveMutation.isPending}
                                title="Approva"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                onClick={() => approveMutation.mutate({ logId: log.id, approve: false })}
                                disabled={approveMutation.isPending}
                                title="Rimuovi approvazione"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

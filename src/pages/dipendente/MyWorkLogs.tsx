import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, Clock, CheckCircle2, AlertCircle, Filter, Pencil } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  order?: {
    order_code: string | null;
    description: string;
  };
}

const ACTIVITY_LABELS: Record<string, string> = {
  lavoro: "Lavoro",
  trasferta: "Trasferta",
  formazione: "Formazione",
  malattia: "Malattia",
  ferie: "Ferie",
  permesso: "Permesso",
};

export default function MyWorkLogs() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved">("all");

  // Generate month options (last 12 months)
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

  // Parse selected month
  const monthDate = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [selectedMonth]);

  // Fetch employee profile
  const { data: employee } = useQuery({
    queryKey: ["my-employee-profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch work logs
  const { data: workLogs = [], isLoading } = useQuery({
    queryKey: ["my-work-logs-list", employee?.id, selectedMonth],
    queryFn: async () => {
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);

      const { data, error } = await supabase
        .from("work_logs")
        .select(`
          *,
          order:orders(order_code, description)
        `)
        .eq("employee_id", employee!.id)
        .gte("work_date", format(monthStart, "yyyy-MM-dd"))
        .lte("work_date", format(monthEnd, "yyyy-MM-dd"))
        .order("work_date", { ascending: false });
      
      if (error) throw error;
      return data as WorkLog[];
    },
    enabled: !!employee?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (statusFilter === "all") return workLogs;
    if (statusFilter === "approved") return workLogs.filter(log => log.is_approved);
    return workLogs.filter(log => !log.is_approved);
  }, [workLogs, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = workLogs.reduce((sum, log) => sum + Number(log.hours_worked), 0);
    const approved = workLogs.filter(l => l.is_approved).reduce((sum, log) => sum + Number(log.hours_worked), 0);
    const pending = workLogs.filter(l => !l.is_approved).reduce((sum, log) => sum + Number(log.hours_worked), 0);
    
    return { total, approved, pending, count: workLogs.length };
  }, [workLogs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">I Miei Rapportini</h1>
        <p className="text-muted-foreground">
          Storico delle ore lavorate e stato approvazione
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}h</p>
              <p className="text-sm text-muted-foreground">Ore totali</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-600">{stats.approved}h</p>
              <p className="text-sm text-muted-foreground">Approvate</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
              <AlertCircle className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-500">{stats.pending}h</p>
              <p className="text-sm text-muted-foreground">In attesa</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Rapportini
            </CardTitle>
            <div className="flex gap-2">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[180px]">
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
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  <SelectItem value="approved">Approvati</SelectItem>
                  <SelectItem value="pending">In attesa</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Ore</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="hidden md:table-cell">Ordine</TableHead>
                    <TableHead className="hidden lg:table-cell">Descrizione</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {format(new Date(log.work_date), "EEE d MMM", { locale: it })}
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{log.hours_worked}h</span>
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
                      <TableCell className="hidden lg:table-cell max-w-[200px]">
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
                        <Link to={`/dipendente/ore?data=${log.work_date}`}>
                          <Button variant="ghost" size="icon" title="Modifica">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

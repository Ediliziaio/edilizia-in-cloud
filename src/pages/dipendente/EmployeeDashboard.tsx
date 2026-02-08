import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval,
  isSameMonth,
  isToday,
  getDay
} from "date-fns";
import { it } from "date-fns/locale";
import { Clock, CalendarCheck, AlertCircle, CheckCircle2, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface WorkLog {
  id: string;
  work_date: string;
  hours_worked: number;
  description: string | null;
  activity_type: string;
  is_approved: boolean;
  order_id: string | null;
  order?: {
    order_code: string | null;
    description: string;
  };
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const today = new Date();
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

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

  // Fetch work logs for current month
  const { data: workLogs = [], isLoading } = useQuery({
    queryKey: ["my-work-logs", employee?.id, format(monthStart, "yyyy-MM")],
    queryFn: async () => {
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

  // Stats calculation
  const stats = useMemo(() => {
    const totalHours = workLogs.reduce((sum, log) => sum + Number(log.hours_worked), 0);
    const approvedLogs = workLogs.filter(log => log.is_approved);
    const pendingLogs = workLogs.filter(log => !log.is_approved);
    const daysWorked = workLogs.length;
    
    return {
      totalHours,
      approvedHours: approvedLogs.reduce((sum, log) => sum + Number(log.hours_worked), 0),
      pendingHours: pendingLogs.reduce((sum, log) => sum + Number(log.hours_worked), 0),
      daysWorked,
      approvedCount: approvedLogs.length,
      pendingCount: pendingLogs.length,
    };
  }, [workLogs]);

  // Calendar days
  const calendarDays = useMemo(() => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const logsByDate = new Map(workLogs.map(log => [log.work_date, log]));
    
    return days.map(day => ({
      date: day,
      log: logsByDate.get(format(day, "yyyy-MM-dd")),
      isWeekend: getDay(day) === 0 || getDay(day) === 6,
    }));
  }, [workLogs, monthStart, monthEnd]);

  // Recent logs
  const recentLogs = workLogs.slice(0, 5);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ciao, {employee?.first_name}!</h1>
          <p className="text-muted-foreground">
            {format(today, "EEEE d MMMM yyyy", { locale: it })}
          </p>
        </div>
        <Link to="/dipendente/ore">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Registra Ore
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Totali</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalHours}h</div>
            <p className="text-xs text-muted-foreground">
              {format(monthStart, "MMMM yyyy", { locale: it })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ore Approvate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approvedHours}h</div>
            <p className="text-xs text-muted-foreground">
              {stats.approvedCount} rapportini
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Attesa</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.pendingHours}h</div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingCount} da approvare
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Giorni Lavorati</CardTitle>
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.daysWorked}</div>
            <p className="text-xs text-muted-foreground">
              questo mese
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mini Calendar */}
        <Card>
          <CardHeader>
            <CardTitle>Calendario {format(monthStart, "MMMM yyyy", { locale: it })}</CardTitle>
            <CardDescription>
              Clicca su un giorno per registrare le ore
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {["L", "M", "M", "G", "V", "S", "D"].map((day, i) => (
                <div key={i} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
              
              {/* Empty cells for days before month start */}
              {Array.from({ length: (getDay(monthStart) + 6) % 7 }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              
              {calendarDays.map(({ date, log, isWeekend }) => (
                <Link
                  key={date.toISOString()}
                  to={`/dipendente/ore?data=${format(date, "yyyy-MM-dd")}`}
                  className={cn(
                    "aspect-square rounded-md flex flex-col items-center justify-center text-sm transition-colors",
                    isToday(date) && "ring-2 ring-primary",
                    isWeekend && !log && "text-muted-foreground/50",
                    log && log.is_approved && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                    log && !log.is_approved && "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
                    !log && !isWeekend && "hover:bg-muted"
                  )}
                >
                  <span>{format(date, "d")}</span>
                  {log && (
                    <span className="text-[10px] font-medium">{log.hours_worked}h</span>
                  )}
                </Link>
              ))}
            </div>
            
            <div className="flex gap-4 mt-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/30" />
                <span>Approvato</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-100 dark:bg-orange-900/30" />
                <span>In attesa</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Logs */}
        <Card>
          <CardHeader>
            <CardTitle>Ultimi Rapportini</CardTitle>
            <CardDescription>
              I tuoi ultimi inserimenti
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nessun rapportino inserito</p>
                <Link to="/dipendente/ore" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">
                    Inserisci il primo
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentLogs.map(log => (
                  <div 
                    key={log.id} 
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {format(new Date(log.work_date), "EEEE d MMM", { locale: it })}
                        </span>
                        <Badge 
                          variant={log.is_approved ? "default" : "secondary"}
                          className={cn(
                            "text-xs",
                            log.is_approved 
                              ? "bg-green-100 text-green-800 hover:bg-green-100" 
                              : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                          )}
                        >
                          {log.is_approved ? "Approvato" : "In attesa"}
                        </Badge>
                      </div>
                      {log.order && (
                        <p className="text-sm text-muted-foreground">
                          Ordine: {log.order.order_code || log.order.description.substring(0, 30)}
                        </p>
                      )}
                      {log.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {log.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold">{log.hours_worked}h</span>
                    </div>
                  </div>
                ))}
                
                <Link to="/dipendente/rapportini" className="block">
                  <Button variant="outline" className="w-full mt-2">
                    Vedi tutti i rapportini
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

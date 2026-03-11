import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  Palmtree, Clock, RotateCcw, Plus, X, Check, Ban, AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const currentYear = new Date().getFullYear();

const calcWorkingDays = (start: Date, end: Date): number => {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "In attesa", variant: "secondary", icon: Clock },
  approved: { label: "Approvata", variant: "default", icon: Check },
  rejected: { label: "Rifiutata", variant: "destructive", icon: Ban },
  cancelled: { label: "Annullata", variant: "outline", icon: X },
};

const typeLabels: Record<string, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  congedo: "Congedo",
};

export default function LeaveRequests() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Get employee record
  const { data: employee } = useQuery({
    queryKey: queryKeys.leave.employeeProfile(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, company_id, first_name, last_name")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // Balance
  const { data: balance } = useQuery({
    queryKey: queryKeys.leave.balance(employee?.id, currentYear),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_balances")
        .select("*")
        .eq("employee_id", employee!.id)
        .eq("year", currentYear)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["leave-requests-employee", employee?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("employee_id", employee!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!employee?.id,
    staleTime: 2 * 60 * 1000,
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", requestId)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests-employee"] });
      toast.success("Richiesta annullata");
    },
    onError: () => toast.error("Errore nell'annullamento"),
  });

  // Balance cards
  const ferieTotal = Number(balance?.ferie_days_total ?? 0);
  const ferieUsed = Number(balance?.ferie_days_used ?? 0);
  const feriePercent = ferieTotal > 0 ? (ferieUsed / ferieTotal) * 100 : 0;

  const permessiTotal = Number(balance?.permessi_hours_total ?? 0);
  const permessiUsed = Number(balance?.permessi_hours_used ?? 0);
  const permessiPercent = permessiTotal > 0 ? (permessiUsed / permessiTotal) * 100 : 0;

  const rolTotal = Number(balance?.rol_hours_total ?? 0);
  const rolUsed = Number(balance?.rol_hours_used ?? 0);
  const rolPercent = rolTotal > 0 ? (rolUsed / rolTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ferie & Permessi</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova richiesta
        </Button>
      </div>

      {/* Balance cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <BalanceCard
          icon={Palmtree}
          title="Ferie"
          used={ferieUsed}
          total={ferieTotal}
          unit="gg"
          percent={feriePercent}
          color="text-amber-600"
        />
        <BalanceCard
          icon={Clock}
          title="Permessi"
          used={permessiUsed}
          total={permessiTotal}
          unit="ore"
          percent={permessiPercent}
          color="text-blue-600"
        />
        <BalanceCard
          icon={RotateCcw}
          title="ROL"
          used={rolUsed}
          total={rolTotal}
          unit="ore"
          percent={rolPercent}
          color="text-green-600"
        />
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Storico richieste</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Nessuna richiesta trovata
            </p>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const cfg = statusConfig[req.status] || statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={cfg.variant} className="shrink-0 gap-1">
                        <Icon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      <span className="font-medium text-sm">
                        {typeLabels[req.type] ?? req.type}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(req.start_date), "d MMM yyyy", { locale: it })}
                        {req.start_date !== req.end_date &&
                          ` – ${format(new Date(req.end_date), "d MMM yyyy", { locale: it })}`}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {req.total_days
                          ? `${Number(req.total_days)} gg`
                          : req.total_hours
                            ? `${Number(req.total_hours)} ore`
                            : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {req.rejection_note && (
                        <span className="text-xs text-destructive italic max-w-[200px] truncate">
                          "{req.rejection_note}"
                        </span>
                      )}
                      {req.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelMutation.mutate(req.id)}
                          disabled={cancelMutation.isPending}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Annulla
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New request dialog */}
      {employee && (
        <NewLeaveDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          employeeId={employee.id}
          companyId={employee.company_id}
        />
      )}
    </div>
  );
}

// ─── Balance Card ────────────────────────────────────
function BalanceCard({
  icon: Icon,
  title,
  used,
  total,
  unit,
  percent,
  color,
}: {
  icon: React.ElementType;
  title: string;
  used: number;
  total: number;
  unit: string;
  percent: number;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-3">
          <Icon className={cn("h-5 w-5", color)} />
          <span className="font-semibold">{title}</span>
        </div>
        <div className="text-2xl font-bold mb-1">
          {used} / {total} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
        </div>
        <Progress value={percent} className="h-2" />
        <p className="text-xs text-muted-foreground mt-1">
          Rimanenti: {Math.max(0, total - used)} {unit}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── New Leave Dialog ────────────────────────────────
function NewLeaveDialog({
  open,
  onOpenChange,
  employeeId,
  companyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("ferie");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [hours, setHours] = useState<string>("");
  const [notes, setNotes] = useState("");

  const isHourType = type === "permesso";

  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return calcWorkingDays(startDate, endDate);
  }, [startDate, endDate]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!startDate) throw new Error("Data inizio obbligatoria");

      const payload: any = {
        company_id: companyId,
        employee_id: employeeId,
        type,
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate ?? startDate, "yyyy-MM-dd"),
        notes: notes || null,
        status: "pending",
      };

      if (isHourType) {
        payload.total_hours = parseFloat(hours);
        payload.total_days = null;
      } else {
        payload.total_days = workingDays;
        payload.total_hours = null;
      }

      const { error } = await supabase.from("leave_requests").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests-employee"] });
      toast.success("Richiesta inviata con successo");
      onOpenChange(false);
      resetForm();
    },
    onError: () => toast.error("Errore nell'invio della richiesta"),
  });

  const resetForm = () => {
    setType("ferie");
    setStartDate(undefined);
    setEndDate(undefined);
    setHours("");
    setNotes("");
  };

  const canSubmit = startDate && (isHourType ? parseFloat(hours) > 0 : workingDays > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuova richiesta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ferie">Ferie</SelectItem>
                <SelectItem value="permesso">Permesso orario</SelectItem>
                <SelectItem value="malattia">Malattia</SelectItem>
                <SelectItem value="congedo">Congedo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data inizio</Label>
              <DatePickerField value={startDate} onChange={setStartDate} />
            </div>
            {!isHourType && (
              <div>
                <Label>Data fine</Label>
                <DatePickerField
                  value={endDate}
                  onChange={setEndDate}
                  fromDate={startDate}
                />
              </div>
            )}
          </div>

          {isHourType ? (
            <div>
              <Label>Ore</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="es. 4"
              />
            </div>
          ) : (
            startDate && endDate && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4" />
                Giorni lavorativi: <strong>{workingDays}</strong>
              </div>
            )
          )}

          <div>
            <Label>Note (opzionale)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo della richiesta..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Invia richiesta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Simple Date Picker ──────────────────────────────
function DatePickerField({
  value,
  onChange,
  fromDate,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  fromDate?: Date;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
        >
          {value ? format(value, "dd/MM/yyyy") : "Seleziona data"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
          fromDate={fromDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

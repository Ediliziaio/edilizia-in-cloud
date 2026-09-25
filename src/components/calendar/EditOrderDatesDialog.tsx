/**
 * Dialog completo per gestire un ordine dal calendario.
 * Mostra: info ordine, date (editabili), pagamenti, squadra (editabile), meteo cantiere, distanza sede.
 */
import { useState, useEffect, useMemo } from "react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { it } from "date-fns/locale";
import {
  CalendarIcon, Loader2, MapPin, Navigation, Users, UsersRound, Plus, X,
  HardHat, Wrench, ExternalLink, CreditCard,
  CheckCircle2, AlertCircle, Clock, Receipt,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { weatherCodeToEmoji, weatherCodeToLabel, type LocationWeatherDay } from "@/hooks/useWeatherForecast";
import type { CalendarOrder } from "@/types/calendar";
import { DisponibilitaSquadra } from "@/components/calendar/DisponibilitaSquadra";
import { Link } from "react-router-dom";

/* ── Types ──────────────────────────────────────────────── */

interface EditOrderDatesDialogProps {
  order: CalendarOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
  /** Info meteo + distanza dal Calendar */
  orderWeatherInfo?: {
    weather?: LocationWeatherDay;
    distanceKm?: number;
    durationMin?: number;
    durationLabel?: string;
    address?: string;
  };
}

interface DateFieldProps {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
}

/* ── DateField ──────────────────────────────────────────── */

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full justify-start text-left font-normal h-9",
              !value && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {value ? format(value, "d MMMM yyyy", { locale: it }) : "Seleziona data"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            locale={it}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */

export function EditOrderDatesDialog({
  order,
  open,
  onOpenChange,
  onSave,
  orderWeatherInfo,
}: EditOrderDatesDialogProps) {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [isSaving, setIsSaving] = useState(false);

  // ── Date state ──
  const [workStartDate, setWorkStartDate] = useState<Date | undefined>();
  const [workEndDate, setWorkEndDate] = useState<Date | undefined>();
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState<Date | undefined>();
  // Orari dei lavori ("HH:mm" o vuoto = tutto il giorno): con gli orari la
  // posa sul calendario Google della squadra ha un'ora, e due mezze giornate
  // della stessa squadra non si pestano.
  const [workStartTime, setWorkStartTime] = useState("");
  const [workEndTime, setWorkEndTime] = useState("");

  useEffect(() => {
    if (open && order) {
      setWorkStartDate(order.work_start_date ? parseISO(order.work_start_date) : undefined);
      setWorkEndDate(order.work_end_date ? parseISO(order.work_end_date) : undefined);
      setWorkStartTime(order.work_start_time?.slice(0, 5) ?? "");
      setWorkEndTime(order.work_end_time?.slice(0, 5) ?? "");
      setExpectedDate(order.expected_date ? parseISO(order.expected_date) : undefined);
      setWarehouseArrivalDate(order.warehouse_arrival_date ? parseISO(order.warehouse_arrival_date) : undefined);
    }
  }, [open, order]);

  // ── Fetch operai azienda (per il select "aggiungi") ──
  const { data: allEmployees = [] } = useQuery({
    queryKey: queryKeys.employees.list(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, role_type, area")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("last_name");
      if (error) {
        // Fallback if area column doesn't exist yet
        const { data: fb } = await supabase
          .from("employees")
          .select("id, first_name, last_name, role_type")
          .eq("company_id", companyId!)
          .eq("is_active", true)
          .order("last_name");
        return (fb || []).map((e: any) => ({
          ...e,
          area: e.role_type === "staff_interno" ? "amministrazione" : "cantiere",
        })) as Array<{ id: string; first_name: string; last_name: string; role_type?: string; area?: string }>;
      }
      return (data || []).map((e: any) => ({
        ...e,
        area: e.area || (e.role_type === "staff_interno" ? "amministrazione" : "cantiere"),
      })) as Array<{ id: string; first_name: string; last_name: string; role_type?: string; area?: string }>;
    },
    enabled: !!companyId && open,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch subappaltatori azienda ──
  const { data: allExternalTeams = [] } = useQuery({
    queryKey: ["external-teams-list", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Array<{ id: string; name: string }>;
    },
    enabled: !!companyId && open,
    staleTime: 5 * 60 * 1000,
  });

  // ── Fetch pagamenti ordine ──
  const { data: paymentData } = useQuery({
    queryKey: ["order-payments-dialog", order.id],
    queryFn: async () => {
      // 1. Campi pagamento diretti dall'ordine
      const { data: orderPayment, error: opErr } = await supabase
        .from("orders")
        .select("total_amount, deposit_amount, deposit_paid, deposit_paid_date, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_paid_date, deposit_2_expected_date, balance_amount, balance_paid, balance_paid_date, balance_expected_date, payment_type")
        .eq("id", order.id)
        .single();
      if (opErr) throw opErr;

      // 2. Rate personalizzate
      const { data: installments, error: instErr } = await supabase
        .from("order_installments")
        .select("id, label, type, amount, is_paid, paid_date, expected_date, position")
        .eq("order_id", order.id)
        .order("position");
      if (instErr) throw instErr;

      // 3. Fatture collegate
      const { data: invoices, error: invErr } = await supabase
        .from("documenti_fiscali" as never)
        .select("id, numero, data_emissione, stato, totale_da_pagare, importo_pagato, data_scadenza")
        .eq("ordine_id", order.id)
        .is("deleted_at", null);
      if (invErr) throw invErr;

      return {
        order: orderPayment as {
          total_amount: number;
          deposit_amount: number | null;
          deposit_paid: boolean | null;
          deposit_paid_date: string | null;
          deposit_expected_date: string | null;
          deposit_2_amount: number | null;
          deposit_2_paid: boolean | null;
          deposit_2_paid_date: string | null;
          deposit_2_expected_date: string | null;
          balance_amount: number | null;
          balance_paid: boolean | null;
          balance_paid_date: string | null;
          balance_expected_date: string | null;
          payment_type: string | null;
        },
        installments: (installments ?? []) as Array<{
          id: string; label: string | null; type: string | null;
          amount: number; is_paid: boolean | null; paid_date: string | null;
          expected_date: string | null; position: number;
        }>,
        invoices: ((invoices ?? []) as any[]).map((inv: any) => ({
          id: inv.id as string,
          numero: inv.numero as string | null,
          data_emissione: inv.data_emissione as string | null,
          stato: inv.stato as string,
          totale: (inv.totale_da_pagare ?? 0) as number,
          pagato: (inv.importo_pagato ?? 0) as number,
          scadenza: inv.data_scadenza as string | null,
        })),
      };
    },
    enabled: open,
    staleTime: 30_000,
  });

  // ── Calcoli pagamento ──
  const paymentSummary = useMemo(() => {
    if (!paymentData?.order) return null;
    const o = paymentData.order;
    const total = o.total_amount || 0;
    if (total === 0) return null;

    // Build payment lines from order fields
    const lines: Array<{
      label: string;
      amount: number;
      paid: boolean;
      paidDate: string | null;
      expectedDate: string | null;
    }> = [];

    if (o.deposit_amount && o.deposit_amount > 0) {
      lines.push({
        label: "Acconto",
        amount: o.deposit_amount,
        paid: !!o.deposit_paid,
        paidDate: o.deposit_paid_date,
        expectedDate: o.deposit_expected_date,
      });
    }
    if (o.deposit_2_amount && o.deposit_2_amount > 0) {
      lines.push({
        label: "2° Acconto",
        amount: o.deposit_2_amount,
        paid: !!o.deposit_2_paid,
        paidDate: o.deposit_2_paid_date,
        expectedDate: o.deposit_2_expected_date,
      });
    }
    if (o.balance_amount && o.balance_amount > 0) {
      lines.push({
        label: "Saldo",
        amount: o.balance_amount,
        paid: !!o.balance_paid,
        paidDate: o.balance_paid_date,
        expectedDate: o.balance_expected_date,
      });
    }

    // Override with installments if present (more flexible)
    const inst = paymentData.installments;
    const useInstallments = inst.length > 0;
    const installmentLines = inst.map(i => ({
      label: i.label || (i.type === "deposit" ? "Acconto" : i.type === "balance" ? "Saldo" : `Rata ${i.position}`),
      amount: i.amount,
      paid: !!i.is_paid,
      paidDate: i.paid_date,
      expectedDate: i.expected_date,
    }));

    const finalLines = useInstallments ? installmentLines : lines;
    const totalPaid = finalLines.filter(l => l.paid).reduce((sum, l) => sum + l.amount, 0);
    const pct = total > 0 ? Math.min(100, Math.round((totalPaid / total) * 100)) : 0;

    return { total, totalPaid, pct, lines: finalLines };
  }, [paymentData]);

  // ── Operai attualmente assegnati ──
  const assignedEmployeeIds = useMemo(
    () => new Set(order.order_employees?.map(oe => oe.employee.id) ?? []),
    [order.order_employees]
  );
  const availableEmployees = allEmployees.filter(e => !assignedEmployeeIds.has(e.id));

  // ── Subappaltatori attualmente assegnati ──
  const assignedTeamIds = useMemo(
    () => new Set(order.order_external_teams?.map(oet => oet.external_team.id) ?? []),
    [order.order_external_teams]
  );
  const availableTeams = allExternalTeams.filter(t => !assignedTeamIds.has(t.id));

  // ── Mutations: aggiungi/rimuovi operaio ──
  const addEmployee = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("order_employees")
        .insert({ order_id: order.id, employee_id: employeeId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast.success("Operaio aggiunto");
    },
    onError: () => toast.error("Errore aggiunta operaio"),
  });

  const removeEmployee = useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase
        .from("order_employees")
        .delete()
        .eq("order_id", order.id)
        .eq("employee_id", employeeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast.success("Operaio rimosso");
    },
    onError: () => toast.error("Errore rimozione operaio"),
  });

  // ── Mutations: aggiungi/rimuovi subappaltatore ──
  const addTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase
        .from("order_external_teams")
        .insert({ order_id: order.id, external_team_id: teamId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast.success("Subappaltatore aggiunto");
    },
    onError: () => toast.error("Errore aggiunta subappaltatore"),
  });

  const removeTeam = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase
        .from("order_external_teams")
        .delete()
        .eq("order_id", order.id)
        .eq("external_team_id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      toast.success("Subappaltatore rimosso");
    },
    onError: () => toast.error("Errore rimozione subappaltatore"),
  });

  // ── Save dates ──
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          work_start_date: workStartDate ? format(workStartDate, "yyyy-MM-dd") : null,
          work_end_date: workEndDate ? format(workEndDate, "yyyy-MM-dd") : null,
          expected_date: expectedDate ? format(expectedDate, "yyyy-MM-dd") : null,
          warehouse_arrival_date: warehouseArrivalDate ? format(warehouseArrivalDate, "yyyy-MM-dd") : null,
          work_start_time: workStartTime || null,
          work_end_time: workEndTime || null,
        } as never)
        .eq("id", order.id);
      if (error) throw error;
      toast.success("Date aggiornate");
      // La posa raggiunge subito i calendari Google delle squadre. Best effort:
      // il trigger sulla commessa ha già accodato, il cron ci riprova comunque.
      void supabase.functions.invoke("google-calendar-sync", {
        body: { action: "push-order", companyId, orderId: order.id },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      onSave?.();
      onOpenChange(false);
    } catch (error) {
      logger.error("Errore aggiornamento date:", error);
      toast.error("Errore durante l'aggiornamento");
    } finally {
      setIsSaving(false);
    }
  };

  const ow = orderWeatherInfo;
  const orderAddress = order.indirizzo_lavori || ow?.address;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-primary" />
            {order.order_code || "Ordine"}
          </DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="font-medium text-foreground">
              {order.customer.first_name} {order.customer.last_name}
            </span>
            {order.description && (
              <span className="block text-xs line-clamp-2">{order.description}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ═══ INFO CANTIERE: Indirizzo + Distanza + Meteo ═══ */}
        {(orderAddress || ow) && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            {orderAddress && (
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-sm">{orderAddress}</span>
              </div>
            )}
            {ow?.distanceKm != null && (
              <div className="flex items-center gap-2 text-sm">
                <Navigation className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="font-medium">{ow.distanceKm} km</span>
                {ow.durationLabel && (
                  <span className="text-muted-foreground">· {ow.durationLabel} dalla sede</span>
                )}
              </div>
            )}
            {ow?.weather && (
              <div className={cn(
                "flex items-center gap-2 text-sm rounded-md px-2 py-1",
                ow.weather.precip > 20 ? "bg-red-50 dark:bg-red-900/20" :
                ow.weather.precip > 5 ? "bg-orange-50 dark:bg-orange-900/20" :
                "bg-sky-50 dark:bg-sky-900/20"
              )}>
                <span className="text-lg">{weatherCodeToEmoji(ow.weather.code)}</span>
                <div>
                  <span className="font-medium">{weatherCodeToLabel(ow.weather.code)}</span>
                  <span className="text-muted-foreground ml-1">{ow.weather.minTemp}°–{ow.weather.maxTemp}°</span>
                  {ow.weather.precip > 0 && <span className="text-blue-600 ml-1">{ow.weather.precip}mm</span>}
                </div>
                {ow.weather.precip > 20 && <Badge variant="destructive" className="ml-auto text-[10px] px-1.5">Stop lavori</Badge>}
                {ow.weather.precip > 5 && ow.weather.precip <= 20 && <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 bg-orange-100 text-orange-700">Rischio pioggia</Badge>}
              </div>
            )}
          </div>
        )}

        {/* ═══ STATO ═══ */}
        {order.status && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: order.status.color }} />
            <span className="text-sm font-medium">{order.status.name}</span>
            <Link
              to={`/azienda/ordini/${order.id}`}
              className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
              onClick={() => onOpenChange(false)}
            >
              Apri ordine <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* ═══ PAGAMENTI ═══ */}
        {paymentSummary && (
          <>
            <Separator />
            <div className="space-y-2.5">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Pagamenti
              </h4>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    Incassato: <span className="font-semibold text-foreground">€{paymentSummary.totalPaid.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Totale: <span className="font-semibold text-foreground">€{paymentSummary.total.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                  </span>
                </div>
                <Progress
                  value={paymentSummary.pct}
                  className={cn(
                    "h-2.5",
                    paymentSummary.pct >= 100 ? "[&>div]:bg-green-500" :
                    paymentSummary.pct >= 50 ? "[&>div]:bg-blue-500" :
                    paymentSummary.pct > 0 ? "[&>div]:bg-amber-500" :
                    "[&>div]:bg-red-400"
                  )}
                />
                <p className="text-[11px] text-right text-muted-foreground">{paymentSummary.pct}% incassato</p>
              </div>

              {/* Singole rate */}
              <div className="space-y-1.5">
                {paymentSummary.lines.map((line, i) => {
                  const isOverdue = !line.paid && line.expectedDate && isPast(parseISO(line.expectedDate)) && !isToday(parseISO(line.expectedDate));
                  return (
                    <div key={i} className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                      line.paid ? "bg-green-50 dark:bg-green-900/15" :
                      isOverdue ? "bg-red-50 dark:bg-red-900/15" :
                      "bg-muted/40"
                    )}>
                      {line.paid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : isOverdue ? (
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium flex-1">{line.label}</span>
                      <span className="font-semibold tabular-nums">€{line.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}</span>
                      {line.paid && line.paidDate ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800">
                          Pagato {format(parseISO(line.paidDate), "d MMM", { locale: it })}
                        </Badge>
                      ) : line.expectedDate ? (
                        <Badge variant="outline" className={cn(
                          "text-[10px] px-1.5",
                          isOverdue ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {isOverdue ? "Scaduto" : "Scade"} {format(parseISO(line.expectedDate), "d MMM", { locale: it })}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">
                          Da incassare
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Fatture collegate */}
              {paymentData?.invoices && paymentData.invoices.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 pt-1">
                    <Receipt className="h-3.5 w-3.5" /> Fatture collegate
                  </p>
                  {paymentData.invoices.map((inv) => {
                    const invOverdue = !["pagata"].includes(inv.stato) && inv.scadenza && isPast(parseISO(inv.scadenza));
                    const invPct = inv.totale > 0 ? Math.round((inv.pagato / inv.totale) * 100) : 0;
                    return (
                      <div key={inv.id} className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-xs",
                        inv.stato === "pagata" ? "bg-green-50/60 dark:bg-green-900/10" :
                        invOverdue ? "bg-red-50/60 dark:bg-red-900/10" :
                        "bg-muted/30"
                      )}>
                        <span className="font-medium">
                          {inv.numero || "Bozza"}
                        </span>
                        {inv.data_emissione && (
                          <span className="text-muted-foreground">
                            {format(parseISO(inv.data_emissione), "d/MM/yy")}
                          </span>
                        )}
                        <span className="ml-auto font-semibold tabular-nums">
                          €{inv.totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </span>
                        <Badge variant="outline" className={cn(
                          "text-[10px] px-1.5",
                          inv.stato === "pagata" ? "text-green-700 border-green-200 dark:text-green-400" :
                          inv.stato === "parzialmente_pagata" ? "text-amber-700 border-amber-200 dark:text-amber-400" :
                          invOverdue ? "text-red-700 border-red-200 dark:text-red-400" :
                          "text-muted-foreground"
                        )}>
                          {inv.stato === "pagata" ? `Pagata` :
                           inv.stato === "parzialmente_pagata" ? `${invPct}%` :
                           inv.stato === "emessa" || inv.stato === "inviata_sdi" || inv.stato === "consegnata" ? "Emessa" :
                           inv.stato === "bozza" ? "Bozza" :
                           inv.stato}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        <Separator />

        {/* ═══ DATE ═══ */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" /> Date
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <DateField label="Inizio Lavori" value={workStartDate} onChange={setWorkStartDate} />
            <DateField label="Fine Lavori" value={workEndDate} onChange={setWorkEndDate} />
            <div className="col-span-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Dalle</Label>
                <Input type="time" className="h-9" value={workStartTime} onChange={(e) => setWorkStartTime(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Alle</Label>
                <Input type="time" className="h-9" value={workEndTime} onChange={(e) => setWorkEndTime(e.target.value)} />
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" className="h-9 px-2 text-xs" onClick={() => { setWorkStartTime("08:00"); setWorkEndTime("12:00"); }}>
                  Mattina
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9 px-2 text-xs" onClick={() => { setWorkStartTime("13:00"); setWorkEndTime("17:00"); }}>
                  Pomeriggio
                </Button>
              </div>
            </div>
            <DateField label="Data Posa Prevista" value={expectedDate} onChange={setExpectedDate} />
            <DateField label="Arrivo Merce" value={warehouseArrivalDate} onChange={setWarehouseArrivalDate} />
          </div>
        </div>

        <Separator />

        {/* ═══ SQUADRA OPERAI ═══ */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Operai assegnati
          </h4>
          {order.order_employees && order.order_employees.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {order.order_employees.map(oe => {
                const emp = allEmployees.find(e => e.id === oe.employee.id);
                const area = (emp as any)?.area || "cantiere";
                const areaEmoji: Record<string, string> = { cantiere: "🏗️", commerciale: "💼", tecnico: "🔧", amministrazione: "🏢" };
                return (
                  <Badge key={oe.employee.id} variant="secondary" className="gap-1 pr-1">
                    <span className="text-[10px]">{areaEmoji[area] || "👤"}</span>
                    {oe.employee.first_name} {oe.employee.last_name}
                    <button
                      onClick={() => removeEmployee.mutate(oe.employee.id)}
                      className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5"
                      disabled={removeEmployee.isPending}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-amber-600">Nessun operaio assegnato</p>
          )}
          {availableEmployees.length > 0 && (
            <Select onValueChange={(id) => addEmployee.mutate(id)}>
              <SelectTrigger className="h-8 text-xs">
                <div className="flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  <SelectValue placeholder="Aggiungi operaio..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  const areaOrder = ["cantiere", "commerciale", "tecnico", "amministrazione"];
                  const areaLabels: Record<string, { emoji: string; label: string }> = {
                    cantiere: { emoji: "🏗️", label: "Cantiere" },
                    commerciale: { emoji: "💼", label: "Commerciale" },
                    tecnico: { emoji: "🔧", label: "Tecnico" },
                    amministrazione: { emoji: "🏢", label: "Ufficio" },
                  };
                  const grouped = new Map<string, typeof availableEmployees>();
                  for (const e of availableEmployees) {
                    const a = (e as any).area || "cantiere";
                    if (!grouped.has(a)) grouped.set(a, []);
                    grouped.get(a)!.push(e);
                  }
                  return areaOrder.filter(a => grouped.has(a)).map(area => {
                    const info = areaLabels[area] || { emoji: "👤", label: area };
                    return (
                      <div key={area}>
                        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide sticky top-0 bg-popover">
                          {info.emoji} {info.label}
                        </div>
                        {grouped.get(area)!.map(e => (
                          <SelectItem key={e.id} value={e.id} className="text-xs">
                            <span className="flex items-center gap-2">
                              {e.first_name} {e.last_name}
                              <span className="text-[10px] text-muted-foreground">{info.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </div>
                    );
                  });
                })()}
              </SelectContent>
            </Select>
          )}
        </div>

        <Separator />

        {/* ═══ SUBAPPALTATORI ═══ */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <UsersRound className="h-4 w-4" /> Subappaltatori
          </h4>
          {order.order_external_teams && order.order_external_teams.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {order.order_external_teams.map(oet => (
                <Badge key={oet.external_team.id} variant="outline" className="gap-1 pr-1">
                  <Wrench className="h-3 w-3" />
                  {oet.external_team.name}
                  <button
                    onClick={() => removeTeam.mutate(oet.external_team.id)}
                    className="ml-0.5 hover:bg-destructive/20 rounded-full p-0.5"
                    disabled={removeTeam.isPending}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nessun subappaltatore</p>
          )}
          {/* Disponibilità: per ogni squadra, nelle date scelte nel form (non
              in quelle salvate), è libera o è già altrove? Avvisa, non blocca. */}
          {order.order_external_teams && order.order_external_teams.length > 0 && (
            <div className="space-y-1">
              {order.order_external_teams.map(oet => (
                <DisponibilitaSquadra
                  key={`disp-${oet.external_team.id}`}
                  team={oet.external_team}
                  orderId={order.id}
                  date={{
                    work_start_date: workStartDate ? format(workStartDate, "yyyy-MM-dd") : null,
                    work_end_date: workEndDate ? format(workEndDate, "yyyy-MM-dd") : null,
                    work_start_time: workStartTime || null,
                    work_end_time: workEndTime || null,
                  }}
                />
              ))}
            </div>
          )}
          {availableTeams.length > 0 && (
            <Select onValueChange={(id) => addTeam.mutate(id)}>
              <SelectTrigger className="h-8 text-xs">
                <div className="flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  <SelectValue placeholder="Aggiungi subappaltatore..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                {availableTeams.map(t => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Annulla
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

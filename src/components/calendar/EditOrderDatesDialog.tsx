/**
 * Dialog completo per gestire un ordine dal calendario.
 * Mostra: info ordine, date (editabili), pagamenti, squadra (editabile), meteo cantiere, distanza sede.
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { it } from "date-fns/locale";
import {
  CalendarIcon,
  Loader2,
  MapPin,
  Navigation,
  Users,
  HardHat,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Clock,
  Receipt,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { calendarWorkLocation } from "@/lib/calendar/navigation";
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

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  weatherCodeToEmoji,
  weatherCodeToLabel,
  type LocationWeatherDay,
} from "@/hooks/useWeatherForecast";
import type { CalendarOrder } from "@/types/calendar";
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
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full justify-start text-left font-normal h-9",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {value
              ? format(value, "d MMMM yyyy", { locale: it })
              : "Seleziona data"}
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
  const { effectiveCompany, user } = useAuth();
  const permissions = usePermissions();
  const canEdit =
    !permissions.isLoading &&
    permissions.canEditOrders &&
    !permissions.solaLettura;
  const companyId = effectiveCompany?.id;
  const [isSaving, setIsSaving] = useState(false);

  // ── Date state ──
  const [workStartDate, setWorkStartDate] = useState<Date | undefined>(() =>
    order.work_start_date ? parseISO(order.work_start_date) : undefined,
  );
  const [workEndDate, setWorkEndDate] = useState<Date | undefined>(() =>
    order.work_end_date ? parseISO(order.work_end_date) : undefined,
  );
  const [expectedDate, setExpectedDate] = useState<Date | undefined>(() =>
    order.expected_date ? parseISO(order.expected_date) : undefined,
  );
  const [warehouseArrivalDate, setWarehouseArrivalDate] = useState<
    Date | undefined
  >(() =>
    order.warehouse_arrival_date
      ? parseISO(order.warehouse_arrival_date)
      : undefined,
  );
  // Orari dei lavori ("HH:mm" o vuoto = tutto il giorno): con gli orari la
  // posa sul calendario Google della squadra ha un'ora, e due mezze giornate
  // della stessa squadra non si pestano.
  const [workStartTime, setWorkStartTime] = useState(
    order.work_start_time?.slice(0, 5) ?? "",
  );
  const [workEndTime, setWorkEndTime] = useState(
    order.work_end_time?.slice(0, 5) ?? "",
  );

  const openedOrder = useRef<string | null>(open ? order.id : null);
  useEffect(() => {
    if (!open) {
      openedOrder.current = null;
      return;
    }
    if (!order || openedOrder.current === order.id) return;
    openedOrder.current = order.id;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setWorkStartDate(
        order.work_start_date ? parseISO(order.work_start_date) : undefined,
      );
      setWorkEndDate(
        order.work_end_date ? parseISO(order.work_end_date) : undefined,
      );
      setWorkStartTime(order.work_start_time?.slice(0, 5) ?? "");
      setWorkEndTime(order.work_end_time?.slice(0, 5) ?? "");
      setExpectedDate(
        order.expected_date ? parseISO(order.expected_date) : undefined,
      );
      setWarehouseArrivalDate(
        order.warehouse_arrival_date
          ? parseISO(order.warehouse_arrival_date)
          : undefined,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, order]);

  // ── Fetch pagamenti ordine ──
  const { data: paymentData } = useQuery({
    queryKey: ["order-payments-dialog", companyId, user?.id, order.id],
    queryFn: async () => {
      if (
        !companyId ||
        !user?.id ||
        permissions.isLoading ||
        !permissions.canViewScadenzario
      )
        throw new Error("Non hai accesso ai pagamenti della commessa");
      // 1. Campi pagamento diretti dall'ordine
      const { data: orderPayment, error: opErr } = await supabase
        .from("orders")
        .select(
          "total_amount, deposit_amount, deposit_paid, deposit_paid_date, deposit_expected_date, deposit_2_amount, deposit_2_paid, deposit_2_paid_date, deposit_2_expected_date, balance_amount, balance_paid, balance_paid_date, balance_expected_date, payment_type",
        )
        .eq("id", order.id)
        .eq("company_id", companyId)
        .single();
      if (opErr) throw opErr;

      // 2. Rate personalizzate
      const { data: installments, error: instErr } = await supabase
        .from("order_installments")
        .select(
          "id, label, type, amount, is_paid, paid_date, expected_date, position",
        )
        .eq("order_id", order.id)
        .order("position");
      if (instErr) throw instErr;

      // 3. Fatture collegate
      const { data: invoices, error: invErr } = await supabase
        .from("documenti_fiscali" as never)
        .select(
          "id, numero, data_emissione, stato, totale_da_pagare, importo_pagato, data_scadenza",
        )
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
          id: string;
          label: string | null;
          type: string | null;
          amount: number;
          is_paid: boolean | null;
          paid_date: string | null;
          expected_date: string | null;
          position: number;
        }>,
        invoices: (
          (invoices ?? []) as {
            id: string;
            numero: string | null;
            data_emissione: string | null;
            stato: string;
            totale_da_pagare: number | null;
            importo_pagato: number | null;
            data_scadenza: string | null;
          }[]
        ).map((inv) => ({
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
    enabled:
      open &&
      !!companyId &&
      !!user?.id &&
      !permissions.isLoading &&
      permissions.canViewScadenzario,
    staleTime: 30_000,
  });

  // ── Calcoli pagamento ──
  const paymentSummary = useMemo(() => {
    if (!permissions.canViewScadenzario || !paymentData?.order) return null;
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
    const installmentLines = inst.map((i) => ({
      label:
        i.label ||
        (i.type === "deposit"
          ? "Acconto"
          : i.type === "balance"
            ? "Saldo"
            : `Rata ${i.position}`),
      amount: i.amount,
      paid: !!i.is_paid,
      paidDate: i.paid_date,
      expectedDate: i.expected_date,
    }));

    const finalLines = useInstallments ? installmentLines : lines;
    const totalPaid = finalLines
      .filter((l) => l.paid)
      .reduce((sum, l) => sum + l.amount, 0);
    const pct =
      total > 0 ? Math.min(100, Math.round((totalPaid / total) * 100)) : 0;

    return { total, totalPaid, pct, lines: finalLines };
  }, [paymentData, permissions.canViewScadenzario]);

  // ── Save dates ──
  const handleSave = async () => {
    if (!canEdit || !companyId || !user?.id) return;
    if (workStartDate && workEndDate && workEndDate < workStartDate) {
      toast.error(
        "La fine dei lavori deve essere successiva o uguale all’inizio",
      );
      return;
    }
    if (
      workStartTime &&
      workEndTime &&
      workEndTime <= workStartTime &&
      (!workStartDate ||
        !workEndDate ||
        format(workStartDate, "yyyy-MM-dd") ===
          format(workEndDate, "yyyy-MM-dd"))
    ) {
      toast.error("L’orario di fine deve essere successivo all’inizio");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({
          work_start_date: workStartDate
            ? format(workStartDate, "yyyy-MM-dd")
            : null,
          work_end_date: workEndDate ? format(workEndDate, "yyyy-MM-dd") : null,
          expected_date: expectedDate
            ? format(expectedDate, "yyyy-MM-dd")
            : null,
          warehouse_arrival_date: warehouseArrivalDate
            ? format(warehouseArrivalDate, "yyyy-MM-dd")
            : null,
          work_start_time: workStartTime || null,
          work_end_time: workEndTime || null,
        } as never)
        .eq("id", order.id)
        .eq("company_id", companyId)
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Date aggiornate");
      // La posa raggiunge subito i calendari Google delle squadre. Best effort:
      // il trigger sulla commessa ha già accodato, il cron ci riprova comunque.
      void supabase.functions.invoke("google-calendar-sync", {
        body: { action: "push-order", companyId, orderId: order.id },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
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
              <span className="block text-xs line-clamp-2">
                {order.description}
              </span>
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
                  <span className="text-muted-foreground">
                    · {ow.durationLabel} dalla sede
                  </span>
                )}
              </div>
            )}
            {ow?.weather && (
              <div
                className={cn(
                  "flex items-center gap-2 text-sm rounded-md px-2 py-1",
                  ow.weather.precip > 20
                    ? "bg-red-50 dark:bg-red-900/20"
                    : ow.weather.precip > 5
                      ? "bg-orange-50 dark:bg-orange-900/20"
                      : "bg-sky-50 dark:bg-sky-900/20",
                )}
              >
                <span className="text-lg">
                  {weatherCodeToEmoji(ow.weather.code)}
                </span>
                <div>
                  <span className="font-medium">
                    {weatherCodeToLabel(ow.weather.code)}
                  </span>
                  <span className="text-muted-foreground ml-1">
                    {ow.weather.minTemp}°–{ow.weather.maxTemp}°
                  </span>
                  {ow.weather.precip > 0 && (
                    <span className="text-blue-600 ml-1">
                      {ow.weather.precip}mm
                    </span>
                  )}
                </div>
                {ow.weather.precip > 20 && (
                  <Badge
                    variant="destructive"
                    className="ml-auto text-[10px] px-1.5"
                  >
                    Stop lavori
                  </Badge>
                )}
                {ow.weather.precip > 5 && ow.weather.precip <= 20 && (
                  <Badge
                    variant="secondary"
                    className="ml-auto text-[10px] px-1.5 bg-orange-100 text-orange-700"
                  >
                    Rischio pioggia
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ STATO ═══ */}
        {order.status && (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: order.status.color }}
            />
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
                    Incassato:{" "}
                    <span className="font-semibold text-foreground">
                      €
                      {paymentSummary.totalPaid.toLocaleString("it-IT", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    Totale:{" "}
                    <span className="font-semibold text-foreground">
                      €
                      {paymentSummary.total.toLocaleString("it-IT", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </span>
                </div>
                <Progress
                  value={paymentSummary.pct}
                  className={cn(
                    "h-2.5",
                    paymentSummary.pct >= 100
                      ? "[&>div]:bg-green-500"
                      : paymentSummary.pct >= 50
                        ? "[&>div]:bg-blue-500"
                        : paymentSummary.pct > 0
                          ? "[&>div]:bg-amber-500"
                          : "[&>div]:bg-red-400",
                  )}
                />
                <p className="text-[11px] text-right text-muted-foreground">
                  {paymentSummary.pct}% incassato
                </p>
              </div>

              {/* Singole rate */}
              <div className="space-y-1.5">
                {paymentSummary.lines.map((line, i) => {
                  const isOverdue =
                    !line.paid &&
                    line.expectedDate &&
                    isPast(parseISO(line.expectedDate)) &&
                    !isToday(parseISO(line.expectedDate));
                  return (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                        line.paid
                          ? "bg-green-50 dark:bg-green-900/15"
                          : isOverdue
                            ? "bg-red-50 dark:bg-red-900/15"
                            : "bg-muted/40",
                      )}
                    >
                      {line.paid ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : isOverdue ? (
                        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium flex-1">{line.label}</span>
                      <span className="font-semibold tabular-nums">
                        €
                        {line.amount.toLocaleString("it-IT", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                      {line.paid && line.paidDate ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                        >
                          Pagato{" "}
                          {format(parseISO(line.paidDate), "d MMM", {
                            locale: it,
                          })}
                        </Badge>
                      ) : line.expectedDate ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5",
                            isOverdue
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {isOverdue ? "Scaduto" : "Scade"}{" "}
                          {format(parseISO(line.expectedDate), "d MMM", {
                            locale: it,
                          })}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 text-muted-foreground"
                        >
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
                    const invOverdue =
                      !["pagata"].includes(inv.stato) &&
                      inv.scadenza &&
                      isPast(parseISO(inv.scadenza));
                    const invPct =
                      inv.totale > 0
                        ? Math.round((inv.pagato / inv.totale) * 100)
                        : 0;
                    return (
                      <div
                        key={inv.id}
                        className={cn(
                          "flex items-center gap-2 rounded px-2 py-1 text-xs",
                          inv.stato === "pagata"
                            ? "bg-green-50/60 dark:bg-green-900/10"
                            : invOverdue
                              ? "bg-red-50/60 dark:bg-red-900/10"
                              : "bg-muted/30",
                        )}
                      >
                        <span className="font-medium">
                          {inv.numero || "Bozza"}
                        </span>
                        {inv.data_emissione && (
                          <span className="text-muted-foreground">
                            {format(parseISO(inv.data_emissione), "d/MM/yy")}
                          </span>
                        )}
                        <span className="ml-auto font-semibold tabular-nums">
                          €
                          {inv.totale.toLocaleString("it-IT", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5",
                            inv.stato === "pagata"
                              ? "text-green-700 border-green-200 dark:text-green-400"
                              : inv.stato === "parzialmente_pagata"
                                ? "text-amber-700 border-amber-200 dark:text-amber-400"
                                : invOverdue
                                  ? "text-red-700 border-red-200 dark:text-red-400"
                                  : "text-muted-foreground",
                          )}
                        >
                          {inv.stato === "pagata"
                            ? `Pagata`
                            : inv.stato === "parzialmente_pagata"
                              ? `${invPct}%`
                              : inv.stato === "emessa" ||
                                  inv.stato === "inviata_sdi" ||
                                  inv.stato === "consegnata"
                                ? "Emessa"
                                : inv.stato === "bozza"
                                  ? "Bozza"
                                  : inv.stato}
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
        <fieldset disabled={!canEdit || isSaving} className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" /> Date della commessa
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Inizio Lavori"
              value={workStartDate}
              onChange={setWorkStartDate}
            />
            <DateField
              label="Fine Lavori"
              value={workEndDate}
              onChange={setWorkEndDate}
            />
            <div className="col-span-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Dalle
                </Label>
                <Input
                  type="time"
                  className="h-9"
                  value={workStartTime}
                  onChange={(e) => setWorkStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Alle
                </Label>
                <Input
                  type="time"
                  className="h-9"
                  value={workEndTime}
                  onChange={(e) => setWorkEndTime(e.target.value)}
                />
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-2 text-xs"
                  onClick={() => {
                    setWorkStartTime("08:00");
                    setWorkEndTime("12:00");
                  }}
                >
                  Mattina
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 px-2 text-xs"
                  onClick={() => {
                    setWorkStartTime("13:00");
                    setWorkEndTime("17:00");
                  }}
                >
                  Pomeriggio
                </Button>
              </div>
            </div>
            <DateField
              label="Data Posa Prevista"
              value={expectedDate}
              onChange={setExpectedDate}
            />
            <DateField
              label="Arrivo Merce"
              value={warehouseArrivalDate}
              onChange={setWarehouseArrivalDate}
            />
          </div>
        </fieldset>

        <Separator />

        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" />
            Risorse della commessa
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {order.order_employees?.map(({ employee }) => (
              <Badge key={employee.id} variant="secondary">
                {employee.first_name} {employee.last_name}
              </Badge>
            ))}
            {order.order_external_teams?.map(({ external_team }) => (
              <Badge key={external_team.id} variant="outline">
                {external_team.name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Persone, squadre e mezzi si assegnano alle fasi della commessa. Il
            calendario utilizza le stesse date e assegnazioni.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link
              to={calendarWorkLocation(order.id)}
              onClick={() => onOpenChange(false)}
            >
              Apri lavorazioni e risorse{" "}
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </Link>
          </Button>
        </div>

        <DialogFooter className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {canEdit ? "Annulla" : "Chiudi"}
          </Button>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva date
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

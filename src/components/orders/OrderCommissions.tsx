import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";

import { format } from "date-fns";
import { it } from "date-fns/locale";
import { UserCheck, Percent, DollarSign, Receipt, CalendarIcon, Check, Loader2, Plus, Trash2, History, MinusCircle, PlusCircle, RotateCcw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { calculateCommissionGross, calculateStoredCommissionNet, type CompensationMode } from "@/lib/commissions";

interface OrderSalesperson {
  id: string;
  salesperson_id: string;
  commission_type: string;
  commission_value: number;
  commission_amount: number;
  deduction_amount: number;
  is_paid: boolean;
  paid_date: string | null;
  payment_expected_date: string | null;
  salesperson: {
    first_name: string;
    last_name: string;
    compensation_mode?: CompensationMode | null;
  };
}

interface CommissionLedgerEntry {
  id: string;
  order_salesperson_id: string;
  entry_type: string;
  amount_delta: number | string;
  balance_after: number | string;
  source: string;
  description: string | null;
  effective_date: string;
  created_at: string;
}

interface OrderCommissionsProps {
  orderId: string;
  totalAmount: number;
  collectedAmount: number;
  vatRate: number;
  readOnly?: boolean;
}

const COMMISSION_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  fixed: { label: "Fisso", icon: <DollarSign className="h-3 w-3" /> },
  percentage_sold: { label: "% sul venduto", icon: <Percent className="h-3 w-3" /> },
  percentage_collected: { label: "% sull'incassato", icon: <Receipt className="h-3 w-3" /> },
};

const COMMISSION_LEDGER_LABELS: Record<string, string> = {
  base: "Base calcolata",
  base_adjustment: "Ricalcolo base",
  deduction: "Decurtazione",
  deduction_adjustment: "Variazione decurtazione",
  payment_marked: "Pagamento segnato",
  payment_reopened: "Pagamento riaperto",
  payment_expected_updated: "Scadenza aggiornata",
  rule_changed: "Regola modificata",
  manual_bonus: "Bonus manuale",
  manual_malus: "Malus manuale",
  manual_adjustment: "Rettifica manuale",
  ai_adjustment: "Rettifica AI",
  system_note: "Nota sistema",
};

function ledgerAmount(entry: CommissionLedgerEntry): number {
  const amount = Number(entry.amount_delta ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function OrderCommissions({
  orderId,
  totalAmount,
  collectedAmount,
  vatRate,
  readOnly = false,
}: OrderCommissionsProps) {

  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const confirm = useConfirm();

  // Dialog state for paid date selection
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [paidDialogSp, setPaidDialogSp] = useState<OrderSalesperson | null>(null);
  const [selectedPaidDate, setSelectedPaidDate] = useState<Date>(new Date());

  // Dialog for adding a new salesperson
  /** Provvigione col form di modifica aperto (null = tutte compatte).
      Il form era SEMPRE aperto: 319px di campi per un solo venditore, su una
      provvigione gia' decisa. Ora si apre solo quando serve davvero. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedSalespersonId, setSelectedSalespersonId] = useState("");

  // Fetch available salespeople for add dialog
  const { data: availableSalespeople = [] } = useQuery({
    queryKey: ["salespeople-active", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salespeople")
        .select("id, first_name, last_name, commission_type, commission_value, compensation_mode")
        .eq("company_id", effectiveCompany!.id)
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data as {
        id: string;
        first_name: string;
        last_name: string;
        commission_type: string;
        commission_value: number;
        compensation_mode?: CompensationMode | null;
      }[];
    },
    enabled: !!effectiveCompany?.id && addDialogOpen,
  });

  const { data: orderSalespeople = [], isLoading } = useQuery({
    queryKey: queryKeys.orderSalespeople.byOrder(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          *,
          salesperson:salespeople(first_name, last_name, compensation_mode)
        `)
        .eq("order_id", orderId);

      if (error) throw error;
      // Difesa: un venditore può essere stato rimosso → il join `salesperson`
      // torna null/undefined. Sostituisco un placeholder così le righe non
      // crashano su sp.salesperson?.first_name (era la causa di "reading 'first_name'").
      return ((data ?? []) as Array<
        Omit<OrderSalesperson, "salesperson"> & { salesperson: OrderSalesperson["salesperson"] | null }
      >).map((row): OrderSalesperson => ({
        ...row,
        salesperson: row.salesperson ?? {
          first_name: "Venditore",
          last_name: "(rimosso)",
          compensation_mode: null,
        },
      }));
    },
    enabled: !!orderId,
  });

  const { data: commissionLedger = [] } = useQuery({
    queryKey: queryKeys.orders.commissionLedger(orderId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_commission_ledger" as never)
        .select("id, order_salesperson_id, entry_type, amount_delta, balance_after, source, description, effective_date, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw error;
      }

      return (data as unknown as CommissionLedgerEntry[]) ?? [];
    },
    enabled: !!orderId,
  });

  const ledgerByOrderSalesperson = useMemo(() => {
    const groups = new Map<string, CommissionLedgerEntry[]>();
    commissionLedger.forEach((entry) => {
      const entries = groups.get(entry.order_salesperson_id) ?? [];
      entries.push(entry);
      groups.set(entry.order_salesperson_id, entries);
    });
    return groups;
  }, [commissionLedger]);

  const calculateCommission = (type: string, value: number, compensationMode?: string | null) => {
    return calculateCommissionGross({
      commissionType: type,
      commissionValue: value,
      compensationMode,
      totalAmount,
      collectedAmount,
    });
  };

  const updateCommissionMutation = useMutation({
    mutationFn: async (data: Partial<OrderSalesperson> & { id: string }) => {
      const { error } = await supabase
        .from("order_salespeople")
        .update({
          commission_type: data.commission_type,
          commission_value: data.commission_value,
          commission_amount: data.commission_amount,
          deduction_amount: data.deduction_amount,
          is_paid: data.is_paid,
          paid_date: data.paid_date,
          payment_expected_date: data.payment_expected_date,
        })
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderSalespeople.byOrder(orderId) });
      queryClient.invalidateQueries({ queryKey: ["oes-salespeople", orderId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.commissionLedger(orderId) });
      toast.success("Provvigione aggiornata", { description: "Le modifiche sono state salvate." });
    },
    onError: () => {
      toast.error("Errore", { description: "Impossibile aggiornare la provvigione." });
    },
  });

  // Add salesperson to order
  const addSalespersonMutation = useMutation({
    mutationFn: async (spId: string) => {
      const sp = availableSalespeople.find(s => s.id === spId);
      if (!sp) throw new Error("Venditore non trovato");
      const commAmount = calculateCommissionGross({
        commissionType: sp.commission_type,
        commissionValue: sp.commission_value,
        compensationMode: sp.compensation_mode,
        totalAmount,
        collectedAmount,
      });
      const { error } = await supabase.from("order_salespeople").insert({
        order_id: orderId,
        salesperson_id: spId,
        commission_type: sp.commission_type,
        commission_value: sp.commission_value,
        commission_amount: commAmount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderSalespeople.byOrder(orderId) });
      queryClient.invalidateQueries({ queryKey: ["oes-salespeople", orderId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.commissionLedger(orderId) });
      toast.success("Commerciale aggiunto");
      setAddDialogOpen(false);
      setSelectedSalespersonId("");
    },
    onError: () => toast.error("Errore nell'aggiunta del commerciale"),
  });

  // Remove salesperson from order
  const removeSalespersonMutation = useMutation({
    mutationFn: async (recordId: string) => {
      const { error } = await supabase.from("order_salespeople").delete().eq("id", recordId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderSalespeople.byOrder(orderId) });
      queryClient.invalidateQueries({ queryKey: ["oes-salespeople", orderId] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.commissionLedger(orderId) });
      toast.success("Commerciale rimosso");
    },
    onError: () => toast.error("Errore nella rimozione del commerciale"),
  });

  // When toggling paid: if turning ON, open dialog; if turning OFF, clear date directly
  const handleTogglePaid = (sp: OrderSalesperson) => {
    if (!sp.is_paid) {
      // Opening dialog to pick paid date
      setPaidDialogSp(sp);
      setSelectedPaidDate(new Date());
      setPaidDialogOpen(true);
    } else {
      // Turning off: clear paid status
      updateCommissionMutation.mutate({
        id: sp.id,
        is_paid: false,
        paid_date: null,
        commission_type: sp.commission_type,
        commission_value: sp.commission_value,
        commission_amount: sp.commission_amount,
        deduction_amount: sp.deduction_amount,
        payment_expected_date: sp.payment_expected_date,
      });
    }
  };

  // Confirm paid date from dialog
  const handleConfirmPaidDate = () => {
    if (!paidDialogSp) return;
    const dateStr = format(selectedPaidDate, "yyyy-MM-dd");
    updateCommissionMutation.mutate({
      id: paidDialogSp.id,
      is_paid: true,
      paid_date: dateStr,
      commission_type: paidDialogSp.commission_type,
      commission_value: paidDialogSp.commission_value,
      commission_amount: paidDialogSp.commission_amount,
      deduction_amount: paidDialogSp.deduction_amount,
      payment_expected_date: paidDialogSp.payment_expected_date,
    });
    setPaidDialogOpen(false);
    setPaidDialogSp(null);
  };

  // Update expected payment date
  const handleUpdateExpectedDate = (sp: OrderSalesperson, date: Date | undefined) => {
    updateCommissionMutation.mutate({
      id: sp.id,
      payment_expected_date: date ? format(date, "yyyy-MM-dd") : null,
      commission_type: sp.commission_type,
      commission_value: sp.commission_value,
      commission_amount: sp.commission_amount,
      deduction_amount: sp.deduction_amount,
      is_paid: sp.is_paid,
      paid_date: sp.paid_date,
    });
  };

  const handleUpdateCommission = (sp: OrderSalesperson, type: string, value: number) => {
    const newAmount = calculateCommission(type, value, sp.salesperson.compensation_mode);
    updateCommissionMutation.mutate({
      id: sp.id,
      commission_type: type,
      commission_value: value,
      commission_amount: newAmount,
      deduction_amount: sp.deduction_amount,
      is_paid: sp.is_paid,
      paid_date: sp.paid_date,
      payment_expected_date: sp.payment_expected_date,
    });
  };

  const handleUpdateDeduction = (sp: OrderSalesperson, deduction: number) => {
    updateCommissionMutation.mutate({
      id: sp.id,
      commission_type: sp.commission_type,
      commission_value: sp.commission_value,
      commission_amount: sp.commission_amount,
      deduction_amount: deduction,
      is_paid: sp.is_paid,
      paid_date: sp.paid_date,
      payment_expected_date: sp.payment_expected_date,
    });
  };

  const totalCommissions = orderSalespeople.reduce((sum, sp) => {
    return sum + calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount);
  }, 0);

  const unpaidCommissions = orderSalespeople
    .filter(sp => !sp.is_paid)
    .reduce((sum, sp) => {
      return sum + calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount);
    }, 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Provvigioni Venditori
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (orderSalespeople.length === 0) {
    return (
      <>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
                <UserCheck className="h-4 w-4" />
                Provvigioni Venditori
              </CardTitle>
              {!readOnly && (
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Aggiungi Commerciale
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Nessun commerciale assegnato a questa commessa.</p>
          </CardContent>
        </Card>
        {renderAddDialog()}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <UserCheck className="h-4 w-4" />
              Provvigioni Venditori
            </CardTitle>
            {!readOnly && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Aggiungi
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderSalespeople.map((sp) => {
            const currentAmount = calculateStoredCommissionNet(sp.commission_amount, sp.deduction_amount);
            const ledgerEntries = ledgerByOrderSalesperson.get(sp.id) ?? [];

            return (
              <div
                key={sp.id}
                className={cn(
                  "p-4 border rounded-lg space-y-3",
                  sp.is_paid && "bg-muted/50"
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">
                      {sp.salesperson?.first_name} {sp.salesperson.last_name}
                    </span>
                    <Badge variant="outline" className="gap-1 text-xs">
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.icon}
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">
                      {formatCurrency(currentAmount)}
                    </span>
                    {!readOnly && (
                      <>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={sp.is_paid}
                            onCheckedChange={() => handleTogglePaid(sp)}
                          />
                          <span className="text-sm text-muted-foreground">
                            {sp.is_paid ? "Pagata" : "Da pagare"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          aria-label={`${editingId === sp.id ? "Chiudi" : "Modifica"} la provvigione di ${sp.salesperson?.first_name} ${sp.salesperson?.last_name}`}
                          onClick={() => setEditingId(editingId === sp.id ? null : sp.id)}
                        >
                          {editingId === sp.id ? "Chiudi" : "Modifica"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                          aria-label={`Rimuovi provvigione di ${sp.salesperson?.first_name} ${sp.salesperson.last_name}`}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Rimuovere il venditore dalla commessa?",
                                description: `La provvigione di ${sp.salesperson?.first_name} ${sp.salesperson.last_name} verrà rimossa da questa commessa.`,
                                confirmLabel: "Rimuovi",
                                variant: "destructive",
                              })
                            ) {
                              removeSalespersonMutation.mutate(sp.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    {readOnly && sp.is_paid && (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        Pagata
                      </Badge>
                    )}
                  </div>
                </div>

                {!readOnly && editingId === sp.id && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Tipo</Label>
                      <Select
                        value={sp.commission_type}
                        onValueChange={(type) =>
                          handleUpdateCommission(sp, type, sp.commission_value)
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Importo Fisso</SelectItem>
                          <SelectItem value="percentage_sold">% sul Venduto</SelectItem>
                          <SelectItem value="percentage_collected">% sull'Incassato</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {sp.commission_type === "fixed" ? "Importo (€)" : "Percentuale (%)"}
                      </Label>
                      <Input
                        type="number"
                        step={sp.commission_type === "fixed" ? "0.01" : "0.1"}
                        value={sp.commission_value}
                        onChange={(e) =>
                          handleUpdateCommission(
                            sp,
                            sp.commission_type,
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Decurtazione (€)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        defaultValue={sp.deduction_amount || 0}
                        onBlur={(e) =>
                          handleUpdateDeduction(sp, parseFloat(e.target.value) || 0)
                        }
                        className="h-8"
                      />
                    </div>
                  </div>
                )}

                {/* Data prevista: visibile solo col form aperto */}
                {!sp.is_paid && !readOnly && editingId === sp.id && (
                  <div className="space-y-2">
                    <Label className="text-xs">Data pagamento prevista</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-8 w-full justify-start text-left font-normal text-sm",
                            !sp.payment_expected_date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-3 w-3" />
                          {sp.payment_expected_date
                            ? format(new Date(sp.payment_expected_date), "d MMMM yyyy", { locale: it })
                            : "Seleziona data prevista"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={sp.payment_expected_date ? new Date(sp.payment_expected_date) : undefined}
                          onSelect={(date) => handleUpdateExpectedDate(sp, date)}
                          autoFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                {!sp.is_paid && readOnly && sp.payment_expected_date && (
                  <p className="text-xs text-muted-foreground">
                    Pagamento previsto il {format(new Date(sp.payment_expected_date), "d MMMM yyyy", { locale: it })}
                  </p>
                )}

                {sp.paid_date && (
                  <p className="text-xs text-muted-foreground">
                    Pagata il {format(new Date(sp.paid_date), "d MMMM yyyy", { locale: it })}
                  </p>
                )}

                {ledgerEntries.length > 0 && (
                  <div className="rounded-md border bg-muted/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <History className="h-3.5 w-3.5" />
                        Movimenti provvigione
                      </div>
                      <Badge variant="secondary" className="text-[11px]">
                        Saldo {formatCurrency(Number(ledgerEntries[0]?.balance_after ?? currentAmount))}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1">
                      {ledgerEntries.slice(0, 4).map((entry) => {
                        const amount = ledgerAmount(entry);
                        const label = entry.description || COMMISSION_LEDGER_LABELS[entry.entry_type] || "Movimento";

                        return (
                          <div key={entry.id} className="flex items-center justify-between gap-3 text-xs">
                            <div className="flex min-w-0 items-center gap-2">
                              {amount > 0 ? (
                                <PlusCircle className="h-3.5 w-3.5 shrink-0 text-green-600" />
                              ) : amount < 0 ? (
                                <MinusCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                              ) : (
                                <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="truncate">{label}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {format(new Date(entry.created_at), "dd/MM HH:mm", { locale: it })}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 font-medium",
                                amount > 0 && "text-green-700",
                                amount < 0 && "text-red-700",
                                amount === 0 && "text-muted-foreground"
                              )}
                            >
                              {amount === 0 ? "evento" : formatCurrency(amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {ledgerEntries.length > 4 && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        +{ledgerEntries.length - 4} movimenti precedenti
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Summary */}
          <div className="pt-4 border-t space-y-2">
            <div className="flex justify-between text-sm">
              <span>Totale Provvigioni{orderSalespeople.some(sp => (sp.deduction_amount || 0) > 0) ? " (netto decurtazioni)" : ""}</span>
              <span className="font-medium">{formatCurrency(totalCommissions)}</span>
            </div>
            {unpaidCommissions > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Da pagare</span>
                <span className="text-destructive">{formatCurrency(unpaidCommissions)}</span>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      {/* Dialog for selecting paid date */}
      <Dialog open={paidDialogOpen} onOpenChange={setPaidDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Data pagamento provvigione</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {paidDialogSp && (
              <p className="text-sm text-muted-foreground">
                Provvigione di{" "}
                <span className="font-medium text-foreground">
                  {paidDialogSp.salesperson.first_name} {paidDialogSp.salesperson.last_name}
                </span>
              </p>
            )}
            <Calendar
              mode="single"
              selected={selectedPaidDate}
              onSelect={(date) => date && setSelectedPaidDate(date)}
              autoFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleConfirmPaidDate}>
              Conferma pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {renderAddDialog()}
    </>
  );

  function renderAddDialog() {
    const alreadyAssignedIds = orderSalespeople.map(sp => sp.salesperson_id);
    const unassigned = availableSalespeople.filter(s => !alreadyAssignedIds.includes(s.id));
    return (
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Commerciale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tutti i commerciali sono già assegnati a questa commessa.</p>
            ) : (
              <Select value={selectedSalespersonId} onValueChange={setSelectedSalespersonId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona commerciale" />
                </SelectTrigger>
                <SelectContent>
                  {unassigned.map(sp => (
                    <SelectItem key={sp.id} value={sp.id}>
                      {sp.first_name} {sp.last_name}
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({sp.compensation_mode === "fixed_only"
                          ? "solo fisso"
                          : sp.commission_type === "fixed"
                            ? formatCurrency(sp.commission_value)
                            : `${sp.commission_value}%`})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); setSelectedSalespersonId(""); }}>
              Annulla
            </Button>
            <Button
              disabled={!selectedSalespersonId || addSalespersonMutation.isPending}
              onClick={() => addSalespersonMutation.mutate(selectedSalespersonId)}
            >
              {addSalespersonMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
}

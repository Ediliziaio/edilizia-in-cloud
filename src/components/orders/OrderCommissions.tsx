import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/formatters";

import { format } from "date-fns";
import { it } from "date-fns/locale";
import { UserCheck, Percent, DollarSign, Receipt, CalendarIcon, Check, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Separator } from "@/components/ui/separator";

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
  };
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

export function OrderCommissions({
  orderId,
  totalAmount,
  collectedAmount,
  vatRate,
  readOnly = false,
}: OrderCommissionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog state for paid date selection
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [paidDialogSp, setPaidDialogSp] = useState<OrderSalesperson | null>(null);
  const [selectedPaidDate, setSelectedPaidDate] = useState<Date>(new Date());

  const { data: orderSalespeople = [], isLoading } = useQuery({
    queryKey: ["order-salespeople", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_salespeople")
        .select(`
          *,
          salesperson:salespeople(first_name, last_name)
        `)
        .eq("order_id", orderId);

      if (error) throw error;
      return data as OrderSalesperson[];
    },
    enabled: !!orderId,
  });

  // totalAmount and collectedAmount are already net (imponibile), no need to strip VAT again
  const calculateCommission = (type: string, value: number) => {
    switch (type) {
      case "fixed":
        return value;
      case "percentage_sold":
        return totalAmount * (value / 100);
      case "percentage_collected":
        return collectedAmount * (value / 100);
      default:
        return 0;
    }
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
      queryClient.invalidateQueries({ queryKey: ["order-salespeople", orderId] });
      toast({
        title: "Provvigione aggiornata",
        description: "Le modifiche sono state salvate.",
      });
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare la provvigione.",
        variant: "destructive",
      });
    },
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
    const newAmount = calculateCommission(type, value);
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
    const gross = calculateCommission(sp.commission_type, sp.commission_value);
    return sum + (gross - (sp.deduction_amount || 0));
  }, 0);

  const unpaidCommissions = orderSalespeople
    .filter(sp => !sp.is_paid)
    .reduce((sum, sp) => {
      const gross = calculateCommission(sp.commission_type, sp.commission_value);
      return sum + (gross - (sp.deduction_amount || 0));
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
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Provvigioni Venditori
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderSalespeople.map((sp) => {
            const grossAmount = calculateCommission(sp.commission_type, sp.commission_value);
            const deduction = sp.deduction_amount || 0;
            const currentAmount = grossAmount - deduction;

            return (
              <div
                key={sp.id}
                className={cn(
                  "p-4 border rounded-lg space-y-3",
                  sp.is_paid && "bg-muted/50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {sp.salesperson.first_name} {sp.salesperson.last_name}
                    </span>
                    <Badge variant="outline" className="gap-1">
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.icon}
                      {COMMISSION_TYPE_LABELS[sp.commission_type]?.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold">
                      {formatCurrency(currentAmount)}
                    </span>
                    {!readOnly && (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={sp.is_paid}
                          onCheckedChange={() => handleTogglePaid(sp)}
                        />
                        <span className="text-sm text-muted-foreground">
                          {sp.is_paid ? "Pagata" : "Da pagare"}
                        </span>
                      </div>
                    )}
                    {readOnly && sp.is_paid && (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="h-3 w-3" />
                        Pagata
                      </Badge>
                    )}
                  </div>
                </div>

                {!readOnly && (
                  <div className="grid grid-cols-3 gap-4">
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

                {/* Expected payment date for unpaid commissions */}
                {!sp.is_paid && !readOnly && (
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
                          initialFocus
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

          {/* Decurtazioni dall'ordine */}
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Decurtazioni dall'ordine
            </p>
            <div className="flex justify-between text-sm">
              <span>Imponibile vendita (netto IVA)</span>
              <span>{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm text-destructive">
              <span>Totale provvigioni</span>
              <span>- {formatCurrency(totalCommissions)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-sm font-semibold">
              <span>Netto dopo provvigioni</span>
              <span>{formatCurrency(totalAmount - totalCommissions)}</span>
            </div>
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
              initialFocus
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
    </>
  );
}

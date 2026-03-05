import React, { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, CalendarIcon, Check, Clock, Building2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { Installment } from "@/lib/orderUtils";

export type PaymentType = 'standard' | 'financing';
export type AmountInputMode = 'net' | 'gross';

// ── DatePickerField ─────────────────────────────────────────────
const DatePickerField = React.forwardRef<HTMLDivElement, {
  label: string;
  date?: Date;
  onDateChange: (date?: Date) => void;
  disabled?: boolean;
}>(({ label, date, onDateChange, disabled = false }, ref) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "justify-start text-left font-normal h-8 text-xs",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-1 h-3 w-3" />
          {date ? format(date, "dd/MM/yyyy", { locale: it }) : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
});
DatePickerField.displayName = "DatePickerField";

// ── PaymentStatusRow ────────────────────────────────────────────
type PaymentStatus = 'non_pagato' | 'pagato';

const PaymentStatusRow = React.forwardRef<HTMLDivElement, {
  label: string;
  amount: number;
  paid?: boolean;
  paidDate?: Date;
  expectedDate?: Date;
  onPaidChange?: (paid: boolean) => void;
  onPaidDateChange?: (date?: Date) => void;
  onExpectedDateChange?: (date?: Date) => void;
  readOnly?: boolean;
}>(({ label, amount, paid, paidDate, expectedDate, onPaidChange, onPaidDateChange, onExpectedDateChange, readOnly = false }, ref) => {
  if (amount <= 0) return null;

  const status: PaymentStatus = paid ? 'pagato' : 'non_pagato';

  const handleStatusChange = (newStatus: PaymentStatus) => {
    onPaidChange?.(newStatus === 'pagato');
    if (newStatus === 'pagato') {
      onExpectedDateChange?.(undefined);
    } else {
      onPaidDateChange?.(undefined);
    }
  };

  return (
    <div ref={ref} className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border">
      <div className="flex justify-between items-center">
        <span className="font-medium">{label}</span>
        <span className="font-semibold">{formatCurrency(amount)}</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Stato:</Label>
          <Select
            value={status}
            onValueChange={handleStatusChange}
            disabled={readOnly}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non_pagato">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                  Non Pagato
                </span>
              </SelectItem>
              <SelectItem value="pagato">
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-500" />
                  Pagato
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {paid ? (
          <DatePickerField
            label="Data incasso"
            date={paidDate}
            onDateChange={onPaidDateChange || (() => {})}
            disabled={readOnly}
          />
        ) : (
          <DatePickerField
            label="Data prevista"
            date={expectedDate}
            onDateChange={onExpectedDateChange || (() => {})}
            disabled={readOnly}
          />
        )}
      </div>
    </div>
  );
});
PaymentStatusRow.displayName = "PaymentStatusRow";

// ── FinancialSummary (editable) ─────────────────────────────────

interface FinancialSummaryProps {
  totalAmount: string;
  vatRate: string;
  paymentType: PaymentType;
  installments: Installment[];
  onInstallmentsChange: (installments: Installment[]) => void;
  numInstallments: number;
  onNumInstallmentsChange: (num: number) => void;
  onTotalAmountChange: (value: string) => void;
  onVatRateChange: (value: string) => void;
  onPaymentTypeChange: (value: PaymentType) => void;
  balance: number;
  readOnly?: boolean;
  hasBuildingBonus?: boolean;
  onHasBuildingBonusChange?: (value: boolean) => void;
  financingCost?: string;
  onFinancingCostChange?: (value: string) => void;
}

export function FinancialSummary({
  totalAmount, vatRate, paymentType,
  installments, onInstallmentsChange,
  numInstallments, onNumInstallmentsChange,
  onTotalAmountChange, onVatRateChange, onPaymentTypeChange,
  balance, readOnly = false,
  hasBuildingBonus, onHasBuildingBonusChange,
  financingCost, onFinancingCostChange,
}: FinancialSummaryProps) {
  const [inputMode, setInputMode] = useState<AmountInputMode>('net');
  const [rawTotalInput, setRawTotalInput] = useState(totalAmount);
  const [rawFinancingCostInput, setRawFinancingCostInput] = useState(financingCost || "");
  const [rawAmountInputs, setRawAmountInputs] = useState<Record<number, string>>({});

  const vat = parseFloat(vatRate) || 22;
  const total = parseFloat(totalAmount) || 0;
  const vatAmount = total * (vat / 100);
  const totalWithVat = total + vatAmount;

  // Sync raw total input
  useEffect(() => {
    if (inputMode === 'gross') {
      setRawTotalInput(totalWithVat > 0 ? totalWithVat.toFixed(2) : "");
    } else {
      setRawTotalInput(totalAmount);
    }
  }, [totalAmount, inputMode, totalWithVat]);

  // Sync raw amount inputs when installments structure changes
  useEffect(() => {
    const newRaw: Record<number, string> = {};
    installments.forEach(i => {
      if (i.type !== 'balance') {
        newRaw[i.position] = i.amount > 0 ? i.amount.toString() : "";
      }
    });
    setRawAmountInputs(newRaw);
  }, [installments]);

  useEffect(() => {
    setRawFinancingCostInput(financingCost || "");
  }, [financingCost]);

  // Input mode handlers
  const handleInputModeChange = (mode: AmountInputMode) => {
    setInputMode(mode);
    if (mode === 'gross') {
      setRawTotalInput(totalWithVat > 0 ? totalWithVat.toFixed(2) : "");
    } else {
      setRawTotalInput(totalAmount);
    }
  };

  const handleTotalBlur = () => {
    if (inputMode === 'gross') {
      const grossAmount = parseFloat(rawTotalInput) || 0;
      const netAmount = grossAmount / (1 + vat / 100);
      onTotalAmountChange(netAmount > 0 ? netAmount.toFixed(2) : "");
    } else {
      onTotalAmountChange(rawTotalInput);
    }
  };

  const handleVatRateChange = (newRate: string) => {
    onVatRateChange(newRate);
    if (inputMode === 'gross' && rawTotalInput) {
      const newVat = parseFloat(newRate) || 22;
      const newGross = total * (1 + newVat / 100);
      setRawTotalInput(newGross > 0 ? newGross.toFixed(2) : "");
    }
  };

  // Installment handlers
  const handleInstallmentAmountBlur = (position: number) => {
    const raw = rawAmountInputs[position] || "";
    const val = parseFloat(raw) || 0;
    const updated = installments.map(i =>
      i.position === position ? { ...i, amount: val } : i
    );
    onInstallmentsChange(updated);
  };

  const handleInstallmentPaidChange = (position: number, paid: boolean) => {
    const updated = installments.map(i =>
      i.position === position ? {
        ...i,
        is_paid: paid,
        paid_date: paid ? new Date().toISOString().split('T')[0] : null,
        expected_date: paid ? null : i.expected_date,
      } : i
    );
    onInstallmentsChange(updated);
  };

  const handleInstallmentDateChange = (position: number, field: 'paid_date' | 'expected_date', date?: Date) => {
    const updated = installments.map(i =>
      i.position === position ? {
        ...i,
        [field]: date ? date.toISOString().split('T')[0] : null,
      } : i
    );
    onInstallmentsChange(updated);
  };

  // Render an installment amount input + payment status
  const renderInstallmentInput = (inst: Installment, labelOverride?: string) => (
    <div key={inst.position} className="space-y-2">
      <Label>{labelOverride || inst.label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
        <Input
          type="number" min="0" step="0.01"
          value={rawAmountInputs[inst.position] ?? ""}
          onChange={(e) => setRawAmountInputs(prev => ({ ...prev, [inst.position]: e.target.value }))}
          onBlur={() => handleInstallmentAmountBlur(inst.position)}
          className="pl-8" placeholder="0.00"
          disabled={readOnly}
        />
      </div>
      {inst.amount > 0 && (
        <PaymentStatusRow
          label={`Stato ${inst.label}`}
          amount={inst.amount}
          paid={inst.is_paid}
          paidDate={inst.paid_date ? new Date(inst.paid_date) : undefined}
          expectedDate={inst.expected_date ? new Date(inst.expected_date) : undefined}
          onPaidChange={(paid) => handleInstallmentPaidChange(inst.position, paid)}
          onPaidDateChange={(date) => handleInstallmentDateChange(inst.position, 'paid_date', date)}
          onExpectedDateChange={(date) => handleInstallmentDateChange(inst.position, 'expected_date', date)}
          readOnly={readOnly}
        />
      )}
    </div>
  );

  // Render balance section
  const renderBalance = (labelText: string) => {
    const balanceInst = installments.find(i => i.type === 'balance');
    return (
      <div className="pt-4 border-t space-y-3">
        <div className="flex justify-between items-center text-lg font-semibold">
          <span>{labelText}</span>
          <span>{formatCurrency(balance)}</span>
        </div>
        {balance > 0 && balanceInst && (
          <PaymentStatusRow
            label="Stato Saldo"
            amount={balance}
            paid={balanceInst.is_paid}
            paidDate={balanceInst.paid_date ? new Date(balanceInst.paid_date) : undefined}
            expectedDate={balanceInst.expected_date ? new Date(balanceInst.expected_date) : undefined}
            onPaidChange={(paid) => handleInstallmentPaidChange(balanceInst.position, paid)}
            onPaidDateChange={(date) => handleInstallmentDateChange(balanceInst.position, 'paid_date', date)}
            onExpectedDateChange={(date) => handleInstallmentDateChange(balanceInst.position, 'expected_date', date)}
            readOnly={readOnly}
          />
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Euro className="h-5 w-5" />
          Riepilogo Finanziario
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment Type */}
        <div className="space-y-2">
          <Label>Tipo Pagamento</Label>
          <Select
            value={paymentType}
            onValueChange={(value: PaymentType) => onPaymentTypeChange(value)}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (Acconti)</SelectItem>
              <SelectItem value="financing">Finanziamento</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Amount Input Mode Toggle */}
        {!readOnly && (
          <Tabs value={inputMode} onValueChange={(v) => handleInputModeChange(v as AmountInputMode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="net">Imponibile</TabsTrigger>
              <TabsTrigger value="gross">IVA Inclusa</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* Total Amount */}
        <div className="space-y-2">
          <Label htmlFor="total">
            {inputMode === 'gross' ? 'Importo Totale (IVA Inclusa)' : 'Importo Totale (Imponibile)'} *
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
            <Input
              id="total"
              type="number" min="0" step="0.01"
              value={rawTotalInput}
              onChange={(e) => setRawTotalInput(e.target.value)}
              onBlur={handleTotalBlur}
              className="pl-8" placeholder="0.00"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* VAT Rate */}
        <div className="space-y-2">
          <Label>Aliquota IVA</Label>
          <Select value={vatRate} onValueChange={handleVatRateChange} disabled={readOnly}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4%</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="22">22%</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Building Bonus Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="building-bonus" className="cursor-pointer">Bonus Edilizio</Label>
          </div>
          <Switch
            id="building-bonus"
            checked={hasBuildingBonus || false}
            onCheckedChange={onHasBuildingBonusChange}
            disabled={readOnly}
          />
        </div>

        {/* VAT Summary */}
        <div className="p-3 rounded-lg bg-muted/50 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Imponibile</span>
            <span>{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>IVA ({vat}%)</span>
            <span>{formatCurrency(vatAmount)}</span>
          </div>
          <div className="flex justify-between font-medium border-t pt-2">
            <span>Totale con IVA</span>
            <span>{formatCurrency(totalWithVat)}</span>
          </div>
          {hasBuildingBonus && (() => {
            const bankTaxableBase = totalWithVat / 1.22;
            const bankWithholding = bankTaxableBase * 0.11;
            return (
              <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Ritenuta Bonus Edilizio
                </p>
                <div className="flex justify-between text-xs">
                  <span className="text-amber-700 dark:text-amber-300">Imponibile bancario (÷ 1.22)</span>
                  <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankTaxableBase)}</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-amber-700 dark:text-amber-300">Ritenuta 11%</span>
                  <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankWithholding)}</span>
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  Importo trattenuto dalla banca — recuperabile in dichiarazione
                </p>
              </div>
            );
          })()}
        </div>

        {paymentType === 'standard' ? (
          <>
            {/* Number of installments selector */}
            {!readOnly && (
              <div className="space-y-2">
                <Label>Numero Rate</Label>
                <Select
                  value={numInstallments.toString()}
                  onValueChange={(v) => onNumInstallmentsChange(parseInt(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n} rate ({n - 1} {n - 1 === 1 ? 'Acconto' : 'Acconti'} + Saldo)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Deposit installments */}
            {installments.filter(i => i.type === 'deposit').map(inst => renderInstallmentInput(inst))}

            {/* Balance */}
            {renderBalance("Saldo da Pagare")}
          </>
        ) : (
          <>
            {/* Number of deposits selector for financing */}
            {!readOnly && (
              <div className="space-y-2">
                <Label>Numero Acconti</Label>
                <Select
                  value={(numInstallments - 2).toString()}
                  onValueChange={(v) => onNumInstallmentsChange(parseInt(v) + 2)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3, 4, 5].map(n => (
                      <SelectItem key={n} value={n.toString()}>
                        {n === 0 ? 'Nessun acconto' : `${n} Accont${n === 1 ? 'o' : 'i'}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Deposit installments (if any) */}
            {installments.filter(i => i.type === 'deposit').map(inst =>
              renderInstallmentInput(inst, inst.label + ' (opzionale)')
            )}

            {/* Financing amount */}
            {(() => {
              const finInst = installments.find(i => i.type === 'financing');
              return finInst ? renderInstallmentInput(finInst, 'Valore Finanziamento') : null;
            })()}

            {/* Financing Cost */}
            <div className="space-y-2">
              <Label htmlFor="financing-cost">Costo Finanziaria</Label>
              <p className="text-xs text-muted-foreground">Commissione da versare alla finanziaria (es. tasso zero)</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  id="financing-cost"
                  type="number" min="0" step="0.01"
                  value={rawFinancingCostInput}
                  onChange={(e) => setRawFinancingCostInput(e.target.value)}
                  onBlur={() => onFinancingCostChange?.(rawFinancingCostInput)}
                  className="pl-8" placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Balance */}
            {renderBalance("Saldo Cliente")}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── FinancialSummaryReadOnly ────────────────────────────────────

interface FinancialSummaryReadOnlyProps {
  totalAmount: number;
  vatRate?: number;
  paymentType: PaymentType;
  installments: Installment[];
  hasBuildingBonus?: boolean;
  financingCost?: number;
  onInstallmentPaidToggle?: (installment: Installment, paid: boolean) => void;
}

export function FinancialSummaryReadOnly({
  totalAmount,
  vatRate = 22,
  paymentType,
  installments,
  hasBuildingBonus,
  financingCost,
  onInstallmentPaidToggle,
}: FinancialSummaryReadOnlyProps) {
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;

  const nonBalanceSum = installments
    .filter(i => i.type !== 'balance')
    .reduce((sum, i) => sum + i.amount, 0);
  const balanceAmount = Math.max(0, totalWithVat - nonBalanceSum);

  const formatPaymentDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: it });
  };

  const renderPaymentRow = (inst: Installment, displayAmount?: number) => {
    const amount = displayAmount ?? inst.amount;
    if (amount <= 0 && inst.type !== 'balance') return null;

    return (
      <div key={inst.position} className="p-3 rounded-lg bg-muted/30 space-y-1">
        <div className={cn("flex justify-between", inst.type === 'balance' && "pt-2 border-t")}>
          <span className={inst.type === 'balance' ? "font-medium" : "text-muted-foreground"}>
            {inst.label}
          </span>
          <span className={inst.type === 'balance' ? "font-bold text-lg" : "text-primary font-medium"}>
            {formatCurrency(amount)}
          </span>
        </div>
        {amount > 0 && (
          <div className="flex items-center justify-between text-xs">
            {inst.is_paid ? (
              <span className="flex items-center gap-1 text-green-600">
                <Check className="h-3 w-3" />
                {inst.type === 'financing' ? 'Incassato' : 'Pagato'} {inst.paid_date && `il ${formatPaymentDate(inst.paid_date)}`}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <Clock className="h-3 w-3" />
                In attesa {inst.expected_date && `- Previsto ${formatPaymentDate(inst.expected_date)}`}
              </span>
            )}
            {onInstallmentPaidToggle && (
              <Switch
                checked={!!inst.is_paid}
                onCheckedChange={(paid) => onInstallmentPaidToggle(inst, paid)}
                className="scale-75"
              />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Euro className="h-5 w-5" />
          Riepilogo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Imponibile</span>
          <span className="font-medium">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">IVA ({vatRate}%)</span>
          <span>{formatCurrency(vatAmount)}</span>
        </div>
        <div className="flex justify-between text-primary font-medium">
          <span>Totale con IVA</span>
          <span>{formatCurrency(totalWithVat)}</span>
        </div>
        {hasBuildingBonus && (() => {
          const bankTaxableBase = totalWithVat / 1.22;
          const bankWithholding = bankTaxableBase * 0.11;
          return (
            <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200 flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Ritenuta Bonus Edilizio
              </p>
              <div className="flex justify-between text-xs">
                <span className="text-amber-700 dark:text-amber-300">Imponibile bancario (÷ 1.22)</span>
                <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankTaxableBase)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-amber-700 dark:text-amber-300">Ritenuta 11%</span>
                <span className="text-amber-800 dark:text-amber-200">{formatCurrency(bankWithholding)}</span>
              </div>
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Importo trattenuto dalla banca — recuperabile in dichiarazione
              </p>
            </div>
          );
        })()}

        <div className="pt-3 border-t space-y-3">
          {/* Deposit installments */}
          {installments.filter(i => i.type === 'deposit').map(inst => renderPaymentRow(inst))}

          {/* Financing (if applicable) */}
          {paymentType === 'financing' && (() => {
            const finInst = installments.find(i => i.type === 'financing');
            return finInst ? renderPaymentRow(finInst) : null;
          })()}

          {/* Financing cost */}
          {paymentType === 'financing' && (financingCost || 0) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Costo Finanziaria</span>
              <span className="text-destructive font-medium">- {formatCurrency(financingCost || 0)}</span>
            </div>
          )}

          {/* Balance */}
          {(() => {
            const balanceInst = installments.find(i => i.type === 'balance');
            return balanceInst ? renderPaymentRow(balanceInst, balanceAmount) : null;
          })()}
        </div>
      </CardContent>
    </Card>
  );
}

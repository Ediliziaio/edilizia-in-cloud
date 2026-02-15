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
import { Euro, CalendarIcon, Check, Clock } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export type PaymentType = 'standard' | 'financing';
export type AmountInputMode = 'net' | 'gross';
type PaymentStatus = 'non_pagato' | 'pagato';

interface PaymentStatusProps {
  depositPaid?: boolean;
  depositPaidDate?: Date;
  depositExpectedDate?: Date;
  deposit2Paid?: boolean;
  deposit2PaidDate?: Date;
  deposit2ExpectedDate?: Date;
  balancePaid?: boolean;
  balancePaidDate?: Date;
  balanceExpectedDate?: Date;
  onDepositPaidChange?: (paid: boolean) => void;
  onDepositPaidDateChange?: (date?: Date) => void;
  onDepositExpectedDateChange?: (date?: Date) => void;
  onDeposit2PaidChange?: (paid: boolean) => void;
  onDeposit2PaidDateChange?: (date?: Date) => void;
  onDeposit2ExpectedDateChange?: (date?: Date) => void;
  onBalancePaidChange?: (paid: boolean) => void;
  onBalancePaidDateChange?: (date?: Date) => void;
  onBalanceExpectedDateChange?: (date?: Date) => void;
  // Financing payment status
  financingPaid?: boolean;
  financingPaidDate?: Date;
  financingExpectedDate?: Date;
  financingCost?: string;
  onFinancingPaidChange?: (paid: boolean) => void;
  onFinancingPaidDateChange?: (date?: Date) => void;
  onFinancingExpectedDateChange?: (date?: Date) => void;
  onFinancingCostChange?: (value: string) => void;
}

interface FinancialSummaryProps extends PaymentStatusProps {
  totalAmount: string;
  depositAmount: string;
  deposit2Amount: string;
  financingAmount: string;
  paymentType: PaymentType;
  vatRate: string;
  onTotalAmountChange: (value: string) => void;
  onDepositAmountChange: (value: string) => void;
  onDeposit2AmountChange: (value: string) => void;
  onFinancingAmountChange: (value: string) => void;
  onPaymentTypeChange: (value: PaymentType) => void;
  onVatRateChange: (value: string) => void;
  balance: number;
  readOnly?: boolean;
}

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

export function FinancialSummary({
  totalAmount,
  depositAmount,
  deposit2Amount,
  financingAmount,
  paymentType,
  vatRate,
  onTotalAmountChange,
  onDepositAmountChange,
  onDeposit2AmountChange,
  onFinancingAmountChange,
  onPaymentTypeChange,
  onVatRateChange,
  balance,
  readOnly = false,
  // Payment status props
  depositPaid,
  depositPaidDate,
  depositExpectedDate,
  deposit2Paid,
  deposit2PaidDate,
  deposit2ExpectedDate,
  balancePaid,
  balancePaidDate,
  balanceExpectedDate,
  onDepositPaidChange,
  onDepositPaidDateChange,
  onDepositExpectedDateChange,
  onDeposit2PaidChange,
  onDeposit2PaidDateChange,
  onDeposit2ExpectedDateChange,
  onBalancePaidChange,
  onBalancePaidDateChange,
  onBalanceExpectedDateChange,
  // Financing payment status
  financingPaid,
  financingPaidDate,
  financingExpectedDate,
  financingCost,
  onFinancingPaidChange,
  onFinancingPaidDateChange,
  onFinancingExpectedDateChange,
  onFinancingCostChange,
}: FinancialSummaryProps) {
  const [inputMode, setInputMode] = useState<AmountInputMode>('net');
  
  // Local state for raw input - this allows user to type freely
  const [rawTotalInput, setRawTotalInput] = useState(totalAmount);
  const [rawDepositInput, setRawDepositInput] = useState(depositAmount);
  const [rawDeposit2Input, setRawDeposit2Input] = useState(deposit2Amount);
  const [rawFinancingInput, setRawFinancingInput] = useState(financingAmount);
  const [rawFinancingCostInput, setRawFinancingCostInput] = useState(financingCost || "");
  
  const vat = parseFloat(vatRate) || 22;
  const total = parseFloat(totalAmount) || 0;
  const vatAmount = total * (vat / 100);
  const totalWithVat = total + vatAmount;

  // Sync local state when prop changes externally (e.g., initial load)
  useEffect(() => {
    if (inputMode === 'gross') {
      setRawTotalInput(totalWithVat > 0 ? totalWithVat.toFixed(2) : "");
    } else {
      setRawTotalInput(totalAmount);
    }
  }, [totalAmount, inputMode, totalWithVat]);

  useEffect(() => {
    setRawDepositInput(depositAmount);
  }, [depositAmount]);

  useEffect(() => {
    setRawDeposit2Input(deposit2Amount);
  }, [deposit2Amount]);

  useEffect(() => {
    setRawFinancingInput(financingAmount);
  }, [financingAmount]);

  useEffect(() => {
    setRawFinancingCostInput(financingCost || "");
  }, [financingCost]);

  // Handle input mode change
  const handleInputModeChange = (mode: AmountInputMode) => {
    setInputMode(mode);
    if (mode === 'gross') {
      setRawTotalInput(totalWithVat > 0 ? totalWithVat.toFixed(2) : "");
    } else {
      setRawTotalInput(totalAmount);
    }
  };

  // Handle total amount blur - sync with parent
  const handleTotalBlur = () => {
    const value = rawTotalInput;
    if (inputMode === 'gross') {
      const grossAmount = parseFloat(value) || 0;
      const netAmount = grossAmount / (1 + vat / 100);
      onTotalAmountChange(netAmount > 0 ? netAmount.toFixed(2) : "");
    } else {
      onTotalAmountChange(value);
    }
  };

  // Handle VAT rate change - recalculate display if in gross mode
  const handleVatRateChange = (newRate: string) => {
    onVatRateChange(newRate);
    if (inputMode === 'gross' && rawTotalInput) {
      const newVat = parseFloat(newRate) || 22;
      const newGross = total * (1 + newVat / 100);
      setRawTotalInput(newGross > 0 ? newGross.toFixed(2) : "");
    }
  };

  const handleDepositBlur = () => {
    onDepositAmountChange(rawDepositInput);
  };

  const handleDeposit2Blur = () => {
    onDeposit2AmountChange(rawDeposit2Input);
  };

  const handleFinancingBlur = () => {
    onFinancingAmountChange(rawFinancingInput);
  };

  const handleFinancingCostBlur = () => {
    onFinancingCostChange?.(rawFinancingCostInput);
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
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              €
            </span>
            <Input
              id="total"
              type="number"
              min="0"
              step="0.01"
              value={rawTotalInput}
              onChange={(e) => setRawTotalInput(e.target.value)}
              onBlur={handleTotalBlur}
              className="pl-8"
              placeholder="0.00"
              disabled={readOnly}
            />
          </div>
        </div>

        {/* VAT Rate */}
        <div className="space-y-2">
          <Label>Aliquota IVA</Label>
          <Select
            value={vatRate}
            onValueChange={handleVatRateChange}
            disabled={readOnly}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4%</SelectItem>
              <SelectItem value="10">10%</SelectItem>
              <SelectItem value="22">22%</SelectItem>
            </SelectContent>
          </Select>
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
        </div>

        {paymentType === 'standard' ? (
          <>
            {/* Deposit 1 */}
            <div className="space-y-2">
              <Label htmlFor="deposit">Acconto 1</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
                <Input
                  id="deposit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rawDepositInput}
                  onChange={(e) => setRawDepositInput(e.target.value)}
                  onBlur={handleDepositBlur}
                  className="pl-8"
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
              {(parseFloat(depositAmount) || 0) > 0 && (
                <PaymentStatusRow
                  label="Stato Acconto 1"
                  amount={parseFloat(depositAmount) || 0}
                  paid={depositPaid}
                  paidDate={depositPaidDate}
                  expectedDate={depositExpectedDate}
                  onPaidChange={onDepositPaidChange}
                  onPaidDateChange={onDepositPaidDateChange}
                  onExpectedDateChange={onDepositExpectedDateChange}
                  readOnly={readOnly}
                />
              )}
            </div>

            {/* Deposit 2 */}
            <div className="space-y-2">
              <Label htmlFor="deposit2">Acconto 2</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
                <Input
                  id="deposit2"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rawDeposit2Input}
                  onChange={(e) => setRawDeposit2Input(e.target.value)}
                  onBlur={handleDeposit2Blur}
                  className="pl-8"
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
              {(parseFloat(deposit2Amount) || 0) > 0 && (
                <PaymentStatusRow
                  label="Stato Acconto 2"
                  amount={parseFloat(deposit2Amount) || 0}
                  paid={deposit2Paid}
                  paidDate={deposit2PaidDate}
                  expectedDate={deposit2ExpectedDate}
                  onPaidChange={onDeposit2PaidChange}
                  onPaidDateChange={onDeposit2PaidDateChange}
                  onExpectedDateChange={onDeposit2ExpectedDateChange}
                  readOnly={readOnly}
                />
              )}
            </div>

            {/* Balance */}
            <div className="pt-4 border-t space-y-3">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Saldo da Pagare</span>
                <span>{formatCurrency(balance)}</span>
              </div>
              {balance > 0 && (
                <PaymentStatusRow
                  label="Stato Saldo"
                  amount={balance}
                  paid={balancePaid}
                  paidDate={balancePaidDate}
                  expectedDate={balanceExpectedDate}
                  onPaidChange={onBalancePaidChange}
                  onPaidDateChange={onBalancePaidDateChange}
                  onExpectedDateChange={onBalanceExpectedDateChange}
                  readOnly={readOnly}
                />
              )}
            </div>
          </>
        ) : (
          <>
            {/* Deposit for financing (optional) */}
            <div className="space-y-2">
              <Label htmlFor="deposit-financing">Acconto (opzionale)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
                <Input
                  id="deposit-financing"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rawDepositInput}
                  onChange={(e) => setRawDepositInput(e.target.value)}
                  onBlur={handleDepositBlur}
                  className="pl-8"
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
              {(parseFloat(depositAmount) || 0) > 0 && (
                <PaymentStatusRow
                  label="Stato Acconto"
                  amount={parseFloat(depositAmount) || 0}
                  paid={depositPaid}
                  paidDate={depositPaidDate}
                  expectedDate={depositExpectedDate}
                  onPaidChange={onDepositPaidChange}
                  onPaidDateChange={onDepositPaidDateChange}
                  onExpectedDateChange={onDepositExpectedDateChange}
                  readOnly={readOnly}
                />
              )}
            </div>

            {/* Financing Amount */}
            <div className="space-y-2">
              <Label htmlFor="financing">Valore Finanziamento</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
                <Input
                  id="financing"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rawFinancingInput}
                  onChange={(e) => setRawFinancingInput(e.target.value)}
                  onBlur={handleFinancingBlur}
                  className="pl-8"
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
              {(parseFloat(financingAmount) || 0) > 0 && (
                <PaymentStatusRow
                  label="Incasso Finanziamento"
                  amount={parseFloat(financingAmount) || 0}
                  paid={financingPaid}
                  paidDate={financingPaidDate}
                  expectedDate={financingExpectedDate}
                  onPaidChange={onFinancingPaidChange}
                  onPaidDateChange={onFinancingPaidDateChange}
                  onExpectedDateChange={onFinancingExpectedDateChange}
                  readOnly={readOnly}
                />
              )}
            </div>

            {/* Financing Cost */}
            <div className="space-y-2">
              <Label htmlFor="financing-cost">Costo Finanziaria</Label>
              <p className="text-xs text-muted-foreground">Commissione da versare alla finanziaria (es. tasso zero)</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  €
                </span>
                <Input
                  id="financing-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rawFinancingCostInput}
                  onChange={(e) => setRawFinancingCostInput(e.target.value)}
                  onBlur={handleFinancingCostBlur}
                  className="pl-8"
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Balance */}
            <div className="pt-4 border-t space-y-3">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Saldo Cliente</span>
                <span>{formatCurrency(balance)}</span>
              </div>
              {balance > 0 && (
                <PaymentStatusRow
                  label="Stato Saldo"
                  amount={balance}
                  paid={balancePaid}
                  paidDate={balancePaidDate}
                  expectedDate={balanceExpectedDate}
                  onPaidChange={onBalancePaidChange}
                  onPaidDateChange={onBalancePaidDateChange}
                  onExpectedDateChange={onBalanceExpectedDateChange}
                  readOnly={readOnly}
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Read-only version for detail views
interface FinancialSummaryReadOnlyProps {
  totalAmount: number;
  depositAmount: number;
  deposit2Amount: number;
  financingAmount: number;
  paymentType: PaymentType;
  balanceAmount: number;
  vatRate?: number;
  depositPaid?: boolean;
  depositPaidDate?: string | null;
  depositExpectedDate?: string | null;
  deposit2Paid?: boolean;
  deposit2PaidDate?: string | null;
  deposit2ExpectedDate?: string | null;
  balancePaid?: boolean;
  balancePaidDate?: string | null;
  balanceExpectedDate?: string | null;
  financingPaid?: boolean;
  financingPaidDate?: string | null;
  financingExpectedDate?: string | null;
  financingCost?: number;
}

export function FinancialSummaryReadOnly({
  totalAmount,
  depositAmount,
  deposit2Amount,
  financingAmount,
  paymentType,
  balanceAmount,
  vatRate = 22,
  depositPaid,
  depositPaidDate,
  depositExpectedDate,
  deposit2Paid,
  deposit2PaidDate,
  deposit2ExpectedDate,
  balancePaid,
  balancePaidDate,
  balanceExpectedDate,
  financingPaid,
  financingPaidDate,
  financingExpectedDate,
  financingCost,
}: FinancialSummaryReadOnlyProps) {
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;

  const formatPaymentDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: it });
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

        <div className="pt-3 border-t space-y-3">
          {paymentType === 'standard' ? (
            <>
              {/* Acconto 1 */}
              {depositAmount > 0 && (
                <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Acconto 1</span>
                    <span className="text-primary font-medium">{formatCurrency(depositAmount)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {depositPaid ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="h-3 w-3" />
                        Pagato {depositPaidDate && `il ${formatPaymentDate(depositPaidDate)}`}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />
                        In attesa {depositExpectedDate && `- Previsto ${formatPaymentDate(depositExpectedDate)}`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Acconto 2 */}
              {deposit2Amount > 0 && (
                <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Acconto 2</span>
                    <span className="text-primary font-medium">{formatCurrency(deposit2Amount)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {deposit2Paid ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="h-3 w-3" />
                        Pagato {deposit2PaidDate && `il ${formatPaymentDate(deposit2PaidDate)}`}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />
                        In attesa {deposit2ExpectedDate && `- Previsto ${formatPaymentDate(deposit2ExpectedDate)}`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Saldo */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Saldo</span>
                  <span className="font-bold text-lg">{formatCurrency(balanceAmount)}</span>
                </div>
                {balanceAmount > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    {balancePaid ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="h-3 w-3" />
                        Pagato {balancePaidDate && `il ${formatPaymentDate(balancePaidDate)}`}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />
                        In attesa {balanceExpectedDate && `- Previsto ${formatPaymentDate(balanceExpectedDate)}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {depositAmount > 0 && (
                <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Acconto</span>
                    <span className="text-primary font-medium">{formatCurrency(depositAmount)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {depositPaid ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="h-3 w-3" />
                        Pagato {depositPaidDate && `il ${formatPaymentDate(depositPaidDate)}`}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />
                        In attesa {depositExpectedDate && `- Previsto ${formatPaymentDate(depositExpectedDate)}`}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Finanziamento</span>
                  <span className="font-medium">{formatCurrency(financingAmount)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {financingPaid ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <Check className="h-3 w-3" />
                      Incassato {financingPaidDate && `il ${formatPaymentDate(financingPaidDate)}`}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Clock className="h-3 w-3" />
                      In attesa {financingExpectedDate && `- Previsto ${formatPaymentDate(financingExpectedDate)}`}
                    </span>
                  )}
                </div>
              </div>
              {(financingCost || 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Costo Finanziaria</span>
                  <span className="text-destructive font-medium">- {formatCurrency(financingCost || 0)}</span>
                </div>
              )}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-medium">Saldo Cliente</span>
                  <span className="font-bold text-lg">{formatCurrency(balanceAmount)}</span>
                </div>
                {balanceAmount > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    {balancePaid ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Check className="h-3 w-3" />
                        Pagato {balancePaidDate && `il ${formatPaymentDate(balancePaidDate)}`}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-600">
                        <Clock className="h-3 w-3" />
                        In attesa {balanceExpectedDate && `- Previsto ${formatPaymentDate(balanceExpectedDate)}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

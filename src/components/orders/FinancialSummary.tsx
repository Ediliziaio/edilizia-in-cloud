import { useState } from "react";
import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

interface PaymentStatusProps {
  depositPaid?: boolean;
  depositPaidDate?: Date;
  deposit2Paid?: boolean;
  deposit2PaidDate?: Date;
  balancePaid?: boolean;
  balancePaidDate?: Date;
  balanceExpectedDate?: Date;
  onDepositPaidChange?: (paid: boolean) => void;
  onDepositPaidDateChange?: (date?: Date) => void;
  onDeposit2PaidChange?: (paid: boolean) => void;
  onDeposit2PaidDateChange?: (date?: Date) => void;
  onBalancePaidChange?: (paid: boolean) => void;
  onBalancePaidDateChange?: (date?: Date) => void;
  onBalanceExpectedDateChange?: (date?: Date) => void;
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

function DatePickerField({
  label,
  date,
  onDateChange,
  disabled = false,
}: {
  label: string;
  date?: Date;
  onDateChange: (date?: Date) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
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
}

function PaymentStatusRow({
  label,
  amount,
  paid,
  paidDate,
  expectedDate,
  onPaidChange,
  onPaidDateChange,
  onExpectedDateChange,
  readOnly = false,
  showExpected = false,
}: {
  label: string;
  amount: number;
  paid?: boolean;
  paidDate?: Date;
  expectedDate?: Date;
  onPaidChange?: (paid: boolean) => void;
  onPaidDateChange?: (date?: Date) => void;
  onExpectedDateChange?: (date?: Date) => void;
  readOnly?: boolean;
  showExpected?: boolean;
}) {
  if (amount <= 0) return null;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/30 border">
      <div className="flex justify-between items-center">
        <span className="font-medium">{label}</span>
        <span className="font-semibold">{formatCurrency(amount)}</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${label}-paid`}
            checked={paid || false}
            onCheckedChange={(checked) => onPaidChange?.(!!checked)}
            disabled={readOnly}
          />
          <label
            htmlFor={`${label}-paid`}
            className={cn(
              "text-sm cursor-pointer",
              paid ? "text-green-600 font-medium" : "text-muted-foreground"
            )}
          >
            {paid ? "Pagato" : "Non pagato"}
          </label>
        </div>
        
        {paid && (
          <DatePickerField
            label="Data pagamento"
            date={paidDate}
            onDateChange={onPaidDateChange || (() => {})}
            disabled={readOnly}
          />
        )}
        
        {showExpected && !paid && (
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
}

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
  deposit2Paid,
  deposit2PaidDate,
  balancePaid,
  balancePaidDate,
  balanceExpectedDate,
  onDepositPaidChange,
  onDepositPaidDateChange,
  onDeposit2PaidChange,
  onDeposit2PaidDateChange,
  onBalancePaidChange,
  onBalancePaidDateChange,
  onBalanceExpectedDateChange,
}: FinancialSummaryProps) {
  const [inputMode, setInputMode] = useState<AmountInputMode>('net');
  
  const vat = parseFloat(vatRate) || 22;
  
  // Calcola importi in base alla modalità input
  const handleAmountChange = (value: string) => {
    if (inputMode === 'gross') {
      // L'utente inserisce l'importo IVA inclusa, calcoliamo l'imponibile
      const grossAmount = parseFloat(value) || 0;
      const netAmount = grossAmount / (1 + vat / 100);
      onTotalAmountChange(netAmount.toFixed(2));
    } else {
      onTotalAmountChange(value);
    }
  };
  
  const total = parseFloat(totalAmount) || 0;
  const vatAmount = total * (vat / 100);
  const totalWithVat = total + vatAmount;
  
  // Valore visualizzato nel campo input
  const displayAmount = inputMode === 'gross' ? totalWithVat.toFixed(2) : totalAmount;

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
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as AmountInputMode)}>
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
              value={displayAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
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
            onValueChange={onVatRateChange}
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
                  value={depositAmount}
                  onChange={(e) => onDepositAmountChange(e.target.value)}
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
                  onPaidChange={onDepositPaidChange}
                  onPaidDateChange={onDepositPaidDateChange}
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
                  value={deposit2Amount}
                  onChange={(e) => onDeposit2AmountChange(e.target.value)}
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
                  onPaidChange={onDeposit2PaidChange}
                  onPaidDateChange={onDeposit2PaidDateChange}
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
                  showExpected={true}
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
                  value={depositAmount}
                  onChange={(e) => onDepositAmountChange(e.target.value)}
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
                  onPaidChange={onDepositPaidChange}
                  onPaidDateChange={onDepositPaidDateChange}
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
                  value={financingAmount}
                  onChange={(e) => onFinancingAmountChange(e.target.value)}
                  className="pl-8"
                  placeholder="0.00"
                  disabled={readOnly}
                />
              </div>
            </div>

            {/* Info */}
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Pagamento tramite finanziaria
              </p>
              <div className="flex justify-between items-center text-lg font-semibold mt-2">
                <span>Saldo da Pagare</span>
                <span className="text-muted-foreground">€ 0,00</span>
              </div>
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
  // Payment status
  depositPaid?: boolean;
  depositPaidDate?: string | null;
  deposit2Paid?: boolean;
  deposit2PaidDate?: string | null;
  balancePaid?: boolean;
  balancePaidDate?: string | null;
  balanceExpectedDate?: string | null;
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
  deposit2Paid,
  deposit2PaidDate,
  balancePaid,
  balancePaidDate,
  balanceExpectedDate,
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
                        In attesa
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
                        In attesa
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
                        In attesa
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Finanziamento</span>
                <span className="text-accent-foreground">{formatCurrency(financingAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t mt-2">
                <span className="font-medium">Saldo</span>
                <span className="font-bold text-lg text-muted-foreground">€ 0,00</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

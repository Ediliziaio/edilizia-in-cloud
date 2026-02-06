import { formatCurrency } from "@/lib/formatters";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro } from "lucide-react";

export type PaymentType = 'standard' | 'financing';

interface FinancialSummaryProps {
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
}: FinancialSummaryProps) {
  const total = parseFloat(totalAmount) || 0;
  const vat = parseFloat(vatRate) || 22;
  const vatAmount = total * (vat / 100);
  const totalWithVat = total + vatAmount;

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

        {/* Total Amount */}
        <div className="space-y-2">
          <Label htmlFor="total">Importo Totale (Imponibile) *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              €
            </span>
            <Input
              id="total"
              type="number"
              min="0"
              step="0.01"
              value={totalAmount}
              onChange={(e) => onTotalAmountChange(e.target.value)}
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
            </div>

            {/* Balance */}
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Saldo da Pagare</span>
                <span>{formatCurrency(balance)}</span>
              </div>
            </div>
          </>
        ) : (
          <>
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
}

export function FinancialSummaryReadOnly({
  totalAmount,
  depositAmount,
  deposit2Amount,
  financingAmount,
  paymentType,
  balanceAmount,
  vatRate = 22,
}: FinancialSummaryReadOnlyProps) {
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;

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

        <div className="pt-3 border-t">
          {paymentType === 'standard' ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Acconto 1</span>
                <span className="text-primary">{formatCurrency(depositAmount)}</span>
              </div>
              {deposit2Amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acconto 2</span>
                  <span className="text-primary">{formatCurrency(deposit2Amount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t mt-2">
                <span className="font-medium">Saldo</span>
                <span className="font-bold text-lg">{formatCurrency(balanceAmount)}</span>
              </div>
            </>
          ) : (
            <>
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

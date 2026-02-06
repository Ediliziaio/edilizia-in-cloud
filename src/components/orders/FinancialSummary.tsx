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
  onTotalAmountChange: (value: string) => void;
  onDepositAmountChange: (value: string) => void;
  onDeposit2AmountChange: (value: string) => void;
  onFinancingAmountChange: (value: string) => void;
  onPaymentTypeChange: (value: PaymentType) => void;
  balance: number;
  readOnly?: boolean;
}

export function FinancialSummary({
  totalAmount,
  depositAmount,
  deposit2Amount,
  financingAmount,
  paymentType,
  onTotalAmountChange,
  onDepositAmountChange,
  onDeposit2AmountChange,
  onFinancingAmountChange,
  onPaymentTypeChange,
  balance,
  readOnly = false,
}: FinancialSummaryProps) {
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
          <Label htmlFor="total">Importo Totale *</Label>
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
}

export function FinancialSummaryReadOnly({
  totalAmount,
  depositAmount,
  deposit2Amount,
  financingAmount,
  paymentType,
  balanceAmount,
}: FinancialSummaryReadOnlyProps) {
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
          <span className="text-muted-foreground">Totale</span>
          <span className="font-medium">{formatCurrency(totalAmount)}</span>
        </div>

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
            <div className="flex justify-between pt-2 border-t">
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
            <div className="flex justify-between pt-2 border-t">
              <span className="font-medium">Saldo</span>
              <span className="font-bold text-lg text-muted-foreground">€ 0,00</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, Building2 } from "lucide-react";

interface CustomerFinancialSummaryProps {
  totalAmount: number;
  depositAmount: number;
  deposit2Amount: number;
  financingAmount: number;
  paymentType: string;
  balanceAmount: number;
  vatRate: number;
  hasBuildingBonus?: boolean;
}

export function CustomerFinancialSummary({
  totalAmount,
  depositAmount,
  deposit2Amount,
  financingAmount,
  paymentType,
  balanceAmount,
  vatRate,
  hasBuildingBonus,
}: CustomerFinancialSummaryProps) {
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;
  const totalDeposits = depositAmount + deposit2Amount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Euro className="h-5 w-5" />
          Riepilogo Economico
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
        <div className="flex justify-between text-primary font-semibold">
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

        <div className="pt-3 border-t space-y-2">
          {paymentType === 'standard' ? (
            <>
              {totalDeposits > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acconti versati</span>
                  <span className="text-primary">- {formatCurrency(totalDeposits)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Saldo da Pagare</span>
                <span>{formatCurrency(balanceAmount + (balanceAmount * vatRate / 100))}</span>
              </div>
            </>
          ) : (
            <>
              {depositAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Acconto versato</span>
                  <span className="text-primary">- {formatCurrency(depositAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Finanziamento</span>
                <span>{formatCurrency(financingAmount)}</span>
              </div>
              {(() => {
                const clientBalance = totalWithVat - depositAmount - financingAmount;
                return clientBalance > 0 ? (
                  <div className="flex justify-between font-bold text-lg">
                    <span>Saldo da Pagare</span>
                    <span>{formatCurrency(clientBalance)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between font-bold text-lg">
                    <span>Saldo da Pagare</span>
                    <span className="text-muted-foreground">€ 0,00</span>
                  </div>
                );
              })()}
              <p className="text-sm text-muted-foreground">
                Pagamento tramite finanziaria
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

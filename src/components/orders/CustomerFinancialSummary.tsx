import { formatCurrency } from "@/lib/formatters";
import { ritenutaSuLordo, IVA_SCORPORO_BANCA } from "@/lib/orders/bonusFiscali";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Euro, Building2 } from "lucide-react";

interface CustomerFinancialSummaryProps {
  totalAmount: number;
  vatRate: number;
  paymentType: string;
  /**
   * Gli importi con la regola della scheda commessa (public.cliente_rate_commesse): totale con le
   * varianti approvate, pagato dagli incassi, da pagare dal residuo delle rate.
   */
  regola: { totale: number; pagato: number; daPagare: number; finanziamento: number };
  hasBuildingBonus?: boolean;
}

export function CustomerFinancialSummary({
  totalAmount,
  vatRate,
  paymentType,
  regola,
  hasBuildingBonus,
}: CustomerFinancialSummaryProps) {
  const vatAmount = totalAmount * (vatRate / 100);
  const totalWithVat = totalAmount + vatAmount;
  
  // Le varianti approvate cambiano il totale: si mostra quello aggiornato quando è diverso.
  const totaleAggiornato = paymentType === 'standard' && regola.totale > 0
    && Math.abs(regola.totale - totalWithVat) >= 0.01 ? regola.totale : null;

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
          // Scorporo al 22% convenzionale come fa la banca (circolare AdE
          // 40/E/2010): qui era gia' corretto, ora passa dalla funzione unica.
          const bankTaxableBase = totalWithVat / (1 + IVA_SCORPORO_BANCA);
          const bankWithholding = ritenutaSuLordo(totalWithVat);
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
          {totaleAggiornato != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Totale con le varianti approvate</span>
              <span className="font-medium">{formatCurrency(totaleAggiornato)}</span>
            </div>
          )}
          {regola.pagato > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Già pagato</span>
              <span className="text-primary">- {formatCurrency(regola.pagato)}</span>
            </div>
          )}
          {paymentType !== 'standard' && regola.finanziamento > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Finanziamento</span>
              <span>{formatCurrency(regola.finanziamento)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg">
            <span>Da pagare</span>
            <span className={regola.daPagare > 0 ? undefined : "text-muted-foreground"}>{formatCurrency(regola.daPagare)}</span>
          </div>
          {paymentType !== 'standard' && (
            <p className="text-sm text-muted-foreground">
              Pagamento tramite finanziaria
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { SalTab } from "./SalTab";
import type { Installment } from "@/lib/orderUtils";

interface OrdineSALProps {
  orderId: string;
  companyId: string;
  orderTotalAmount?: number;
  /** Piano rate della commessa (Riepilogo Finanziario): se presente, SalTab
      mostra l'avanzamento incassi in cima alla sezione SAL. */
  installments?: Installment[];
  vatRate?: number;
  /** Costo finanziaria già "gated" dal chiamante (0 se pagamento non financing). */
  financingCost?: number;
  /** La vista commessa tiene gli incassi in Economia, senza scollegare le rate dai SAL. */
  showPaymentProgress?: boolean;
}

export function OrdineSAL({
  orderId,
  companyId,
  orderTotalAmount,
  installments,
  vatRate,
  financingCost,
  showPaymentProgress,
}: OrdineSALProps) {
  return (
    <SalTab
      orderId={orderId}
      companyId={companyId}
      orderTotalAmount={orderTotalAmount}
      installments={installments}
      vatRate={vatRate}
      financingCost={financingCost}
      showPaymentProgress={showPaymentProgress}
    />
  );
}

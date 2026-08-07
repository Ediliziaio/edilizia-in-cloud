import { FinancialSummaryReadOnly, type PaymentType } from "./FinancialSummary";
import { OrderCommissions } from "./OrderCommissions";
import type { Installment } from "@/lib/orderUtils";

interface OrdineEconomicoProps {
  orderId: string;
  totalAmount: number;
  vatRate: number;
  paymentType: PaymentType;
  installments: Installment[];
  hasBuildingBonus: boolean;
  financingCost?: number;
  collectedAmount: number;
  onInstallmentPaidToggle: (installment: Installment, paid: boolean) => void;
  onInstallmentDateChange?: (installment: Installment, field: 'paid_date' | 'expected_date', date?: Date) => void;
  /** Codice commessa per la descrizione della registrazione in Prima Nota. */
  orderCode?: string | null;
  /** true se chi guarda ha il permesso Prima Nota: abilita "Registra incasso". */
  conPrimaNota?: boolean;
}

// NB: niente card "Conto Economico" qui — il conto economico completo
// (consuntivo incluso) è già in OrderEconomicsSummary in cima alla pagina;
// duplicarlo qui mostrava gli stessi numeri due volte e sparava 4 query extra.
export function OrdineEconomico({
  orderId,
  totalAmount,
  vatRate,
  paymentType,
  installments,
  hasBuildingBonus,
  financingCost,
  collectedAmount,
  onInstallmentPaidToggle,
  onInstallmentDateChange,
  orderCode,
  conPrimaNota,
}: OrdineEconomicoProps) {
  return (
    <div className="space-y-4">
      <FinancialSummaryReadOnly
        totalAmount={totalAmount}
        vatRate={vatRate}
        paymentType={paymentType}
        installments={installments}
        hasBuildingBonus={hasBuildingBonus}
        financingCost={financingCost}
        onInstallmentPaidToggle={onInstallmentPaidToggle}
        onInstallmentDateChange={onInstallmentDateChange}
        orderId={orderId}
        orderCode={orderCode}
        conPrimaNota={conPrimaNota}
      />
      <OrderCommissions
        orderId={orderId}
        totalAmount={totalAmount}
        collectedAmount={collectedAmount}
        vatRate={vatRate}
      />
    </div>
  );
}

import { FinancialSummaryReadOnly, type PaymentType } from "./FinancialSummary";
import type { VarianteDatata } from "@/lib/commissions";
import { usePermissions } from "@/hooks/usePermissions";
import type { Installment } from "@/lib/orderUtils";
import { PianoPagamentiAzioni } from "./PianoPagamentiAzioni";

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
  /** Nome cliente per il match banca↔rate (citato nelle causali). */
  clienteNome?: string | null;
  /** id del cliente: serve ai versamenti blocca prezzo (visibilità dal portale). */
  customerId?: string | null;
  /** P.IVA dell'impresa, per comporre le causali dei bonifici parlanti. */
  pivaImpresa?: string | null;
  /** Varianti approvate con la data, per il saldo già pagato. */
  varianti?: ReadonlyArray<VarianteDatata>;
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
  onInstallmentPaidToggle,
  onInstallmentDateChange,
  orderCode,
  conPrimaNota,
  clienteNome,
  varianti,
}: OrdineEconomicoProps) {
  // Piano e rate del cliente. Bonus, blocca prezzo e IVA stanno in fondo alla vista (AltroIncassiCommessa),
  // le provvigioni in Margini e costi (01/11/2026).
  const permissions = usePermissions();
  return (
    <div className="space-y-4 max-sm:space-y-3">
      {/* Come si paga: il piano da un modello, e il saldo salvato che non torna col totale. */}
      <PianoPagamentiAzioni
        orderId={orderId}
        totalAmount={totalAmount}
        vatRate={vatRate}
        paymentType={paymentType}
        financingCost={financingCost}
        installments={installments}
        puoModificare={permissions.canEditOrders}
      />
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
        clienteNome={clienteNome}
        varianti={varianti}
      />
    </div>
  );
}

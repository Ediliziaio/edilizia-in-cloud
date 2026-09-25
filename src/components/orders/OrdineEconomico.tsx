import { FinancialSummaryReadOnly, type PaymentType } from "./FinancialSummary";
import { OrderCommissions } from "./OrderCommissions";
import { usePermissions } from "@/hooks/usePermissions";
import type { Installment } from "@/lib/orderUtils";
import { BonusRipartizioneCard } from "./BonusRipartizioneCard";
import { BloccaPrezzoCard } from "./BloccaPrezzoCard";

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
  clienteNome,
  customerId,
  pivaImpresa,
}: OrdineEconomicoProps) {
  // Le provvigioni sono un dato di margine (vedi usePermissions: can_view_margins
  // copre "margine e provvigioni"): un ruolo senza quel permesso non deve
  // vederle solo perche' vede gli importi della commessa.
  const permissions = usePermissions();
  return (
    <div className="space-y-4 max-sm:space-y-3">
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
      />
      {/* Bonus, blocca prezzo e provvigioni: conti d'ufficio, dal telefono no. */}
      <div className="space-y-4 max-sm:hidden">
      {/* Ripartizione su più bonus: quanti bonifici parlanti servono e con che
          causale. Si mostra da sé solo se l'azienda l'ha accesa e le righe ci sono. */}
      <BonusRipartizioneCard
        orderId={orderId}
        vatRate={vatRate}
        hasBuildingBonus={hasBuildingBonus}
        datiCausale={{ pivaImpresa: pivaImpresa ?? null }}
      />

      {/* Blocca prezzo: soldi che stanno FUORI dal contratto e vanno restituiti. */}
      <BloccaPrezzoCard
        orderId={orderId}
        customerId={customerId}
        hasBuildingBonus={hasBuildingBonus}
        saldoPagato={installments.some((i) => i.type === "balance" && i.is_paid)}
      />

      {permissions.canViewMargins && (
        <OrderCommissions
          orderId={orderId}
          totalAmount={totalAmount}
          collectedAmount={collectedAmount}
          vatRate={vatRate}
        />
      )}
      </div>
    </div>
  );
}

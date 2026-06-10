import { FinancialSummaryReadOnly, type PaymentType } from "./FinancialSummary";
import { OrderEconomics } from "./OrderEconomics";
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
  items: {
    name: string;
    quantity: number;
    purchase_price?: number;
    vat_rate?: number;
    unit_price?: number;
    discount_percent?: number;
    standard_cost?: number;
  }[];
  collectedAmount: number;
  onInstallmentPaidToggle: (installment: Installment, paid: boolean) => void;
  onInstallmentDateChange?: (installment: Installment, field: 'paid_date' | 'expected_date', date?: Date) => void;
}

export function OrdineEconomico({
  orderId,
  totalAmount,
  vatRate,
  paymentType,
  installments,
  hasBuildingBonus,
  financingCost,
  items,
  collectedAmount,
  onInstallmentPaidToggle,
  onInstallmentDateChange,
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
      />
      <OrderEconomics
        orderId={orderId}
        totalAmount={totalAmount}
        collectedAmount={collectedAmount}
        vatRate={vatRate}
        items={items}
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

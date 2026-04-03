import { LinkedPurchaseOrdersCard } from "./LinkedPurchaseOrdersCard";

interface OrdineAcquistoItem {
  name: string;
  quantity: number;
  purchase_price?: number;
  supplier_id?: string;
  vat_rate?: number;
}

interface OrdineAcquistoProps {
  orderId: string;
  orderCode: string | null;
  items: OrdineAcquistoItem[];
}

export function OrdineAcquisto({ orderId, orderCode, items }: OrdineAcquistoProps) {
  return (
    <LinkedPurchaseOrdersCard
      orderId={orderId}
      orderCode={orderCode}
      items={items}
    />
  );
}

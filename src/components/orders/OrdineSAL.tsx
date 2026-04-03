import { SalTab } from "./SalTab";

interface OrdineSALProps {
  orderId: string;
  companyId: string;
  orderTotalAmount?: number;
}

export function OrdineSAL({ orderId, companyId, orderTotalAmount }: OrdineSALProps) {
  return (
    <SalTab
      orderId={orderId}
      companyId={companyId}
      orderTotalAmount={orderTotalAmount}
    />
  );
}

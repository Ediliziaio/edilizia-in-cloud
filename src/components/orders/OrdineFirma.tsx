import { OrderSignatureCard } from "./OrderSignatureCard";

interface OrdineFirmaProps {
  orderId: string;
  customerEmail?: string;
  customerName?: string;
}

export function OrdineFirma({ orderId, customerEmail, customerName }: OrdineFirmaProps) {
  return (
    <OrderSignatureCard
      orderId={orderId}
      customerEmail={customerEmail}
      customerName={customerName}
    />
  );
}

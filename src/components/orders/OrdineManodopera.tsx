import { OrderLaborCosts } from "./OrderLaborCosts";

interface OrdineManodoperaProps {
  orderId: string;
  editable?: boolean;
}

export function OrdineManodopera({ orderId, editable = true }: OrdineManodoperaProps) {
  return <OrderLaborCosts orderId={orderId} editable={editable} />;
}

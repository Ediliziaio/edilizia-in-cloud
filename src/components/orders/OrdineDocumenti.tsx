import { OrderAttachments } from "./OrderAttachments";

interface OrdineDocumentiProps {
  orderId: string;
  editable?: boolean;
}

export function OrdineDocumenti({ orderId, editable = true }: OrdineDocumentiProps) {
  return <OrderAttachments orderId={orderId} editable={editable} />;
}

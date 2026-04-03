import { OdVSection } from "./OdVSection";
import { VariantiCard } from "./VariantiCard";

interface OrdineVariazioneProps {
  orderId: string;
  companyId: string;
}

export function OrdineVariazione({ orderId, companyId }: OrdineVariazioneProps) {
  return (
    <div className="space-y-4">
      <OdVSection orderId={orderId} companyId={companyId} />
      <VariantiCard orderId={orderId} companyId={companyId} />
    </div>
  );
}

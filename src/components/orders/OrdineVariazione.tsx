import { OdVSection } from "./OdVSection";
import type { VariationContext } from "./VariationEditor";

interface OrdineVariazioneProps {
  orderId: string;
  companyId: string;
  context?: VariationContext;
  onOpenDocuments?:()=>void;
}

// Una sola sezione varianti sulla commessa: l'OdV formale (Ordine di Variazione
// con firma cliente). La VariantiCard (varianti_cliente) era una duplicazione
// confondente — rimossa da qui. I dati restano in tabella e il componente è
// ancora usato altrove (es. vista cliente), quindi nessuna perdita.
export function OrdineVariazione({ orderId, companyId, context, onOpenDocuments }: OrdineVariazioneProps) {
  return <OdVSection key={orderId} orderId={orderId} companyId={companyId} context={context} onOpenDocuments={onOpenDocuments} />;
}

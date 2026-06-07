import { OdVSection } from "./OdVSection";

interface OrdineVariazioneProps {
  orderId: string;
  companyId: string;
}

// Una sola sezione varianti sulla commessa: l'OdV formale (Ordine di Variazione
// con firma cliente). La VariantiCard (varianti_cliente) era una duplicazione
// confondente — rimossa da qui. I dati restano in tabella e il componente è
// ancora usato altrove (es. vista cliente), quindi nessuna perdita.
export function OrdineVariazione({ orderId, companyId }: OrdineVariazioneProps) {
  return <OdVSection orderId={orderId} companyId={companyId} />;
}

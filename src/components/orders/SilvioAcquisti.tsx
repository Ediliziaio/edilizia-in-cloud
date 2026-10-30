/**
 * Silvio in «Materiali e acquisti» (31/10/2026): cosa ordinare, cosa serve
 * presto in cantiere, a quale fornitore, a che prezzo. I conti li fanno
 * controlliAcquisti sui materiali della commessa (gli stessi di Lavorazioni);
 * le azioni portano agli ordini o all'elenco degli articoli.
 */
import { useMemo } from "react";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { SilvioAiuto } from "@/components/silvio/SilvioAiuto";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { controlliAcquisti, type AzioneSilvio } from "@/lib/orders/silvioControlli";

export function SilvioAcquisti({ orderId, orderCode, onAzione, className }: {
  orderId: string;
  orderCode: string | null;
  onAzione: (a: AzioneSilvio) => void;
  className?: string;
}) {
  const { phases, materials } = useOrderWorkPhases(orderId);
  const oggi = giornoLocale(new Date().toISOString());
  const punti = useMemo(() => controlliAcquisti(materials, phases, oggi), [materials, phases, oggi]);
  const daOrdinare = materials.filter((m) => m.readiness === "da_ordinare");
  return (
    <SilvioAiuto
      className={className}
      titolo="Silvio · cosa comprare"
      descrizione="Materiali da ordinare, quelli che servono presto in cantiere, fornitori e prezzi che mancano."
      punti={punti}
      onAzione={onAzione}
      intestazioneChat={`Commessa ${orderCode ?? ""}: ${materials.length} materiali, ${daOrdinare.length} da ordinare (${daOrdinare.slice(0, 15).map((m) => `${m.name} × ${m.quantity}`).join(", ")}).`}
      domande={["Cosa devo ordinare questa settimana?", "Raggruppa gli ordini per fornitore", "Mancano materiali per qualche fase?", "Dove posso risparmiare?"]}
    />
  );
}

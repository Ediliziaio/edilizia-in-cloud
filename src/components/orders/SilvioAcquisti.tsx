/**
 * Silvio in «Materiali e acquisti» (31/10/2026): cosa ordinare, cosa serve
 * presto in cantiere, a quale fornitore, a che prezzo. I conti li fanno
 * controlliAcquisti sui materiali della commessa (gli stessi di Lavorazioni);
 * le azioni portano agli ordini o all'elenco degli articoli.
 */
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { SilvioAiuto } from "@/components/silvio/SilvioAiuto";
import { giornoLocale } from "@/lib/orders/cronoprogramma";
import { controlliAcquisti, type AzioneSilvio } from "@/lib/orders/silvioControlli";
import { caricaAllegatoFasi, chiediSilvioAcquisti } from "@/lib/orders/silvioFasi";
import type { ConversazioneSilvio } from "@/components/silvio/SilvioConversazione";

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
  // Silvio risponde nel popup (06/11/2026): niente chat laterale, niente scritture.
  const conversazione: ConversazioneSilvio = {
    carica: (file) => caricaAllegatoFasi(orderId, file),
    applica: async () => {},
    chiedi: async (messaggio, storia, allegati) => {
      const fase = new Map(phases.map((p) => [p.id, p]));
      const ids = [...new Set(materials.map((m) => m.supplier_id).filter((x): x is string => !!x))];
      const letti: { data: Array<{ id: string; name: string }> | null } = ids.length
        ? await supabase.from("suppliers").select("id, name").in("id", ids)
        : { data: [] };
      const fornitore = new Map((letti.data ?? []).map((f) => [f.id, f.name]));
      return chiediSilvioAcquisti(orderId, messaggio, {
        oggi, commessa: orderCode ?? "",
        materiali: materials.map((m) => ({
          nome: m.name, quantita: m.quantity, unita: m.unita_misura ?? null,
          fase: m.phase_id ? fase.get(m.phase_id)?.name ?? null : null,
          serve_dal: m.phase_id ? fase.get(m.phase_id)?.start_date ?? null : null,
          fornitore: m.supplier_id ? fornitore.get(m.supplier_id) ?? null : null,
          prezzo: m.purchase_price ?? null, stato: m.readiness,
        })),
        fasi: phases.map((p) => ({ nome: p.name, dal: p.start_date, al: p.end_date })),
      }, storia, allegati);
    },
  };
  return (
    <SilvioAiuto
      className={className}
      titolo="Silvio · cosa comprare"
      descrizione="Materiali da ordinare, quelli che servono presto in cantiere, fornitori e prezzi che mancano."
      punti={punti}
      onAzione={onAzione}
      intestazioneChat={`Commessa ${orderCode ?? ""}: ${materials.length} materiali, ${daOrdinare.length} da ordinare (${daOrdinare.slice(0, 15).map((m) => `${m.name} × ${m.quantity}`).join(", ")}).`}
      domande={["Cosa devo ordinare questa settimana?", "Raggruppa gli ordini per fornitore", "Mancano materiali per qualche fase?", "Dove posso risparmiare?"]}
      conversazione={conversazione}
    />
  );
}

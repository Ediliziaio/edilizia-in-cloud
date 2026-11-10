import { supabase } from "@/integrations/supabase/client";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import type { ConfrontoRiga } from "./computo";

export async function scriviMisureAtomiche(uploadId: string, confronto: readonly ConfrontoRiga[], versione: number, voci: ReadonlyMap<string, VoceComputo>,
  idMisura = (c: ConfrontoRiga) => c.misura.id,
  attesa = (c: ConfrontoRiga): { piantaId: string | null; versione: number | null } => ({ piantaId: c.misura.planimetriaId, versione: c.misura.versione })) {
  if (!confronto.length) return;
  if (!uploadId || !Number.isInteger(versione) || versione < 1) throw new Error("Riapri il confronto prima di aggiornare le misure.");
  const ids = [...new Set(confronto.map((c) => c.misura.voceId))];
  const p_voci = ids.map((id) => {
    const voce = voci.get(id);
    if (!voce) throw new Error("Una voce non è più nel computo. Riapri il confronto.");
    return { id, quantita: voce.quantita, prezzo: voce.prezzo_unitario_computo };
  });
  const p_righe = confronto.map((c) => ({ id: idMisura(c), voce_id: c.misura.voceId, vecchia: c.vecchia, nuova: c.nuova,
    vecchia_pianta: attesa(c).piantaId, vecchia_versione: attesa(c).versione,
    pianta_id: c.misura.planimetriaId, versione, chiavi: c.misura.chiavi }));
  const { error } = await supabase.rpc("planimetria_aggiorna_misure_computo" as never, { p_upload_id: uploadId, p_righe, p_voci } as never);
  if (error) throw new Error(error.code === "PT409" || error.code === "40001" || error.code === "42501" || error.code === "22023" ? error.message : "Misure non aggiornate. Nessuna modifica è stata applicata: riprova.");
}

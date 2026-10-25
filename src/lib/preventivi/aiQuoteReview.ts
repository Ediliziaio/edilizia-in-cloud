import { importoRiga, round2 } from "@/hooks/usePreventivoCosti";
import { datiMancantiPreventivoAi, type SezionePreventivoAi } from "../../../supabase/functions/_shared/preventivoAiContract";

export { leggiPreventivoAi, confermaPreventivoAi } from "../../../supabase/functions/_shared/preventivoAiContract";
export type { SezionePreventivoAi, SezionePreventivoAiConfermata } from "../../../supabase/functions/_shared/preventivoAiContract";

// Same database-scale rounding as the editor, not a second economic engine.
export function riepilogoPreventivoAi(sezioni: SezionePreventivoAi[]) {
  const mancanti = datiMancantiPreventivoAi(sezioni);
  let totale = 0;
  let righe = 0;
  for (const s of sezioni) for (const r of s.righe) {
    righe++;
    if (r.item_category === "nota" || r.quantita == null || r.unit_price == null || !r.unita_misura) continue;
    totale += importoRiga({ item_category: r.item_category, quantity: r.quantita, unit_price: r.unit_price });
  }
  return { totale: round2(totale), righe, mancanti, completo: righe > 0 && mancanti.length === 0 };
}

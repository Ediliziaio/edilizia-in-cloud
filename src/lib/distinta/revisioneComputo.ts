// Il computo è cambiato dopo che i materiali erano stati confermati (23/11/2026).
//
// Ricaricare una revisione non tocca gli articoli già confermati nella commessa: è giusto, li ha
// confermati una persona. Ma prima nessuno diceva che la quantità era cambiata o che una voce
// era sparita: l'articolo vecchio restava lì, e accanto nasceva una proposta nuova. Qui si dice
// soltanto che cosa è cambiato; la decisione resta a chi compra.

import type { MaterialeEsistente } from "./pianoAcquisti";

export interface VariazioneRevisione {
  tipo: "quantita_cambiata" | "non_piu_nel_computo";
  chiave: string;
  order_item_id: string;
  nome: string;
  unita: string | null;
  prima: number | null;
  ora: number | null;
}

interface RigaNuova { chiave: string; descrizione: string; unita_misura: string; quantita_calcolata: number }

const dalComputo = (e: MaterialeEsistente) => (e.origini ?? []).some((o) => o.tipo === "computo");

/** Gli articoli già confermati che la revisione del computo cambia o non prevede più. */
export function confrontaRevisione(nuove: RigaNuova[], esistenti: MaterialeEsistente[]): VariazioneRevisione[] {
  const perChiave = new Map(nuove.map((r) => [r.chiave, r]));
  const esito: VariazioneRevisione[] = [];
  for (const e of esistenti) {
    if (!e.chiave_materiale || !dalComputo(e)) continue;
    const prima = e.quantita_calcolata ?? null;
    const base = { chiave: e.chiave_materiale, order_item_id: e.id, nome: e.name ?? "Materiale", unita: e.unita_misura ?? null, prima };
    const nuova = perChiave.get(e.chiave_materiale);
    if (!nuova) { esito.push({ ...base, tipo: "non_piu_nel_computo", ora: null }); continue; }
    // Senza la quantità calcolata allora, non si può dire che è cambiata: meglio tacere che allarmare.
    if (prima != null && Math.abs(Number(prima) - nuova.quantita_calcolata) > 0.0001) {
      esito.push({ ...base, tipo: "quantita_cambiata", unita: nuova.unita_misura, ora: nuova.quantita_calcolata });
    }
  }
  return esito.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome, "it"));
}

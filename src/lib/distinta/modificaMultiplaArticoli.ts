import type { Json } from "@/integrations/supabase/types";

/** Cambiare caratteristiche tecniche richiede una nuova verifica, conservando la provenienza. */
export function originiDopoCambioSpecifiche(origini: Json): Json {
  if (!Array.isArray(origini)) return origini;
  return origini.map(o => {
    if (!o || typeof o !== "object" || Array.isArray(o) || !["computo", "contratto", "planimetria"].includes(String(o.tipo))) return o;
    return { ...o, verifica_acquisto: { stato: "da_verificare", motivi: ["Specifiche modificate in blocco: conferma nuovamente prodotto, quantità e inclusioni."], campi_mancanti: ["specifiche"] } };
  });
}

export interface ModificheArticoli {
  fornitore: boolean; supplierId: string; fase: boolean; phaseId: string;
  data: boolean; serveEntro: string; specifiche: boolean; testoSpecifiche: string;
}
export function preparaModificaMultipla(m: ModificheArticoli) {
  const patch: { supplier_id?: string | null; phase_id?: string | null; data_fabbisogno?: string | null; specifiche?: string | null } = {};
  if (m.fornitore) {
    if (!m.supplierId) throw new Error("Scegli il fornitore da assegnare.");
    patch.supplier_id = m.supplierId === "_nessuno" ? null : m.supplierId;
  }
  if (m.fase) {
    if (!m.phaseId) throw new Error("Scegli la fase di destinazione.");
    patch.phase_id = m.phaseId === "_senza" ? null : m.phaseId;
  }
  if (m.data) {
    if (m.serveEntro && (!/^\d{4}-\d{2}-\d{2}$/.test(m.serveEntro) || Number.isNaN(Date.parse(m.serveEntro + "T00:00:00Z"))
      || new Date(m.serveEntro + "T00:00:00Z").toISOString().slice(0, 10) !== m.serveEntro)) throw new Error("La data di fabbisogno non è valida.");
    patch.data_fabbisogno = m.serveEntro || null;
  }
  if (m.specifiche) {
    if (!m.testoSpecifiche.trim()) throw new Error("Scrivi le specifiche comuni da applicare.");
    patch.specifiche = m.testoSpecifiche.trim();
  }
  if (!Object.keys(patch).length) throw new Error("Scegli almeno un campo da modificare.");
  return patch;
}

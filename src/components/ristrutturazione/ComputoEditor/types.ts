/**
 * Tipi condivisi del Computo Editor (Fase 3 — il cuore del verticale).
 *
 * Il computo è gestito client-side come `RstComputoVoce[]` controllato; le righe
 * "draft" (non ancora salvate) hanno un id generato client-side (`crypto.randomUUID`)
 * così React può tracciarle via `key` senza scrivere stato in effect/render.
 */
import type { RstComputoVoce, RstUnitaMisura } from "@/types/ristrutturazione";

/**
 * Payload ritornato da `AddVocePicker.onPick`. Rappresenta una voce "sorgente"
 * (da listino lavorazioni / prodotti / manodopera) o una voce libera, pronta per
 * essere materializzata in una `RstComputoVoce` dal contenitore.
 */
export interface PickedVoce {
  descrizione: string;
  unita_misura: RstUnitaMisura;
  prezzo_unitario: number;
  costo_materiali: number;
  costo_manodopera: number;
  /** Capitolo suggerito dalla sorgente (es. capitolo del listino). */
  capitolo_nome?: string;
  /** Id della voce di listino lavorazioni d'origine (tracciabilità prezzi). */
  listino_voce_id?: string | null;
}

/** Sorgente di una voce nel picker (per badge + raggruppamento). */
export type VoceSource = "lavorazione" | "prodotto" | "manodopera" | "libera";

/**
 * Materializza una `PickedVoce` in una riga di computo completa con un id draft.
 * `quantita` parte da 1 (UX: una voce appena aggiunta è subito "computabile").
 * NB: `crypto.randomUUID()` è chiamato SOLO da event handler, mai in render.
 */
export function pickedToComputoVoce(
  picked: PickedVoce,
  opts: { progetto_id: string; company_id: string; capitolo_nome: string; ordine: number },
): RstComputoVoce {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `draft-${opts.ordine}-${Math.round(performance.now())}`,
    progetto_id: opts.progetto_id,
    company_id: opts.company_id,
    capitolo_nome: opts.capitolo_nome,
    descrizione: picked.descrizione,
    unita_misura: picked.unita_misura,
    quantita: 1,
    prezzo_unitario: picked.prezzo_unitario,
    costo_materiali: picked.costo_materiali,
    costo_manodopera: picked.costo_manodopera,
    sconto_pct: 0,
    importo: 0,
    margine_eur: 0,
    margine_pct: 0,
    listino_voce_id: picked.listino_voce_id ?? null,
    ordine: opts.ordine,
  };
}

/** Genera un id draft per una nuova riga/capitolo (solo da event handler). */
export function newDraftId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `draft-${Math.round(performance.now())}-${Math.round(performance.now() % 1000)}`;
}

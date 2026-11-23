// Le scelte fatte in «Genera dal computo» e non ancora salvate (23/11/2026).
//
// Chiudere la finestra, ricaricare la pagina o perdere la connessione a metà revisione buttava
// via fasi scelte, righe spente e articoli abbinati a mano. Restano su questo dispositivo, per
// commessa e per computo, finché non si salva o non si ricomincia. Solo scelte: nessun dato del
// computo e nessun prezzo.

import type { SceltaArticolo } from "./collegaArticoli";

export interface ScelteInSospeso {
  /** Capitolo → fase. */
  scelte: Record<string, string>;
  /** Materiale (chiave) → acceso o spento a mano. */
  accese: Record<string, boolean>;
  /** Materiale (chiave) → articolo scelto a mano. */
  sceltaArticolo: Record<string, SceltaArticolo>;
  salvato_il: string;
}

const PREFISSO = "eic-genera-materiali:v1:";
/** Oltre questo tempo le scelte non si ripropongono: il computo e il catalogo sono cambiati troppo. */
const GIORNI_VALIDITA = 14;

/** Il deposito del browser, o null se non c'è o è bloccato (navigazione privata, criteri aziendali): anche solo leggerlo può lanciare. */
export function depositoLocale(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export const chiaveSospeso = (orderId: string, computoId: string) => `${PREFISSO}${orderId}:${computoId}`;
const oggetto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export const sospesoVuoto = (s: Pick<ScelteInSospeso, "scelte" | "accese" | "sceltaArticolo">) =>
  !Object.keys(s.scelte).length && !Object.keys(s.accese).length && !Object.keys(s.sceltaArticolo).length;

/** Le scelte lasciate a metà, o null se non ce ne sono, sono vecchie o non si leggono. */
export function leggiSospeso(deposito: Pick<Storage, "getItem"> | null | undefined, chiave: string, adesso: Date = new Date()): ScelteInSospeso | null {
  try {
    const grezzo = deposito?.getItem(chiave);
    if (!grezzo) return null;
    const d: unknown = JSON.parse(grezzo);
    if (!oggetto(d) || !oggetto(d.scelte) || !oggetto(d.accese) || !oggetto(d.sceltaArticolo) || typeof d.salvato_il !== "string") return null;
    const quando = Date.parse(d.salvato_il);
    if (!Number.isFinite(quando) || adesso.getTime() - quando > GIORNI_VALIDITA * 86_400_000) return null;
    const s = { scelte: d.scelte as Record<string, string>, accese: d.accese as Record<string, boolean>,
      sceltaArticolo: d.sceltaArticolo as Record<string, SceltaArticolo>, salvato_il: d.salvato_il };
    return sospesoVuoto(s) ? null : s;
  } catch { return null; }
}

/** Scrive le scelte; se non c'è più niente da ricordare toglie la voce. Non lancia mai. */
export function scriviSospeso(deposito: Pick<Storage, "setItem" | "removeItem"> | null | undefined, chiave: string,
  s: Pick<ScelteInSospeso, "scelte" | "accese" | "sceltaArticolo">, adesso: Date = new Date()): void {
  try {
    if (sospesoVuoto(s)) deposito?.removeItem(chiave);
    else deposito?.setItem(chiave, JSON.stringify({ scelte: s.scelte, accese: s.accese, sceltaArticolo: s.sceltaArticolo, salvato_il: adesso.toISOString() }));
  } catch { /* spazio finito o deposito non disponibile: si lavora come prima, senza ricordare */ }
}

export function cancellaSospeso(deposito: Pick<Storage, "removeItem"> | null | undefined, chiave: string): void {
  try { deposito?.removeItem(chiave); } catch { /* come sopra */ }
}

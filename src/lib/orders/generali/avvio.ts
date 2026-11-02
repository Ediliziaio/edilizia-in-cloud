// src/lib/orders/generali/avvio.ts
// La partenza di una generale nuova: quante unità preparare subito. Le sigle si possono cambiare dopo.
import { generaSigle, MAX_SERIE, type UnitaDaCreare } from "@/lib/orders/generali/unitaSerie";

/** «6» → 6. Vuoto → 0 (nessuna unità, va bene). Tutto il resto → null: il modulo lo segnala. */
export function leggiQuanteUnita(testo: string): number | null {
  const t = testo.trim();
  if (t === "") return 0;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_SERIE ? n : null;
}

export const unitaDiPartenza = (quante: number): UnitaDaCreare[] =>
  generaSigle("A", 1, quante).map((sigla): UnitaDaCreare => ({
    sigla, edificio: null, piano: null, tipologia: null, mq_commerciali: null, millesimi: null, prezzo_listino: null,
  }));

/** Il mese corrente, da cui partono le voci tipiche del piano: «2026-11». */
export function meseCorrente(oggi = new Date()): string {
  return `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, "0")}`;
}

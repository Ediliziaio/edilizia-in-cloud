/**
 * Dai termini di pagamento scritti come si scrivono davvero ("30 gg fine
 * mese", "60gg df", "bonifico 30 giorni") alla data di scadenza.
 *
 * Serve alla cassa: il costo generato dalla ricezione di un ordine aveva
 * scadenza = oggi, e il previsionale mostrava un'uscita immediata che non
 * esiste — in edilizia si paga a 30/60/90. Sbagliare la data di un
 * pagamento da 20.000 € sposta la cassa prevista di un mese.
 *
 * Regole del mestiere:
 * - "N gg" / "N giorni"          → data base + N giorni
 * - "fine mese" / "f.m." / "fm"  → dopo aver sommato i giorni, si va
 *                                  all'ultimo giorno di QUEL mese
 *                                  (30gg fm dal 10/03 → 10/04 → 30/04)
 * - "alla consegna" / "vista"    → la data base stessa
 * - testo non riconosciuto       → null: meglio nessuna interpretazione
 *                                  che una data inventata
 */

/** Giorni di dilazione letti dal testo, o null se non riconoscibili. */
export function estraiGiorni(termini: string | null | undefined): number | null {
  if (!termini) return null;
  const t = termini.toLowerCase();

  if (/(alla\s+consegna|a\s+vista|contanti|immediato|anticipat)/.test(t)) return 0;

  const m = t.match(/(\d{1,3})\s*(?:gg|giorni|g\.?g\.?|days?|dd)\b/);
  if (m) return Number(m[1]);

  // "30/60" o "30-60-90": rate multiple — la PRIMA scadenza e' quella che
  // conta per il previsionale (le successive sono oltre l'orizzonte tipico).
  const rate = t.match(/^(\d{2,3})\s*[/-]\s*\d{2,3}/);
  if (rate) return Number(rate[1]);

  return null;
}

export function chiedeFineMese(termini: string | null | undefined): boolean {
  if (!termini) return false;
  return /(fine\s*mese|f\.?\s*m\.?\b|fm\b)/i.test(termini);
}

/**
 * Data di scadenza in formato YYYY-MM-DD, o null se i termini non si
 * capiscono. `da` e' la data della prestazione (di solito la ricezione).
 */
export function calcolaScadenza(
  termini: string | null | undefined,
  da: Date = new Date(),
): string | null {
  const giorni = estraiGiorni(termini);
  if (giorni == null) return null;

  // Aritmetica in locale, non UTC: il bug delle date che scalano di un
  // giorno e' gia' stato pagato una volta in quest'app.
  const d = new Date(da.getFullYear(), da.getMonth(), da.getDate());
  d.setDate(d.getDate() + giorni);

  if (chiedeFineMese(termini)) {
    // Ultimo giorno del mese in cui cade la data calcolata.
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString("en-CA");
  }
  return d.toLocaleDateString("en-CA");
}

/** Preset offerti nell'editor: quelli che si vedono davvero sulle fatture. */
export const TERMINI_PRESET = [
  "Alla consegna",
  "30 gg",
  "30 gg fine mese",
  "60 gg",
  "60 gg fine mese",
  "90 gg",
] as const;

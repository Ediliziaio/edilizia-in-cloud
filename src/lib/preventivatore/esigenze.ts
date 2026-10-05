/**
 * Le esigenze del cliente scelte per il singolo preventivo («spifferi e freddo»,
 * «muffa», «bolletta alta»…): servono a far parlare il PDF del SUO problema invece
 * di un elenco di voci.
 *
 * Sono FACOLTATIVE e non cambiano lo standard: se il venditore non ne sceglie
 * nessuna, il documento resta quello di sempre (l'elenco scritto nel modello
 * dell'azienda, o niente). Quando ne sceglie, escono quelle.
 *
 * Funzioni pure, usate dall'editor del passo «Dati», dall'anteprima a destra e dal
 * PDF che si genera dal browser (`adattatoreEdile.leggiModello`). Il PDF di Bagni che
 * parte dal server nasce da un preventivo classico: non le vede.
 */

export interface EsigenzaCliente {
  titolo: string;
  descrizione?: string | null;
}

const testo = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** La chiave di una esigenza è il titolo, senza badare a maiuscole e spazi doppi. */
export const chiaveEsigenza = (titolo: string): string => titolo.trim().toLowerCase().replace(/\s+/g, " ");

/** Il jsonb del database in un elenco pulito: solo voci con un titolo, senza doppioni. */
export function leggiEsigenze(valore: unknown): EsigenzaCliente[] {
  if (!Array.isArray(valore)) return [];
  const viste = new Set<string>();
  const out: EsigenzaCliente[] = [];
  for (const v of valore) {
    if (!v || typeof v !== "object") continue;
    const titolo = testo((v as Record<string, unknown>).titolo);
    if (!titolo) continue;
    const chiave = chiaveEsigenza(titolo);
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    out.push({ titolo, descrizione: testo((v as Record<string, unknown>).descrizione) || null });
  }
  return out;
}

export const esigenzaScelta = (scelte: EsigenzaCliente[], voce: EsigenzaCliente): boolean =>
  scelte.some((s) => chiaveEsigenza(s.titolo) === chiaveEsigenza(voce.titolo));

/** Spunta o toglie una voce (copia il testo: cambiare la libreria non tocca i preventivi già fatti). */
export function alternaEsigenza(scelte: EsigenzaCliente[], voce: EsigenzaCliente): EsigenzaCliente[] {
  if (esigenzaScelta(scelte, voce)) return scelte.filter((s) => chiaveEsigenza(s.titolo) !== chiaveEsigenza(voce.titolo));
  return [...scelte, { titolo: voce.titolo.trim(), descrizione: testo(voce.descrizione) || null }];
}

/** Le esigenze scelte per il preventivo, lette dalla sua riga (`progetto.esigenze`). */
export const esigenzeDelPreventivo = (progetto: { esigenze?: unknown } | null | undefined): EsigenzaCliente[] =>
  leggiEsigenze(progetto?.esigenze);

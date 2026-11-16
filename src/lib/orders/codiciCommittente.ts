/**
 * Codici del committente (16/11/2026, docs/piano-punti-aperti-20261116.md §4).
 *
 * Le stesse regole del database (private.tes_codice_norm, tes_codici_da_descrizione,
 * tes_codice_valido), per mostrare in anticipo cosa cercherà il motore della banca e per
 * proporre il codice da ricordare dopo una conferma a mano. Il database resta l'arbitro.
 */

/** «MM-311», «mm 311» e «MM311» sono lo stesso codice. */
export function normalizzaCodice(c: string): string {
  return c.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Almeno 3 caratteri (4 se solo cifre), al massimo 40. */
export function codiceValido(c: string): boolean {
  const n = normalizzaCodice(c);
  return n.length >= 3 && n.length <= 40 && (/[A-Z]/.test(n) || n.length >= 4);
}

const SIGLE_ESCLUSE = new Set([
  "IVA", "CAP", "N", "NR", "NO", "NUM", "FT", "FATT", "RIF", "REF", "VIA", "CIG", "CUP",
  "TEL", "CELL", "KW", "KWP", "KWH", "ANNO", "DEL", "DL", "DM", "DPR", "UNI", "EN", "ISO", "CEI",
]);

/**
 * I codici che si riconoscono in un testo: lettere maiuscole (1-4) e almeno tre cifre, attaccate o
 * separate da spazio, trattino, punto o barra («MM 311», «AB-12345»). Con `maiuscole: false`
 * (causali della banca, spesso in minuscolo) le lettere si accettano anche minuscole.
 */
export function codiciNelTesto(testo: string | null | undefined, opz: { maiuscole?: boolean } = {}): string[] {
  const re = opz.maiuscole === false ? /\b([A-Za-z]{1,4})[ ./-]?([0-9]{3,8})\b/g : /\b([A-Z]{1,4})[ ./-]?([0-9]{3,8})\b/g;
  const out = new Set<string>();
  for (const m of (testo ?? "").matchAll(re)) {
    const sigla = m[1].toUpperCase();
    if (SIGLE_ESCLUSE.has(sigla)) continue;
    out.add(sigla + m[2]);
  }
  return [...out];
}

/** Il codice da proporre per «Ricorda questo codice»: il primo della causale che la commessa non ha già. */
export function codiceDaRicordare(causale: string | null | undefined, giaSullaCommessa: string[] = []): string | null {
  const gia = new Set(giaSullaCommessa.map(normalizzaCodice));
  return codiciNelTesto(causale, { maiuscole: false }).find((c) => !gia.has(normalizzaCodice(c))) ?? null;
}

/** Testo libero (virgole, punti e virgola, a capo) → elenco di codici, senza doppioni. */
export function codiciDaTesto(testo: string): string[] {
  const visti = new Set<string>();
  const out: string[] = [];
  for (const pezzo of testo.split(/[,;\n]+/)) {
    const c = pezzo.trim().toUpperCase();
    if (!c) continue;
    const k = normalizzaCodice(c);
    if (visti.has(k)) continue;
    visti.add(k);
    out.push(c);
  }
  return out;
}

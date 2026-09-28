/**
 * Che documento è arrivato al bot operativo (28/09/2026).
 *
 * Dal testo letto (foto o PDF) più la didascalia dell'utente, capisce se è un
 * DDT, una fattura del fornitore, un computo metrico o uno scontrino. Regole a
 * parole chiave pesate, senza database, così si prova. In pareggio vince il più
 * specifico (scontrino/computo prima di fattura/ddt).
 */

export type TipoDocumento = "ddt" | "fattura" | "computo" | "scontrino" | "altro";

const REGOLE: { tipo: Exclude<TipoDocumento, "altro">; parole: string[] }[] = [
  { tipo: "scontrino", parole: ["scontrino", "ricevuta", "scontrino fiscale", "pagato", "contanti"] },
  { tipo: "computo", parole: ["computo metrico", "computo", "estimativo", "voci di capitolato", "capitolato", "e.p.u", "elenco prezzi"] },
  { tipo: "fattura", parole: ["imponibile", "iva 22", "iva 10", "aliquota", "n. fattura", "fattura n", "partita iva", "totale fattura"] },
  { tipo: "ddt", parole: ["documento di trasporto", "ddt", "d.d.t", "bolla", "trasporto a mezzo", "vettore", "colli", "causale trasporto"] },
];

/** Quante parole chiave del tipo compaiono nel testo (parola intera o inizio parola). */
function punteggio(testo: string, parole: string[]): number {
  let n = 0;
  for (const p of parole) {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${esc}`, "i").test(testo)) n++;
  }
  return n;
}

export function tipoDocumento(testoLetto: string, didascalia: string | null): TipoDocumento {
  const testo = `${didascalia ?? ""}\n${testoLetto ?? ""}`.toLowerCase();
  let best: { tipo: TipoDocumento; score: number } = { tipo: "altro", score: 0 };
  for (const r of REGOLE) {
    const s = punteggio(testo, r.parole);
    if (s > best.score) best = { tipo: r.tipo, score: s };
  }
  return best.score > 0 ? best.tipo : "altro";
}

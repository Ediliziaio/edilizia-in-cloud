/**
 * La commessa dall'indirizzo di destinazione scritto sulla bolla (23/11/2026).
 * Una bolla di calcestruzzo diceva «Destinazione: VIA GARIBALDI, MONTESILVANO» e
 * il cantiere era «Via Garibaldi 2, Montesilvano (PE)»: chi la registrava doveva
 * cercare la commessa a mano. Qui si propone, mai si decide: la persona conferma.
 *
 * Regola: stessa via (tipo + nome, es. «via garibaldi») e, se la bolla lo scrive,
 * stesso comune. Il numero civico, quando c'è su tutti e due, deve essere uguale.
 * Due cantieri che tornano allo stesso modo = nessuna proposta.
 */
import { indirizzoConfrontabile } from "./normalizza.ts";

export interface CommessaConIndirizzo {
  id: string;
  codice: string | null;
  indirizzo: string | null;
}

export interface CommessaProposta {
  id: string;
  codice: string | null;
  /** Il perché, da mostrare: «via garibaldi, montesilvano». */
  motivo: string;
}

const TIPI_VIA = /^(via|viale|piazza|corso|vicolo|localita|frazione|contrada|strada|largo|piazzale|traversa|vico|borgo)\b/;

/** Via, civico e comune di un indirizzo scritto come «Via X 2, Comune (PR)». */
export function partiIndirizzo(v: string | null | undefined): { via: string; civico: string | null; comune: string } | null {
  const grezzo = String(v ?? "").trim();
  if (!grezzo) return null;
  const [primo, ...resto] = grezzo.split(/[,\n]/);
  const testa = indirizzoConfrontabile(primo);
  const m = testa.match(/^(.*?)(?:\s+(\d+[a-z]?))?(?:\s+\d.*)?$/);
  const via = (m?.[1] ?? testa).trim();
  if (!TIPI_VIA.test(via) || via.split(" ").length < 2) return null;
  // Il nome della via deve dire qualcosa: «via roma» va bene, «via 1» no.
  if (!via.split(" ").slice(1).some((p) => p.length >= 4)) return null;
  const comune = indirizzoConfrontabile(resto.join(" ").replace(/\([A-Za-z]{2}\)/g, " ")).replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  return { via, civico: m?.[2] ?? null, comune };
}

export function commessaDallaDestinazione(destinazione: string | null | undefined, commesse: CommessaConIndirizzo[]): CommessaProposta | null {
  const testo = ` ${indirizzoConfrontabile(destinazione)} `;
  if (testo.trim().length < 6) return null;
  const trovate: Array<{ c: CommessaConIndirizzo; punti: number; motivo: string }> = [];
  for (const c of commesse) {
    const p = partiIndirizzo(c.indirizzo);
    if (!p || !testo.includes(` ${p.via} `)) continue;
    const dopoVia = testo.slice(testo.indexOf(` ${p.via} `) + p.via.length + 2);
    const civicoBolla = dopoVia.match(/^(\d+[a-z]?)\b/)?.[1] ?? null;
    if (p.civico && civicoBolla && p.civico !== civicoBolla) continue;
    const comuneUguale = !!p.comune && testo.includes(` ${p.comune} `);
    // Un altro comune scritto sulla bolla, lontano da quello del cantiere: non si propone.
    const punti = 1 + (comuneUguale ? 2 : 0) + (p.civico && civicoBolla === p.civico ? 1 : 0);
    trovate.push({ c, punti, motivo: [p.via + (civicoBolla ? ` ${civicoBolla}` : ""), comuneUguale ? p.comune : null].filter(Boolean).join(", ") });
  }
  if (trovate.length === 0) return null;
  const migliore = Math.max(...trovate.map((t) => t.punti));
  const prime = trovate.filter((t) => t.punti === migliore);
  if (prime.length !== 1) return null;
  // Solo la via, senza comune: vale soltanto se nessun altro cantiere ha quella via.
  if (migliore === 1 && trovate.length > 1) return null;
  return { id: prime[0].c.id, codice: prime[0].c.codice, motivo: prime[0].motivo };
}

/**
 * «Affida e manda il contratto» (11/11/2026): un solo percorso al posto di cinque passaggi.
 *
 * Il titolare: «Collega al listino», «Affida le voci», prezzi una quota alla volta, «Crea contratto» che
 * rimostra le stesse righe, condizioni e firma su un'altra pagina: troppi popup. Qui si scelgono le voci e
 * la ditta, quantità e prezzi si scrivono nella stessa tabella, e un pulsante crea il contratto.
 *
 * Questo file tiene la parte che si prova senza rete: il conto della tabella, l'elenco del contratto dalle
 * quote appena create coi prezzi scritti, e cosa fare se la ditta ha già un contratto sulla commessa.
 */
import { elencoDaAffidamenti, elencoDaSalvare, type AffidamentoPerContratto, type VoceLavoro } from "@/lib/orders/ditteLavori";
import { totaleElencoLavori, type RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

const cent = (n: number) => Math.round(n * 100) / 100;

export interface RigaTabella {
  voceId: string;
  quantita: number | null;
  prezzo: number | null;
}

export interface VoceConVenduto { id: string; quantita: number; importo: number | null; costo_materiali?: number | null }

/** Il conto in fondo alla tabella: costo della ditta, venduto della parte affidata, margine; le righe da sistemare. */
export function contoTabella(
  righe: ReadonlyArray<RigaTabella>,
  voci: ReadonlyArray<VoceConVenduto>,
  residua: (voceId: string) => number,
  comprende: "posa" | "fornitura_e_posa",
) {
  const voce = new Map(voci.map((v) => [v.id, v]));
  let costo = 0;
  let venduto = 0;
  let materiali = 0;
  const errori: Array<{ voceId: string; motivo: string }> = [];
  for (const r of righe) {
    const v = voce.get(r.voceId);
    if (!v) continue;
    const q = r.quantita ?? 0;
    if (!(q > 0)) errori.push({ voceId: r.voceId, motivo: "Quantità mancante" });
    else if (q > residua(r.voceId) + 0.0005) errori.push({ voceId: r.voceId, motivo: "Oltre la quantità libera" });
    if (r.prezzo == null || !(r.prezzo > 0)) errori.push({ voceId: r.voceId, motivo: "Prezzo mancante" });
    else if (Math.abs(Math.round(r.prezzo * 100) - r.prezzo * 100) > 1e-6) errori.push({ voceId: r.voceId, motivo: "Prezzo al centesimo" });
    costo += q * (r.prezzo ?? 0);
    const unitario = Number(v.quantita) > 0 ? (Number(v.importo) || 0) / Number(v.quantita) : 0;
    venduto += unitario * q;
    if (comprende === "posa") materiali += q * (Number(v.costo_materiali) || 0);
  }
  costo = cent(costo);
  venduto = cent(venduto);
  materiali = cent(materiali);
  const margine = cent(venduto - costo - materiali);
  return { costo, venduto, materiali, margine, marginePct: venduto > 0 ? Math.round((margine / venduto) * 1000) / 10 : null, errori };
}

/**
 * Le righe del contratto dalle quote appena create, coi prezzi della tabella (al centesimo). Solo le voci
 * scelte: le altre quote in bozza della ditta restano fuori, si mettono nel contratto da «Lavori e prezzi».
 */
export function righeContratto(
  fasi: Array<{ id: string; name: string; position?: number | null }>,
  voci: VoceLavoro[],
  quote: ReadonlyArray<AffidamentoPerContratto>,
  anagraficaId: string,
  righe: ReadonlyArray<RigaTabella>,
): RigaElencoLavori[] {
  const prezzo = new Map(righe.map((r) => [r.voceId, r.prezzo]));
  const elenco = elencoDaAffidamenti(fasi, voci, quote.filter((a) => a.stato === "bozza" && prezzo.has(a.voce_id)), anagraficaId, null);
  return elencoDaSalvare(elenco.map((r) => {
    const p = cent(Number(prezzo.get(r.voce_id ?? "")) || 0);
    return { ...r, prezzo: p, importo: cent(r.quantita * p) };
  }));
}

export type ContrattoEsistente = { id: string; firmato_il: string | null; stato: string; elenco_lavori: unknown } | null;

/** Cosa fare col contratto della ditta sulla commessa: uno nuovo, aggiungere al suo in bozza, o fermarsi. */
export function destinoContratto(c: ContrattoEsistente, inFirma: boolean): { tipo: "nuovo" } | { tipo: "aggiungi"; id: string } | { tipo: "blocca"; messaggio: string } {
  if (!c) return { tipo: "nuovo" };
  if (c.firmato_il) return { tipo: "blocca", messaggio: "La ditta ha già un contratto firmato su questa commessa: le voci in più si aggiungono con «Variante sulle voci»." };
  if (inFirma) return { tipo: "blocca", messaggio: "Il contratto della ditta è in firma: annulla la richiesta di firma, poi aggiungi le voci." };
  if (c.stato !== "bozza") return { tipo: "blocca", messaggio: "Il contratto della ditta non è più in bozza: aggiungi le voci da «Lavori e prezzi» o con una variante." };
  return { tipo: "aggiungi", id: c.id };
}

/** L'elenco del contratto in bozza con le righe nuove in coda, e il suo totale. */
export function elencoUnito(esistente: unknown, nuove: RigaElencoLavori[]): { elenco: RigaElencoLavori[]; importo: number } {
  const prima = Array.isArray(esistente) ? (esistente as RigaElencoLavori[]) : [];
  const elenco = [...prima, ...nuove];
  return { elenco, importo: totaleElencoLavori(elenco) };
}

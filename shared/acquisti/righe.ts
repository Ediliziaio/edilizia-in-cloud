/**
 * Ordinato, consegnato, fatturato riga per riga (§7.7).
 *
 * Tre cose separate:
 *   1. `abbinaRigheFattura` — quale riga di DDT/ordine copre ogni riga della
 *      fattura: prima il codice articolo (nostro, o del fornitore tramite le
 *      equivalenze già confermate), poi la descrizione uguale; la quantità
 *      conferma, non identifica. Mai un abbinamento «per somiglianza».
 *   2. `confrontaRiga` — le differenze di quantità, prezzo e unità, con le
 *      tolleranze scritte e le sole conversioni autorizzate.
 *   3. `statoRigaOrdine` — quanto è stato ordinato, consegnato, reso,
 *      fatturato e accreditato, e cosa resta: consegne parziali, più fatture
 *      per ordine, note di credito, fatture arrivate prima della consegna.
 *
 * «Collegato», «verificato», «approvato per il pagamento» e «pagato» sono stati
 * del collegamento (vedi `traccia.ts` e la tabella `acquisti_collegamenti`),
 * non si calcolano qui e non si confondono con le quantità.
 */
import {
  fattoreConversione,
  nomeConfrontabile,
  soloAlfanumerico,
  centesimi,
  type ConversioneAutorizzata,
} from "./normalizza.ts";
import { decidi, type Candidato, type Decisione, type Prova } from "./riconciliazione.ts";
import type { RigaFatturaLetta } from "./riferimentiFattura.ts";

export interface RigaDocumento {
  id: string;
  /** Il documento a cui appartiene (DDT o ordine). */
  documentoId: string;
  codice: string | null;
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  /** Prezzo netto unitario; null sulle bolle senza prezzi. */
  prezzoUnitario: number | null;
  /** Riga d'ordine da cui viene (per i DDT): da lì il prezzo, se la bolla non lo dice. */
  rigaOrdineId?: string | null;
}

/** Codice del fornitore = nostro codice, confermato da una persona (`fattura_equivalenze_fornitore`). */
export interface EquivalenzaCodice {
  codiceFornitore: string;
  codiceNostro: string;
}

export interface Tolleranze {
  /** Differenza di quantità ammessa, in percentuale (default 0). */
  quantitaPerc?: number;
  /** Differenza di prezzo unitario ammessa, in percentuale (default 0,5%). */
  prezzoPerc?: number;
  /** Differenza d'importo di riga ammessa, in centesimi (default 2: arrotondamenti). */
  importoCent?: number;
}

function codiciDellaRiga(r: RigaFatturaLetta, equivalenze: EquivalenzaCodice[]): Set<string> {
  const s = new Set<string>();
  for (const c of r.codici) {
    const k = soloAlfanumerico(c.valore);
    if (k.length < 3) continue;
    s.add(k);
    for (const e of equivalenze) if (soloAlfanumerico(e.codiceFornitore) === k) s.add(soloAlfanumerico(e.codiceNostro));
  }
  return s;
}

/**
 * La riga di DDT/ordine che copre una riga di fattura, fra quelle dei documenti
 * già collegati a quella riga (`righeAmmesse`, di solito le righe dei DDT che
 * il `RiferimentoNumeroLinea` lega alla riga).
 */
export function abbinaRigaFattura(
  riga: RigaFatturaLetta,
  righeAmmesse: RigaDocumento[],
  opz: { equivalenze?: EquivalenzaCodice[]; conversioni?: ConversioneAutorizzata[]; giaUsate?: Set<string>; tolleranze?: Tolleranze } = {},
): Decisione<RigaDocumento> {
  // Tolleranza di quantità dell'azienda (Impostazioni → Automazioni, default 0%: uguale).
  const tollQ = Math.max(0, opz.tolleranze?.quantitaPerc ?? 0);
  const codici = codiciDellaRiga(riga, opz.equivalenze ?? []);
  const descr = nomeConfrontabile(riga.descrizione);
  const candidati: Candidato<RigaDocumento>[] = [];
  for (const d of righeAmmesse) {
    if (opz.giaUsate?.has(d.id)) continue;
    const prove: Prova[] = [];
    const cod = soloAlfanumerico(d.codice);
    if (codici.size && cod) {
      prove.push({
        campo: "codice_articolo",
        ruolo: "identifica",
        esito: codici.has(cod) ? "uguale" : "diverso",
        testo: codici.has(cod) ? `stesso codice articolo (${d.codice})` : `codice diverso (${d.codice})`,
      });
    }
    if (descr.length >= 4 && nomeConfrontabile(d.descrizione) === descr)
      prove.push({ campo: "descrizione", ruolo: codici.size && cod ? "conferma" : "identifica", esito: "uguale", testo: "stessa descrizione" });
    if (riga.quantita != null && d.quantita != null) {
      const f = fattoreConversione(riga.unitaLetta ?? riga.unita, d.unita, opz.conversioni, riga.codici[0]?.valore);
      if (f != null) {
        const scarto = Math.abs(riga.quantita * f - d.quantita);
        const identica = scarto < 1e-6 * Math.max(1, d.quantita);
        const uguale = identica || scarto <= (Math.abs(d.quantita) * tollQ) / 100 + 1e-9;
        prove.push({
          campo: "quantita",
          ruolo: "conferma",
          esito: uguale ? "uguale" : "diverso",
          testo: identica ? `stessa quantità (${d.quantita} ${d.unita ?? ""})`.trim()
            : uguale ? `quantità entro la tolleranza del ${tollQ}% (${riga.quantita} / ${d.quantita})`
            : `quantità diversa (${riga.quantita} / ${d.quantita})`,
        });
      }
    }
    // Un codice diverso esclude: due articoli con la stessa descrizione e codici diversi non sono lo stesso.
    if (prove.some((p) => p.campo === "codice_articolo" && p.esito === "diverso")) continue;
    // Solo codice o descrizione uguali fanno un candidato: la sola quantità uguale è una coincidenza.
    if (prove.some((p) => p.ruolo === "identifica" && p.esito === "uguale")) candidati.push({ id: d.id, dato: d, prove });
  }
  const dec = decidi(candidati, { automaticoConsentito: true, datiUtili: ["codice articolo"] });
  // La riga si chiude da sola solo con la quantità uguale: con unità non convertibili (250 M contro
  // 1 PZ) il codice dice l'articolo, non quanto ne è arrivato. Resta una proposta.
  if (dec.esito === "automatico") {
    const scelto = dec.candidati.find((c) => c.id === dec.sceltoId);
    if (!scelto?.prove.some((p) => p.campo === "quantita" && p.esito === "uguale"))
      return { ...dec, esito: "proposta", mancanti: [...new Set([...dec.mancanti, "quantità confrontabile"])] };
  }
  return dec;
}

/**
 * Abbina tutte le righe: ogni riga di DDT si usa una volta (una consegna non si
 * fattura due volte). Le righe di sconto e accessorie non si abbinano a merce.
 */
export function abbinaRigheFattura(
  righe: RigaFatturaLetta[],
  righeAmmesse: (r: RigaFatturaLetta) => RigaDocumento[],
  opz: { equivalenze?: EquivalenzaCodice[]; conversioni?: ConversioneAutorizzata[]; tolleranze?: Tolleranze } = {},
): Array<{ numeroLinea: number; decisione: Decisione<RigaDocumento> }> {
  const usate = new Set<string>();
  const out: Array<{ numeroLinea: number; decisione: Decisione<RigaDocumento> }> = [];
  // Prima le righe col codice (più sicure), così non si «rubano» la riga giusta a vicenda.
  const ordine = [...righe].sort((a, b) => Number(!a.codici.length) - Number(!b.codici.length));
  for (const r of ordine) {
    if (r.tipoCessione === "SC" || r.tipoCessione === "AB" || r.tipoCessione === "AC") continue;
    const d = abbinaRigaFattura(r, righeAmmesse(r), { ...opz, giaUsate: usate });
    if (d.esito === "automatico" && d.sceltoId) usate.add(d.sceltoId);
    out.push({ numeroLinea: r.numeroLinea, decisione: d });
  }
  return out.sort((a, b) => a.numeroLinea - b.numeroLinea);
}

export type Differenza =
  | { tipo: "quantita"; fattura: number; documento: number; scarto: number }
  | { tipo: "prezzo"; fattura: number; documento: number; scartoPerc: number }
  | { tipo: "unita"; fattura: string | null; documento: string | null }
  | { tipo: "prezzo_mancante" };

/**
 * Le differenze fra una riga di fattura e la riga di documento abbinata. La
 * bolla senza prezzo prende il prezzo dalla riga d'ordine (`prezzoOrdine`):
 * è il prezzo pattuito, e non si inventa.
 */
export function confrontaRiga(
  f: RigaFatturaLetta,
  d: RigaDocumento,
  opz: { tolleranze?: Tolleranze; conversioni?: ConversioneAutorizzata[]; prezzoOrdine?: number | null } = {},
): Differenza[] {
  const tol = { quantitaPerc: 0, prezzoPerc: 0.5, importoCent: 2, ...opz.tolleranze };
  const out: Differenza[] = [];
  const fattore = fattoreConversione(f.unitaLetta ?? f.unita, d.unita, opz.conversioni, f.codici[0]?.valore);
  if (fattore == null && (f.unita || d.unita)) out.push({ tipo: "unita", fattura: f.unitaLetta ?? f.unita, documento: d.unita });
  if (fattore != null && f.quantita != null && d.quantita != null) {
    const qf = f.quantita * fattore;
    const scarto = qf - d.quantita;
    if (Math.abs(scarto) > (Math.abs(d.quantita) * tol.quantitaPerc) / 100 + 1e-9)
      out.push({ tipo: "quantita", fattura: qf, documento: d.quantita, scarto });
  }
  const prezzoDoc = d.prezzoUnitario ?? opz.prezzoOrdine ?? null;
  if (prezzoDoc == null) out.push({ tipo: "prezzo_mancante" });
  else if (fattore != null && f.prezzoUnitario != null && prezzoDoc > 0) {
    const pf = f.prezzoUnitario / fattore;
    const perc = ((pf - prezzoDoc) / prezzoDoc) * 100;
    const importoOk =
      f.quantita != null && Math.abs(centesimi(pf * f.quantita * fattore) - centesimi(prezzoDoc * f.quantita * fattore)) <= tol.importoCent;
    if (Math.abs(perc) > tol.prezzoPerc && !importoOk) out.push({ tipo: "prezzo", fattura: pf, documento: prezzoDoc, scartoPerc: perc });
  }
  return out;
}

/** Il prezzo con cui valorizzare una riga di DDT: il suo, o quello dell'ordine. Mai un medio o una stima. */
export function prezzoRigaDdt(d: Pick<RigaDocumento, "prezzoUnitario">, prezzoOrdine: number | null | undefined): { prezzo: number | null; fonte: "ddt" | "ordine" | null } {
  if (d.prezzoUnitario != null) return { prezzo: d.prezzoUnitario, fonte: "ddt" };
  if (prezzoOrdine != null) return { prezzo: prezzoOrdine, fonte: "ordine" };
  return { prezzo: null, fonte: null };
}

export interface MovimentoRiga {
  quantita: number;
  /** Data del documento: serve solo a ordinare e a dire «arrivato prima». */
  data?: string | null;
}

export interface StatoRigaOrdine {
  ordinato: number;
  consegnato: number;
  reso: number;
  fatturato: number;
  accreditato: number;
  /** Consegnato netto dei resi. */
  consegnatoNetto: number;
  /** Fatturato netto delle note di credito. */
  fatturatoNetto: number;
  daConsegnare: number;
  /** Consegnato e non ancora fatturato. */
  daFatturare: number;
  /** Fatturato più di quanto consegnato: fattura arrivata prima della bolla, o fatturato in eccesso. */
  fatturatoNonConsegnato: number;
  /** Consegnato oltre l'ordinato (entro tolleranza non conta). */
  eccedenzaConsegna: number;
  stato: "aperta" | "parziale" | "consegnata" | "chiusa" | "eccedenza";
}

/**
 * Lo stato di una riga d'ordine dai suoi movimenti. Le quantità sono già
 * nell'unità della riga d'ordine (convertite a monte). Funziona con i documenti
 * in qualunque ordine siano arrivati: è una somma, non una sequenza.
 */
export function statoRigaOrdine(p: {
  ordinato: number;
  consegne?: MovimentoRiga[];
  resi?: MovimentoRiga[];
  fatture?: MovimentoRiga[];
  noteCredito?: MovimentoRiga[];
  tolleranzaPerc?: number;
}): StatoRigaOrdine {
  const somma = (xs?: MovimentoRiga[]) => (xs ?? []).reduce((s, x) => s + Math.abs(x.quantita), 0);
  const r = (n: number) => Math.round(n * 1e6) / 1e6;
  const consegnato = r(somma(p.consegne));
  const reso = r(somma(p.resi));
  const fatturato = r(somma(p.fatture));
  const accreditato = r(somma(p.noteCredito));
  const consegnatoNetto = r(consegnato - reso);
  const fatturatoNetto = r(fatturato - accreditato);
  const tol = (p.ordinato * (p.tolleranzaPerc ?? 0)) / 100;
  const daConsegnare = r(Math.max(0, p.ordinato - consegnatoNetto));
  const daFatturare = r(Math.max(0, consegnatoNetto - fatturatoNetto));
  const fatturatoNonConsegnato = r(Math.max(0, fatturatoNetto - consegnatoNetto));
  const eccedenzaConsegna = consegnatoNetto - p.ordinato > tol ? r(consegnatoNetto - p.ordinato) : 0;
  let stato: StatoRigaOrdine["stato"];
  if (eccedenzaConsegna > 0) stato = "eccedenza";
  else if (consegnatoNetto <= 0 && fatturatoNetto <= 0) stato = "aperta";
  else if (daConsegnare > tol) stato = "parziale";
  else if (daFatturare > 0 || fatturatoNonConsegnato > 0) stato = "consegnata";
  else stato = "chiusa";
  return {
    ordinato: p.ordinato,
    consegnato,
    reso,
    fatturato,
    accreditato,
    consegnatoNetto,
    fatturatoNetto,
    daConsegnare,
    daFatturare,
    fatturatoNonConsegnato,
    eccedenzaConsegna,
    stato,
  };
}

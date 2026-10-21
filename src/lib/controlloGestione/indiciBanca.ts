/**
 * Formule e testi degli indici «da banca» del Controllo di Gestione:
 * Indici avanzati, Rating bancario, Piano industriale, Health-check.
 *
 * Le RPC restituiscono anche numeratori e denominatori: qui si ricalcolano gli
 * indici che dipendono dal periodo (giorni trascorsi dell'anno in corso), così
 * la pagina è giusta anche prima che il database sia aggiornato, e si tengono
 * in un posto solo nomi, spiegazioni e soglie mostrati al titolare.
 */

// ── Formati it-IT ─────────────────────────────────────────────────────────

const nf = (dec: number) =>
  new Intl.NumberFormat("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const MENO = "−"; // segno meno tipografico

function finito(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** 3.1234 → «3,12». null/NaN/Infinity → «—». */
export function formatNumero(v: number | null | undefined, decimali = 2): string {
  if (!finito(v)) return "—";
  const s = nf(decimali).format(Math.abs(v));
  return v < 0 && s !== nf(decimali).format(0) ? `${MENO}${s}` : s;
}

/** Rapporto 0,389 → «38,9%». */
export function formatRapportoPct(v: number | null | undefined, decimali = 1): string {
  if (!finito(v)) return "—";
  return `${formatNumero(v * 100, decimali)}%`;
}

/** Valore già in percentuale 36.2 → «36,2%». */
export function formatPct(v: number | null | undefined, decimali = 1): string {
  if (!finito(v)) return "—";
  return `${formatNumero(v, decimali)}%`;
}

/** 81.4 → «81 giorni». */
export function formatGiorni(v: number | null | undefined): string {
  if (!finito(v)) return "—";
  const g = Math.round(v);
  return `${g < 0 ? MENO : ""}${Math.abs(g)} ${Math.abs(g) === 1 ? "giorno" : "giorni"}`;
}

/** 8.06 → «8,06 volte». */
export function formatVolte(v: number | null | undefined): string {
  if (!finito(v)) return "—";
  return `${formatNumero(v, 2)} volte`;
}

/** Euro interi it-IT: 1346331.55 → «1.346.332 €». */
export function formatEuro(v: number | null | undefined): string {
  if (!finito(v)) return "—";
  const s = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(Math.abs(v));
  return `${v < 0 && Math.round(Math.abs(v)) !== 0 ? MENO : ""}${s} €`;
}

/** Euro abbreviati in italiano: 4.700.000 → «4,7 Mln €», −414.000 → «−414 mila €». */
export function formatEuroBreve(v: number | null | undefined): string {
  if (!finito(v)) return "—";
  const abs = Math.abs(v);
  const segno = v < 0 ? MENO : "";
  if (abs >= 1_000_000) return `${segno}${nf(1).format(abs / 1_000_000)} Mln €`;
  if (abs >= 10_000) return `${segno}${nf(0).format(Math.round(abs / 1_000))} mila €`;
  return `${segno}${nf(0).format(Math.round(abs))} €`;
}

// ── Periodo ───────────────────────────────────────────────────────────────

/**
 * Giorni coperti dai dati dell'esercizio: anni chiusi 365/366, anno in corso i
 * giorni trascorsi (oggi compreso), anni futuri null. Data LOCALE, non UTC.
 */
export function giorniPeriodo(anno: number, oggi: Date = new Date()): number | null {
  const annoOggi = oggi.getFullYear();
  if (anno > annoOggi) return null;
  const inizio = new Date(anno, 0, 1);
  if (anno < annoOggi) {
    return Math.round((new Date(anno + 1, 0, 1).getTime() - inizio.getTime()) / 86_400_000);
  }
  const oggiMezzanotte = new Date(annoOggi, oggi.getMonth(), oggi.getDate());
  return Math.round((oggiMezzanotte.getTime() - inizio.getTime()) / 86_400_000) + 1;
}

// ── Indici di rotazione ───────────────────────────────────────────────────

export interface ComponentiRotazione {
  crediti_clienti: number;
  debiti_fornitori: number;
  rimanenze: number;
  ricavi: number;
  acquisti: number;
  costo_venduto: number;
}

export interface Rotazione {
  dso: number | null;
  dpo: number | null;
  dsi: number | null;
  ccc: number | null;
  giorni: number | null;
  /** Perché il DPO non c'è (null se c'è). */
  motivoDpo: string | null;
}

/**
 * DSO = crediti / ricavi × giorni del periodo; DPO = debiti fornitori /
 * acquisti × giorni; DSI = rimanenze / costo del venduto × giorni;
 * CCC = DSO + DSI − DPO, solo se DSO e DPO ci sono (senza DPO sarebbe gonfiato).
 */
export function calcolaRotazione(c: ComponentiRotazione, giorni: number | null): Rotazione {
  const g = giorni && giorni > 0 ? giorni : null;
  const dso = g && c.ricavi > 0 ? (c.crediti_clienti / c.ricavi) * g : null;
  const dsi = g && c.costo_venduto > 0 ? (c.rimanenze / c.costo_venduto) * g : null;
  let motivoDpo: string | null = null;
  let dpo: number | null = null;
  if (!g) motivoDpo = "Anno non ancora iniziato.";
  else if (!(c.acquisti > 0)) motivoDpo = "Nessun acquisto registrato nell'anno.";
  else if (!(c.debiti_fornitori > 0)) {
    motivoDpo = "Nessun debito verso fornitori registrato: carica le scadenze da pagare per calcolarlo.";
  } else dpo = (c.debiti_fornitori / c.acquisti) * g;
  const ccc = dso !== null && dpo !== null ? dso + (dsi ?? 0) - dpo : null;
  return { dso, dpo, dsi, ccc, giorni: g, motivoDpo };
}

export type Giudizio = "buono" | "medio" | "critico" | "na";

export function giudizioDso(g: number | null): Giudizio {
  if (g === null) return "na";
  return g <= 60 ? "buono" : g <= 90 ? "medio" : "critico";
}
export function giudizioDpo(g: number | null): Giudizio {
  if (g === null) return "na";
  return g >= 60 ? "buono" : g >= 30 ? "medio" : "critico";
}
export function giudizioDsi(g: number | null): Giudizio {
  if (g === null) return "na";
  return g <= 60 ? "buono" : g <= 120 ? "medio" : "critico";
}
export function giudizioCcc(g: number | null): Giudizio {
  if (g === null) return "na";
  return g < 60 ? "buono" : g < 120 ? "medio" : "critico";
}

// ── DSCR ──────────────────────────────────────────────────────────────────

export interface Dscr {
  valore: number | null;
  ratePeriodo: number;
  classe: "eccellente" | "buono" | "critico" | "insufficiente" | "na";
}

/**
 * DSCR = (EBITDA − imposte) del periodo / rate dei mutui dello stesso periodo.
 * Prima si confrontavano 10 mesi di flusso con 12 mesi di rate.
 */
export function calcolaDscr(flusso: number, rateAnno: number, giorni: number | null): Dscr {
  const ratePeriodo = giorni && giorni > 0 ? Math.round(((rateAnno * giorni) / 365) * 100) / 100 : 0;
  if (!(ratePeriodo > 0)) return { valore: null, ratePeriodo, classe: "na" };
  const valore = Math.round((flusso / ratePeriodo) * 100) / 100;
  const classe = valore >= 1.5 ? "eccellente" : valore >= 1.2 ? "buono" : valore >= 1 ? "critico" : "insufficiente";
  return { valore, ratePeriodo, classe };
}

export const ETICHETTA_DSCR: Record<Dscr["classe"], string> = {
  eccellente: "Rate coperte con ampio margine",
  buono: "Rate coperte",
  critico: "Rate coperte a fatica",
  insufficiente: "Il flusso non copre le rate",
  na: "Nessun mutuo attivo",
};

// ── Rating bancario ───────────────────────────────────────────────────────

export type CodiceIndicatoreRating = "liquidita" | "indipendenza" | "oneri_finanziari" | "cashflow";

export const INDICATORI_RATING: Record<
  CodiceIndicatoreRating,
  { nome: string; formula: string; spiegazione: string; percentuale: boolean; piuBassoMeglio: boolean }
> = {
  liquidita: {
    nome: "Liquidità",
    formula: "Attivo circolante / Debiti a breve",
    spiegazione: "Quante volte crediti, cassa e magazzino coprono i debiti da pagare entro l'anno. Sopra 1,5 è buono, sotto 1 vuol dire tensione di cassa.",
    percentuale: false,
    piuBassoMeglio: false,
  },
  indipendenza: {
    nome: "Indipendenza finanziaria",
    formula: "Mezzi propri / Totale passivo",
    spiegazione: "Quanta parte dell'azienda è finanziata con soldi tuoi e non con debiti. Sopra il 30% è buono, sotto il 10% la banca ti vede troppo indebitato.",
    percentuale: true,
    piuBassoMeglio: false,
  },
  oneri_finanziari: {
    nome: "Peso degli oneri finanziari",
    formula: "Interessi e oneri bancari / Fatturato",
    spiegazione: "Quanto del fatturato se ne va in interessi. Fino al 2,5% è buono, oltre il 6% gli interessi mangiano il margine.",
    percentuale: true,
    piuBassoMeglio: true,
  },
  cashflow: {
    nome: "Flusso di cassa",
    formula: "(Utile + Ammortamenti) / Totale attivo",
    spiegazione: "Quanta cassa produce l'attività rispetto a quanto è grande l'azienda. Sopra l'8% è buono, sotto l'1% l'azienda genera poca cassa.",
    percentuale: true,
    piuBassoMeglio: false,
  },
};

export interface IndicatoreRatingLike {
  codice: string;
  valore: number | null;
  punteggio: number;
  calcolabile?: boolean;
}

/**
 * Se l'indicatore è calcolabile. Le RPC nuove lo dicono ('calcolabile'); con
 * le vecchie si riconoscono i ripieghi: oneri finanziari = 1 con 0 punti
 * (fatturato zero) e valore 0 con 0 punti (denominatore mancante).
 */
export function indicatoreCalcolabile(ind: IndicatoreRatingLike): boolean {
  if (typeof ind.calcolabile === "boolean") return ind.calcolabile;
  if (ind.valore === null || !Number.isFinite(ind.valore)) return false;
  if (ind.codice === "oneri_finanziari" && ind.valore === 1 && ind.punteggio === 0) return false;
  if (ind.valore === 0 && ind.punteggio === 0) return false;
  return true;
}

export function formatValoreIndicatore(ind: IndicatoreRatingLike): string {
  if (!indicatoreCalcolabile(ind)) return "—";
  const meta = INDICATORI_RATING[ind.codice as CodiceIndicatoreRating];
  // Liquidità senza debiti a breve: valore nullo ma calcolabile (25 punti).
  if (ind.valore === null) return ind.codice === "liquidita" ? "nessun debito a breve" : "—";
  return meta?.percentuale ? formatRapportoPct(ind.valore) : formatNumero(ind.valore);
}

export function formatObiettivoIndicatore(codice: string, sogliaTop: number): string {
  const meta = INDICATORI_RATING[codice as CodiceIndicatoreRating];
  const v = meta?.percentuale ? formatRapportoPct(sogliaTop) : formatNumero(sogliaTop);
  return meta?.piuBassoMeglio ? `fino a ${v}` : `da ${v} in su`;
}

export type ClasseRating = "AAA" | "AA" | "A" | "BBB" | "BB" | "B" | "CCC";

/** Fasce di punteggio delle classi, dalla peggiore alla migliore (come cg_get_rating). */
export const FASCE_RATING: { classe: ClasseRating; da: number; a: number; colore: string; giudizio: string }[] = [
  { classe: "CCC", da: 0, a: 20, colore: "#991b1b", giudizio: "Rischio molto alto" },
  { classe: "B", da: 20, a: 40, colore: "#ef4444", giudizio: "Rischio alto" },
  { classe: "BB", da: 40, a: 55, colore: "#f97316", giudizio: "Sotto la media" },
  { classe: "BBB", da: 55, a: 70, colore: "#eab308", giudizio: "Adeguato" },
  { classe: "A", da: 70, a: 80, colore: "#84cc16", giudizio: "Buono" },
  { classe: "AA", da: 80, a: 90, colore: "#22c55e", giudizio: "Molto buono" },
  { classe: "AAA", da: 90, a: 100, colore: "#15803d", giudizio: "Eccellente" },
];

export function classeDaPunteggio(score: number): ClasseRating {
  const s = Math.max(0, Math.min(100, score));
  return [...FASCE_RATING].reverse().find((f) => s >= f.da)?.classe ?? "CCC";
}

/** Angolo della lancetta (gradi SVG): 180 = sinistra (punteggio 0), 360 = destra (100). */
export function angoloLancetta(score: number): number {
  const s = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return 180 + (s / 100) * 180;
}

// ── Piano industriale ─────────────────────────────────────────────────────

/**
 * Variazione da un anno all'altro. In percentuale solo se entrambi i valori
 * sono positivi: da −414 mila a −353 mila «+14,7%» non vuol dire niente,
 * meglio «+61 mila €».
 */
export function variazioneLeggibile(curr: number, prev: number): string | null {
  if (!finito(curr) || !finito(prev)) return null;
  if (prev > 0 && curr >= 0) {
    const pct = ((curr - prev) / prev) * 100;
    return `${pct >= 0 ? "+" : MENO}${nf(1).format(Math.abs(pct))}%`;
  }
  const diff = curr - prev;
  if (Math.round(diff) === 0) return "=";
  return `${diff >= 0 ? "+" : MENO}${formatEuroBreve(Math.abs(diff))}`;
}

export interface PeriodoPianoLike {
  ricavi: number;
  ebitda: number;
  ammortamenti: number;
  oneri_finanziari: number;
  utile: number;
  cespiti: number;
  mezzi_propri: number;
  debito_mlt: number;
}

export interface IndicePiano {
  valore: number | null;
  /** Perché manca, da mostrare al posto del numero. */
  motivo: string | null;
}

export function roePiano(p: PeriodoPianoLike): IndicePiano {
  if (!(p.mezzi_propri > 0)) return { valore: null, motivo: "mezzi propri negativi o nulli" };
  return { valore: (p.utile / p.mezzi_propri) * 100, motivo: null };
}

/** ROI = EBIT / capitale investito (mezzi propri + debiti finanziari). */
export function roiPiano(p: PeriodoPianoLike): IndicePiano {
  const capitale = p.mezzi_propri + p.debito_mlt;
  if (!(capitale > 0)) return { valore: null, motivo: "capitale investito negativo o nullo" };
  return { valore: ((p.ebitda - p.ammortamenti) / capitale) * 100, motivo: null };
}

export function rosPiano(p: PeriodoPianoLike): IndicePiano {
  if (!(p.ricavi > 0)) return { valore: null, motivo: "nessun ricavo" };
  return { valore: ((p.ebitda - p.ammortamenti) / p.ricavi) * 100, motivo: null };
}

export function margineEbitdaPiano(p: PeriodoPianoLike): IndicePiano {
  if (!(p.ricavi > 0)) return { valore: null, motivo: "nessun ricavo" };
  return { valore: (p.ebitda / p.ricavi) * 100, motivo: null };
}

/** Leva = debiti finanziari / mezzi propri (quante volte i debiti superano il capitale). */
export function levaPiano(p: PeriodoPianoLike): IndicePiano {
  if (!(p.mezzi_propri > 0)) return { valore: null, motivo: "mezzi propri negativi o nulli" };
  return { valore: p.debito_mlt / p.mezzi_propri, motivo: null };
}

// ── Health-check ──────────────────────────────────────────────────────────

const CHECK_IN_EURO = new Set(["patrimonio_netto", "quadratura_sp"]);

export function formatValoreCheck(codice: string, valore: number, unita?: string): string {
  if (unita === "euro" || CHECK_IN_EURO.has(codice)) return formatEuro(valore);
  return finito(valore) ? new Intl.NumberFormat("it-IT").format(valore) : "—";
}

/**
 * Legge un importo scritto all'italiana: «1.234.567,89», «1234567,89»,
 * «1234567.89», «€ 12.000». Vuoto → null; testo non valido → NaN.
 */
export function parseImportoIt(testo: string): number | null {
  const t = testo.replace(/[€\s]/g, "");
  if (t === "") return null;
  let norm = t;
  if (t.includes(",")) {
    norm = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    norm = t.replace(/\./g, "");
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : Number.NaN;
}

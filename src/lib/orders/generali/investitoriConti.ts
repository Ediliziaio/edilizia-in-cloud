// src/lib/orders/generali/investitoriConti.ts
// Fonti e investitori della commessa generale: chi ha messo i soldi, quanto ha versato,
// quanto gli spetta a fine operazione. Solo conti, senza React né database: i fatti
// (fonti e movimenti) arrivano da generale_fonti / generale_fonti_movimenti, la stima
// finale dal piano economico (numeriPerInvestitori in pianoConti.ts).
//
// Le regole, scritte anche nell'interfaccia (spiegaRegola):
//  · chi presta (investitore a prestito, banca) riceve il capitale più gli interessi
//    semplici al tasso annuo, su ogni euro dal giorno del versamento a quello del
//    rimborso, fino alla scadenza (o alla fine dell'operazione);
//  · chi sta a capitale (mezzi propri, investitore a capitale) si divide l'utile
//    dell'operazione: prima le quote fisse pattuite, poi il resto pro quota del
//    capitale versato e del tempo per cui è rimasto dentro (euro × giorni). Se nessuna
//    fonte è pro quota, il resto resta all'azienda;
//  · l'utile da dividere è il margine del piano meno gli interessi, se il piano non li
//    ha già tra i costi (voce «Oneri finanziari»).
// Le colonne sono quelle del resto dell'app: Previsto · Ad oggi · A finire, e la stima
// finale è Ad oggi + A finire.

import type { NumeriInvestitori } from "@/lib/orders/generali/pianoConti";

export const TIPI_FONTE = ["propri", "capitale", "prestito", "banca"] as const;
export type TipoFonte = typeof TIPI_FONTE[number];
export const TIPI_MOVIMENTO = ["versamento", "rimborso", "distribuzione", "interessi"] as const;
export type TipoMovimento = typeof TIPI_MOVIMENTO[number];

export const NOMI_FONTE: Record<TipoFonte, { nome: string; aiuto: string }> = {
  propri: { nome: "Mezzi propri", aiuto: "I soldi dell'azienda o dei soci. Partecipano all'utile come gli investitori a capitale." },
  capitale: { nome: "Investitore a capitale", aiuto: "Mette capitale e riceve una parte dell'utile: pro quota o con una quota fissa pattuita." },
  prestito: { nome: "Investitore a prestito", aiuto: "Presta i soldi a un tasso annuo e li riavrà alla scadenza, con gli interessi." },
  banca: { nome: "Banca o mutuo", aiuto: "Finanziamento bancario: erogazioni, interessi al tasso annuo e rimborsi." },
};

export const NOMI_MOVIMENTO: Record<TipoMovimento, string> = {
  versamento: "Versamento",
  rimborso: "Rimborso del capitale",
  distribuzione: "Distribuzione di utile",
  interessi: "Interessi pagati",
};

/** Come si chiama il versamento per quella fonte: per la banca è un'erogazione. */
export const nomeVersamento = (tipo: TipoFonte) => (tipo === "banca" ? "Erogazione" : "Versamento");

/** I movimenti che una fonte può avere. */
export function movimentiAmmessi(tipo: TipoFonte): TipoMovimento[] {
  return aCapitale(tipo) ? ["versamento", "rimborso", "distribuzione"] : ["versamento", "rimborso", "interessi"];
}

export const aCapitale = (tipo: TipoFonte) => tipo === "propri" || tipo === "capitale";
export const aPrestito = (tipo: TipoFonte) => tipo === "prestito" || tipo === "banca";

export interface Fonte {
  id: string;
  tipo: TipoFonte;
  nome: string;
  soggetto: "persona" | "societa";
  clienteId: string | null;
  email: string | null;
  impegno: number;
  /** Quota fissa di utile, 0–100; null = pro quota. Solo a capitale. */
  quotaUtilePct: number | null;
  /** Tasso annuo semplice, 0–100. Solo a prestito. */
  tassoPct: number | null;
  /** «2027-03-15». */
  dataInizio: string | null;
  scadenza: string | null;
  nota: string | null;
  ordine: number;
}

export interface Movimento {
  id: string;
  fonteId: string;
  tipo: TipoMovimento;
  /** «2027-03-15». */
  data: string;
  importo: number;
  nota: string | null;
}

/** I numeri dell'operazione che servono qui, dal piano economico. */
export interface NumeriOperazione {
  marginePrevisto: number;
  margineStima: number;
  capitaleMassimo: number;
  /** «2027-03». */
  meseCapitaleMassimo: string | null;
  capitaleInvestitoOggi: number;
  /** Primo e ultimo mese del flusso di cassa: «2027-01», «2029-06». */
  inizio: string | null;
  fine: string | null;
  /** Il piano ha già gli interessi tra i costi (voce «Oneri finanziari»): non si tolgono due volte. */
  interessiNelPiano: boolean;
}

export const arrotonda = (n: number) => Math.round(n * 100) / 100;
const somma = (v: number[]) => arrotonda(v.reduce((t, x) => t + x, 0));

const GIORNO = 86_400_000;
const giornoValido = (d: string | null | undefined): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d);
const ms = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

/** Giorni da `da` ad `a` (0 se `a` viene prima). */
export function giorniTra(da: string, a: string): number {
  return Math.max(0, Math.round((ms(a) - ms(da)) / GIORNO));
}

/** «2027-03» → «2027-03-01». */
export const inizioMese = (mese: string) => `${mese.slice(0, 7)}-01`;
/** «2027-02» → «2027-02-28». */
export function fineMese(mese: string): string {
  const a = Number(mese.slice(0, 4));
  const m = Number(mese.slice(5, 7));
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mese.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

const minData = (a: string, b: string) => (a <= b ? a : b);

/**
 * Euro per giorni del capitale rimasto dentro fino a `fino`: ogni versamento conta dal suo
 * giorno, ogni rimborso toglie dal suo. È la base sia degli interessi sia del «pro quota del tempo».
 */
export function capitaleGiorni(movimenti: Pick<Movimento, "tipo" | "data" | "importo">[], fino: string): number {
  let t = 0;
  for (const m of movimenti) {
    if (!giornoValido(m.data)) continue;
    if (m.tipo === "versamento") t += m.importo * giorniTra(m.data, fino);
    else if (m.tipo === "rimborso") t -= m.importo * giorniTra(m.data, fino);
  }
  return Math.max(0, t);
}

/** Interessi semplici al tasso annuo (in %) su euro × giorni. */
export const interessiSu = (euroGiorni: number, tassoPct: number) => arrotonda((euroGiorni * tassoPct) / 100 / 365);

export interface Colonne { previsto: number; adOggi: number; aFinire: number; stima: number }
const colonne = (previsto: number, adOggi: number, aFinire: number): Colonne => ({
  previsto: arrotonda(previsto),
  adOggi: arrotonda(adOggi),
  aFinire: arrotonda(aFinire),
  stima: arrotonda(adOggi + aFinire),
});

export interface ContoFonte {
  fonte: Fonte;
  movimenti: Movimento[];
  versato: number;
  rimborsato: number;
  /** Utile distribuito (a capitale) o interessi pagati (a prestito). */
  pagato: number;
  /** Il capitale che è dentro oggi: versato meno rimborsato. */
  capitaleDentro: number;
  daVersare: number;
  /** Capitale: previsto = impegno, ad oggi = dentro, a finire = ancora da versare. */
  capitale: Colonne;
  /** Utile o interessi: previsto dal piano, ad oggi = già pagato, a finire = ancora da ricevere. */
  rendimento: Colonne;
  /** Solo a prestito: interessi maturati fino a oggi (pagati o no). */
  interessiMaturati: number | null;
  /** Solo a capitale: la quota di utile usata (0–1), previsto e stima. */
  quota: { previsto: number; stima: number } | null;
  /** Quanto riceverà ancora a fine operazione: capitale da restituire più rendimento non ancora pagato. */
  spettaAFine: number;
  /** Rendimento stimato sul capitale (utile o interessi / capitale), 0.12 = 12%. */
  rendimentoPct: number | null;
  /** Da dove viene il numero, in una frase per chi legge. */
  regola: string;
  /** Il giorno fino a cui si contano interessi o tempo. */
  fineConteggio: string;
}

export interface Copertura {
  gruppo: "propri" | "investitori" | "banca";
  nome: string;
  impegno: number;
  dentro: number;
}

export interface ContiInvestitori {
  oggi: string;
  fine: string;
  fonti: ContoFonte[];
  utile: { previsto: number; stima: number; interessiTolti: { previsto: number; stima: number } };
  /** La quota di utile che resta all'azienda perché nessuna fonte è pro quota (0–1). */
  quotaAzienda: { previsto: number; stima: number };
  copertura: Copertura[];
  totali: { impegno: number; dentro: number; daVersare: number; spettaAFine: number };
  /** Quanto manca agli impegni per coprire il picco di esposizione; 0 = coperto. */
  scoperto: number;
  avvisi: string[];
}

const GRUPPO: Record<TipoFonte, Copertura["gruppo"]> = { propri: "propri", capitale: "investitori", prestito: "investitori", banca: "banca" };
const NOMI_GRUPPO: Record<Copertura["gruppo"], string> = { propri: "Mezzi propri", investitori: "Investitori", banca: "Banca" };

/** Il giorno in cui finisce l'operazione: fine dell'ultimo mese del flusso, altrimenti la scadenza più lontana, altrimenti oggi. */
export function fineOperazione(n: Pick<NumeriOperazione, "fine"> | null, fonti: Fonte[], oggi: string): string {
  if (n?.fine && /^\d{4}-\d{2}/.test(n.fine)) return fineMese(n.fine);
  const scadenze = fonti.map((f) => f.scadenza).filter(giornoValido).sort();
  const ultima = scadenze[scadenze.length - 1];
  return ultima && ultima > oggi ? ultima : oggi;
}

interface Base {
  fonte: Fonte;
  movimenti: Movimento[];
  versato: number;
  rimborsato: number;
  pagato: number;
  capitaleDentro: number;
  daVersare: number;
  inizio: string;
  fineConteggio: string;
  /** I movimenti più l'impegno ancora da versare, messo oggi: come andrà se tutti fanno la loro parte. */
  futuri: Pick<Movimento, "tipo" | "data" | "importo">[];
}

function base(fonte: Fonte, movimenti: Movimento[], oggi: string, fine: string): Base {
  const miei = movimenti.filter((m) => m.fonteId === fonte.id && giornoValido(m.data)).sort((a, b) => a.data.localeCompare(b.data));
  const di = (t: TipoMovimento) => somma(miei.filter((m) => m.tipo === t).map((m) => m.importo));
  const versato = di("versamento");
  const rimborsato = di("rimborso");
  const pagato = aCapitale(fonte.tipo) ? di("distribuzione") : di("interessi");
  const daVersare = arrotonda(Math.max(0, fonte.impegno - versato));
  const primoVersamento = miei.find((m) => m.tipo === "versamento")?.data;
  const inizio = giornoValido(fonte.dataInizio) ? fonte.dataInizio : primoVersamento ?? minData(oggi, fine);
  const fineConteggio = aPrestito(fonte.tipo) && giornoValido(fonte.scadenza) ? fonte.scadenza : fine;
  const quando = minData(oggi, fineConteggio) < inizio ? inizio : minData(oggi, fineConteggio);
  const futuri = daVersare > 0 ? [...miei, { tipo: "versamento" as const, data: quando, importo: daVersare }] : miei;
  return {
    fonte, movimenti: miei, versato, rimborsato, pagato,
    capitaleDentro: arrotonda(versato - rimborsato), daVersare, inizio, fineConteggio, futuri,
  };
}

const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;

function contoPrestito(b: Base, oggi: string): ContoFonte {
  const tasso = b.fonte.tassoPct ?? 0;
  const previsto = interessiSu(b.fonte.impegno * giorniTra(b.inizio, b.fineConteggio), tasso);
  const maturati = interessiSu(capitaleGiorni(b.movimenti, minData(oggi, b.fineConteggio)), tasso);
  const stima = interessiSu(capitaleGiorni(b.futuri, b.fineConteggio), tasso);
  const daRicevere = Math.max(0, stima - b.pagato);
  const capitaleFinale = b.capitaleDentro + b.daVersare;
  return {
    fonte: b.fonte,
    movimenti: b.movimenti,
    versato: b.versato,
    rimborsato: b.rimborsato,
    pagato: b.pagato,
    capitaleDentro: b.capitaleDentro,
    daVersare: b.daVersare,
    capitale: colonne(b.fonte.impegno, b.capitaleDentro, b.daVersare),
    rendimento: colonne(previsto, b.pagato, daRicevere),
    interessiMaturati: maturati,
    quota: null,
    spettaAFine: arrotonda(Math.max(0, capitaleFinale) + daRicevere),
    rendimentoPct: capitaleFinale > 0 ? stima / capitaleFinale : null,
    regola: tasso > 0
      ? `Interessi semplici al ${pct(tasso)} annuo su ogni euro, dal giorno del versamento a quello del rimborso, fino al ${dataIt(b.fineConteggio)}.`
      : "Nessun tasso indicato: riceve indietro il capitale, senza interessi.",
    fineConteggio: b.fineConteggio,
  };
}

const dataIt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Tutti i conti delle fonti di una generale. `numeri` null = piano non ancora scritto: niente utile da dividere. */
export function calcolaInvestitori(input: {
  fonti: Fonte[];
  movimenti: Movimento[];
  numeri: NumeriOperazione | null;
  /** «2027-03-15». */
  oggi: string;
}): ContiInvestitori {
  const { numeri, oggi } = input;
  const fonti = [...input.fonti].sort((a, b) => a.ordine - b.ordine || TIPI_FONTE.indexOf(a.tipo) - TIPI_FONTE.indexOf(b.tipo));
  const fine = fineOperazione(numeri, fonti, oggi);
  const basi = fonti.map((f) => base(f, input.movimenti, oggi, fine));
  const avvisi: string[] = [];

  // Chi presta: i suoi interessi sono un costo dell'operazione.
  const prestiti = new Map(basi.filter((b) => aPrestito(b.fonte.tipo)).map((b) => [b.fonte.id, contoPrestito(b, oggi)]));
  const interessiPrevisti = somma([...prestiti.values()].map((c) => c.rendimento.previsto));
  const interessiStima = somma([...prestiti.values()].map((c) => c.rendimento.stima));
  const togli = numeri && !numeri.interessiNelPiano;
  const interessiTolti = { previsto: togli ? interessiPrevisti : 0, stima: togli ? interessiStima : 0 };
  const utile = {
    previsto: numeri ? arrotonda(numeri.marginePrevisto - interessiTolti.previsto) : 0,
    stima: numeri ? arrotonda(numeri.margineStima - interessiTolti.stima) : 0,
    interessiTolti,
  };

  // Chi sta a capitale: prima le quote fisse, poi il resto pro quota di euro × giorni.
  const equity = basi.filter((b) => aCapitale(b.fonte.tipo));
  const fisse = equity.filter((b) => b.fonte.quotaUtilePct !== null);
  const proQuota = equity.filter((b) => b.fonte.quotaUtilePct === null);
  let sommaFisse = fisse.reduce((t, b) => t + (b.fonte.quotaUtilePct ?? 0), 0) / 100;
  let scalaFisse = 1;
  if (sommaFisse > 1 + 1e-9) {
    avvisi.push(`Le quote fisse di utile sommano a ${pct(sommaFisse * 100)}: le ho ridotte in proporzione fino al 100%. Correggile nelle fonti.`);
    scalaFisse = 1 / sommaFisse;
    sommaFisse = 1;
  }
  const resto = Math.max(0, 1 - sommaFisse);

  const pesi = (colonna: "previsto" | "stima") => {
    const p = proQuota.map((b) =>
      colonna === "previsto" ? b.fonte.impegno * giorniTra(b.inizio, fine) : capitaleGiorni(b.futuri, fine),
    );
    const tot = p.reduce((t, x) => t + x, 0);
    if (tot > 0) return p.map((x) => x / tot);
    // Nessun capitale nel tempo (niente impegni né versamenti): parti uguali.
    return proQuota.map(() => (proQuota.length ? 1 / proQuota.length : 0));
  };
  const pesiPrevisto = pesi("previsto");
  let pesiStima = pesi("stima");
  if (proQuota.length && proQuota.every((b) => capitaleGiorni(b.futuri, fine) === 0)) pesiStima = pesiPrevisto;

  const quote = new Map<string, { previsto: number; stima: number }>();
  for (const b of fisse) {
    const q = ((b.fonte.quotaUtilePct ?? 0) / 100) * scalaFisse;
    quote.set(b.fonte.id, { previsto: q, stima: q });
  }
  proQuota.forEach((b, i) => quote.set(b.fonte.id, { previsto: resto * pesiPrevisto[i], stima: resto * pesiStima[i] }));
  const quotaAzienda = proQuota.length ? { previsto: 0, stima: 0 } : { previsto: resto, stima: resto };

  const contoCapitale = (b: Base): ContoFonte => {
    const q = quote.get(b.fonte.id) ?? { previsto: 0, stima: 0 };
    const utilePrevisto = arrotonda(utile.previsto * q.previsto);
    const utileStima = arrotonda(utile.stima * q.stima);
    const daRicevere = utileStima - b.pagato;
    const capitaleFinale = b.capitaleDentro + b.daVersare;
    const fissa = b.fonte.quotaUtilePct !== null;
    return {
      fonte: b.fonte,
      movimenti: b.movimenti,
      versato: b.versato,
      rimborsato: b.rimborsato,
      pagato: b.pagato,
      capitaleDentro: b.capitaleDentro,
      daVersare: b.daVersare,
      capitale: colonne(b.fonte.impegno, b.capitaleDentro, b.daVersare),
      rendimento: colonne(utilePrevisto, b.pagato, daRicevere),
      interessiMaturati: null,
      quota: q,
      spettaAFine: arrotonda(Math.max(0, capitaleFinale + daRicevere)),
      rendimentoPct: capitaleFinale > 0 ? utileStima / capitaleFinale : null,
      regola: fissa
        ? `Quota fissa pattuita: ${pct((b.fonte.quotaUtilePct ?? 0) * scalaFisse)} dell'utile dell'operazione, qualunque sia il capitale versato.`
        : `Pro quota: ${pct(q.stima * 100)} dell'utile, in proporzione al capitale versato e ai giorni per cui resta nell'operazione${sommaFisse > 0 ? `, sulla parte che resta dopo le quote fisse (${pct(resto * 100)})` : ""}.`,
      fineConteggio: fine,
    };
  };

  const conti = basi.map((b) => (aPrestito(b.fonte.tipo) ? prestiti.get(b.fonte.id)! : contoCapitale(b)));

  const copertura = (["propri", "investitori", "banca"] as const).map((g) => {
    const del = conti.filter((c) => GRUPPO[c.fonte.tipo] === g);
    return { gruppo: g, nome: NOMI_GRUPPO[g], impegno: somma(del.map((c) => Math.max(c.fonte.impegno, c.versato))), dentro: somma(del.map((c) => c.capitaleDentro)) };
  });
  const impegno = somma(copertura.map((c) => c.impegno));
  const dentro = somma(copertura.map((c) => c.dentro));
  const scoperto = numeri ? arrotonda(Math.max(0, numeri.capitaleMassimo - impegno)) : 0;
  if (numeri && scoperto >= 1) {
    avvisi.push(
      `Le fonti coprono ${eur(impegno)} su un capitale massimo impegnato di ${eur(numeri.capitaleMassimo)}${numeri.meseCapitaleMassimo ? ` (${meseIt(numeri.meseCapitaleMassimo)})` : ""}: mancano ${eur(scoperto)} al picco di esposizione.`,
    );
  }
  if (numeri && numeri.capitaleInvestitoOggi - dentro >= 1) {
    avvisi.push(`A oggi l'operazione ha assorbito ${eur(numeri.capitaleInvestitoOggi)}, ma dalle fonti ne sono entrati ${eur(dentro)}: la differenza la sta anticipando l'azienda.`);
  }
  for (const c of conti) {
    if (aPrestito(c.fonte.tipo) && !c.fonte.tassoPct) avvisi.push(`${c.fonte.nome}: manca il tasso, gli interessi sono a zero.`);
    if (c.versato - c.fonte.impegno >= 1 && c.fonte.impegno > 0) avvisi.push(`${c.fonte.nome} ha versato ${eur(c.versato)}, più dell'impegno di ${eur(c.fonte.impegno)}.`);
    if (c.rimborsato - c.versato >= 1) avvisi.push(`${c.fonte.nome}: i rimborsi superano i versamenti, controlla i movimenti.`);
  }
  if (!numeri && equity.length) avvisi.push("Il piano economico non c'è ancora: senza la stima finale l'utile da dividere è zero.");

  return {
    oggi,
    fine,
    fonti: conti,
    utile,
    quotaAzienda,
    copertura,
    totali: { impegno, dentro, daVersare: somma(conti.map((c) => c.daVersare)), spettaAFine: somma(conti.map((c) => c.spettaAFine)) },
    scoperto,
    avvisi,
  };
}

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur = (n: number) => EURO.format(n);
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const meseIt = (m: string) => `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** La regola di ripartizione in frasi, per la scheda e per il PDF. */
export function spiegaRegola(c: ContiInvestitori): string[] {
  const righe: string[] = [];
  const fisse = c.fonti.filter((f) => aCapitale(f.fonte.tipo) && f.fonte.quotaUtilePct !== null);
  const proQuota = c.fonti.filter((f) => aCapitale(f.fonte.tipo) && f.fonte.quotaUtilePct === null);
  righe.push(
    c.utile.interessiTolti.stima > 0
      ? `L'utile da dividere è il margine a finire del piano meno gli interessi di chi presta (${eur(c.utile.interessiTolti.stima)}).`
      : "L'utile da dividere è il margine a finire del piano: gli interessi di chi presta sono già tra i suoi costi.",
  );
  if (fisse.length) righe.push(`Prima le quote fisse pattuite: ${fisse.map((f) => `${f.fonte.nome} ${pct((f.quota?.stima ?? 0) * 100)}`).join(", ")}.`);
  if (proQuota.length) {
    righe.push(
      `${fisse.length ? "Il resto" : "Tutto l'utile"} si divide pro quota tra ${proQuota.map((f) => f.fonte.nome).join(", ")}: conta il capitale versato per i giorni in cui resta nell'operazione, quindi chi entra prima e con di più prende di più. L'impegno non ancora versato si conta da oggi.`,
    );
  } else if (c.quotaAzienda.stima > 0) {
    righe.push(`Nessuna fonte è pro quota: il ${pct(c.quotaAzienda.stima * 100)} che resta dopo le quote fisse rimane all'azienda.`);
  }
  if (c.fonti.some((f) => aPrestito(f.fonte.tipo))) {
    righe.push("Chi presta riceve il capitale e gli interessi semplici al suo tasso annuo, dal versamento al rimborso: non partecipa all'utile né alle perdite.");
  }
  righe.push(`Se l'operazione va in perdita, chi sta a capitale la divide con le stesse quote, fino al capitale versato.`);
  return righe;
}

/**
 * I numeri dell'operazione dal piano economico. Gli interessi sono «già nel piano» se il
 * piano ha una voce di oneri finanziari con un importo: in quel caso non si tolgono di nuovo.
 */
export function numeriDalPiano(
  n: NumeriInvestitori,
  costi: { categoria: string; previsto: number; stima: number }[],
): NumeriOperazione {
  const mesi = n.flussoMensile.map((m) => m.mese).filter((m) => /^\d{4}-\d{2}/.test(m)).sort();
  return {
    marginePrevisto: n.previsto.margine,
    margineStima: n.stimaFinale.margine,
    capitaleMassimo: n.capitaleMassimoImpegnato,
    meseCapitaleMassimo: n.meseCapitaleMassimo,
    capitaleInvestitoOggi: n.capitaleInvestitoOggi,
    inizio: mesi[0] ?? null,
    fine: mesi[mesi.length - 1] ?? null,
    interessiNelPiano: costi.some((r) => r.categoria === "finanziari" && (r.previsto > 0 || r.stima > 0)),
  };
}

// src/lib/orders/generali/investitoriConti.ts
// Fonti di finanziamento della commessa generale: mezzi propri, investitori, banca, mutuo
// e altri finanziamenti. Chi ha messo i soldi, quanto costa il debito, quanto spetta a
// ciascuno a fine operazione e quanto rendono i mezzi propri rispetto all'operazione
// (l'effetto leva). Solo conti, senza React né database: i fatti (fonti e movimenti)
// arrivano da generale_fonti / generale_fonti_movimenti, la stima finale e il fabbisogno
// di cassa dal piano economico (numeriPerInvestitori in pianoConti.ts).
//
// Le regole, scritte anche nell'interfaccia (spiegaRegola):
//  · chi presta (investitore a prestito, banca, mutuo, fido, prestito soci, leasing)
//    riceve il capitale più gli interessi semplici al tasso annuo, su ogni euro dal giorno
//    del versamento (o dell'erogazione) a quello del rimborso, fino alla scadenza o alla
//    fine dell'operazione. Il rimborso segue il suo piano: tutto alla scadenza, a rate
//    costanti di capitale, oppure con le vendite (frazionamento o accollo sulle unità);
//  · il costo del debito è interessi più spese (istruttoria, perizia, notaio…);
//  · l'impegno non ancora versato entra quando il piano ne ha bisogno: ogni mese si copre
//    il fabbisogno di cassa del piano prima con i mezzi propri, poi con gli investitori,
//    poi con la banca e gli altri finanziamenti. Senza piano, si conta da oggi;
//  · chi sta a capitale (mezzi propri, investitore a capitale) si divide l'utile: prima
//    le quote fisse pattuite, poi il resto pro quota del capitale per il tempo in cui
//    resta dentro (euro × giorni). Se nessuna fonte è pro quota, il resto resta all'azienda;
//  · l'utile da dividere è il margine del piano meno il costo del debito, se il piano non
//    l'ha già tra i costi (voce «Oneri finanziari»).
// Le colonne sono quelle del resto dell'app: Previsto · Ad oggi · A finire, e la stima
// finale è Ad oggi + A finire.

import { distanzaMesi, tirAnnuo, type NumeriInvestitori } from "@/lib/orders/generali/pianoConti";

export const TIPI_FONTE = ["propri", "capitale", "prestito", "banca", "finanziamento"] as const;
export type TipoFonte = typeof TIPI_FONTE[number];
export const TIPI_MOVIMENTO = ["versamento", "rimborso", "distribuzione", "interessi", "spese", "accollo"] as const;
export type TipoMovimento = typeof TIPI_MOVIMENTO[number];
export const FORME_DEBITO = ["mutuo_fondiario", "finanziamento", "fido", "prestito_soci", "leasing", "altro"] as const;
export type FormaDebito = typeof FORME_DEBITO[number];
export const PIANI_RIMBORSO = ["scadenza", "rate", "vendite"] as const;
export type PianoRimborso = typeof PIANI_RIMBORSO[number];

export const NOMI_FONTE: Record<TipoFonte, { nome: string; aiuto: string }> = {
  propri: { nome: "Mezzi propri", aiuto: "I soldi dell'azienda o dei soci. Partecipano all'utile come gli investitori a capitale." },
  capitale: { nome: "Investitore a capitale", aiuto: "Mette capitale e riceve una parte dell'utile: pro quota o con una quota fissa pattuita." },
  prestito: { nome: "Investitore a prestito", aiuto: "Presta i soldi a un tasso annuo e li riavrà alla scadenza, con gli interessi." },
  banca: { nome: "Banca o mutuo", aiuto: "Mutuo fondiario o finanziamento bancario: importo deliberato, erogazioni a SAL, tasso, spese e rimborso." },
  finanziamento: { nome: "Altro finanziamento", aiuto: "Fido, prestito soci, leasing o altro debito: tasso, spese e piano di rimborso." },
};

export const NOMI_FORMA: Record<FormaDebito, string> = {
  mutuo_fondiario: "Mutuo fondiario",
  finanziamento: "Finanziamento",
  fido: "Fido",
  prestito_soci: "Prestito soci",
  leasing: "Leasing",
  altro: "Altro",
};

export const NOMI_RIMBORSO: Record<PianoRimborso, { nome: string; aiuto: string }> = {
  scadenza: { nome: "Tutto alla scadenza", aiuto: "Il capitale torna in una volta sola alla scadenza (o a fine operazione)." },
  rate: { nome: "A rate", aiuto: "Quote di capitale uguali ogni mese, dall'inizio dell'ammortamento all'ultima rata." },
  vendite: { nome: "Con le vendite", aiuto: "Frazionamento o accollo: il debito scende man mano che le unità si vendono." },
};

export const NOMI_MOVIMENTO: Record<TipoMovimento, string> = {
  versamento: "Versamento",
  rimborso: "Rimborso del capitale",
  distribuzione: "Distribuzione di utile",
  interessi: "Interessi pagati",
  spese: "Spese pagate",
  accollo: "Accollo all'acquirente",
};

export const aCapitale = (tipo: TipoFonte) => tipo === "propri" || tipo === "capitale";
export const aPrestito = (tipo: TipoFonte) => tipo === "prestito" || tipo === "banca" || tipo === "finanziamento";
/** Debito verso banche e finanziatori (non verso gli investitori). */
export const aDebito = (tipo: TipoFonte) => tipo === "banca" || tipo === "finanziamento";

/** Come si chiama il versamento per quella fonte: per banca e finanziamenti è un'erogazione. */
export const nomeVersamento = (tipo: TipoFonte) => (aDebito(tipo) ? "Erogazione" : "Versamento");

/** I movimenti che una fonte può avere. */
export function movimentiAmmessi(tipo: TipoFonte): TipoMovimento[] {
  if (aCapitale(tipo)) return ["versamento", "rimborso", "distribuzione"];
  return aDebito(tipo) ? ["versamento", "rimborso", "interessi", "spese", "accollo"] : ["versamento", "rimborso", "interessi", "spese"];
}

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
  /** Solo banca e finanziamento. */
  forma?: FormaDebito | null;
  speseIniziali?: number;
  rimborso?: PianoRimborso;
  ammortamentoDal?: string | null;
}

export interface Movimento {
  id: string;
  fonteId: string;
  tipo: TipoMovimento;
  /** «2027-03-15». */
  data: string;
  importo: number;
  nota: string | null;
  unitaId?: string | null;
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
  /** Gli oneri finanziari già nel piano (per il margine prima del debito). */
  oneriNelPiano?: { previsto: number; stima: number };
  /** Il capitale che l'operazione chiede mese per mese (meno il cumulato della cassa, mai sotto zero). */
  fabbisogno?: { mese: string; importo: number }[];
  /** TIR annuo del progetto dal piano. */
  tirProgetto?: number | null;
}

/** Uno scenario sul debito: «tasso +1%», «mutuo più basso del 30%». */
export interface ScenarioDebito {
  /** Punti di tasso in più (o in meno) su tutto ciò che è a prestito. */
  tassoPunti: number;
  /** Variazione percentuale dell'importo di banca e finanziamenti: −30 = il 30% in meno. */
  debitoPct: number;
}
export const scenarioDebitoNeutro = (s: ScenarioDebito | null | undefined) => !s || (s.tassoPunti === 0 && s.debitoPct === 0);

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
/** «2027-12» + 1 → «2028-01». */
export function meseDopo(mese: string, n = 1): string {
  const t = Number(mese.slice(0, 4)) * 12 + Number(mese.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

const minData = (a: string, b: string) => (a <= b ? a : b);
const maxData = (a: string, b: string) => (a >= b ? a : b);

type Passo = Pick<Movimento, "tipo" | "data" | "importo">;

/** Dentro o fuori dal capitale: versamenti +, rimborsi e accolli −, il resto non conta. */
const segno = (t: TipoMovimento) => (t === "versamento" ? 1 : t === "rimborso" || t === "accollo" ? -1 : 0);

/**
 * Euro per giorni del capitale rimasto dentro fino a `fino`: ogni versamento conta dal suo
 * giorno, ogni rimborso (o accollo) toglie dal suo. È la base sia degli interessi sia del
 * «pro quota del tempo».
 */
export function capitaleGiorni(movimenti: Passo[], fino: string): number {
  let t = 0;
  for (const m of movimenti) {
    if (!giornoValido(m.data)) continue;
    t += segno(m.tipo) * m.importo * giorniTra(m.data, fino);
  }
  return Math.max(0, t);
}

/** Interessi semplici al tasso annuo (in %) su euro × giorni. */
export const interessiSu = (euroGiorni: number, tassoPct: number) => arrotonda((euroGiorni * tassoPct) / 100 / 365);

/** TIR annuo da flussi con la data, raccolti per mese. null se non cambiano mai segno. */
export function tirDaFlussi(flussi: { data: string; importo: number }[]): number | null {
  const validi = flussi.filter((f) => giornoValido(f.data) && Math.abs(f.importo) >= 0.005);
  if (validi.length < 2) return null;
  const mesi = validi.map((f) => f.data.slice(0, 7)).sort();
  const primo = mesi[0];
  const n = distanzaMesi(primo, mesi[mesi.length - 1]) + 1;
  if (n > 600) return null;
  const serie = new Array<number>(n).fill(0);
  for (const f of validi) serie[distanzaMesi(primo, f.data.slice(0, 7))] += f.importo;
  return tirAnnuo(serie);
}

/**
 * Le quote di capitale del piano di rimborso, da `da` in poi: tutto alla scadenza, a rate
 * mensili costanti fino alla scadenza, o con le vendite (a fine operazione).
 */
export function rimborsiPianificati(piano: PianoRimborso, capitale: number, da: string, scadenza: string, fine: string): Passo[] {
  if (capitale < 0.005) return [];
  if (piano === "vendite") return [{ tipo: "rimborso", data: minData(fine, scadenza), importo: arrotonda(capitale) }];
  if (piano === "rate" && da < scadenza) {
    const mesi: string[] = [];
    for (let m = da.slice(0, 7); m <= scadenza.slice(0, 7) && mesi.length < 600; m = meseDopo(m)) mesi.push(m);
    const quota = Math.floor((capitale / mesi.length) * 100) / 100;
    return mesi.map((m, i) => ({
      tipo: "rimborso" as const,
      data: i === mesi.length - 1 ? scadenza : maxData(fineMese(m), da),
      importo: i === mesi.length - 1 ? arrotonda(capitale - quota * (mesi.length - 1)) : quota,
    }));
  }
  return [{ tipo: "rimborso", data: scadenza, importo: arrotonda(capitale) }];
}

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
  /** Il capitale che è dentro oggi: versato meno rimborsato (e accollato). */
  capitaleDentro: number;
  /** L'impegno non ancora versato. */
  daVersare: number;
  /** Quanto dell'impegno servirà secondo il fabbisogno del piano (senza piano: tutto). */
  daUsare: number;
  /** Capitale: previsto = impegno, ad oggi = dentro, a finire = ancora da versare secondo il piano. */
  capitale: Colonne;
  /** Utile o interessi: previsto dal piano, ad oggi = già pagato, a finire = ancora da ricevere. */
  rendimento: Colonne;
  /** Solo a prestito: interessi maturati fino a oggi (pagati o no). */
  interessiMaturati: number | null;
  /** Solo a prestito: le spese del finanziamento. */
  spese: Colonne | null;
  /** Solo a prestito: interessi più spese sul capitale medio annuo (0.06 = 6%). */
  costoAnnuo: number | null;
  /** Solo a capitale: la quota di utile usata (0–1), previsto e stima. */
  quota: { previsto: number; stima: number } | null;
  /** Quanto riceverà ancora a fine operazione: capitale da restituire più rendimento non ancora pagato. */
  spettaAFine: number;
  /** Rendimento stimato sul capitale (utile o interessi / capitale), 0.12 = 12%. */
  rendimentoPct: number | null;
  /** TIR annuo dal suo punto di vista: soldi dati, soldi tornati e quelli che torneranno. */
  tir: number | null;
  /** Da dove viene il numero, in una frase per chi legge. */
  regola: string;
  /** Il giorno fino a cui si contano interessi o tempo. */
  fineConteggio: string;
  /** I movimenti che il conto prevede da qui alla fine (prelievi e rimborsi), per i grafici. */
  proiezione: Passo[];
}

export type GruppoFonte = "propri" | "investitori" | "debito";
export interface Copertura { gruppo: GruppoFonte; nome: string; impegno: number; dentro: number }

export interface MeseComposizione {
  mese: string;
  propri: number;
  investitori: number;
  debito: number;
  /** Il capitale che il piano chiede quel mese. */
  fabbisogno: number;
  /** Mese passato (movimenti veri) o futuro (proiezione). */
  reale: boolean;
}

export interface MeseCostoDebito { mese: string; interessi: number; spese: number; reale: boolean }

export interface Rendimenti {
  /** L'operazione come se fosse tutta a capitale: margine prima del costo del debito sul capitale massimo. */
  progetto: { margine: number; capitale: number; roi: number | null; tir: number | null };
  /** I mezzi propri: utile che gli resta dopo debito e investitori, sul capitale messo. */
  mezziPropri: { capitale: number; utile: number; roe: number | null; tir: number | null } | null;
  /** ROE meno ROI, in punti: positivo = il debito e gli investitori fanno rendere di più i mezzi propri. */
  leva: number | null;
}

export interface ContiInvestitori {
  oggi: string;
  /** C'è un piano economico da cui prendere margine e fabbisogno. */
  haPiano: boolean;
  fine: string;
  fonti: ContoFonte[];
  utile: { previsto: number; stima: number; interessiTolti: { previsto: number; stima: number } };
  /** La quota di utile che resta all'azienda perché nessuna fonte è pro quota (0–1). */
  quotaAzienda: { previsto: number; stima: number };
  copertura: Copertura[];
  totali: { impegno: number; dentro: number; daVersare: number; spettaAFine: number };
  /** Quanto manca agli impegni per coprire il picco di esposizione; 0 = coperto. */
  scoperto: number;
  /** Interessi e spese di tutto ciò che è a prestito. */
  costoDebito: { interessi: Colonne; spese: Colonne; totale: number; costoAnnuo: number | null; mensile: MeseCostoDebito[] };
  composizione: MeseComposizione[];
  rendimenti: Rendimenti;
  avvisi: string[];
}

const GRUPPO: Record<TipoFonte, GruppoFonte> = { propri: "propri", capitale: "investitori", prestito: "investitori", banca: "debito", finanziamento: "debito" };
export const NOMI_GRUPPO: Record<GruppoFonte, string> = { propri: "Mezzi propri", investitori: "Investitori", debito: "Banca e finanziamenti" };
/** Chi copre per primo il fabbisogno del piano. */
const ORDINE_PRELIEVO: Record<TipoFonte, number> = { propri: 0, capitale: 1, prestito: 2, banca: 3, finanziamento: 4 };

/** Il giorno in cui finisce l'operazione: fine dell'ultimo mese del flusso, altrimenti la scadenza più lontana, altrimenti oggi. */
export function fineOperazione(n: Pick<NumeriOperazione, "fine"> | null, fonti: Fonte[], oggi: string): string {
  if (n?.fine && /^\d{4}-\d{2}/.test(n.fine)) return fineMese(n.fine);
  const scadenze = fonti.map((f) => f.scadenza).filter(giornoValido).sort();
  const ultima = scadenze[scadenze.length - 1];
  return ultima && ultima > oggi ? ultima : oggi;
}

/** La fonte con lo scenario applicato: tasso spostato, debito ridotto. */
function conScenario(f: Fonte, s: ScenarioDebito | null): Fonte {
  if (!s || scenarioDebitoNeutro(s)) return f;
  const tasso = aPrestito(f.tipo) && f.tassoPct !== null ? Math.max(0, f.tassoPct + s.tassoPunti) : f.tassoPct;
  const impegno = aDebito(f.tipo) ? Math.max(0, arrotonda(f.impegno * (1 + s.debitoPct / 100))) : f.impegno;
  return { ...f, tassoPct: tasso, impegno };
}

interface Base {
  fonte: Fonte;
  movimenti: Movimento[];
  versato: number;
  rimborsato: number;
  pagato: number;
  spesePagate: number;
  capitaleDentro: number;
  daVersare: number;
  inizio: string;
  fineConteggio: string;
  prelievi: Passo[];
  /** Movimenti veri, prelievi futuri e rimborsi del piano: come andrà. */
  futuri: Passo[];
  rimborsiFuturi: Passo[];
}

function base(fonte: Fonte, movimenti: Movimento[], oggi: string, fine: string): Omit<Base, "prelievi" | "futuri" | "rimborsiFuturi"> {
  const miei = movimenti.filter((m) => m.fonteId === fonte.id && giornoValido(m.data)).sort((a, b) => a.data.localeCompare(b.data));
  const di = (t: TipoMovimento) => somma(miei.filter((m) => m.tipo === t).map((m) => m.importo));
  const versato = di("versamento");
  const rimborsato = arrotonda(di("rimborso") + di("accollo"));
  const pagato = aCapitale(fonte.tipo) ? di("distribuzione") : di("interessi");
  const daVersare = arrotonda(Math.max(0, fonte.impegno - versato));
  const primoVersamento = miei.find((m) => m.tipo === "versamento")?.data;
  const inizio = giornoValido(fonte.dataInizio) ? fonte.dataInizio : primoVersamento ?? minData(oggi, fine);
  const fineConteggio = aPrestito(fonte.tipo) && giornoValido(fonte.scadenza) ? fonte.scadenza : fine;
  return {
    fonte, movimenti: miei, versato, rimborsato, pagato, spesePagate: di("spese"),
    capitaleDentro: arrotonda(versato - rimborsato), daVersare, inizio, fineConteggio,
  };
}

/**
 * Quando entra l'impegno non ancora versato. Con il fabbisogno del piano: mese per mese,
 * quanto serve, prima i mezzi propri, poi gli investitori, poi banca e finanziamenti
 * (le erogazioni a SAL). Senza piano: tutto oggi.
 */
function prelievi(basi: ReturnType<typeof base>[], numeri: NumeriOperazione | null, oggi: string): Map<string, Passo[]> {
  const fuori = new Map<string, Passo[]>(basi.map((b): [string, Passo[]] => [b.fonte.id, []]));
  const quando = (b: ReturnType<typeof base>, data: string) => {
    const d = maxData(data, b.inizio);
    return minData(d, maxData(b.fineConteggio, b.inizio));
  };
  const fabbisogno = (numeri?.fabbisogno ?? []).filter((f) => /^\d{4}-\d{2}/.test(f.mese)).sort((a, b) => a.mese.localeCompare(b.mese));
  if (fabbisogno.length === 0) {
    for (const b of basi) if (b.daVersare > 0) fuori.get(b.fonte.id)!.push({ tipo: "versamento", data: quando(b, oggi), importo: b.daVersare });
    return fuori;
  }
  const ordine = [...basi].sort((a, b) => ORDINE_PRELIEVO[a.fonte.tipo] - ORDINE_PRELIEVO[b.fonte.tipo] || a.fonte.ordine - b.fonte.ordine);
  const rimasto = new Map(basi.map((b) => [b.fonte.id, b.daVersare]));
  let dentro = basi.reduce((t, b) => t + Math.max(0, b.capitaleDentro), 0);
  const meseOggi = oggi.slice(0, 7);
  for (const f of fabbisogno) {
    if (f.mese < meseOggi) continue;
    let serve = f.importo - dentro;
    if (serve < 0.5) continue;
    const data = f.mese === meseOggi ? oggi : inizioMese(f.mese);
    for (const b of ordine) {
      const r = rimasto.get(b.fonte.id) ?? 0;
      if (r <= 0 || serve < 0.005) continue;
      const preso = arrotonda(Math.min(r, serve));
      fuori.get(b.fonte.id)!.push({ tipo: "versamento", data: quando(b, data), importo: preso });
      rimasto.set(b.fonte.id, arrotonda(r - preso));
      serve -= preso;
      dentro += preso;
    }
  }
  return fuori;
}

const pct = (n: number) => `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`;
const dataIt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

function contoPrestito(b: Base, oggi: string): ContoFonte {
  const f = b.fonte;
  const tasso = f.tassoPct ?? 0;
  const piano = f.rimborso ?? "scadenza";
  const inizioAmm = giornoValido(f.ammortamentoDal) ? f.ammortamentoDal : b.inizio;
  // Il previsto: tutto l'impegno erogato all'inizio e rimborsato col suo piano.
  const simulato: Passo[] = [{ tipo: "versamento", data: b.inizio, importo: f.impegno }, ...rimborsiPianificati(piano, f.impegno, inizioAmm, b.fineConteggio, b.fineConteggio)];
  const previsto = interessiSu(capitaleGiorni(simulato, b.fineConteggio), tasso);
  const maturati = interessiSu(capitaleGiorni(b.movimenti, minData(oggi, b.fineConteggio)), tasso);
  const euroGiorni = capitaleGiorni(b.futuri, b.fineConteggio);
  const stima = interessiSu(euroGiorni, tasso);
  const daRicevere = Math.max(0, stima - b.pagato);
  const daUsare = somma(b.prelievi.map((p) => p.importo));
  const capitaleFinale = b.capitaleDentro + daUsare;
  const spesePreviste = f.speseIniziali ?? 0;
  const spese = colonne(spesePreviste, b.spesePagate, Math.max(0, spesePreviste - b.spesePagate));
  const anni = euroGiorni / 365;
  // Dal suo punto di vista: dà le erogazioni, riceve rimborsi e interessi (gli accolli li paga l'acquirente).
  const flussi = [
    ...b.movimenti.map((m) => ({ data: m.data, importo: m.tipo === "versamento" ? -m.importo : m.tipo === "spese" ? 0 : m.importo })),
    ...b.prelievi.map((p) => ({ data: p.data, importo: -p.importo })),
    ...b.rimborsiFuturi.map((p) => ({ data: p.data, importo: p.importo })),
    { data: b.fineConteggio, importo: daRicevere },
  ];
  const rimborsoTesto = piano === "rate" ? ` Rimborso a rate mensili di capitale dal ${dataIt(inizioAmm)}.` : piano === "vendite" ? " Rimborso con le vendite delle unità (frazionamento o accollo)." : "";
  return {
    fonte: f,
    movimenti: b.movimenti,
    versato: b.versato,
    rimborsato: b.rimborsato,
    pagato: b.pagato,
    capitaleDentro: b.capitaleDentro,
    daVersare: b.daVersare,
    daUsare,
    capitale: colonne(f.impegno, b.capitaleDentro, daUsare),
    rendimento: colonne(previsto, b.pagato, daRicevere),
    interessiMaturati: maturati,
    spese,
    costoAnnuo: anni > 0 ? (stima + spese.stima) / anni : null,
    quota: null,
    spettaAFine: arrotonda(Math.max(0, capitaleFinale) + daRicevere),
    rendimentoPct: capitaleFinale > 0 ? stima / capitaleFinale : null,
    tir: tirDaFlussi(flussi),
    regola: (tasso > 0
      ? `Interessi semplici al ${pct(tasso)} annuo su ogni euro, dal giorno ${aDebito(f.tipo) ? "dell'erogazione" : "del versamento"} a quello del rimborso, fino al ${dataIt(b.fineConteggio)}.`
      : "Nessun tasso indicato: riceve indietro il capitale, senza interessi.") + rimborsoTesto,
    fineConteggio: b.fineConteggio,
    proiezione: [...b.prelievi, ...b.rimborsiFuturi],
  };
}

/** Tutti i conti delle fonti di una generale. `numeri` null = piano non ancora scritto: niente utile da dividere. */
export function calcolaInvestitori(input: {
  fonti: Fonte[];
  movimenti: Movimento[];
  numeri: NumeriOperazione | null;
  /** «2027-03-15». */
  oggi: string;
  scenario?: ScenarioDebito | null;
}): ContiInvestitori {
  const { numeri, oggi } = input;
  const scenario = input.scenario ?? null;
  const fonti = [...input.fonti]
    .map((f) => conScenario(f, scenario))
    .sort((a, b) => a.ordine - b.ordine || TIPI_FONTE.indexOf(a.tipo) - TIPI_FONTE.indexOf(b.tipo));
  const fine = fineOperazione(numeri, fonti, oggi);
  const parziali = fonti.map((f) => base(f, input.movimenti, oggi, fine));
  const prese = prelievi(parziali, numeri, oggi);
  const basi: Base[] = parziali.map((p) => {
    const pre = prese.get(p.fonte.id) ?? [];
    const capitaleFinale = p.capitaleDentro + pre.reduce((t, x) => t + x.importo, 0);
    const daQui = maxData(oggi, giornoValido(p.fonte.ammortamentoDal) ? p.fonte.ammortamentoDal : p.inizio);
    // Il capitale torna: chi presta col suo piano, chi sta a capitale a fine operazione.
    const rimborsiFuturi = aPrestito(p.fonte.tipo)
      ? rimborsiPianificati(p.fonte.rimborso ?? "scadenza", capitaleFinale, daQui, maxData(p.fineConteggio, oggi), fine)
      : capitaleFinale > 0.005 ? [{ tipo: "rimborso" as const, data: maxData(fine, oggi), importo: arrotonda(capitaleFinale) }] : [];
    return { ...p, prelievi: pre, rimborsiFuturi, futuri: [...p.movimenti, ...pre, ...(aPrestito(p.fonte.tipo) ? rimborsiFuturi : [])] };
  });
  const avvisi: string[] = [];

  // Chi presta: interessi e spese sono il costo del debito, un costo dell'operazione.
  const prestiti = new Map(basi.filter((b) => aPrestito(b.fonte.tipo)).map((b) => [b.fonte.id, contoPrestito(b, oggi)]));
  const contiPrestito = [...prestiti.values()];
  const interessi = colonne(
    somma(contiPrestito.map((c) => c.rendimento.previsto)),
    somma(contiPrestito.map((c) => c.rendimento.adOggi)),
    somma(contiPrestito.map((c) => c.rendimento.aFinire)),
  );
  const spese = colonne(
    somma(contiPrestito.map((c) => c.spese!.previsto)),
    somma(contiPrestito.map((c) => c.spese!.adOggi)),
    somma(contiPrestito.map((c) => c.spese!.aFinire)),
  );
  const euroAnni = basi.filter((b) => aPrestito(b.fonte.tipo)).reduce((t, b) => t + capitaleGiorni(b.futuri, b.fineConteggio) / 365, 0);
  const togli = numeri && !numeri.interessiNelPiano;
  const interessiTolti = {
    previsto: togli ? arrotonda(interessi.previsto + spese.previsto) : 0,
    stima: togli ? arrotonda(interessi.stima + spese.stima) : 0,
  };
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
    const daUsare = somma(b.prelievi.map((p) => p.importo));
    const capitaleFinale = b.capitaleDentro + daUsare;
    const spetta = arrotonda(Math.max(0, capitaleFinale + daRicevere));
    const fissa = b.fonte.quotaUtilePct !== null;
    const flussi = [
      ...b.movimenti.map((m) => ({ data: m.data, importo: m.tipo === "versamento" ? -m.importo : m.importo })),
      ...b.prelievi.map((p) => ({ data: p.data, importo: -p.importo })),
      { data: maxData(fine, oggi), importo: spetta },
    ];
    return {
      fonte: b.fonte,
      movimenti: b.movimenti,
      versato: b.versato,
      rimborsato: b.rimborsato,
      pagato: b.pagato,
      capitaleDentro: b.capitaleDentro,
      daVersare: b.daVersare,
      daUsare,
      capitale: colonne(b.fonte.impegno, b.capitaleDentro, daUsare),
      rendimento: colonne(utilePrevisto, b.pagato, daRicevere),
      interessiMaturati: null,
      spese: null,
      costoAnnuo: null,
      quota: q,
      spettaAFine: spetta,
      rendimentoPct: capitaleFinale > 0 ? utileStima / capitaleFinale : null,
      tir: tirDaFlussi(flussi),
      regola: fissa
        ? `Quota fissa pattuita: ${pct((b.fonte.quotaUtilePct ?? 0) * scalaFisse)} dell'utile dell'operazione, qualunque sia il capitale versato.`
        : `Pro quota: ${pct(q.stima * 100)} dell'utile, in proporzione al capitale versato e ai giorni per cui resta nell'operazione${sommaFisse > 0 ? `, sulla parte che resta dopo le quote fisse (${pct(resto * 100)})` : ""}.`,
      fineConteggio: fine,
      proiezione: [...b.prelievi, ...b.rimborsiFuturi],
    };
  };

  const conti = basi.map((b) => (aPrestito(b.fonte.tipo) ? prestiti.get(b.fonte.id)! : contoCapitale(b)));

  const copertura = (["propri", "investitori", "debito"] as const).map((g) => {
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
    if (aPrestito(c.fonte.tipo) && c.fonte.scadenza && c.fonte.scadenza < fine && c.fonte.rimborso !== "vendite") {
      avvisi.push(`${c.fonte.nome} scade il ${dataIt(c.fonte.scadenza)}, prima della fine dell'operazione (${dataIt(fine)}): serve la cassa per rimborsarlo.`);
    }
  }
  if (!numeri && equity.length) avvisi.push("Il piano economico non c'è ancora: senza la stima finale l'utile da dividere è zero.");

  // Rendimenti: il progetto (prima del debito) contro i mezzi propri (dopo debito e investitori).
  const oneri = numeri?.interessiNelPiano ? numeri.oneriNelPiano?.stima ?? 0 : 0;
  const margineProgetto = numeri ? arrotonda(numeri.margineStima + oneri) : 0;
  const capitaleProgetto = numeri?.capitaleMassimo ?? 0;
  const progetto = {
    margine: margineProgetto,
    capitale: capitaleProgetto,
    roi: numeri && capitaleProgetto > 0 ? margineProgetto / capitaleProgetto : null,
    tir: numeri?.tirProgetto ?? null,
  };
  const propri = conti.filter((c) => c.fonte.tipo === "propri");
  const capitalePropri = somma(propri.map((c) => c.capitaleDentro + c.daUsare));
  const utilePropri = somma(propri.map((c) => c.rendimento.stima));
  const flussiPropri = propri.flatMap((c) => [
    ...c.movimenti.map((m) => ({ data: m.data, importo: m.tipo === "versamento" ? -m.importo : m.importo })),
    ...c.proiezione.filter((p) => p.tipo === "versamento").map((p) => ({ data: p.data, importo: -p.importo })),
    { data: maxData(fine, oggi), importo: c.spettaAFine },
  ]);
  const mezziPropri = propri.length
    ? { capitale: capitalePropri, utile: utilePropri, roe: numeri && capitalePropri > 0 ? utilePropri / capitalePropri : null, tir: numeri ? tirDaFlussi(flussiPropri) : null }
    : null;
  const rendimenti: Rendimenti = {
    progetto,
    mezziPropri,
    leva: mezziPropri?.roe != null && progetto.roi !== null ? mezziPropri.roe - progetto.roi : null,
  };

  return {
    oggi,
    haPiano: !!numeri,
    fine,
    fonti: conti,
    utile,
    quotaAzienda,
    copertura,
    totali: { impegno, dentro, daVersare: somma(conti.map((c) => c.daVersare)), spettaAFine: somma(conti.map((c) => c.spettaAFine)) },
    scoperto,
    costoDebito: {
      interessi,
      spese,
      totale: arrotonda(interessi.stima + spese.stima),
      costoAnnuo: euroAnni > 0 ? (interessi.stima + spese.stima) / euroAnni : null,
      mensile: costoMensile(basi, oggi),
    },
    composizione: composizione(basi, numeri, oggi, fine),
    rendimenti,
    avvisi,
  };
}

/** Interessi maturati e spese di ogni mese, di tutto ciò che è a prestito. */
function costoMensile(basi: Base[], oggi: string): MeseCostoDebito[] {
  const debiti = basi.filter((b) => aPrestito(b.fonte.tipo));
  if (debiti.length === 0) return [];
  const primo = debiti.map((b) => b.inizio).sort()[0].slice(0, 7);
  const ultimo = debiti.map((b) => b.fineConteggio).sort().reverse()[0].slice(0, 7);
  const meseOggi = oggi.slice(0, 7);
  const righe: MeseCostoDebito[] = [];
  for (let m = primo; m <= ultimo && righe.length < 600; m = meseDopo(m)) {
    let interessi = 0;
    let spese = 0;
    for (const b of debiti) {
      const tasso = b.fonte.tassoPct ?? 0;
      const fino = minData(fineMese(m), b.fineConteggio);
      const dal = fineMese(meseDopo(m, -1));
      if (fino > dal) interessi += ((capitaleGiorni(b.futuri, fino) - capitaleGiorni(b.futuri, dal)) * tasso) / 100 / 365;
      spese += b.movimenti.filter((x) => x.tipo === "spese" && x.data.slice(0, 7) === m).reduce((t, x) => t + x.importo, 0);
      const resto = Math.max(0, (b.fonte.speseIniziali ?? 0) - b.spesePagate);
      if (resto > 0 && maxData(b.inizio, oggi).slice(0, 7) === m) spese += resto;
    }
    righe.push({ mese: m, interessi: arrotonda(Math.max(0, interessi)), spese: arrotonda(spese), reale: m <= meseOggi });
  }
  return righe;
}

/** Il capitale di ogni gruppo di fonti a fine mese, contro il fabbisogno del piano. */
function composizione(basi: Base[], numeri: NumeriOperazione | null, oggi: string, fine: string): MeseComposizione[] {
  const date = [
    ...basi.flatMap((b) => [...b.movimenti, ...b.prelievi].map((m) => m.data)),
    ...(numeri?.inizio ? [inizioMese(numeri.inizio)] : []),
  ].filter(giornoValido).sort();
  if (date.length === 0) return [];
  const fabbisogno = new Map((numeri?.fabbisogno ?? []).map((f) => [f.mese.slice(0, 7), f.importo]));
  const primo = date[0].slice(0, 7);
  const ultimo = [fine, ...basi.map((b) => b.fineConteggio)].sort().reverse()[0].slice(0, 7);
  const meseOggi = oggi.slice(0, 7);
  const righe: MeseComposizione[] = [];
  for (let m = primo; m <= ultimo && righe.length < 600; m = meseDopo(m)) {
    const fino = fineMese(m);
    const saldo: Record<GruppoFonte, number> = { propri: 0, investitori: 0, debito: 0 };
    for (const b of basi) {
      const passi: Passo[] = [...b.movimenti, ...b.prelievi, ...b.rimborsiFuturi];
      const s = passi.filter((p) => p.data <= fino).reduce((t, p) => t + segno(p.tipo) * p.importo, 0);
      saldo[GRUPPO[b.fonte.tipo]] += Math.max(0, s);
    }
    righe.push({
      mese: m,
      propri: arrotonda(saldo.propri),
      investitori: arrotonda(saldo.investitori),
      debito: arrotonda(saldo.debito),
      fabbisogno: arrotonda(fabbisogno.get(m) ?? 0),
      reale: m <= meseOggi,
    });
  }
  return righe;
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
    !c.haPiano
      ? "L'utile da dividere è il margine a finire del piano economico: finché il piano non c'è, è zero."
      : c.utile.interessiTolti.stima > 0
      ? `L'utile da dividere è il margine a finire del piano meno il costo del debito, cioè interessi e spese di chi presta (${eur(c.utile.interessiTolti.stima)}).`
      : "L'utile da dividere è il margine a finire del piano: interessi e spese di chi presta sono già tra i suoi costi.",
  );
  if (fisse.length) righe.push(`Prima le quote fisse pattuite: ${fisse.map((f) => `${f.fonte.nome} ${pct((f.quota?.stima ?? 0) * 100)}`).join(", ")}.`);
  if (proQuota.length) {
    righe.push(
      `${fisse.length ? "Il resto" : "Tutto l'utile"} si divide pro quota tra ${proQuota.map((f) => f.fonte.nome).join(", ")}: conta il capitale versato per i giorni in cui resta nell'operazione, quindi chi entra prima e con di più prende di più.`,
    );
  } else if (c.quotaAzienda.stima > 0) {
    righe.push(`Nessuna fonte è pro quota: il ${pct(c.quotaAzienda.stima * 100)} che resta dopo le quote fisse rimane all'azienda.`);
  }
  righe.push("L'impegno non ancora versato entra quando il piano ne ha bisogno: prima i mezzi propri, poi gli investitori, poi banca e finanziamenti.");
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
  const finanziari = costi.filter((r) => r.categoria === "finanziari");
  const oneri = { previsto: somma(finanziari.map((r) => r.previsto)), stima: somma(finanziari.map((r) => r.stima)) };
  return {
    marginePrevisto: n.previsto.margine,
    margineStima: n.stimaFinale.margine,
    capitaleMassimo: n.capitaleMassimoImpegnato,
    meseCapitaleMassimo: n.meseCapitaleMassimo,
    capitaleInvestitoOggi: n.capitaleInvestitoOggi,
    inizio: mesi[0] ?? null,
    fine: mesi[mesi.length - 1] ?? null,
    interessiNelPiano: oneri.previsto > 0 || oneri.stima > 0,
    oneriNelPiano: oneri,
    fabbisogno: n.flussoMensile
      .filter((m) => /^\d{4}-\d{2}/.test(m.mese))
      .map((m) => ({ mese: m.mese.slice(0, 7), importo: arrotonda(Math.max(0, -m.cumulato)) })),
    tirProgetto: n.tirAnnuo,
  };
}

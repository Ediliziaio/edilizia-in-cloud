/**
 * Analisi Acquisti — i conti, in funzioni pure (nessun React, nessun I/O).
 *
 * Una sola base per tutti gli importi: l'IMPONIBILE, cioè senza IVA.
 *   - Ordinato   = ordini d'acquisto (né bozze né annullati), `subtotal`.
 *   - Fatturato  = fatture ricevute, imponibile; le note di credito (elenco
 *                  condiviso `NOTE_DI_CREDITO`) sottraggono; le rifiutate non
 *                  contano.
 *   - Scaduto / in scadenza = rate da pagare ai fornitori: quello che resta da
 *     pagare, quindi IVA compresa (è il bonifico che parte). Le previsionali no.
 *
 * Lo stesso risultato lo dà la funzione SQL `analisi_acquisti`: qui c'è il
 * calcolo che la pagina usa finché la funzione non è nel database, e le regole
 * del confronto prezzi.
 */

import { eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";

/** Converte in numero finito; tutto ciò che non lo è → 0. */
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalizza una stringa per usarla come chiave (minuscole, spazi singoli). */
function normalizeText(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Data locale «AAAA-MM-GG» (mai toISOString: in Italia sposta il giorno). */
export function dataLocale(d: Date): string {
  return d.toLocaleDateString("en-CA");
}

function spostaAnni(data: string, anni: number): string {
  const [a, m, g] = data.split("-").map(Number);
  // 29 febbraio → 28 nell'anno non bisestile.
  const d = new Date(a + anni, m - 1, 1);
  const ultimo = new Date(a + anni, m, 0).getDate();
  d.setDate(Math.min(g, ultimo));
  return dataLocale(d);
}

function spostaGiorni(data: string, giorni: number): string {
  const [a, m, g] = data.split("-").map(Number);
  return dataLocale(new Date(a, m - 1, g + giorni));
}

// ───────────────────────── Periodo ─────────────────────────

export type SceltaPeriodo = "anno" | "12mesi" | "annoScorso" | "personalizzato";

export interface Periodo {
  dal: string;
  al: string;
}

/**
 * Il periodo scelto, in date locali. «Ultimi 12 mesi» parte dal primo giorno
 * di undici mesi fa, così il grafico ha dodici mesi interi o quasi.
 */
export function periodoDaScelta(
  scelta: SceltaPeriodo,
  oggi: Date = new Date(),
  personalizzato?: Partial<Periodo>,
): Periodo {
  const anno = oggi.getFullYear();
  const oggiStr = dataLocale(oggi);
  if (scelta === "annoScorso") return { dal: `${anno - 1}-01-01`, al: `${anno - 1}-12-31` };
  if (scelta === "12mesi") {
    return { dal: dataLocale(new Date(anno, oggi.getMonth() - 11, 1)), al: oggiStr };
  }
  if (scelta === "personalizzato" && personalizzato?.dal && personalizzato?.al) {
    const { dal, al } = personalizzato;
    return dal <= al ? { dal, al } : { dal: al, al: dal };
  }
  return { dal: `${anno}-01-01`, al: oggiStr };
}

/** Lo stesso periodo un anno prima. */
export function periodoAnnoPrima(p: Periodo): Periodo {
  return { dal: spostaAnni(p.dal, -1), al: spostaAnni(p.al, -1) };
}

/** I mesi «AAAA-MM» del periodo, al massimo gli ultimi 12. */
export function mesiDelPeriodo(p: Periodo): string[] {
  const out: string[] = [];
  let [a, m] = p.dal.split("-").map(Number);
  const [aF, mF] = p.al.split("-").map(Number);
  while (a < aF || (a === aF && m <= mF)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out.slice(-12);
}

/** Variazione relativa sull'anno prima (null se l'anno prima era zero). */
export function variazione(attuale: number, prima: number): number | null {
  if (!Number.isFinite(prima) || Math.abs(prima) < 0.005) return null;
  return (attuale - prima) / Math.abs(prima);
}

// ───────────────────────── Confronto prezzi ─────────────────────────

/** Riga d'acquisto (item di un ordine) arricchita col fornitore. */
export interface PurchaseLine {
  description: string | null;
  sku: string | null;
  article_template_id: string | null;
  unit_of_measure: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  discount_percent?: number | string | null;
  line_total?: number | string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  issue_date: string | null;
}

export interface PriceBenchmark {
  /** Chiave di raggruppamento (articolo + unità di misura). */
  key: string;
  label: string;
  unitOfMeasure: string | null;
  purchaseCount: number;
  supplierCount: number;
  /** Prezzo netto minimo degli ultimi 12 mesi. */
  minPrice: number;
  maxPrice: number;
  /** Media ponderata per quantità del prezzo netto. */
  avgPrice: number;
  /** Spread relativo (max-min)/max, 0..1. */
  spread: number;
  /** Prezzo dell'acquisto più recente. */
  lastPrice: number;
  lastSupplierName: string | null;
  totalQuantity: number;
  totalSpend: number;
  /** Quanto si sarebbe risparmiato pagando ogni acquisto al prezzo minimo. */
  potentialSaving: number;
  bestSupplierName: string | null;
}

/**
 * Prezzo unitario netto di sconto: il totale riga diviso la quantità quando
 * c'è, altrimenti prezzo × (1 − sconto%).
 */
export function prezzoNetto(line: Pick<PurchaseLine, "quantity" | "unit_price" | "discount_percent" | "line_total">): number {
  const qty = num(line.quantity);
  const totale = num(line.line_total);
  if (qty > 0 && totale > 0) return totale / qty;
  const sconto = Math.min(100, Math.max(0, num(line.discount_percent)));
  return num(line.unit_price) * (1 - sconto / 100);
}

const SINONIMI_UNITA: Record<string, string> = {
  m2: "mq", "m²": "mq", mq: "mq",
  m3: "mc", "m³": "mc", mc: "mc",
  pz: "pz", pezzi: "pz", pezzo: "pz", n: "pz", nr: "pz", num: "pz", cad: "pz", cadauno: "pz",
  ml: "ml", m: "m", mt: "m", metri: "m",
  kg: "kg", t: "t", ton: "t", q: "q", ql: "q",
  l: "l", lt: "l", litri: "l",
  h: "h", ore: "h", ora: "h",
};

/** Unità di misura confrontabile («Pz.», «nr» e «cad» sono la stessa cosa). */
export function normalizzaUnita(uom: string | null | undefined): string {
  const u = normalizeText(uom).replace(/[.\s]/g, "");
  return SINONIMI_UNITA[u] ?? u;
}

/** «a corpo», «corpo», «forfait», «forfettario»: un prezzo che non ha un'unità. */
export function eUnitaForfait(uom: string | null | undefined): boolean {
  const u = normalizeText(uom).replace(/\./g, "");
  if (!u) return false;
  return /\bcorpo\b|forfait|forfet|^ac$|^a\/c$/.test(u);
}

/**
 * Una descrizione che nomina una categoria, non un articolo: «Cementi, malte e
 * rasanti», «Materiale elettrico vario», «Forniture idrauliche». Niente
 * numeri (misure, codici, formati) e un elenco o una parola da raccoglitore.
 */
export function eDescrizioneGenerica(desc: string | null | undefined): boolean {
  const d = normalizeText(desc);
  if (!d) return true;
  if (/\d/.test(d)) return false;
  if (d.includes(",") || /\s(e|ed)\s/.test(d)) return true;
  return /\b(vari|varie|vario|varia|diversi|diverse|materiale|materiali|fornitura|forniture|accessori|minuteria|consumabili)\b/.test(d);
}

/**
 * Una riga entra nel confronto solo se è un articolo vero: con un prezzo,
 * un'unità che non sia «a corpo», e non una voce da 1 con il nome di una
 * categoria.
 */
export function rigaConfrontabile(line: PurchaseLine): boolean {
  if (eUnitaForfait(line.unit_of_measure)) return false;
  const qty = num(line.quantity);
  if (qty <= 0) return false;
  if (prezzoNetto(line) <= 0) return false;
  if (qty === 1 && !line.article_template_id && !normalizeText(line.sku) && eDescrizioneGenerica(line.description)) return false;
  return true;
}

function chiaveArticolo(line: PurchaseLine): string | null {
  const unita = normalizzaUnita(line.unit_of_measure);
  if (line.article_template_id) return `tpl:${line.article_template_id}|${unita}`;
  const sku = normalizeText(line.sku);
  if (sku) return `sku:${sku}|${unita}`;
  const desc = normalizeText(line.description).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (desc) return `desc:${desc}|${unita}`;
  return null;
}

interface BenchmarkOptions {
  /** Data di riferimento per «ultimi 12 mesi» (default oggi). */
  oggi?: Date;
  /** Mesi indietro da considerare (default 12). */
  mesi?: number;
  /** Basta che l'articolo sia stato comprato da almeno N fornitori… (default 2) */
  minFornitori?: number;
  /** …oppure almeno N volte (default 3). */
  minAcquisti?: number;
}

/**
 * Lo stesso articolo (stessa descrizione o codice, stessa unità di misura)
 * pagato a prezzi diversi negli ultimi 12 mesi. Risparmio = per ogni acquisto,
 * (prezzo pagato − prezzo minimo del periodo) × quantità.
 */
export function computePriceBenchmarks(
  lines: PurchaseLine[],
  opts: BenchmarkOptions = {},
): PriceBenchmark[] {
  const oggi = opts.oggi ?? new Date();
  const mesi = opts.mesi ?? 12;
  const minFornitori = opts.minFornitori ?? 2;
  const minAcquisti = opts.minAcquisti ?? 3;
  const inizio = dataLocale(new Date(oggi.getFullYear(), oggi.getMonth() - mesi, oggi.getDate()));
  const fine = dataLocale(oggi);
  const list = Array.isArray(lines) ? lines : [];

  interface Group {
    key: string;
    label: string;
    unitOfMeasure: string | null;
    rows: Array<{ price: number; qty: number; supplierName: string | null; issueDate: string }>;
    suppliers: Set<string>;
  }
  const groups = new Map<string, Group>();

  for (const line of list) {
    const data = (line.issue_date ?? "").slice(0, 10);
    if (!data || data < inizio || data > fine) continue;
    if (!rigaConfrontabile(line)) continue;
    const key = chiaveArticolo(line);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: (line.description ?? "").trim() || (line.sku ?? "").trim() || "Articolo",
        unitOfMeasure: line.unit_of_measure ?? null,
        rows: [],
        suppliers: new Set<string>(),
      };
      groups.set(key, g);
    }
    g.rows.push({
      price: prezzoNetto(line),
      qty: num(line.quantity),
      supplierName: (line.supplier_name ?? "").trim() || null,
      issueDate: data,
    });
    g.suppliers.add(line.supplier_id || normalizeText(line.supplier_name) || "?");
  }

  const out: PriceBenchmark[] = [];
  for (const g of groups.values()) {
    if (g.suppliers.size < minFornitori && g.rows.length < minAcquisti) continue;
    const prices = g.rows.map((r) => r.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    // Differenze sotto il centesimo sono arrotondamenti, non prezzi diversi.
    if (maxPrice - minPrice < 0.005) continue;

    const totalQuantity = g.rows.reduce((acc, r) => acc + r.qty, 0);
    const totalSpend = g.rows.reduce((acc, r) => acc + r.price * r.qty, 0);
    const avgPrice = totalQuantity > 0 ? totalSpend / totalQuantity : 0;
    const potentialSaving = g.rows.reduce((acc, r) => acc + (r.price - minPrice) * r.qty, 0);
    const last = [...g.rows].sort((a, b) => b.issueDate.localeCompare(a.issueDate))[0];
    const bestRow = g.rows.find((r) => r.price === minPrice) ?? null;

    out.push({
      key: g.key,
      label: g.label,
      unitOfMeasure: g.unitOfMeasure,
      purchaseCount: g.rows.length,
      supplierCount: g.suppliers.size,
      minPrice,
      maxPrice,
      avgPrice,
      spread: maxPrice > 0 ? (maxPrice - minPrice) / maxPrice : 0,
      lastPrice: last?.price ?? 0,
      lastSupplierName: last?.supplierName ?? null,
      totalQuantity,
      totalSpend,
      potentialSaving,
      bestSupplierName: bestRow?.supplierName ?? null,
    });
  }
  return out.sort((a, b) => b.potentialSaving - a.potentialSaving);
}

/** Somma del risparmio potenziale su tutti i confronti. */
export function totalPotentialSaving(benchmarks: PriceBenchmark[]): number {
  return (Array.isArray(benchmarks) ? benchmarks : []).reduce((acc, b) => acc + b.potentialSaving, 0);
}

// ───────────────────────── Fatture ricevute ─────────────────────────

/** Stati di una fattura ricevuta che non è una spesa (rifiutata allo SDI o al fornitore). */
export const STATI_FATTURA_ESCLUSI: ReadonlySet<string> = new Set(["rifiutata"]);

export interface InvoiceSpendRow {
  cedente_ragione_sociale: string | null;
  cedente_piva: string | null;
  data_fattura: string | null;
  imponibile_totale: number | string | null;
  totale_documento: number | string | null;
  iva_totale?: number | string | null;
  tipo_documento: string | null;
  stato?: string | null;
}

/** La fattura conta come spesa? Le rifiutate no. */
export function fatturaValida(r: Pick<InvoiceSpendRow, "stato">): boolean {
  return !STATI_FATTURA_ESCLUSI.has(normalizeText(r.stato));
}

/**
 * Imponibile della fattura, con segno: le note di credito sottraggono anche
 * quando l'importo è registrato positivo. Senza imponibile: totale − IVA.
 */
export function imponibileFattura(r: InvoiceSpendRow): number {
  const base =
    r.imponibile_totale !== null && r.imponibile_totale !== undefined && r.imponibile_totale !== ""
      ? num(r.imponibile_totale)
      : num(r.totale_documento) - num(r.iva_totale);
  return eNotaDiCredito(r.tipo_documento) ? -Math.abs(base) : base;
}

/** P.IVA confrontabile: maiuscole, senza spazi né prefisso «IT». */
export function normalizzaPiva(v: string | null | undefined): string {
  const p = String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^IT\d{11}$/.test(p) ? p.slice(2) : p;
}

// ───────────────────────── Analisi completa ─────────────────────────

export interface OrdineAcquistoRiga {
  id: string;
  supplier_id: string | null;
  order_id: string | null;
  issue_date: string | null;
  status: string | null;
  subtotal: number | string | null;
  total?: number | string | null;
  vat_total?: number | string | null;
}

export interface FatturaRiga extends InvoiceSpendRow {
  id: string;
  purchase_order_id: string | null;
}

export interface ScadenzaRiga {
  id: string;
  supplier_id: string | null;
  order_id?: string | null;
  due_date: string | null;
  amount: number | string | null;
  paid_amount: number | string | null;
  status: string | null;
  is_previsionale?: boolean | null;
  tipo?: string | null;
  description?: string | null;
}

export interface FornitoreAnagrafica {
  id: string;
  name: string | null;
  vat_number?: string | null;
  product_category?: string | null;
}

export interface CommessaAnagrafica {
  id: string;
  order_code: string | null;
  client_name: string | null;
}

export interface FiltriAnalisi {
  fornitoreId?: string | null;
  /** id della commessa, oppure «nessuna» per gli acquisti senza commessa. */
  commessaId?: string | null;
  categoria?: string | null;
}

export interface TotaliAcquisti {
  ordinato: number;
  fatturato: number;
  ordinatoNonFatturato: number;
  scaduto: number;
  scadutoConteggio: number;
  inScadenza30: number;
  inScadenza30Conteggio: number;
  numeroOrdini: number;
  numeroFatture: number;
  /** Ordinato senza commessa nel periodo. */
  senzaCommessa: number;
  annoPrima: { ordinato: number; fatturato: number };
}

export interface FornitoreAnalisi {
  chiave: string;
  supplierId: string | null;
  nome: string;
  piva: string | null;
  categoria: string | null;
  ordinato: number;
  fatturato: number;
  ordinatoNonFatturato: number;
  scaduto: number;
  inScadenza30: number;
  numeroOrdini: number;
  numeroFatture: number;
  ultimoAcquisto: string | null;
}

export interface CommessaAnalisi {
  orderId: string | null;
  codice: string | null;
  cliente: string | null;
  ordinato: number;
  fatturato: number;
  numeroOrdini: number;
}

export interface MeseAnalisi {
  mese: string;
  ordinato: number;
  fatturato: number;
  ordinatoAnnoPrima: number;
  fatturatoAnnoPrima: number;
}

export interface CategoriaAnalisi {
  categoria: string;
  ordinato: number;
  fatturato: number;
}

export interface ScadenzaAnalisi {
  id: string;
  supplierId: string | null;
  fornitore: string;
  descrizione: string | null;
  scadenza: string;
  residuo: number;
  scaduta: boolean;
}

export interface AnalisiAcquistiDati {
  periodo: Periodo;
  totali: TotaliAcquisti;
  fornitori: FornitoreAnalisi[];
  commesse: CommessaAnalisi[];
  mesi: MeseAnalisi[];
  categorie: CategoriaAnalisi[];
  scadenze: ScadenzaAnalisi[];
}

export interface DatiGrezziAcquisti {
  ordini: OrdineAcquistoRiga[];
  fatture: FatturaRiga[];
  scadenze: ScadenzaRiga[];
  fornitori: FornitoreAnagrafica[];
  commesse: CommessaAnagrafica[];
}

const STATI_ORDINE_ESCLUSI = new Set(["annullato", "bozza"]);

/** Un ordine conta come acquisto se è partito: né bozza né annullato. */
export function ordineValido(o: Pick<OrdineAcquistoRiga, "status">): boolean {
  return !STATI_ORDINE_ESCLUSI.has(normalizeText(o.status));
}

/** Imponibile dell'ordine: `subtotal`, o totale − IVA se manca. */
export function imponibileOrdine(o: OrdineAcquistoRiga): number {
  const sub = num(o.subtotal);
  if (sub !== 0) return sub;
  return num(o.total) - num(o.vat_total);
}

/** Rate da pagare: aperte, non previsionali, verso un fornitore. */
export function scadenzaAperta(s: ScadenzaRiga): boolean {
  if (s.is_previsionale) return false;
  if (s.tipo && s.tipo !== "pagamento_fornitore") return false;
  const st = normalizeText(s.status);
  return st === "da_pagare" || st === "parziale";
}

const dentro = (d: string | null | undefined, p: Periodo) => {
  const x = (d ?? "").slice(0, 10);
  return !!x && x >= p.dal && x <= p.al;
};

/**
 * Tutta l'analisi in una passata: lo stesso risultato di `analisi_acquisti`
 * nel database, calcolato nel browser sulle righe lette a pagine.
 */
export function calcolaAnalisiAcquisti(
  grezzi: DatiGrezziAcquisti,
  periodo: Periodo,
  filtri: FiltriAnalisi = {},
  oggi: Date = new Date(),
): AnalisiAcquistiDati {
  const prima = periodoAnnoPrima(periodo);
  const oggiStr = dataLocale(oggi);
  const tra30 = spostaGiorni(oggiStr, 30);

  const fornitoriById = new Map(grezzi.fornitori.map((f) => [f.id, f]));
  const fornitoreDaPiva = new Map<string, FornitoreAnagrafica>();
  for (const f of grezzi.fornitori) {
    const p = normalizzaPiva(f.vat_number);
    if (p && !fornitoreDaPiva.has(p)) fornitoreDaPiva.set(p, f);
  }
  const ordiniById = new Map(grezzi.ordini.map((o) => [o.id, o]));
  const commesseById = new Map(grezzi.commesse.map((c) => [c.id, c]));

  const categoriaDi = (supplierId: string | null) =>
    (supplierId ? (fornitoriById.get(supplierId)?.product_category ?? "").trim() : "") || null;

  const passaFiltri = (supplierId: string | null, orderId: string | null) => {
    if (filtri.fornitoreId && supplierId !== filtri.fornitoreId) return false;
    if (filtri.commessaId) {
      if (filtri.commessaId === "nessuna" ? orderId !== null : orderId !== filtri.commessaId) return false;
    }
    if (filtri.categoria && categoriaDi(supplierId) !== filtri.categoria) return false;
    return true;
  };

  const fornitori = new Map<string, FornitoreAnalisi>();
  const rigaFornitore = (supplierId: string | null, piva: string | null, nome: string | null) => {
    const anag = supplierId ? fornitoriById.get(supplierId) : undefined;
    const chiave = supplierId ? `s:${supplierId}` : piva ? `piva:${piva}` : `nome:${normalizeText(nome)}`;
    let r = fornitori.get(chiave);
    if (!r) {
      r = {
        chiave,
        supplierId,
        nome: (anag?.name ?? nome ?? "").trim() || "Fornitore senza nome",
        piva: anag?.vat_number ?? piva ?? null,
        categoria: categoriaDi(supplierId),
        ordinato: 0,
        fatturato: 0,
        ordinatoNonFatturato: 0,
        scaduto: 0,
        inScadenza30: 0,
        numeroOrdini: 0,
        numeroFatture: 0,
        ultimoAcquisto: null,
      };
      fornitori.set(chiave, r);
    }
    return r;
  };
  const aggiornaUltimo = (r: FornitoreAnalisi, d: string | null) => {
    const x = (d ?? "").slice(0, 10);
    if (x && (!r.ultimoAcquisto || x > r.ultimoAcquisto)) r.ultimoAcquisto = x;
  };

  const commesse = new Map<string, CommessaAnalisi>();
  const rigaCommessa = (orderId: string | null) => {
    const k = orderId ?? "";
    let r = commesse.get(k);
    if (!r) {
      const c = orderId ? commesseById.get(orderId) : undefined;
      r = { orderId, codice: c?.order_code ?? null, cliente: c?.client_name ?? null, ordinato: 0, fatturato: 0, numeroOrdini: 0 };
      commesse.set(k, r);
    }
    return r;
  };

  const mesiElenco = mesiDelPeriodo(periodo);
  const mesi = new Map<string, MeseAnalisi>(
    mesiElenco.map((m) => [m, { mese: m, ordinato: 0, fatturato: 0, ordinatoAnnoPrima: 0, fatturatoAnnoPrima: 0 }]),
  );
  const meseAvanti = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4, 7)}`;

  const categorie = new Map<string, CategoriaAnalisi>();
  const rigaCategoria = (supplierId: string | null) => {
    const c = categoriaDi(supplierId) ?? "Senza categoria";
    let r = categorie.get(c);
    if (!r) {
      r = { categoria: c, ordinato: 0, fatturato: 0 };
      categorie.set(c, r);
    }
    return r;
  };

  const totali: TotaliAcquisti = {
    ordinato: 0,
    fatturato: 0,
    ordinatoNonFatturato: 0,
    scaduto: 0,
    scadutoConteggio: 0,
    inScadenza30: 0,
    inScadenza30Conteggio: 0,
    numeroOrdini: 0,
    numeroFatture: 0,
    senzaCommessa: 0,
    annoPrima: { ordinato: 0, fatturato: 0 },
  };

  // Fatture: a chi e a quale commessa vanno.
  const fatturatoPerOrdine = new Map<string, number>();
  const fattureRisolte = grezzi.fatture
    .filter(fatturaValida)
    .map((f) => {
      const po = f.purchase_order_id ? ordiniById.get(f.purchase_order_id) : undefined;
      const piva = normalizzaPiva(f.cedente_piva) || null;
      const supplierId = po?.supplier_id ?? (piva ? fornitoreDaPiva.get(piva)?.id ?? null : null);
      const importo = imponibileFattura(f);
      if (f.purchase_order_id) {
        fatturatoPerOrdine.set(f.purchase_order_id, (fatturatoPerOrdine.get(f.purchase_order_id) ?? 0) + importo);
      }
      return { f, supplierId, orderId: po?.order_id ?? null, piva, importo };
    });

  for (const o of grezzi.ordini) {
    if (!ordineValido(o)) continue;
    if (!passaFiltri(o.supplier_id, o.order_id)) continue;
    const imp = imponibileOrdine(o);
    const d = (o.issue_date ?? "").slice(0, 10);
    if (dentro(d, periodo)) {
      totali.ordinato += imp;
      totali.numeroOrdini += 1;
      if (!o.order_id) totali.senzaCommessa += imp;
      const nonFatt = Math.max(0, imp - (fatturatoPerOrdine.get(o.id) ?? 0));
      totali.ordinatoNonFatturato += nonFatt;
      const rf = rigaFornitore(o.supplier_id, null, null);
      rf.ordinato += imp;
      rf.numeroOrdini += 1;
      rf.ordinatoNonFatturato += nonFatt;
      aggiornaUltimo(rf, d);
      const rc = rigaCommessa(o.order_id);
      rc.ordinato += imp;
      rc.numeroOrdini += 1;
      rigaCategoria(o.supplier_id).ordinato += imp;
      const m = mesi.get(d.slice(0, 7));
      if (m) m.ordinato += imp;
    } else if (dentro(d, prima)) {
      totali.annoPrima.ordinato += imp;
      const m = mesi.get(meseAvanti(d));
      if (m) m.ordinatoAnnoPrima += imp;
    }
  }

  for (const x of fattureRisolte) {
    if (!passaFiltri(x.supplierId, x.orderId)) continue;
    const d = (x.f.data_fattura ?? "").slice(0, 10);
    if (dentro(d, periodo)) {
      totali.fatturato += x.importo;
      totali.numeroFatture += 1;
      const rf = rigaFornitore(x.supplierId, x.piva, x.f.cedente_ragione_sociale);
      rf.fatturato += x.importo;
      rf.numeroFatture += 1;
      aggiornaUltimo(rf, d);
      rigaCommessa(x.orderId).fatturato += x.importo;
      rigaCategoria(x.supplierId).fatturato += x.importo;
      const m = mesi.get(d.slice(0, 7));
      if (m) m.fatturato += x.importo;
    } else if (dentro(d, prima)) {
      totali.annoPrima.fatturato += x.importo;
      const m = mesi.get(meseAvanti(d));
      if (m) m.fatturatoAnnoPrima += x.importo;
    }
  }

  // Scadenze: lo stato di oggi, non del periodo.
  const scadenze: ScadenzaAnalisi[] = [];
  for (const s of grezzi.scadenze) {
    if (!scadenzaAperta(s)) continue;
    if (!passaFiltri(s.supplier_id ?? null, s.order_id ?? null)) continue;
    const due = (s.due_date ?? "").slice(0, 10);
    if (!due) continue;
    const residuo = num(s.amount) - num(s.paid_amount);
    if (residuo <= 0.005) continue;
    const scaduta = due < oggiStr;
    const prossima = !scaduta && due <= tra30;
    if (!scaduta && !prossima) continue;
    const anag = s.supplier_id ? fornitoriById.get(s.supplier_id) : undefined;
    if (scaduta) {
      totali.scaduto += residuo;
      totali.scadutoConteggio += 1;
    } else {
      totali.inScadenza30 += residuo;
      totali.inScadenza30Conteggio += 1;
    }
    if (s.supplier_id) {
      const rf = rigaFornitore(s.supplier_id, null, null);
      if (scaduta) rf.scaduto += residuo;
      else rf.inScadenza30 += residuo;
    }
    scadenze.push({
      id: s.id,
      supplierId: s.supplier_id ?? null,
      fornitore: (anag?.name ?? "").trim() || "Fornitore non indicato",
      descrizione: s.description ?? null,
      scadenza: due,
      residuo,
      scaduta,
    });
  }
  scadenze.sort((a, b) => a.scadenza.localeCompare(b.scadenza));

  const haCategorie = grezzi.fornitori.some((f) => (f.product_category ?? "").trim());

  return {
    periodo,
    totali,
    fornitori: [...fornitori.values()]
      .filter((r) => r.ordinato !== 0 || r.fatturato !== 0 || r.scaduto !== 0 || r.inScadenza30 !== 0)
      .sort((a, b) => Math.max(b.ordinato, b.fatturato) - Math.max(a.ordinato, a.fatturato)),
    commesse: [...commesse.values()]
      .filter((r) => r.ordinato !== 0 || r.fatturato !== 0)
      .sort((a, b) => (a.orderId === null ? -1 : b.orderId === null ? 1 : Math.max(b.ordinato, b.fatturato) - Math.max(a.ordinato, a.fatturato))),
    mesi: mesiElenco.map((m) => mesi.get(m)!),
    categorie: haCategorie
      ? [...categorie.values()].filter((c) => c.ordinato !== 0 || c.fatturato !== 0).sort((a, b) => b.ordinato + b.fatturato - (a.ordinato + a.fatturato))
      : [],
    scadenze,
  };
}

// ───────────────────────── Firma → primo ordine ─────────────────────────

export interface RigaFirmaOrdine {
  order_id: string;
  /** Data dell'ordine d'acquisto. */
  created_at: string;
  /** Creazione della commessa. */
  commessa_creata: string;
  /** Firma vera del preventivo, se c'è. */
  firmato_il: string | null;
}

export interface FirmaPrimoOrdine {
  mediaGiorni: number;
  commesse: number;
  /** «firma» se la media usa le date di firma vere, «creazione» altrimenti. */
  base: "firma" | "creazione";
}

/**
 * Giorni medi tra la firma (o, se le firme vere sono poche, la creazione della
 * commessa) e il primo ordine d'acquisto. Servono almeno 3 commesse.
 */
export function calcolaFirmaPrimoOrdine(righe: RigaFirmaOrdine[]): FirmaPrimoOrdine | null {
  const primo = new Map<string, RigaFirmaOrdine>();
  for (const r of righe) {
    const cur = primo.get(r.order_id);
    if (!cur || r.created_at < cur.created_at) primo.set(r.order_id, r);
  }
  const media = (base: "firma" | "creazione") => {
    const giorni = [...primo.values()]
      .map((r) => {
        const inizio = base === "firma" ? r.firmato_il : r.commessa_creata;
        if (!inizio) return null;
        return (Date.parse(r.created_at) - Date.parse(inizio)) / 86400000;
      })
      .filter((g): g is number => g !== null && Number.isFinite(g) && g >= 0 && g <= 365);
    return giorni.length >= 3
      ? { mediaGiorni: Math.round(giorni.reduce((s, g) => s + g, 0) / giorni.length), commesse: giorni.length, base }
      : null;
  };
  return media("firma") ?? media("creazione");
}

/** Formatta una quota 0..1 come percentuale italiana (es. 0.185 → "18,5%"). */
export function formatShare(share: number): string {
  const pct = Number.isFinite(share) ? share * 100 : 0;
  return `${pct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

/** «+12%» / «−8%» sull'anno prima. */
export function formatVariazione(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null;
  const pct = Math.round(v * 100);
  if (pct === 0) return "come l'anno prima";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("it-IT")}% sull'anno prima`;
}

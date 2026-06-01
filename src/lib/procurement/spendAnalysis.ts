/**
 * Procurement — spend analysis & price benchmarking (P2).
 *
 * Funzioni PURE (nessun React, nessun I/O) per l'analisi della spesa fornitori.
 * Lavorano su dati GIÀ esistenti, senza migration né edge function:
 *   - vista `supplier_procurement_report` → spesa aggregata per fornitore
 *     (ordini d'acquisto non annullati + scaduto aperto da scadenze).
 *   - `purchase_order_items` (join PO→fornitore) → benchmark prezzi: stesso
 *     articolo acquistato a prezzi diversi ⇒ opportunità di risparmio.
 *   - `fatture_ricevute` → spesa complementare da fatture passive per fornitore.
 *
 * Tutte le metriche sono difensive sui tipi (Supabase può restituire `numeric`
 * come stringa) e gestiscono il caso "nessun dato" senza eccezioni.
 */

/** Converte in numero finito; tutto ciò che non lo è → 0. */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalizza una stringa per usarla come chiave/etichetta (lower, trim, spazi singoli). */
function normalizeText(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ───────────────────────── Spesa per fornitore (vista) ─────────────────────────

/** Riga della vista `supplier_procurement_report`. */
export interface SupplierSpendRow {
  supplier_id: string;
  name: string | null;
  product_category: string | null;
  is_active: boolean | null;
  is_foreign: boolean | null;
  purchase_order_count: number | string | null;
  purchase_order_total: number | string | null;
  open_due_count: number | string | null;
  open_due_amount: number | string | null;
  last_purchase_order_date: string | null;
}

export interface RankedSupplier {
  supplierId: string;
  name: string;
  productCategory: string | null;
  isActive: boolean;
  isForeign: boolean;
  orderCount: number;
  total: number;
  openDueAmount: number;
  openDueCount: number;
  lastOrderDate: string | null;
  /** Quota sul totale speso (0..1). */
  share: number;
}

export interface SupplierSpendSummary {
  totalSpend: number;
  totalOrders: number;
  /** Fornitori con almeno un ordine d'acquisto (spesa > 0). */
  supplierCount: number;
  avgOrderValue: number;
  totalOpenDue: number;
  topSupplier: RankedSupplier | null;
  /** Quota cumulata dei primi 3 fornitori sul totale (0..1). */
  concentrationTop3: number;
  /** Fornitori ordinati per spesa decrescente (solo spesa > 0). */
  ranked: RankedSupplier[];
}

/**
 * Aggrega le righe della vista in KPI + classifica fornitori per spesa.
 * Considera "spesa" il campo `purchase_order_total` (ordini non annullati).
 */
export function summarizeSupplierSpend(rows: SupplierSpendRow[]): SupplierSpendSummary {
  const list = Array.isArray(rows) ? rows : [];

  const totalSpend = list.reduce((acc, r) => acc + num(r.purchase_order_total), 0);
  const totalOrders = list.reduce((acc, r) => acc + num(r.purchase_order_count), 0);
  const totalOpenDue = list.reduce((acc, r) => acc + num(r.open_due_amount), 0);

  const ranked: RankedSupplier[] = list
    .map((r) => {
      const total = num(r.purchase_order_total);
      return {
        supplierId: r.supplier_id,
        name: (r.name ?? "").trim() || "Senza nome",
        productCategory: r.product_category ?? null,
        isActive: r.is_active !== false,
        isForeign: r.is_foreign === true,
        orderCount: num(r.purchase_order_count),
        total,
        openDueAmount: num(r.open_due_amount),
        openDueCount: num(r.open_due_count),
        lastOrderDate: r.last_purchase_order_date ?? null,
        share: totalSpend > 0 ? total / totalSpend : 0,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const concentrationTop3 =
    totalSpend > 0
      ? ranked.slice(0, 3).reduce((acc, r) => acc + r.total, 0) / totalSpend
      : 0;

  return {
    totalSpend,
    totalOrders,
    supplierCount: ranked.length,
    avgOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
    totalOpenDue,
    topSupplier: ranked[0] ?? null,
    concentrationTop3,
    ranked,
  };
}

// ───────────────────────── Benchmark prezzi (righe ordini) ─────────────────────────

/** Riga d'acquisto (item di un ordine) arricchita col fornitore. */
export interface PurchaseLine {
  description: string | null;
  sku: string | null;
  article_template_id: string | null;
  unit_of_measure: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  issue_date: string | null;
}

export interface PriceBenchmark {
  /** Chiave di raggruppamento (template id, oppure sku/descrizione normalizzati). */
  key: string;
  /** Etichetta leggibile dell'articolo. */
  label: string;
  unitOfMeasure: string | null;
  purchaseCount: number;
  supplierCount: number;
  minPrice: number;
  maxPrice: number;
  /** Media ponderata per quantità del prezzo unitario. */
  avgPrice: number;
  /** Spread relativo (max-min)/max, 0..1. */
  spread: number;
  /** Prezzo dell'acquisto più recente (per issue_date). */
  lastPrice: number;
  lastSupplierName: string | null;
  totalQuantity: number;
  totalSpend: number;
  /** Risparmio potenziale comprando tutto al prezzo minimo osservato. */
  potentialSaving: number;
  /** Fornitore che ha praticato il prezzo minimo. */
  bestSupplierName: string | null;
}

/** Chiave di raggruppamento articolo: template id → sku → descrizione. */
function articleKey(line: PurchaseLine): string | null {
  if (line.article_template_id) return `tpl:${line.article_template_id}`;
  const sku = normalizeText(line.sku);
  if (sku) return `sku:${sku}`;
  const desc = normalizeText(line.description);
  if (desc) return `desc:${desc}`;
  return null;
}

interface BenchmarkOptions {
  /** Includi solo gruppi con almeno N acquisti distinti (default 2). */
  minPurchases?: number;
  /** Includi solo gruppi con variazione di prezzo (max>min) (default true). */
  requireVariance?: boolean;
}

/**
 * Raggruppa le righe per articolo e calcola il benchmark dei prezzi.
 * Ritorna i gruppi ordinati per risparmio potenziale decrescente.
 *
 * Le righe con prezzo unitario ≤ 0 vengono ignorate nel calcolo min/avg
 * (prezzo sconosciuto/omaggio); le quantità negative vengono azzerate.
 */
export function computePriceBenchmarks(
  lines: PurchaseLine[],
  opts: BenchmarkOptions = {},
): PriceBenchmark[] {
  const minPurchases = opts.minPurchases ?? 2;
  const requireVariance = opts.requireVariance ?? true;
  const list = Array.isArray(lines) ? lines : [];

  interface Group {
    key: string;
    label: string;
    unitOfMeasure: string | null;
    rows: Array<{
      price: number;
      qty: number;
      supplierName: string | null;
      issueDate: string | null;
    }>;
    suppliers: Set<string>;
  }

  const groups = new Map<string, Group>();

  for (const line of list) {
    const key = articleKey(line);
    if (!key) continue;
    const price = num(line.unit_price);
    if (price <= 0) continue; // prezzo sconosciuto → escluso dal benchmark
    const qty = Math.max(0, num(line.quantity));

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
      price,
      qty,
      supplierName: (line.supplier_name ?? "").trim() || null,
      issueDate: line.issue_date ?? null,
    });
    g.suppliers.add(line.supplier_id ?? line.supplier_name ?? "?");
  }

  const out: PriceBenchmark[] = [];

  for (const g of groups.values()) {
    if (g.rows.length < minPurchases) continue;

    const prices = g.rows.map((r) => r.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (requireVariance && maxPrice <= minPrice) continue;

    const totalQuantity = g.rows.reduce((acc, r) => acc + r.qty, 0);
    const totalSpend = g.rows.reduce((acc, r) => acc + r.price * r.qty, 0);
    // Media ponderata per quantità; se tutte le quantità sono 0, media semplice.
    const avgPrice =
      totalQuantity > 0
        ? totalSpend / totalQuantity
        : prices.reduce((a, b) => a + b, 0) / g.rows.length;

    // Risparmio potenziale: per ogni riga, quanto si sarebbe risparmiato al min.
    const potentialSaving = g.rows.reduce(
      (acc, r) => acc + (r.price - minPrice) * r.qty,
      0,
    );

    // Acquisto più recente (issue_date max).
    const sortedByDate = [...g.rows].sort((a, b) => {
      const da = a.issueDate ? Date.parse(a.issueDate) : 0;
      const db = b.issueDate ? Date.parse(b.issueDate) : 0;
      return db - da;
    });
    const last = sortedByDate[0];

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

/** Somma del risparmio potenziale su tutti i benchmark. */
export function totalPotentialSaving(benchmarks: PriceBenchmark[]): number {
  return (Array.isArray(benchmarks) ? benchmarks : []).reduce(
    (acc, b) => acc + b.potentialSaving,
    0,
  );
}

// ───────────────────────── Spesa da fatture ricevute ─────────────────────────

/** Riga essenziale di `fatture_ricevute` per l'analisi di spesa. */
export interface InvoiceSpendRow {
  cedente_ragione_sociale: string | null;
  cedente_piva: string | null;
  data_fattura: string | null;
  imponibile_totale: number | string | null;
  totale_documento: number | string | null;
  tipo_documento: string | null;
}

export interface InvoiceSupplierSpend {
  key: string;
  name: string;
  piva: string | null;
  invoiceCount: number;
  totalImponibile: number;
  totalDocumento: number;
  lastInvoiceDate: string | null;
  share: number;
}

export interface InvoiceSpendSummary {
  totalImponibile: number;
  totalDocumento: number;
  invoiceCount: number;
  supplierCount: number;
  ranked: InvoiceSupplierSpend[];
}

/**
 * Aggrega le fatture passive per fornitore (chiave: P.IVA se presente, altrimenti
 * ragione sociale normalizzata). Le note di credito (`TD04`) sottraggono spesa.
 */
export function summarizeInvoiceSpend(rows: InvoiceSpendRow[]): InvoiceSpendSummary {
  const list = Array.isArray(rows) ? rows : [];

  const map = new Map<string, InvoiceSupplierSpend>();
  let totalImponibile = 0;
  let totalDocumento = 0;

  for (const r of list) {
    const piva = normalizeText(r.cedente_piva);
    const name = (r.cedente_ragione_sociale ?? "").trim() || "Fornitore sconosciuto";
    const key = piva ? `piva:${piva}` : `name:${normalizeText(name)}`;
    const isCreditNote = normalizeText(r.tipo_documento) === "td04";
    const signNote = isCreditNote ? -1 : 1;
    const imp = num(r.imponibile_totale) * signNote;
    const doc = num(r.totale_documento) * signNote;

    totalImponibile += imp;
    totalDocumento += doc;

    let g = map.get(key);
    if (!g) {
      g = {
        key,
        name,
        piva: r.cedente_piva ?? null,
        invoiceCount: 0,
        totalImponibile: 0,
        totalDocumento: 0,
        lastInvoiceDate: null,
        share: 0,
      };
      map.set(key, g);
    }
    g.invoiceCount += 1;
    g.totalImponibile += imp;
    g.totalDocumento += doc;
    if (r.data_fattura) {
      if (!g.lastInvoiceDate || Date.parse(r.data_fattura) > Date.parse(g.lastInvoiceDate)) {
        g.lastInvoiceDate = r.data_fattura;
      }
    }
  }

  const ranked = [...map.values()]
    .map((g) => ({
      ...g,
      share: totalImponibile > 0 ? g.totalImponibile / totalImponibile : 0,
    }))
    .sort((a, b) => b.totalImponibile - a.totalImponibile);

  return {
    totalImponibile,
    totalDocumento,
    invoiceCount: list.length,
    supplierCount: ranked.length,
    ranked,
  };
}

/** Formatta una quota 0..1 come percentuale italiana (es. 0.185 → "18,5%"). */
export function formatShare(share: number): string {
  const pct = Number.isFinite(share) ? share * 100 : 0;
  return `${pct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
}

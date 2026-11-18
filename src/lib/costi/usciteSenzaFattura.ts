/** Un'uscita senza fattura (bollo, tassa, F24 di cantiere): cosa si salva e quanto vale, senza farne una fattura. */
export interface FormUscita {
  descrizione: string; imponibile: string; aliquota: string; data: string; mese: string; riferimento: string;
  scadenza?: string; dataPagamento?: string;
  fornitoreId: string;
  /**
   * Le commesse a cui va il costo (12/11/2026). Una sola: tutto a lei. Più d'una: ognuna con la
   * sua percentuale, come la ripartizione dei costi; quello che avanza resta costo generale.
   */
  commesse: QuotaCommessa[];
  categoria?: string | null;
  modoQuota?: "euro" | "percentuale";
  mezzoId: string; pagata: boolean; note: string;
}

export interface QuotaCommessa { id: string; pct: string; euro?: string }

const numero = (t: string) => {
  const n = Number(t.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Una percentuale non ha migliaia: «33.5» e «33,5» sono la stessa cosa. */
const percento = (t: string) => {
  const n = Number(t.trim().replace(",", "."));
  return t.trim() && Number.isFinite(n) ? n : NaN;
};

/** Distribuisce anche il centesimo di arrotondamento tra le righe. */
export function quoteInEuro(commesse: QuotaCommessa[], imponibile: string) {
  const totale = Math.round(numero(imponibile) * 100);
  let cumulata = 0;
  return commesse.map(c => {
    const prima = Math.round(totale * cumulata / 100);
    cumulata += percento(c.pct) || 0;
    const centesimi = Math.round(totale * cumulata / 100) - prima;
    return { ...c, euro: Number.isFinite(centesimi) ? (centesimi / 100).toFixed(2).replace(".", ",") : "" };
  });
}

function centesimiQuota(testo = "") {
  const t = testo.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(t)) return NaN;
  return Math.round(Number(t.replace(",", ".")) * 100);
}

export function quoteInPercentuale(commesse: QuotaCommessa[], imponibile: string) {
  const totale = Math.round(numero(imponibile) * 100);
  return commesse.map(c => {
    const pct = centesimiQuota(c.euro) * 100 / totale;
    return { ...c, pct: Number.isFinite(pct) ? String(pct).replace(".", ",") : "" };
  });
}

/** Dice cosa manca, in parole. Null = si può salvare. */
export function erroreUscita(f: FormUscita): string | null {
  if (!f.descrizione.trim()) return "Scrivi di cosa si tratta.";
  const n = numero(f.imponibile);
  if (!f.imponibile.trim() || Number.isNaN(n) || n <= 0) return "Scrivi un importo maggiore di zero.";
  const a = numero(f.aliquota || "0");
  if (Number.isNaN(a) || a < 0 || a > 100) return "L'aliquota va da 0 a 100.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return "Indica la data.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.scadenza ?? f.data)) return "Indica la scadenza del pagamento.";
  if (f.pagata && !/^\d{4}-\d{2}-\d{2}$/.test(f.dataPagamento ?? "")) return "Indica la data del pagamento.";
  const scelte = f.commesse.filter((c) => c.id);
  if (new Set(scelte.map((c) => c.id)).size < scelte.length) return "Hai scelto due volte la stessa commessa.";
  if (f.modoQuota === "euro" && f.commesse.length > 1) {
    if (scelte.length !== f.commesse.length) return "Scegli una commessa per ogni importo o togli la riga.";
    const importi = scelte.map(c => centesimiQuota(c.euro));
    if (importi.some(v => !Number.isFinite(v) || v <= 0)) return "Indica per ogni quota un importo positivo con al massimo due decimali.";
    if (importi.reduce((a, b) => a + b, 0) > Math.round(n * 100)) return "Le quote superano l’importo del costo.";
  } else if (scelte.length > 1) {
    const quote = scelte.map((c) => percento(c.pct));
    if (quote.some((q) => Number.isNaN(q) || q <= 0 || q > 100)) return "Ogni commessa ha una percentuale tra 1 e 100.";
    if (quote.reduce((a, b) => a + b, 0) > 100.0001) return "Le percentuali delle commesse superano il 100%.";
  }
  return null;
}

export function rigaUscita(f: FormUscita, companyId: string) {
  return {
    company_id: companyId,
    name: f.descrizione.trim().slice(0, 200),
    amount: numero(f.imponibile),
    vat_rate: numero(f.aliquota || "0"),
    cost_type: "variable",
    recurrence: "once",
    category: f.categoria === undefined ? "altro" : f.categoria,
    senza_fattura: true,
    due_date: f.scadenza ?? f.data,
    documento_data: f.data,
    documento_riferimento: f.riferimento.trim() || null,
    // Il mese di competenza è il primo del mese; se non è scelto, quello della data.
    mese_competenza: `${meseMostrato(f)}-01`,
    supplier_id: f.fornitoreId || null,
    ...quoteCommesse(f.modoQuota === "euro" ? quoteInPercentuale(f.commesse, f.imponibile) : f.commesse),
    mezzo_id: f.mezzoId || null,
    is_paid: f.pagata,
    paid_date: f.pagata ? (f.dataPagamento || null) : null,
    notes: f.note.trim() || null,
  };
}

/**
 * Una commessa: il costo è suo (order_id). Più commesse: nessuna è «la» commessa, e la quota di
 * ciascuna sta nella ripartizione, che le letture della commessa (costi per fase, IVA della
 * commessa, margini) usano al posto di order_id.
 */
export function quoteCommesse(commesse: QuotaCommessa[]): { order_id: string | null; allocations: Array<{ order_id: string; pct: number }> | null } {
  const scelte = commesse.filter((c) => c.id);
  if (scelte.length === 0) return { order_id: null, allocations: null };
  if (scelte.length === 1) return { order_id: scelte[0].id, allocations: null };
  return { order_id: null, allocations: scelte.map((c) => ({ order_id: c.id, pct: percento(c.pct) })) };
}

/** Divide 100 in parti uguali, con l'avanzo dei decimali sull'ultima: 3 → 33,33 · 33,33 · 33,34. */
export function partiUguali(n: number): string[] {
  if (n <= 0) return [];
  const parte = Math.floor((100 / n) * 100) / 100;
  const ultima = Math.round((100 - parte * (n - 1)) * 100) / 100;
  return Array.from({ length: n }, (_, i) => String(i === n - 1 ? ultima : parte).replace(".", ","));
}

/** Il mese di competenza che si vede: quello scelto, altrimenti quello della data. */
export const meseMostrato = (f: Pick<FormUscita, "mese" | "data">) => (f.mese || f.data).slice(0, 7);

/** Un'uscita già salvata, come la legge l'elenco: serve per riaprirla e modificarla. */
export interface UscitaSalvata {
  category?: string | null;
  name: string; amount: number; vat_rate: number | null; documento_data: string | null; due_date: string; paid_date?: string | null;
  documento_riferimento: string | null; mese_competenza: string | null; is_paid: boolean; notes: string | null;
  supplier_id: string | null; order_id: string | null; mezzo_id: string | null;
  allocations: Array<{ order_id: string; pct: number }> | null;
}

const testoNumero = (n: number) => String(n).replace(".", ",");

/** Il modulo compilato con un'uscita salvata (12/11/2026: prima un'uscita non si correggeva più). */
export function formDaUscita(u: UscitaSalvata): FormUscita {
  const data = u.documento_data ?? u.due_date;
  const quote = Array.isArray(u.allocations) && u.allocations.length > 0
    ? u.allocations.map((a) => ({ id: a.order_id, pct: testoNumero(Number(a.pct)) }))
    : [{ id: u.order_id ?? "", pct: "100" }];
  const mese = u.mese_competenza ? u.mese_competenza.slice(0, 7) : "";
  return {
    categoria: u.category, descrizione: u.name ?? "", imponibile: testoNumero(Number(u.amount)), aliquota: testoNumero(Number(u.vat_rate ?? 0)),
    data, scadenza: u.due_date, dataPagamento: u.paid_date ?? undefined, mese: mese === data.slice(0, 7) ? "" : mese, riferimento: u.documento_riferimento ?? "",
    fornitoreId: u.supplier_id ?? "", commesse: quote, mezzoId: u.mezzo_id ?? "", pagata: !!u.is_paid, note: u.notes ?? "",
  };
}

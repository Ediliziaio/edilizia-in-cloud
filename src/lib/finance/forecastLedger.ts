/** Cash amounts are integer cents. Dates are local calendar days, never UTC durations. */
export type Money = number | string | null;
export type ForecastCategory =
  | "clienti"
  | "fornitori"
  | "personale"
  | "fisco"
  | "squadre"
  | "provvigioni"
  | "altri"
  | "blocca-prezzo";
export const FORECAST_CATEGORIES: Record<ForecastCategory, string> = {
  clienti: "Clienti",
  fornitori: "Fornitori",
  personale: "Personale",
  fisco: "Fisco",
  squadre: "Squadre esterne",
  provvigioni: "Provvigioni",
  altri: "Altri costi",
  "blocca-prezzo": "Blocca prezzo",
};
export interface ForecastMovement {
  id: string;
  description: string;
  counterparty: string;
  category: ForecastCategory;
  direction: "in" | "out";
  cents: number;
  date: string | null;
  source: string;
  href: string;
  estimated: boolean;
  expectedDate?: string | null;
  note?: string;
  orderId?: string | null;
  /** Codice e cliente della commessa, per il filtro comune della pagina. */
  orderLabel?: string;
  /**
   * Incasso che potrebbe essere già compreso nelle rate della stessa commessa (fattura o scadenza
   * non collegata a una rata): resta fuori dal piano finché qualcuno non lo collega.
   */
  possibleDuplicate?: boolean;
  /**
   * Categoria della fonte, quando c'è: la categoria della spesa (company_costs.category) o il tipo
   * della rata («deposit» = acconto). Serve al rendiconto di cassa per mettere il movimento nella
   * voce giusta; il Previsionale non la usa.
   */
  sourceCategory?: string | null;
}
export interface BankRow {
  id: string;
  current_balance: Money;
  available_balance: Money;
  currency?: string | null;
  balance_updated_at: string | null;
}
export interface OrderRow {
  id: string;
  order_code?: string | null;
  client_name?: string | null;
  client_company?: string | null;
  deleted_at?: string | null;
  has_building_bonus?: boolean | null;
}
export interface InstallmentRow {
  id: string;
  order_id: string;
  amount: Money;
  label?: string | null;
  type?: string | null;
  expected_date: string | null;
  is_paid: boolean | null;
  paid_date?: string | null;
  invoice_id?: string | null;
  documento_fiscale_id?: string | null;
  order?: OrderRow | null;
}
export interface InvoiceRow {
  id: string;
  total: Money;
  paid_amount: Money;
  due_date: string | null;
  status: string;
  invoice_number?: string | null;
  client_company_name?: string | null;
  order_id?: string | null;
  document_type?: string | null;
  payment_date?: string | null;
  deleted_at?: string | null;
  issue_date?: string | null;
  tax_amount?: Money;
}
export interface CostRow {
  id: string;
  name: string;
  amount: Money;
  vat_rate: Money;
  due_date: string | null;
  is_paid: boolean | null;
  order_id?: string | null;
  category?: string | null;
  purchase_order_id?: string | null;
  recurrence?: string | null;
  recurrence_auto?: boolean | null;
  recurrence_end_date?: string | null;
  supplier_id?: string | null;
  supplier?: { vat_rate: Money } | null;
}
export interface DeadlineRow {
  id: string;
  description: string;
  amount: Money;
  paid_amount: Money;
  due_date: string | null;
  direction: string;
  status: string;
  cost_id?: string | null;
  invoice_id?: string | null;
  order_item_id?: string | null;
  order_id?: string | null;
  notes?: string | null;
  is_previsionale?: boolean | null;
}
export interface SupplierItemRow {
  id: string;
  name: string;
  purchase_price: Money;
  quantity: number | null;
  payment_method: string | null;
  deposit_amount: Money;
  balance_amount: Money;
  deposit_paid: boolean | null;
  balance_paid: boolean | null;
  deposit_expected_date: string | null;
  balance_expected_date: string | null;
  is_paid: boolean | null;
  order_id: string;
  order?: OrderRow | null;
  supplier?: { name: string; vat_rate: Money } | null;
}
export interface EmployeeRow {
  id: string;
  first_name: string;
  last_name: string;
  net_salary: Money;
  gross_salary: Money;
  data_assunzione?: string | null;
  data_inizio_lavoro?: string | null;
  created_at?: string;
}
export interface PayrollRow {
  id: string;
  employee_id: string;
  anno: number;
  mese: number;
  netto: Money;
  stato: string;
  data_pagamento: string | null;
}
export interface TaxRow {
  id: string;
  importo: Money;
  data_scadenza: string | null;
  tributo_descrizione: string | null;
}
export interface TeamRow {
  id: string;
  total_cost: Money;
  vat_rate: Money;
  payment_date: string | null;
  is_paid: boolean | null;
  order_id: string;
  order?: OrderRow | null;
  external_team?: { name: string } | null;
}
export interface CommissionRow {
  id: string;
  commission_amount: Money;
  deduction_amount: Money;
  payment_expected_date: string | null;
  is_paid: boolean | null;
  order_id: string;
  order?: OrderRow | null;
  salesperson?: { first_name: string; last_name: string } | null;
}
/**
 * Una rata da incassare con la regola della scheda commessa (cruscotto_rate_da_incassare): il residuo,
 * piani storici compresi; `id` è «non-pianificato-<commessa>» per la parte che nessuna rata copre.
 */
export interface RataDaIncassareRow {
  id: string;
  order_id: string;
  amount: Money;
  expected_date: string | null;
  finanziamento?: boolean | null;
}
/** Un incasso di una rata, con la sua data (cruscotto_rate_incassi). */
export interface IncassoRataRow {
  order_id: string;
  installment_id: string | null;
  data: string | null;
  importo: Money;
  documento_fiscale_id?: string | null;
}
export interface NoteRow {
  id: string;
  direction: string;
  amount: Money;
  entry_date: string;
  category?: string;
  description?: string;
  invoice_id?: string | null;
  installment_id?: string | null;
  documento_fiscale_id?: string | null;
}
export interface PurchaseRow {
  id: string;
  total: Money;
  status: string;
  oda_number?: string | null;
  order_id?: string | null;
  issue_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date?: string | null;
  payment_terms_base?: string | null;
  payment_terms_giorni?: number | null;
}
export interface ForecastSources {
  banks: BankRow[];
  /** Il piano rate salvato: etichette e fatture collegate, per riconoscere ciò che ha già una scadenza. */
  installments: InstallmentRow[];
  rateDaIncassare: RataDaIncassareRow[];
  incassiRate: IncassoRataRow[];
  orders: OrderRow[];
  invoices: InvoiceRow[];
  costs: CostRow[];
  deadlines: DeadlineRow[];
  items: SupplierItemRow[];
  coveredItems: { order_item_id: string; company_cost_id?: string }[];
  employees: EmployeeRow[];
  payroll: PayrollRow[];
  taxes: TaxRow[];
  teams: TeamRow[];
  commissions: CommissionRow[];
  notes: NoteRow[];
  blocked: ForecastMovement[];
  purchases: PurchaseRow[];
  purchaseItems: { purchase_order_id: string; order_item_id: string | null }[];
  /** Documenti con l'IVA dei mesi recenti, per la stima della liquidazione. */
  vatDocuments: VatDocumentRow[];
  /** F24 IVA già registrati (codici 6001-6012): il loro mese non si stima. */
  vatF24: { anno: number; mese: number | null; tributo_code: string | null }[];
}
/** Una fattura emessa o ricevuta ridotta a ciò che serve alla stima IVA. */
export interface VatDocumentRow {
  date: string | null;
  vat: Money;
  kind: "vendita" | "acquisto";
  /** Nota di credito: l'IVA si sottrae. */
  credit: boolean;
  /** Da quale archivio arriva: le fatture sincronizzate e quelle del gestionale non si sommano. */
  origin: "esterna" | "nativa" | "ricevuta";
}
export const emptyForecastSources = (): ForecastSources => ({
  banks: [],
  installments: [],
  rateDaIncassare: [],
  incassiRate: [],
  orders: [],
  invoices: [],
  costs: [],
  deadlines: [],
  items: [],
  coveredItems: [],
  employees: [],
  payroll: [],
  taxes: [],
  teams: [],
  commissions: [],
  notes: [],
  blocked: [],
  purchases: [],
  purchaseItems: [],
  vatDocuments: [],
  vatF24: [],
});
export const toCents = (value: Money | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0;
};
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function calendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function validDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null;
  const key = value.slice(0, 10);
  const date = calendarDate(key);
  return Number.isFinite(date.getTime()) &&
    dayKey(date) === key &&
    date.getFullYear() < 9999
    ? key
    : null;
}
export function moveDay(value: string, days: number): string {
  const date = calendarDate(value);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}
const grossCents = (amount: Money, vat: Money): number =>
  Math.round(toCents(amount) * (1 + Math.max(0, Number(vat) || 0) / 100));
const closed = (status: string): boolean =>
  [
    "paid",
    "pagata",
    "pagato",
    "cancelled",
    // Fattura stornata da una nota di credito (e la nota che la compensa).
    "credited",
    "annullata",
    "annullato",
    "draft",
    "bozza",
  ].includes(status);
const creditNote = (type?: string | null): boolean =>
  ["credit_note", "nota_credito", "TD04"].includes(type ?? "");
const orderHref = (id: string): string => `/azienda/ordini/${id}`;
/** Tolleranza sugli arrotondamenti quando si abbinano due importi della stessa uscita (1 €). */
export const MATCH_TOLERANCE_CENTS = 100;
const sameAmount = (a: number, b: number): boolean =>
  Math.abs(a - b) <= MATCH_TOLERANCE_CENTS;
const dayOrdinal = (value: string): number => {
  const d = calendarDate(value);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
};
export const daysBetween = (from: string, to: string): number =>
  Math.round(dayOrdinal(to) - dayOrdinal(from));
/** La scadenza fiscale che cade di sabato o domenica slitta al lunedì. */
export function nextWorkingDay(value: string): string {
  const day = calendarDate(value).getDay();
  return day === 6 ? moveDay(value, 2) : day === 0 ? moveDay(value, 1) : value;
}
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export interface OpeningBalance {
  cents: number | null;
  source: "banca" | "prima-nota" | "nessuna";
  /** Il più vecchio aggiornamento tra i conti che lo dichiarano. */
  updatedAt: string | null;
  /** Conti attivi senza data di aggiornamento: non si sa quanto è vecchio il loro saldo. */
  undatedAccounts?: number;
  warning?: string;
}
export function resolveOpeningBalance(
  banks: BankRow[],
  notes: NoteRow[],
): OpeningBalance {
  if (banks.length) {
    if (banks.some((b) => b.currency && b.currency !== "EUR"))
      return {
        cents: null,
        source: "banca",
        updatedAt: null,
        warning:
          "Sono presenti conti in valuta diversa da EUR: seleziona e riconcilia il saldo in Tesoreria.",
      };
    if (
      banks.some(
        (b) => b.available_balance == null && b.current_balance == null,
      )
    )
      return {
        cents: null,
        source: "banca",
        updatedAt: null,
        warning: "Il saldo di uno o più conti non è disponibile.",
      };
    const refreshed = banks
      .map((b) => b.balance_updated_at)
      .filter((v): v is string => !!v)
      .sort();
    // La data è quella del conto aggiornato meno di recente tra quelli che la hanno: un conto
    // senza data non cancella l'informazione degli altri, ma viene contato a parte.
    return {
      cents: banks.reduce(
        (sum, b) => sum + toCents(b.available_balance ?? b.current_balance),
        0,
      ),
      source: "banca",
      updatedAt: refreshed[0] ?? null,
      undatedAccounts: banks.length - refreshed.length,
    };
  }
  if (notes.length)
    return {
      cents: notes.reduce(
        (sum, n) =>
          sum + toCents(n.amount) * (n.direction === "entrata" ? 1 : -1),
        0,
      ),
      source: "prima-nota",
      updatedAt:
        [...notes]
          .map((n) => n.entry_date)
          .sort()
          .at(-1) ?? null,
    };
  return { cents: null, source: "nessuna", updatedAt: null };
}

/** Exact links identify duplicates. Sharing a job is never enough to discard a payment. */
export function buildForecastLedger(
  s: ForecastSources,
  today: string,
  withholdingFactor = 1,
): {
  movements: ForecastMovement[];
  collected: ForecastMovement[];
  warnings: string[];
} {
  const movements: ForecastMovement[] = [];
  const collected: ForecastMovement[] = [];
  const warnings = new Set<string>();
  const orderMap = new Map(s.orders.map((o) => [o.id, o]));
  const costById = new Map(s.costs.map((c) => [c.id, c]));
  const invoices = new Map(s.invoices.map((i) => [i.id, i]));
  const invoiceDeadlines = new Set(
    s.deadlines
      .filter((d) => d.invoice_id && !closed(d.status))
      .map((d) => d.invoice_id),
  );
  const costDeadlines = new Set(
    s.deadlines.filter((d) => d.cost_id).map((d) => d.cost_id),
  );
  const itemDeadlines = new Map<string, DeadlineRow[]>();
  for (const d of s.deadlines)
    if (d.order_item_id) {
      const list = itemDeadlines.get(d.order_item_id);
      if (list) list.push(d);
      else itemDeadlines.set(d.order_item_id, [d]);
    }
  const docIds = (d: DeadlineRow): string[] =>
    [...(d.notes ?? "").matchAll(/\[DOC:([0-9a-f-]+)\]/gi)].map((m) => m[1]);
  const nativeDeadlines = new Set(s.deadlines.flatMap(docIds));
  const covered = new Set(s.coveredItems.map((i) => i.order_item_id));
  const notedInvoices = new Set(s.notes.map((n) => n.invoice_id));
  const notedInstallments = new Set(s.notes.map((n) => n.installment_id));
  const notedNative = new Set(s.notes.map((n) => n.documento_fiscale_id));
  const orderLabel = (id: string | null | undefined): string | undefined => {
    const o = id ? orderMap.get(id) : undefined;
    if (!o) return undefined;
    const client = o.client_name || o.client_company;
    return [o.order_code, client].filter(Boolean).join(" · ") || undefined;
  };
  const add = (m: ForecastMovement, paid = false) => {
    if (m.cents > 0)
      (paid ? collected : movements).push({
        ...m,
        date: validDay(m.date),
        orderLabel: m.orderLabel ?? orderLabel(m.orderId),
      });
  };
  const netIncome = (
    cents: number,
    orderId?: string | null,
    financing = false,
  ) =>
    orderId && orderMap.get(orderId)?.has_building_bonus && !financing
      ? Math.round(cents * withholdingFactor)
      : cents;
  // Rate e incassi con la regola della scheda commessa (saldo = residuo, varianti approvate, piani
  // storici). Il piano salvato serve solo a riconoscere le rate che hanno già la loro fattura o scadenza.
  const rate = new Map(s.installments.map((r) => [r.id, r]));
  const giaInScadenza = (r: InstallmentRow | undefined) =>
    !!r &&
    ((!!r.invoice_id &&
      (invoices.has(r.invoice_id) || invoiceDeadlines.has(r.invoice_id))) ||
      (!!r.documento_fiscale_id && nativeDeadlines.has(r.documento_fiscale_id)));
  const countedRate = s.rateDaIncassare.filter((d) => {
    const rata = rate.get(d.id);
    return !(
      rata?.order?.deleted_at ||
      orderMap.get(d.order_id)?.deleted_at ||
      giaInScadenza(rata)
    );
  });
  // Doppio conteggio rata + fattura: una fattura (o la sua scadenza) è certamente la stessa cosa
  // di una rata solo se la rata la indica (invoice_id / documento_fiscale_id). Se la commessa ha
  // ancora rate aperte e la fattura non è collegata a nessuna, potrebbe essere già compresa lì:
  // la segnaliamo come «possibile doppione» e la teniamo fuori dal saldo, invece di contarla due volte.
  const ordersWithOpenRate = new Set(
    countedRate.filter((d) => toCents(d.amount) > 0).map((d) => d.order_id),
  );
  const invoicesOnRate = new Set(
    s.installments.map((r) => r.invoice_id).filter(Boolean),
  );
  const docsOnRate = new Set(
    s.installments.map((r) => r.documento_fiscale_id).filter(Boolean),
  );
  const duplicateNote =
    "Fattura della commessa non collegata a una rata: potrebbe essere già compresa nelle rate da incassare. Collegala alla rata nella scheda commessa per toglierla dai dubbi.";
  const maybeDuplicate = (
    orderId: string | null | undefined,
    linked: boolean,
  ): boolean => !!orderId && !linked && ordersWithOpenRate.has(orderId);
  for (const d of s.deadlines) {
    if (closed(d.status)) continue;
    // The actual invoice state takes precedence over a stale automatic deadline.
    const invoice = d.invoice_id ? invoices.get(d.invoice_id) : undefined;
    if (invoice && (closed(invoice.status) || invoice.deleted_at)) continue;
    const amount = Math.max(0, toCents(d.amount) - toCents(d.paid_amount));
    const duplicate =
      d.direction === "entrata" &&
      maybeDuplicate(
        d.order_id ?? invoice?.order_id,
        (!!d.invoice_id && invoicesOnRate.has(d.invoice_id)) ||
          docIds(d).some((id) => docsOnRate.has(id)),
      );
    add({
      id: `scadenza:${d.id}`,
      description: d.description,
      counterparty: invoice?.client_company_name ?? "",
      category:
        d.direction === "entrata"
          ? "clienti"
          : d.cost_id
            ? "altri"
            : "fornitori",
      direction: d.direction === "entrata" ? "in" : "out",
      cents: d.direction === "entrata" ? netIncome(amount, d.order_id) : amount,
      date: d.due_date,
      source: "Scadenzario",
      href: "/azienda/scadenzario",
      sourceCategory: d.cost_id ? costById.get(d.cost_id)?.category ?? null : null,
      orderId: d.order_id ?? invoice?.order_id,
      estimated: !!d.is_previsionale,
      ...(duplicate ? { possibleDuplicate: true, note: duplicateNote } : {}),
    });
  }
  for (const i of s.invoices) {
    if (i.deleted_at || ["cancelled", "draft"].includes(i.status)) continue;
    const isCredit = creditNote(i.document_type);
    if (!invoiceDeadlines.has(i.id) && !closed(i.status))
      add({
        id: `fattura:${i.id}`,
        description: `${isCredit ? "Nota credito" : "Fattura"} ${i.invoice_number ?? ""}`,
        counterparty: i.client_company_name ?? "",
        category: "clienti",
        direction: isCredit ? "out" : "in",
        cents: isCredit
          ? Math.max(0, toCents(i.total) - toCents(i.paid_amount))
          : netIncome(
              Math.max(0, toCents(i.total) - toCents(i.paid_amount)),
              i.order_id,
            ),
        date: i.due_date,
        source: "Fattura",
        href: `/azienda/fatturazione/${i.id}`,
        orderId: i.order_id,
        estimated: false,
        ...(!isCredit && maybeDuplicate(i.order_id, invoicesOnRate.has(i.id))
          ? { possibleDuplicate: true, note: duplicateNote }
          : {}),
      });
    if (
      !isCredit &&
      !notedInvoices.has(i.id) &&
      i.payment_date &&
      toCents(i.paid_amount) > 0
    )
      add(
        {
          id: `incasso-fattura:${i.id}`,
          description: `Fattura ${i.invoice_number ?? ""}`,
          counterparty: i.client_company_name ?? "",
          category: "clienti",
          direction: "in",
          cents: toCents(i.paid_amount),
          date: i.payment_date,
          expectedDate: validDay(i.due_date),
          source: "Fattura",
          href: `/azienda/fatturazione/${i.id}`,
          estimated: false,
        },
        true,
      );
  }
  for (const d of countedRate) {
    const rata = rate.get(d.id);
    const order = orderMap.get(d.order_id);
    add({
      id: `rata:${d.id}`,
      description:
        rata?.label ||
        (d.id.startsWith("non-pianificato-")
          ? "Parte non pianificata della commessa"
          : "Rata commessa"),
      counterparty:
        order?.client_name || order?.client_company || order?.order_code || "",
      category: "clienti",
      direction: "in",
      cents: netIncome(toCents(d.amount), d.order_id, !!d.finanziamento),
      date: d.expected_date,
      expectedDate: validDay(d.expected_date),
      source: "Rata commessa",
      href: orderHref(d.order_id),
      orderId: d.order_id,
      estimated: false,
      sourceCategory: rate.get(d.id)?.type ?? null,
    });
  }
  s.incassiRate.forEach((i, n) => {
    const rata = i.installment_id ? rate.get(i.installment_id) : undefined;
    const order = orderMap.get(i.order_id);
    if (order?.deleted_at || giaInScadenza(rata)) return;
    const documento = i.documento_fiscale_id ?? rata?.documento_fiscale_id;
    // L'incasso registrato in Prima Nota vale da solo: la rata non si conta una seconda volta.
    if (
      (i.installment_id && notedInstallments.has(i.installment_id)) ||
      (documento && (notedNative.has(documento) || nativeDeadlines.has(documento)))
    )
      return;
    add(
      {
        id: `incasso-rata:${i.installment_id ?? i.order_id}:${n}`,
        description: rata?.label || rata?.type || "Rata commessa",
        counterparty:
          order?.client_name || order?.client_company || order?.order_code || "",
        category: "clienti",
        direction: "in",
        cents: toCents(i.importo),
        date: i.data,
        expectedDate: validDay(rata?.expected_date),
        source: "Rata commessa",
        href: orderHref(i.order_id),
        orderId: i.order_id,
        estimated: false,
      },
      true,
    );
  });
  for (const c of s.costs)
    if (!c.is_paid && !costDeadlines.has(c.id)) {
      const vat = c.vat_rate ?? c.supplier?.vat_rate;
      if (vat == null)
        warnings.add(
          "Alcune spese non hanno un’aliquota IVA: il loro importo di cassa è da verificare.",
        );
      add({
        id: `costo:${c.id}`,
        description: c.name,
        counterparty: "",
        category:
          c.category === "Personale"
            ? "personale"
            : c.purchase_order_id
              ? "fornitori"
              : "altri",
        direction: "out",
        cents: grossCents(c.amount, vat),
        date: c.due_date,
        source: "Spesa registrata",
        href: "/azienda/costi",
        sourceCategory: c.category ?? null,
        orderId: c.order_id,
        estimated: vat == null,
        note:
          vat == null
            ? "Aliquota IVA mancante: verifica l’importo da pagare."
            : undefined,
      });
    }
  // Una occorrenza è già registrata se un'altra spesa con lo stesso nome (o dello stesso fornitore
  // e dello stesso importo) cade entro 3 giorni: la data registrata a mano raramente coincide.
  const costsByName = new Map<string, CostRow[]>();
  const costsBySupplier = new Map<string, CostRow[]>();
  const pushTo = (map: Map<string, CostRow[]>, key: string, c: CostRow) => {
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  };
  const nameKey = (name: string) => name.trim().toLocaleLowerCase("it-IT");
  for (const c of s.costs) {
    pushTo(costsByName, nameKey(c.name), c);
    if (c.supplier_id) pushTo(costsBySupplier, c.supplier_id, c);
  }
  const alreadyRegistered = (mother: CostRow, date: string, cents: number) => {
    const near = (c: CostRow) => {
      const day = validDay(c.due_date);
      return (
        c.id !== mother.id && !!day && Math.abs(daysBetween(day, date)) <= 3
      );
    };
    return (
      (costsByName.get(nameKey(mother.name)) ?? []).some(near) ||
      (!!mother.supplier_id &&
        (costsBySupplier.get(mother.supplier_id) ?? []).some(
          (c) =>
            near(c) &&
            sameAmount(
              grossCents(c.amount, c.vat_rate ?? c.supplier?.vat_rate),
              cents,
            ),
        ))
    );
  };
  const occurrences = (c: CostRow, base: string): string[] => {
    const limit = moveDay(today, 120);
    const dates: string[] = [];
    if (c.recurrence === "weekly") {
      const first = Math.max(1, Math.ceil(daysBetween(base, today) / 7));
      for (let n = first; ; n++) {
        const date = moveDay(base, n * 7);
        if (date > limit) break;
        dates.push(date);
      }
      return dates;
    }
    const step =
      c.recurrence === "monthly"
        ? 1
        : c.recurrence === "quarterly"
          ? 3
          : c.recurrence === "yearly"
            ? 12
            : 0;
    if (!step) return dates;
    const anchor = calendarDate(base);
    const now = calendarDate(today);
    const elapsed =
      (now.getFullYear() - anchor.getFullYear()) * 12 +
      now.getMonth() -
      anchor.getMonth();
    for (
      let offset = Math.max(step, Math.floor(elapsed / step) * step);
      ;
      offset += step
    ) {
      const last = new Date(
        anchor.getFullYear(),
        anchor.getMonth() + offset + 1,
        0,
      ).getDate();
      const date = dayKey(
        new Date(
          anchor.getFullYear(),
          anchor.getMonth() + offset,
          Math.min(anchor.getDate(), last),
        ),
      );
      if (date > limit) break;
      dates.push(date);
    }
    return dates;
  };
  for (const c of s.costs) {
    const base = validDay(c.due_date);
    if (!c.recurrence_auto || !base) continue;
    const cents = grossCents(c.amount, c.vat_rate ?? c.supplier?.vat_rate);
    for (const date of occurrences(c, base)) {
      if (c.recurrence_end_date && date > c.recurrence_end_date) break;
      if (date < today || alreadyRegistered(c, date, cents)) continue;
      add({
        id: `ricorrente:${c.id}:${date}`,
        description: c.name,
        counterparty: "",
        category: c.category === "Personale" ? "personale" : "altri",
        direction: "out",
        cents,
        date,
        source: "Stima ricorrenza",
        href: "/azienda/costi",
        sourceCategory: c.category ?? null,
        estimated: true,
        note: "Occorrenza futura prevista dalla ricorrenza, non ancora registrata.",
      });
    }
  }
  const costPurchases = new Set(s.costs.map((c) => c.purchase_order_id));
  const itemsById = new Map(s.items.map((i) => [i.id, i]));
  const itemsByPurchase = new Map<string, Set<string>>();
  for (const pi of s.purchaseItems) {
    if (!pi.order_item_id) continue;
    const set = itemsByPurchase.get(pi.purchase_order_id);
    if (set) set.add(pi.order_item_id);
    else itemsByPurchase.set(pi.purchase_order_id, new Set([pi.order_item_id]));
  }
  for (const p of s.purchases) {
    // «Ricevuto» non vuol dire pagato: finché la merce non diventa una spesa registrata
    // (che porta la sua scadenza), l'ODA ricevuto resta un'uscita da pianificare.
    if (
      costPurchases.has(p.id) ||
      !["inviato", "confermato", "parziale", "ricevuto"].includes(p.status)
    )
      continue;
    const base = p.payment_terms_base;
    const dateBase = ["ordine", "data_ordine"].includes(base ?? "")
      ? validDay(p.issue_date)
      : ["consegna", "data_consegna"].includes(base ?? "")
        ? validDay(p.actual_delivery_date ?? p.expected_delivery_date)
        : null;
    const date =
      dateBase && p.payment_terms_giorni != null
        ? moveDay(dateBase, p.payment_terms_giorni)
        : null;
    const itemTotal = [...(itemsByPurchase.get(p.id) ?? [])]
      .map((id) => itemsById.get(id))
      .filter((i): i is SupplierItemRow => !!i)
      .reduce(
        (sum, i) =>
          sum +
          Math.round(
            toCents(i.purchase_price) *
              (i.quantity ?? 1) *
              (1 + Math.max(0, Number(i.supplier?.vat_rate) || 0) / 100),
          ),
        0,
      );
    add({
      id: `oda:${p.id}`,
      description: `Ordine acquisto ${p.oda_number ?? ""}`,
      counterparty: "",
      category: "fornitori",
      direction: "out",
      cents: Math.max(0, toCents(p.total) - itemTotal),
      date,
      source: p.status === "ricevuto" ? "ODA ricevuto" : "ODA aperto",
      href: `/azienda/ordini-acquisto/${p.id}`,
      orderId: p.order_id,
      estimated: true,
      note: [
        p.status === "ricevuto"
          ? "Merce ricevuta ma non ancora registrata come spesa."
          : "",
        date
          ? "Data stimata dalle condizioni di pagamento dell’ODA."
          : "Scadenza da confermare: la consegna non è una data di pagamento.",
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
  for (const i of s.items) {
    if (i.is_paid || i.order?.deleted_at || covered.has(i.id)) continue;
    const total = toCents(i.purchase_price) * (i.quantity ?? 1);
    const split = ["50_50", "30_70"].includes(i.payment_method ?? "");
    const vat = Math.max(0, Number(i.supplier?.vat_rate) || 0) / 100;
    if (i.supplier?.vat_rate == null)
      warnings.add(
        "Alcuni acquisti stimati non hanno l’aliquota del fornitore: verifica l’importo prima di pianificare il pagamento.",
      );
    const deposit =
      i.deposit_amount == null
        ? Math.round(total * (i.payment_method === "30_70" ? 0.3 : 0.5))
        : toCents(i.deposit_amount);
    const balance =
      i.balance_amount == null
        ? Math.max(0, total - deposit)
        : toCents(i.balance_amount);
    const linked = itemDeadlines.get(i.id) ?? [];
    if (
      total > 0 &&
      linked.some((d) =>
        sameAmount(toCents(d.amount), Math.round(total * (1 + vat))),
      )
    )
      continue;
    const consumed = new Set<string>();
    const emit = (part: string, cents: number, date: string | null) => {
      const amount = Math.round(cents * (1 + vat));
      const match = linked.find((d) => {
        if (consumed.has(d.id)) return false;
        const tagged = /acconto/i.test(d.description)
          ? "Acconto"
          : /saldo/i.test(d.description)
            ? "Saldo"
            : null;
        if (tagged) return tagged === part;
        return (
          !closed(d.status) &&
          !!date &&
          validDay(d.due_date) === validDay(date) &&
          sameAmount(toCents(d.amount), amount)
        );
      });
      if (match) {
        consumed.add(match.id);
        return;
      }
      add({
        id: `articolo:${i.id}:${part}`,
        description: `${part} · ${i.name}`,
        counterparty: i.supplier?.name ?? "",
        category: "fornitori",
        direction: "out",
        cents: amount,
        date,
        source: "Pagamento fornitore",
        href: orderHref(i.order_id),
        orderId: i.order_id,
        estimated: true,
        note: "Importo da articolo; conferma condizioni e aliquota del fornitore.",
      });
    };
    if (split) {
      if (!i.deposit_paid) emit("Acconto", deposit, i.deposit_expected_date);
      if (!i.balance_paid) emit("Saldo", balance, i.balance_expected_date);
    } else if (!i.is_paid)
      emit(
        "Pagamento",
        total,
        i.balance_expected_date ?? i.deposit_expected_date,
      );
  }
  for (const t of s.teams)
    if (!t.is_paid && !t.order?.deleted_at)
      add({
        id: `squadra:${t.id}`,
        description: "Squadra esterna",
        counterparty: t.external_team?.name ?? "",
        category: "squadre",
        direction: "out",
        cents: grossCents(t.total_cost, t.vat_rate),
        date: t.payment_date,
        source: "Squadra esterna",
        href: orderHref(t.order_id),
        orderId: t.order_id,
        estimated: false,
      });
  for (const c of s.commissions)
    if (!c.is_paid && !c.order?.deleted_at)
      add({
        id: `provvigione:${c.id}`,
        description: "Provvigione",
        counterparty:
          `${c.salesperson?.first_name ?? ""} ${c.salesperson?.last_name ?? ""}`.trim(),
        category: "provvigioni",
        direction: "out",
        cents: Math.max(
          0,
          toCents(c.commission_amount) - toCents(c.deduction_amount),
        ),
        date: c.payment_expected_date,
        source: "Provvigione",
        href: orderHref(c.order_id),
        orderId: c.order_id,
        estimated: false,
      });
  for (const t of s.taxes)
    add({
      id: `f24:${t.id}`,
      description: t.tributo_descrizione || "F24 da pagare",
      counterparty: "",
      category: "fisco",
      direction: "out",
      cents: toCents(t.importo),
      date: t.data_scadenza,
      source: "F24 registrato",
      href: "/azienda/contabilita-fiscale",
      estimated: false,
    });

  // Il giorno degli stipendi non è fisso: nel gestionale non c'è un'impostazione HR che lo dica,
  // quindi si ricava dai pagamenti veri (Prima Nota «stipendi» e cedolini pagati degli ultimi
  // 12 mesi). Senza almeno due pagamenti si usa la fine del mese, e lo si dichiara.
  const yearAgo = moveDay(today, -366);
  const salaryDays = [
    ...s.notes
      .filter(
        (n) =>
          n.category?.toLowerCase() === "stipendi" &&
          n.direction === "uscita" &&
          n.entry_date >= yearAgo,
      )
      .map((n) => n.entry_date),
    ...s.payroll
      .filter((p) => p.stato === "pagato")
      .map((p) => validDay(p.data_pagamento))
      .filter((d): d is string => !!d && d >= yearAgo && d <= today),
  ].map((d) => Number(d.slice(8, 10)));
  const observedPayday = salaryDays.length >= 2 ? median(salaryDays) : null;
  const paydayIn = (year: number, month: number): string => {
    const last = new Date(year, month, 0).getDate();
    return dayKey(
      new Date(year, month - 1, Math.min(observedPayday ?? last, last)),
    );
  };
  const paydayRule =
    observedPayday != null
      ? `il giorno ${observedPayday} del mese, mediana di ${salaryDays.length} pagamenti stipendio registrati negli ultimi 12 mesi`
      : "l’ultimo giorno del mese, perché non ci sono almeno due pagamenti stipendio registrati da cui ricavarlo";
  const manualPayroll = s.costs.filter(
    (c) =>
      !c.is_paid &&
      c.category === "Personale" &&
      /stipendi|stipendio|cedolino|retribuzion/i.test(c.name),
  );
  const salaryBudgets = new Map<string, number>();
  for (const c of manualPayroll) {
    const date = validDay(c.due_date);
    if (!date) continue;
    const key = date.slice(0, 7);
    salaryBudgets.set(
      key,
      (salaryBudgets.get(key) ?? 0) +
        grossCents(c.amount, c.vat_rate ?? c.supplier?.vat_rate),
    );
  }
  // Manual payroll cash is already in the ledger. Reserve only the remaining
  // payroll estimate in that payment month, rather than dropping every wage.
  const payrollResidual = (date: string, cents: number) => {
    const key = date.slice(0, 7);
    const covered = Math.min(cents, salaryBudgets.get(key) ?? 0);
    salaryBudgets.set(key, (salaryBudgets.get(key) ?? 0) - covered);
    return { cents: cents - covered, covered };
  };
  const payrollPeriods = new Set(
    s.payroll
      .filter((p) => p.stato !== "bozza")
      .map(
        (p) => `${p.employee_id}:${p.anno}-${String(p.mese).padStart(2, "0")}`,
      ),
  );
  const employeesById = new Map(s.employees.map((e) => [e.id, e]));
  for (const p of s.payroll) {
    if (p.stato === "bozza" || p.stato === "pagato") continue;
    const date = validDay(p.data_pagamento);
    const employee = employeesById.get(p.employee_id);
    const residual = payrollResidual(
      date ?? paydayIn(p.anno, p.mese),
      toCents(p.netto),
    );
    add({
      id: `cedolino:${p.id}`,
      description: `Cedolino ${p.mese}/${p.anno}`,
      counterparty: employee
        ? `${employee.first_name} ${employee.last_name}`
        : "Personale",
      category: "personale",
      direction: "out",
      cents: residual.cents,
      date,
      source: "Cedolino emesso",
      href: "/azienda/personale",
      estimated: !date || residual.covered > 0,
      note:
        residual.covered > 0
          ? "Residuo rispetto alle spese stipendio già registrate nel mese: verifica gli abbinamenti."
          : !date
            ? "Completa la data del pagamento."
            : undefined,
    });
  }
  // Unissued payroll is explicitly a planning estimate. No invented F24 or VAT dates.
  for (const e of s.employees) {
    if (toCents(e.net_salary) <= 0 && toCents(e.gross_salary) <= 0) continue;
    for (let offset = 0; offset < 4; offset++) {
      const month = calendarDate(`${today.slice(0, 7)}-01`);
      month.setMonth(month.getMonth() + offset);
      const date = paydayIn(month.getFullYear(), month.getMonth() + 1);
      if (
        date < today ||
        (e.data_assunzione || e.data_inizio_lavoro || e.created_at || "").slice(
          0,
          10,
        ) > date ||
        payrollPeriods.has(`${e.id}:${date.slice(0, 7)}`)
      )
        continue;
      const residual = payrollResidual(
        date,
        toCents(e.net_salary) > 0
          ? toCents(e.net_salary)
          : toCents(e.gross_salary),
      );
      add({
        id: `stipendio:${e.id}:${date.slice(0, 7)}`,
        description:
          residual.covered > 0
            ? "Stipendio previsto residuo"
            : "Stipendio previsto",
        counterparty:
          residual.covered > 0 ? "Personale" : `${e.first_name} ${e.last_name}`,
        category: "personale",
        direction: "out",
        cents: residual.cents,
        date,
        source: "Stima personale",
        href: "/azienda/personale",
        estimated: true,
        note: `${toCents(e.net_salary) > 0 ? "Netto" : "Lordo usato come stima prudente: netto mancante"}; ${observedPayday != null ? `giorno ${observedPayday} ricavato dai pagamenti registrati` : "fine mese ipotizzata: nessun giorno ricavabile dai pagamenti"}.`,
      });
    }
  }
  if (manualPayroll.length)
    warnings.add(
      "Le stime stipendio sono al netto delle spese stipendio già registrate nel mese di pagamento. Verifica gli abbinamenti nel dettaglio.",
    );
  if (s.employees.length) {
    warnings.add(
      "Stipendi non ancora emessi stimati dall’anagrafica. Imposte e contributi entrano quando sono registrati in F24; verifica che siano completi.",
    );
    warnings.add(`Giorno di pagamento degli stipendi: ${paydayRule}.`);
  }
  const installmentsByDoc = new Map<string, InstallmentRow>();
  for (const r of s.installments)
    if (r.documento_fiscale_id && !installmentsByDoc.has(r.documento_fiscale_id))
      installmentsByDoc.set(r.documento_fiscale_id, r);
  for (const n of s.notes)
    if (n.direction === "entrata") {
      const linked =
        (n.installment_id ? rate.get(n.installment_id) : undefined) ??
        (n.documento_fiscale_id
          ? installmentsByDoc.get(n.documento_fiscale_id)
          : undefined);
      const invoice = n.invoice_id ? invoices.get(n.invoice_id) : undefined;
      add(
        {
          id: `prima-nota:${n.id}`,
          description: n.description || "Entrata registrata",
          counterparty: "",
          category: "clienti",
          direction: "in",
          cents: toCents(n.amount),
          date: n.entry_date,
          expectedDate: validDay(linked?.expected_date ?? invoice?.due_date),
          source: "Prima Nota",
          href: "/azienda/prima-nota",
          estimated: false,
        },
        true,
      );
    }
  for (const m of s.blocked) add(m);
  const vat = vatEstimates(s, today);
  vat.movements.forEach((m) => add(m));
  vat.warnings.forEach((w) => warnings.add(w));
  return {
    movements: movements.sort(
      (a, b) =>
        (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
        a.id.localeCompare(b.id),
    ),
    collected: collected.sort((a, b) =>
      (b.date ?? "").localeCompare(a.date ?? ""),
    ),
    warnings: [...warnings],
  };
}

const VAT_F24_CODES = /^60(0[1-9]|1[0-2])$/;
/**
 * Stima dell'IVA da versare: per ogni mese, IVA delle fatture emesse meno IVA delle fatture
 * ricevute, al 16 del mese dopo (o il primo giorno lavorativo), solo se positiva. Il credito di un
 * mese passa al successivo. Limiti dichiarati: regime mensile, data documento (non data di
 * ricezione SDI), niente acconto di dicembre, split payment o reverse charge; i mesi con un F24
 * IVA già registrato non si stimano. Le fatture sincronizzate e quelle del gestionale non si
 * sommano: per ogni mese vale l'archivio esterno se ha righe, altrimenti quello nativo.
 */
export function vatEstimates(
  s: Pick<ForecastSources, "vatDocuments" | "vatF24">,
  today: string,
): { movements: ForecastMovement[]; warnings: string[] } {
  if (!s.vatDocuments.length) return { movements: [], warnings: [] };
  const months = new Map<
    string,
    { esterna: number; nativa: number; hasEsterna: boolean; acquisti: number }
  >();
  for (const doc of s.vatDocuments) {
    const day = validDay(doc.date);
    if (!day) continue;
    const key = day.slice(0, 7);
    const m = months.get(key) ?? {
      esterna: 0,
      nativa: 0,
      hasEsterna: false,
      acquisti: 0,
    };
    const cents = Math.abs(toCents(doc.vat)) * (doc.credit ? -1 : 1);
    if (doc.kind === "acquisto") m.acquisti += cents;
    else if (doc.origin === "esterna") {
      m.esterna += cents;
      m.hasEsterna = true;
    } else m.nativa += cents;
    months.set(key, m);
  }
  const registered = new Set(
    s.vatF24
      .filter((f) => VAT_F24_CODES.test(f.tributo_code ?? "") && f.mese)
      .map((f) => `${f.anno}-${String(f.mese).padStart(2, "0")}`),
  );
  const movements: ForecastMovement[] = [];
  let credit = 0;
  for (const key of [...months.keys()].sort()) {
    if (key > today.slice(0, 7)) break;
    const m = months.get(key)!;
    const balance =
      (m.hasEsterna ? m.esterna : m.nativa) - m.acquisti - credit;
    credit = balance < 0 ? -balance : 0;
    const [year, month] = key.split("-").map(Number);
    const due = nextWorkingDay(dayKey(new Date(year, month, 16)));
    if (balance <= 0 || due < today || registered.has(key)) continue;
    const current = key === today.slice(0, 7);
    movements.push({
      id: `iva:${key}`,
      description: `IVA da versare · ${calendarDate(`${key}-01`).toLocaleDateString("it-IT", { month: "long", year: "numeric" })}`,
      counterparty: "Erario",
      category: "fisco",
      direction: "out",
      cents: balance,
      date: due,
      source: "Stima IVA",
      href: "/azienda/contabilita-fiscale",
      estimated: true,
      note: `IVA delle fatture emesse meno IVA delle fatture ricevute${current ? " finora (il mese non è finito)" : ""}. Stima: verifica con il commercialista.`,
    });
  }
  return {
    movements,
    warnings: [
      "IVA da versare stimata come IVA delle vendite meno IVA degli acquisti del mese, al 16 del mese dopo: regime mensile, data del documento, senza acconto di dicembre, split payment o reverse charge. Se paghi l’IVA a trimestre o il commercialista registra già l’F24, verifica la stima o spegnila con «Includi stime».",
    ],
  };
}

export interface ForecastScenario {
  delayDays: number;
  includeOverdueIncome: boolean;
  /** Le uscite scadute e non segnate pagate entrano oggi solo se lo chiedi: spesso sono già pagate. */
  includeOverdueExpense?: boolean;
  includeEstimates: boolean;
  /** Solo simulazione: data spostata a mano per un singolo incasso (id movimento → giorno). */
  dateOverrides?: Record<string, string>;
}
export interface ForecastDay {
  date: string;
  income: number;
  expense: number;
  net: number;
  balance: number | null;
  movements: ForecastMovement[];
}
export interface ForecastProjection {
  days: ForecastDay[];
  income: number;
  expense: number;
  net: number;
  finalBalance: number | null;
  minimum: number | null;
  minimumDate: string | null;
  firstBelow: string | null;
  need: number | null;
  undated: ForecastMovement[];
  overdueIncome: ForecastMovement[];
  overdueExpense: ForecastMovement[];
  possibleDuplicates: ForecastMovement[];
  excludedEstimates: ForecastMovement[];
  included: ForecastMovement[];
  outside: ForecastMovement[];
}
export function projectForecast(
  movements: ForecastMovement[],
  opening: number | null,
  today: string,
  horizon: number,
  threshold: number,
  scenario: ForecastScenario,
): ForecastProjection {
  const buckets = new Map<string, ForecastMovement[]>();
  const included: ForecastMovement[] = [];
  const undated: ForecastMovement[] = [];
  const overdueIncome: ForecastMovement[] = [];
  const overdueExpense: ForecastMovement[] = [];
  const possibleDuplicates: ForecastMovement[] = [];
  const excludedEstimates: ForecastMovement[] = [];
  const outside: ForecastMovement[] = [];
  const end = moveDay(today, horizon - 1);
  for (const source of movements) {
    const moved =
      source.direction === "in"
        ? validDay(scenario.dateOverrides?.[source.id])
        : null;
    const m = moved
      ? {
          ...source,
          date: moved,
          note: [
            source.note,
            `Data spostata a mano (era ${source.date ?? "senza data"}): solo simulazione.`,
          ]
            .filter(Boolean)
            .join(" "),
        }
      : source;
    if (m.possibleDuplicate) {
      possibleDuplicates.push(m);
      continue;
    }
    if (!m.date) {
      undated.push(m);
      continue;
    }
    if (m.estimated && !scenario.includeEstimates) {
      excludedEstimates.push(m);
      continue;
    }
    if (
      m.direction === "in" &&
      m.date < today &&
      !scenario.includeOverdueIncome
    ) {
      overdueIncome.push(m);
      continue;
    }
    if (
      m.direction === "out" &&
      m.date < today &&
      !scenario.includeOverdueExpense
    ) {
      overdueExpense.push(m);
      continue;
    }
    const effectiveDate =
      m.direction === "in"
        ? moved
          ? m.date < today
            ? today
            : m.date
          : moveDay(m.date < today ? today : m.date, scenario.delayDays)
        : m.date < today
          ? today
          : m.date;
    const planned = {
      ...m,
      date: effectiveDate,
      note: [
        m.note,
        effectiveDate !== m.date
          ? `Scadenza originale ${m.date}; data di simulazione.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
    if (effectiveDate > end) {
      outside.push(planned);
      continue;
    }
    included.push(planned);
    const bucket = buckets.get(effectiveDate);
    if (bucket) bucket.push(planned);
    else buckets.set(effectiveDate, [planned]);
  }
  let balance = opening;
  let minimum = opening;
  let minimumDate = opening == null ? null : today;
  let firstBelow = opening != null && opening < threshold ? today : null;
  const days = Array.from({ length: horizon }, (_, index): ForecastDay => {
    const date = moveDay(today, index);
    const items = buckets.get(date) ?? [];
    const income = items
      .filter((m) => m.direction === "in")
      .reduce((s, m) => s + m.cents, 0);
    const expense = items
      .filter((m) => m.direction === "out")
      .reduce((s, m) => s + m.cents, 0);
    if (balance != null) {
      balance += income - expense;
      if (minimum == null || balance < minimum) {
        minimum = balance;
        minimumDate = date;
      }
      if (!firstBelow && balance < threshold) firstBelow = date;
    }
    return {
      date,
      income,
      expense,
      net: income - expense,
      balance,
      movements: items,
    };
  });
  const income = days.reduce((sum, d) => sum + d.income, 0);
  const expense = days.reduce((sum, d) => sum + d.expense, 0);
  return {
    days,
    income,
    expense,
    net: income - expense,
    finalBalance: balance,
    minimum,
    minimumDate,
    firstBelow,
    need: minimum == null ? null : Math.max(0, threshold - minimum),
    undated,
    overdueIncome,
    overdueExpense,
    possibleDuplicates,
    excludedEstimates,
    included,
    outside,
  };
}
/**
 * Ritardo medio reale degli incassi: giorni tra la data attesa e quella dell'incasso registrato,
 * negli ultimi 12 mesi (un anticipo conta zero). Null se nessun incasso ha una data attesa.
 */
export function meanCollectionDelay(
  collected: ForecastMovement[],
  today: string,
): { days: number | null; samples: number } {
  const from = moveDay(today, -366);
  const late = collected
    .filter(
      (m) => m.date && m.expectedDate && m.date >= from && m.date <= today,
    )
    .map((m) => Math.max(0, daysBetween(m.expectedDate!, m.date!)));
  return {
    days: late.length
      ? Math.round(late.reduce((sum, d) => sum + d, 0) / late.length)
      : null,
    samples: late.length,
  };
}
export function forecastWeeks(days: ForecastDay[]) {
  return Array.from({ length: Math.ceil(days.length / 7) }, (_, i) => {
    const group = days.slice(i * 7, i * 7 + 7);
    const balances = group
      .map((d) => d.balance)
      .filter((b): b is number => b != null);
    return {
      start: group[0].date,
      end: group.at(-1)!.date,
      income: group.reduce((s, d) => s + d.income, 0),
      expense: group.reduce((s, d) => s + d.expense, 0),
      balance: group.at(-1)!.balance,
      minimum: balances.length ? Math.min(...balances) : null,
      movements: group.flatMap((d) => d.movements),
    };
  });
}
export function forecastExportRows(
  projection: ForecastProjection,
  opening: number | null,
  threshold: number,
  scenario: ForecastScenario,
) {
  const common = {
    saldo_iniziale: opening == null ? "" : (opening / 100).toFixed(2),
    soglia: (threshold / 100).toFixed(2),
    ritardo_giorni: String(scenario.delayDays),
  };
  const row = (m: ForecastMovement, status: string) => ({
    ...common,
    data: m.date ?? "",
    descrizione: m.description,
    controparte: m.counterparty,
    categoria: FORECAST_CATEGORIES[m.category],
    direzione: m.direction === "in" ? "Entrata" : "Uscita",
    importo: (m.cents / 100).toFixed(2),
    fonte: m.source,
    stima: m.estimated ? "Sì" : "No",
    inclusione: status,
    note: m.note ?? "",
  });
  return [
    ...projection.included.map((m) => row(m, "Incluso")),
    ...projection.undated.map((m) => row(m, "Escluso: senza data")),
    ...projection.overdueIncome.map((m) =>
      row(m, "Escluso: incasso scaduto da confermare"),
    ),
    ...projection.overdueExpense.map((m) =>
      row(m, "Escluso: uscita scaduta non segnata pagata"),
    ),
    ...projection.possibleDuplicates.map((m) =>
      row(m, "Escluso: possibile doppione di una rata"),
    ),
    ...projection.excludedEstimates.map((m) =>
      row(m, "Escluso: stime disattivate"),
    ),
    ...projection.outside.map((m) => row(m, "Escluso: oltre il periodo")),
  ];
}

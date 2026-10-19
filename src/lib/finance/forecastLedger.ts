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
    "annullata",
    "annullato",
    "draft",
    "bozza",
  ].includes(status);
const creditNote = (type?: string | null): boolean =>
  ["credit_note", "nota_credito", "TD04"].includes(type ?? "");
const orderHref = (id: string): string => `/azienda/ordini/${id}`;

export interface OpeningBalance {
  cents: number | null;
  source: "banca" | "prima-nota" | "nessuna";
  updatedAt: string | null;
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
    return {
      cents: banks.reduce(
        (sum, b) => sum + toCents(b.available_balance ?? b.current_balance),
        0,
      ),
      source: "banca",
      updatedAt: refreshed.length === banks.length ? refreshed[0] : null,
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
    if (d.order_item_id)
      itemDeadlines.set(d.order_item_id, [
        ...(itemDeadlines.get(d.order_item_id) ?? []),
        d,
      ]);
  const nativeDeadlines = new Set(
    s.deadlines.flatMap((d) =>
      [...(d.notes ?? "").matchAll(/\[DOC:([0-9a-f-]+)\]/gi)].map((m) => m[1]),
    ),
  );
  const covered = new Set(s.coveredItems.map((i) => i.order_item_id));
  const notedInvoices = new Set(s.notes.map((n) => n.invoice_id));
  const notedInstallments = new Set(s.notes.map((n) => n.installment_id));
  const notedNative = new Set(s.notes.map((n) => n.documento_fiscale_id));
  const add = (m: ForecastMovement, paid = false) => {
    if (m.cents > 0)
      (paid ? collected : movements).push({ ...m, date: validDay(m.date) });
  };
  const netIncome = (
    cents: number,
    orderId?: string | null,
    financing = false,
  ) =>
    orderId && orderMap.get(orderId)?.has_building_bonus && !financing
      ? Math.round(cents * withholdingFactor)
      : cents;
  for (const d of s.deadlines) {
    if (closed(d.status)) continue;
    // The actual invoice state takes precedence over a stale automatic deadline.
    const invoice = d.invoice_id ? invoices.get(d.invoice_id) : undefined;
    if (invoice && (closed(invoice.status) || invoice.deleted_at)) continue;
    const amount = Math.max(0, toCents(d.amount) - toCents(d.paid_amount));
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
      orderId: d.order_id,
      estimated: !!d.is_previsionale,
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
  // Rate e incassi con la regola della scheda commessa (saldo = residuo, varianti approvate, piani
  // storici). Il piano salvato serve solo a riconoscere le rate che hanno già la loro fattura o scadenza.
  const rate = new Map(s.installments.map((r) => [r.id, r]));
  const giaInScadenza = (r: InstallmentRow | undefined) =>
    !!r &&
    ((!!r.invoice_id &&
      (invoices.has(r.invoice_id) || invoiceDeadlines.has(r.invoice_id))) ||
      (!!r.documento_fiscale_id && nativeDeadlines.has(r.documento_fiscale_id)));
  for (const d of s.rateDaIncassare) {
    const rata = rate.get(d.id);
    const order = orderMap.get(d.order_id);
    if (rata?.order?.deleted_at || order?.deleted_at || giaInScadenza(rata)) continue;
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
        orderId: c.order_id,
        estimated: vat == null,
        note:
          vat == null
            ? "Aliquota IVA mancante: verifica l’importo da pagare."
            : undefined,
      });
    }
  for (const c of s.costs) {
    const base = validDay(c.due_date);
    const step =
      c.recurrence === "monthly"
        ? 1
        : c.recurrence === "quarterly"
          ? 3
          : c.recurrence === "yearly"
            ? 12
            : 0;
    if (!c.recurrence_auto || !base || !step) continue;
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
      if (
        date > moveDay(today, 120) ||
        (c.recurrence_end_date && date > c.recurrence_end_date)
      )
        break;
      if (
        date < today ||
        s.costs.some(
          (existing) => existing.name === c.name && existing.due_date === date,
        )
      )
        continue;
      add({
        id: `ricorrente:${c.id}:${date}`,
        description: c.name,
        counterparty: "",
        category: c.category === "Personale" ? "personale" : "altri",
        direction: "out",
        cents: grossCents(c.amount, c.vat_rate ?? c.supplier?.vat_rate),
        date,
        source: "Stima ricorrenza",
        href: "/azienda/costi",
        estimated: true,
        note: "Occorrenza futura prevista dalla ricorrenza, non ancora registrata.",
      });
    }
  }
  const costPurchases = new Set(s.costs.map((c) => c.purchase_order_id));
  for (const p of s.purchases) {
    if (
      costPurchases.has(p.id) ||
      !["inviato", "confermato", "parziale"].includes(p.status)
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
    const itemIds = new Set(
      s.purchaseItems
        .filter((i) => i.purchase_order_id === p.id)
        .map((i) => i.order_item_id),
    );
    const itemTotal = s.items
      .filter((i) => itemIds.has(i.id))
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
      source: "ODA aperto",
      href: `/azienda/ordini-acquisto/${p.id}`,
      orderId: p.order_id,
      estimated: true,
      note: date
        ? "Data stimata dalle condizioni di pagamento dell’ODA."
        : "Scadenza da confermare: la consegna non è una data di pagamento.",
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
      linked.some((d) => toCents(d.amount) === Math.round(total * (1 + vat)))
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
          toCents(d.amount) === amount
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

  const salaryDays = s.notes
    .filter(
      (n) =>
        n.category?.toLowerCase() === "stipendi" && n.direction === "uscita",
    )
    .map((n) => Number(n.entry_date.slice(8, 10)))
    .sort((a, b) => a - b);
  const payday =
    salaryDays.length >= 2 ? salaryDays[Math.floor(salaryDays.length / 2)] : 28;
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
  for (const p of s.payroll) {
    if (p.stato === "bozza" || p.stato === "pagato") continue;
    const date = validDay(p.data_pagamento);
    const employee = s.employees.find((e) => e.id === p.employee_id);
    const residual = payrollResidual(
      date ?? `${p.anno}-${String(p.mese).padStart(2, "0")}-28`,
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
      const lastDay = new Date(
        month.getFullYear(),
        month.getMonth() + 1,
        0,
      ).getDate();
      const date = dayKey(
        new Date(
          month.getFullYear(),
          month.getMonth(),
          Math.min(payday, lastDay),
        ),
      );
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
        note: `${toCents(e.net_salary) > 0 ? "Netto" : "Lordo usato come stima prudente: netto mancante"}; ${salaryDays.length >= 2 ? "giorno ricavato dai pagamenti registrati" : "giorno 28 ipotizzato"}.`,
      });
    }
  }
  if (manualPayroll.length)
    warnings.add(
      "Le stime stipendio sono al netto delle spese stipendio già registrate nel mese di pagamento. Verifica gli abbinamenti nel dettaglio.",
    );
  if (s.employees.length)
    warnings.add(
      "Stipendi non ancora emessi stimati dall’anagrafica. Imposte e contributi entrano quando sono registrati in F24; verifica che siano completi.",
    );
  for (const n of s.notes)
    if (n.direction === "entrata") {
      const linked = s.installments.find(
        (r) =>
          r.id === n.installment_id ||
          (!!n.documento_fiscale_id &&
            r.documento_fiscale_id === n.documento_fiscale_id),
      );
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

export interface ForecastScenario {
  delayDays: number;
  includeOverdueIncome: boolean;
  includeEstimates: boolean;
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
  const excludedEstimates: ForecastMovement[] = [];
  const outside: ForecastMovement[] = [];
  const end = moveDay(today, horizon - 1);
  for (const m of movements) {
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
    const effectiveDate =
      m.direction === "in"
        ? moveDay(m.date < today ? today : m.date, scenario.delayDays)
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
    buckets.set(effectiveDate, [
      ...(buckets.get(effectiveDate) ?? []),
      planned,
    ]);
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
    excludedEstimates,
    included,
    outside,
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
    ...projection.excludedEstimates.map((m) =>
      row(m, "Escluso: stime disattivate"),
    ),
    ...projection.outside.map((m) => row(m, "Escluso: oltre il periodo")),
  ];
}

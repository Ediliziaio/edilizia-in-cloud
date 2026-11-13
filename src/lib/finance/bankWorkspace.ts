import {
  withClientTimeout,
  withAbortableClientTimeout,
} from "@/lib/query-timeout";
import { supabase } from "@/integrations/supabase/client";
import { leggiImporto } from "./reconciliationAnalysis";
export type ContextKind =
  | "commessa"
  | "mezzo"
  | "fornitore"
  | "dipendente"
  | "cedolino";
export interface BankTarget {
  id: string;
  kind: ContextKind;
  label: string;
  url: string | null;
}
export interface BankContext extends BankTarget {
  context_id?: string;
  amount: number;
  note?: string | null;
}
export interface BankLink {
  id: string | null;
  kind: string;
  label: string;
  amount: number;
  url: string | null;
  jobs: BankTarget[];
  note?: string | null;
  matched_at?: string;
  unmatched_at?: string;
  split?: boolean;
  existing_payment?: boolean;
  adjustment?: boolean;
  match_type?: string;
}
export interface BankLinks {
  restricted_contexts?: boolean;
  financial: BankLink[];
  contexts: BankContext[];
  history: BankLink[];
  matched: number;
  remaining: number;
  revision: number;
}
export interface BankMovement {
  id: string;
  account_id: string;
  account_name: string;
  booking_date: string | null;
  value_date: string | null;
  amount: number;
  currency: string;
  description: string | null;
  creditor_name: string | null;
  debtor_name: string | null;
  creditor_iban: string | null;
  debtor_iban: string | null;
  reference: string | null;
  transaction_type: "credit" | "debit";
  status: string;
  category: string | null;
  note: string | null;
  reconciliation_status: string;
  chiuso_senza_documento: string | null;
  links: BankLinks;
}
export interface BankFilters {
  search: string;
  account: string;
  direction: string;
  category: string;
  currency: string;
  state: string;
  linked: string;
  from: string;
  to: string;
  min: string;
  max: string;
}
export interface BankPage {
  facets?: { currencies: string[]; categories: string[] };
  rows: BankMovement[];
  count: number;
  totals: {
    currency: string;
    n: number;
    income: number;
    expenses: number;
    net: number;
    unreconciled_count?: number;
    unreconciled_amount?: number;
  }[];
}
export const EMPTY_BANK_FILTERS: BankFilters = {
  search: "",
  account: "all",
  direction: "all",
  category: "all",
  currency: "all",
  state: "all",
  linked: "all",
  from: "",
  to: "",
  min: "",
  max: "",
};
export const CONTEXT_LABELS: Record<ContextKind, string> = {
  commessa: "Commessa",
  mezzo: "Mezzo",
  fornitore: "Fornitore",
  dipendente: "Dipendente",
  cedolino: "Cedolino",
};
export function bankFiltersPayload(f: BankFilters): BankFilters {
  const result = { ...f };
  for (const k of ["min", "max"] as const) {
    if (!f[k].trim()) continue;
    const n = leggiImporto(f[k]);
    if (n === null || n < 0)
      throw new Error("Controlla gli importi minimo e massimo");
    result[k] = String(n);
  }
  if (result.min && result.max && Number(result.min) > Number(result.max))
    throw new Error("L’importo minimo deve essere inferiore al massimo");
  if (f.from && f.to && f.from > f.to)
    throw new Error("La data iniziale deve precedere quella finale");
  return result;
}
export async function bankRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const read = [
    "bank_movimenti_elenco",
    "bank_movimento_dettaglio",
    "bank_context_choices",
    "bank_candidati_movimento",
    "bank_proposte_movimento",
    "bank_proposte_lotto",
  ].includes(name);
  const { data, error } = read
    ? await withAbortableClientTimeout(
        (signal) =>
          supabase.rpc(name as never, args as never).abortSignal(signal),
        "Lettura movimenti",
        30_000,
      )
    : await withClientTimeout(
        supabase.rpc(name as never, args as never),
        "Operazione bancaria: se l’esito resta incerto, aggiorna prima di riprovare",
        30_000,
      );
  if (error) throw new Error(error.message);
  return data as T;
}
export async function loadBankPage(
  company: string,
  filters: BankFilters,
  page: number,
): Promise<BankPage> {
  const result = await bankRpc<BankPage>("bank_movimenti_elenco", {
    p_company: company,
    p_filters: bankFiltersPayload(filters),
    p_offset: page * 50,
    p_limit: 50,
  });
  if (
    !result ||
    !Array.isArray(result.rows) ||
    !Array.isArray(result.totals) ||
    !Number.isFinite(result.count)
  )
    throw new Error("Risposta del registro movimenti non valida");
  return result;
}
export function bankState(m: BankMovement): {
  label: string;
  className: string;
} {
  if (m.chiuso_senza_documento || m.reconciliation_status === "ignored")
    return {
      label: "Senza fattura",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    };
  if (m.reconciliation_status === "suggestion")
    return {
      label: "Da verificare",
      className: "bg-violet-50 text-violet-700 border-violet-200",
    };
  if (m.reconciliation_status === "reconciled")
    return {
      label: "Riconciliata",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  if (m.links.matched > 0)
    return {
      label: "Parziale",
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  return {
    label: "Da collegare",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  };
}
export function bankJobs(m: BankMovement): BankTarget[] {
  return [
    ...new Map(
      [
        ...m.links.contexts.filter((c) => c.kind === "commessa"),
        ...m.links.financial.flatMap((f) => f.jobs ?? []),
      ].map((j) => [j.id, j]),
    ).values(),
  ];
}

/** Cache projections are separated when visibility changes within the same company. */
export function bankVisibilityKey(p: {
  isAdmin: boolean;
  canViewBilling: boolean;
  canViewCosts: boolean;
  canViewMezzi: boolean;
  canViewPrimaNota: boolean;
  canViewOrders: boolean;
}) {
  return [
    p.isAdmin,
    p.canViewBilling,
    p.canViewCosts,
    p.canViewMezzi,
    p.canViewPrimaNota,
    p.canViewOrders,
  ]
    .map(Boolean)
    .map(Number)
    .join("");
}

/** Preserve the bank's wording; a display label must never replace the original causale. */
export function bankCausale(row: { description?: string | null }): string {
  return row.description?.trim()
    ? row.description
    : "Causale non fornita dalla banca";
}

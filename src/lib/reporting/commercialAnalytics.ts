// ============================================================================
// commercialAnalytics — statistiche diagnostiche per la reportistica CRM-vendite.
// Lavora sulle righe GIÀ scaricate (nessuna query nuova). Stesse unità della lib
// report (importi in euro → cents con ×100). Riusa isOpenOpportunity per coerenza.
// ============================================================================
import {
  isMarketingCalendarAppointment,
  isOpenOpportunity,
  type CommercialAppointmentRow,
  type CommercialContactRow,
  type CommercialOpportunityRow,
  type CommercialOrderRow,
  type CommercialQuoteRow,
} from "@/lib/reporting/commercialPerformanceReport";

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function toCents(value: number | string | null | undefined): number {
  const n = toNum(value);
  return n === null ? 0 : Math.round(n * 100);
}
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}
function cleanSource(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v === "" ? "Diretto / Altro" : v;
}

// ── A) Conversioni per stadio (funnel a coorte di contatti) ────────────────
export interface FunnelConversion {
  lead: number;
  appuntamenti: number; // PRIMI appuntamenti: contatti distinti con ≥1 appuntamento marketing
  appuntamentiTotali: number; // tutti gli appuntamenti marketing (primi + follow-up)
  preventivi: number;
  vinti: number;
  convLeadAppt: number | null; // %
  convApptQuote: number | null;
  convQuoteWon: number | null;
}

export function buildFunnelConversion(rows: {
  contacts: CommercialContactRow[];
  appointments: CommercialAppointmentRow[];
  quotes: CommercialQuoteRow[];
  orders: CommercialOrderRow[];
}): FunnelConversion {
  const quoteById = new Map(rows.quotes.map((q) => [q.id, q]));
  // Solo appuntamenti del CALENDARIO MARKETING. "appuntamenti" = PRIMI (contatti
  // distinti): un lead con 3 appuntamenti conta 1 (il suo primo), non 3.
  const marketingAppts = rows.appointments.filter(isMarketingCalendarAppointment);
  const apptContacts = new Set(marketingAppts.map((a) => a.contact_id).filter(Boolean));
  const quoteContacts = new Set(rows.quotes.map((q) => q.contact_id).filter(Boolean));
  const wonContacts = new Set(
    rows.orders.map((o) => quoteById.get(o.quote_id ?? "")?.contact_id).filter(Boolean),
  );

  const lead = rows.contacts.length;
  const appuntamenti = apptContacts.size;
  const appuntamentiTotali = marketingAppts.length;
  const preventivi = quoteContacts.size;
  const vinti = wonContacts.size;
  const pct = (n: number, d: number) => (d > 0 ? roundOne((n / d) * 100) : null);

  return {
    lead,
    appuntamenti,
    appuntamentiTotali,
    preventivi,
    vinti,
    convLeadAppt: pct(appuntamenti, lead),
    convApptQuote: pct(preventivi, appuntamenti),
    convQuoteWon: pct(vinti, preventivi),
  };
}

// ── B) Fatturato + margine per fonte ───────────────────────────────────────
export interface SourceBreakdownRow {
  source: string;
  lead: number;
  vinti: number;
  fatturatoCents: number;
  marginePct: number | null;
}

export function buildSourceBreakdown(
  contacts: CommercialContactRow[],
  quotes: CommercialQuoteRow[],
  orders: CommercialOrderRow[],
): SourceBreakdownRow[] {
  const sourceOf = (c: CommercialContactRow) => cleanSource(c.source ?? c.attr_source);
  const contactSource = new Map(contacts.map((c) => [c.id, sourceOf(c)]));
  const quoteById = new Map(quotes.map((q) => [q.id, q]));

  type Acc = { lead: number; vinti: number; fatturatoCents: number; marginSum: number; marginCount: number };
  const acc = new Map<string, Acc>();
  const ensure = (s: string): Acc => {
    let entry = acc.get(s);
    if (!entry) {
      entry = { lead: 0, vinti: 0, fatturatoCents: 0, marginSum: 0, marginCount: 0 };
      acc.set(s, entry);
    }
    return entry;
  };

  for (const c of contacts) ensure(sourceOf(c)).lead += 1;
  for (const q of quotes) {
    const s = contactSource.get(q.contact_id ?? "") ?? "Diretto / Altro";
    const m = toNum(q.margine_totale_percentuale);
    if (m !== null) {
      const e = ensure(s);
      e.marginSum += m;
      e.marginCount += 1;
    }
  }
  for (const o of orders) {
    const q = quoteById.get(o.quote_id ?? "");
    const s = q ? contactSource.get(q.contact_id ?? "") ?? "Diretto / Altro" : "Diretto / Altro";
    const e = ensure(s);
    e.vinti += 1;
    e.fatturatoCents += toCents(o.total_amount);
  }

  return [...acc.entries()]
    .map(([source, v]) => ({
      source,
      lead: v.lead,
      vinti: v.vinti,
      fatturatoCents: v.fatturatoCents,
      marginePct: v.marginCount ? roundOne(v.marginSum / v.marginCount) : null,
    }))
    .sort((a, b) => b.fatturatoCents - a.fatturatoCents || b.lead - a.lead);
}

// ── C) Sales velocity + Pipeline coverage ──────────────────────────────────
export interface SalesEfficiency {
  velocityCentsPerDay: number;
  coverageRatio: number | null; // pipeline aperta / fabbisogno residuo a target
}

export function buildSalesEfficiency(input: {
  openOppCount: number;
  winRatePct: number; // 0-100
  avgDealCents: number;
  cycleDays: number | null;
  openValueCents: number;
  monthlyTargetCents: number | null;
  wonThisMonthCents: number;
}): SalesEfficiency {
  const velocityCentsPerDay =
    input.cycleDays && input.cycleDays > 0
      ? Math.round((input.openOppCount * (input.winRatePct / 100) * input.avgDealCents) / input.cycleDays)
      : 0;
  let coverageRatio: number | null = null;
  if (input.monthlyTargetCents != null) {
    const remaining = input.monthlyTargetCents - input.wonThisMonthCents;
    coverageRatio = remaining > 0 ? roundOne(input.openValueCents / remaining) : null;
  }
  return { velocityCentsPerDay, coverageRatio };
}

// ── D) Pipeline ferma (aging) ──────────────────────────────────────────────
export interface PipelineAging {
  stale60: number;
  stale90: number;
  staleValueCents: number;
}

export function buildPipelineAging(
  opportunities: CommercialOpportunityRow[],
  now: Date = new Date(),
): PipelineAging {
  const open = opportunities.filter((o) => isOpenOpportunity(o.status));
  let stale60 = 0;
  let stale90 = 0;
  let staleValueCents = 0;
  for (const o of open) {
    const ref = parseDate(o.updated_at) ?? parseDate(o.created_at);
    if (!ref) continue;
    const ageDays = (now.getTime() - ref.getTime()) / 86_400_000;
    if (ageDays > 60) stale60 += 1;
    if (ageDays > 90) {
      stale90 += 1;
      staleValueCents += toCents(o.value);
    }
  }
  return { stale60, stale90, staleValueCents };
}

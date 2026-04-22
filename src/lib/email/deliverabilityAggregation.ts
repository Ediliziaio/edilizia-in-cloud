// ============================================================================
// deliverabilityAggregation — Email Dual-Provider FASE 11
// ============================================================================
// Pure helpers per aggregare righe `email_delivery_log` in bucket per KPI.
// Estratti da EmailDeliverabilityDashboard per poter essere unit-testati.
// ============================================================================

export interface DeliveryRow {
  stream: string | null;
  provider: string | null;
  status: string | null;
  company_id: string | null;
  sent_at: string;
}

export interface AggregateBucket {
  total: number;
  sent: number;
  delivered: number;
  bounced: number;
  spam: number;
  dropped: number;
  failed: number;
}

export type Range = "7d" | "30d" | "90d";

export function emptyBucket(): AggregateBucket {
  return { total: 0, sent: 0, delivered: 0, bounced: 0, spam: 0, dropped: 0, failed: 0 };
}

export function addToBucket(b: AggregateBucket, status: string | null): void {
  b.total++;
  switch (status) {
    case "sent":      b.sent++;      break;
    case "delivered": b.delivered++; break;
    case "bounced":   b.bounced++;   break;
    case "spam":      b.spam++;      break;
    case "dropped":   b.dropped++;   break;
    case "failed":    b.failed++;    break;
  }
}

/** Percentuale formattata in italiano (es. "12,34%"). 0 se `total` è 0. */
export function rate(n: number, total: number): string {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(2)}%`;
}

/** ISO cutoff date (now − N giorni) per filtrare query sul sent_at. */
export function rangeToCutoff(range: Range, now: Date = new Date()): string {
  const d = new Date(now);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export interface AggregationResult {
  global: AggregateBucket;
  byStream: Record<string, AggregateBucket>;
  byProvider: Record<string, AggregateBucket>;
  topCompanies: Array<{ id: string } & AggregateBucket>;
}

/** Aggrega righe in buckets globale, per stream, per provider, top 10 companies. */
export function aggregateDeliveryRows(rows: DeliveryRow[]): AggregationResult {
  const global = emptyBucket();
  const byStream: Record<string, AggregateBucket> = {};
  const byProvider: Record<string, AggregateBucket> = {};
  const byCompany: Record<string, AggregateBucket> = {};

  for (const r of rows) {
    addToBucket(global, r.status);

    const streamKey = r.stream ?? "unknown";
    byStream[streamKey] = byStream[streamKey] ?? emptyBucket();
    addToBucket(byStream[streamKey], r.status);

    const providerKey = r.provider ?? "unknown";
    byProvider[providerKey] = byProvider[providerKey] ?? emptyBucket();
    addToBucket(byProvider[providerKey], r.status);

    if (r.company_id) {
      byCompany[r.company_id] = byCompany[r.company_id] ?? emptyBucket();
      addToBucket(byCompany[r.company_id], r.status);
    }
  }

  const topCompanies = Object.entries(byCompany)
    .map(([id, b]) => ({ id, ...b }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return { global, byStream, byProvider, topCompanies };
}

/** Delivery rate % (sent + delivered) / total. 0 se total è 0. */
export function deliveryRatePct(b: AggregateBucket): number {
  if (!b.total) return 0;
  return ((b.delivered + b.sent) / b.total) * 100;
}

/** Bounce rate % bounced / total. 0 se total è 0. */
export function bounceRatePct(b: AggregateBucket): number {
  if (!b.total) return 0;
  return (b.bounced / b.total) * 100;
}

/** Spam complaint rate % spam / total. 0 se total è 0. */
export function spamRatePct(b: AggregateBucket): number {
  if (!b.total) return 0;
  return (b.spam / b.total) * 100;
}

/**
 * Meta Insights Normalizer
 * Transforms raw Meta API payloads into uniform rows for the reporting table.
 *
 * To configure the primary conversion type per tenant, set it in the
 * company's integration settings or pass it as `conversionType` param.
 * Default: "lead". Other options: "purchase", "offsite_conversion.fb_pixel_lead", etc.
 */

export interface NormalizedCampaignRow {
  campaign_id: string;
  campaign_name: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  objective?: string;
  status?: string;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  conversions: number;
  revenue: number;
  leads: number;
  purchases: number;
  // Computed
  roi: number;
  cpl: number;
  cps: number;
  avg_revenue: number;
}

export interface KPISummary {
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  cpc: number;
  cost_per_conversion: number;
  cpl: number;
  reach: number;
  revenue: number;
  roas: number;
  frequency: number;
}

export interface DailyPoint {
  date: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
}

// --- Pickers ---

export function pickClicks(row: any): number {
  // Prefer link_clicks from actions
  if (row.actions) {
    const linkClick = row.actions.find((a: any) => a.action_type === "link_click");
    if (linkClick) return parseInt(linkClick.value, 10) || 0;
  }
  return parseInt(row.clicks, 10) || 0;
}

export function pickConversions(row: any, conversionType = "lead"): number {
  if (!row.actions) return 0;
  const match = row.actions.find((a: any) => a.action_type === conversionType);
  return match ? parseInt(match.value, 10) || 0 : 0;
}

export function pickLeads(row: any): number {
  if (!row.actions) return 0;
  const types = ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"];
  for (const t of types) {
    const m = row.actions.find((a: any) => a.action_type === t);
    if (m) return parseInt(m.value, 10) || 0;
  }
  return 0;
}

export function pickPurchases(row: any): number {
  if (!row.actions) return 0;
  const types = ["purchase", "offsite_conversion.fb_pixel_purchase"];
  for (const t of types) {
    const m = row.actions.find((a: any) => a.action_type === t);
    if (m) return parseInt(m.value, 10) || 0;
  }
  return 0;
}

export function pickRevenue(row: any): number {
  if (!row.action_values) return 0;
  const types = ["purchase", "offsite_conversion.fb_pixel_purchase"];
  for (const t of types) {
    const m = row.action_values.find((a: any) => a.action_type === t);
    if (m) return parseFloat(m.value) || 0;
  }
  return 0;
}

function safeDivide(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

// --- Main normalizer ---

export function normalizeInsights(
  rawRows: any[],
  conversionType = "lead",
  statusMap?: Record<string, string>
): NormalizedCampaignRow[] {
  return rawRows.map((row) => {
    const clicks = pickClicks(row);
    const spend = parseFloat(row.spend) || 0;
    const leads = pickLeads(row);
    const purchases = pickPurchases(row);
    const revenue = pickRevenue(row);
    const conversions = pickConversions(row, conversionType) || leads;

    return {
      campaign_id: row.campaign_id || "",
      campaign_name: row.campaign_name || "",
      adset_id: row.adset_id,
      adset_name: row.adset_name,
      ad_id: row.ad_id,
      ad_name: row.ad_name,
      objective: row.objective,
      status: statusMap?.[row.campaign_id] || undefined,
      impressions: parseInt(row.impressions, 10) || 0,
      reach: parseInt(row.reach, 10) || 0,
      clicks,
      spend,
      ctr: parseFloat(row.ctr) || 0,
      cpc: safeDivide(spend, clicks),
      conversions,
      revenue,
      leads,
      purchases,
      roi: safeDivide(revenue - spend, spend) * 100,
      cpl: safeDivide(spend, leads),
      cps: safeDivide(spend, purchases),
      avg_revenue: safeDivide(revenue, purchases),
    };
  });
}

// --- KPI aggregator ---

export function computeKPIs(rows: NormalizedCampaignRow[]): KPISummary {
  const totals = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      conversions: acc.conversions + r.conversions,
      spend: acc.spend + r.spend,
      reach: acc.reach + r.reach,
      leads: acc.leads + r.leads,
    }),
    { impressions: 0, clicks: 0, conversions: 0, spend: 0, reach: 0, leads: 0 }
  );

  return {
    ...totals,
    cpc: safeDivide(totals.spend, totals.clicks),
    cost_per_conversion: safeDivide(totals.spend, totals.conversions),
    cpl: safeDivide(totals.spend, totals.leads),
  };
}

// --- Daily series ---

export function computeDailySeries(rawRows: any[], conversionType = "lead"): DailyPoint[] {
  const byDate: Record<string, DailyPoint> = {};

  for (const row of rawRows) {
    const date = row.date_start || row.date || "";
    if (!date) continue;
    if (!byDate[date]) {
      byDate[date] = { date, impressions: 0, clicks: 0, conversions: 0, spend: 0 };
    }
    byDate[date].impressions += parseInt(row.impressions, 10) || 0;
    byDate[date].clicks += pickClicks(row);
    byDate[date].conversions += pickConversions(row, conversionType) || pickLeads(row);
    byDate[date].spend += parseFloat(row.spend) || 0;
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

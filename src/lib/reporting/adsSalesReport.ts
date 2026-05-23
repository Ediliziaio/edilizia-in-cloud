import {
  buildAdsAttributionMetrics,
  isGoogleAttributedContact,
  isMetaAttributedContact,
  type AdsAttributionMetrics,
} from "@/lib/ads/crmAttribution";

export type AdsSalesPlatform = "meta" | "google";
export type AdsSalesProviderFilter = AdsSalesPlatform | "all";

export interface AdsSalesContactRow {
  id: string;
  source?: string | null;
  source_campaign_id?: string | null;
  attr_source?: string | null;
  attr_medium?: string | null;
  attr_campaign?: string | null;
  attr_content?: string | null;
  meta_campaign_id?: string | null;
  meta_adset_id?: string | null;
  meta_ad_id?: string | null;
  google_campaign_id?: string | null;
  google_ad_group_id?: string | null;
  google_ad_id?: string | null;
  gclid?: string | null;
  wbraid?: string | null;
  gbraid?: string | null;
  created_at?: string | null;
}

export interface AdsSalesOpportunityRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
  value?: number | string | null;
}

export interface AdsSalesAppointmentRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
  is_completed?: boolean | null;
}

export interface AdsSalesCostRow {
  source?: string | null;
  campaign_name?: string | null;
  spend_amount?: number | string | null;
}

export interface AdsSalesReportRow {
  id: string;
  platform: AdsSalesPlatform;
  campaignKey: string;
  campaignName: string;
  sourceLabel: string;
  metrics: AdsAttributionMetrics;
}

interface BuildInput {
  contacts: AdsSalesContactRow[];
  opportunities: AdsSalesOpportunityRow[];
  appointments: AdsSalesAppointmentRow[];
  costs: AdsSalesCostRow[];
  provider?: AdsSalesProviderFilter;
}

interface MutableReportRow {
  platform: AdsSalesPlatform;
  campaignKey: string;
  campaignName: string;
  sourceLabel: string;
  terms: Set<string>;
  contactIds: Set<string>;
  spendCents: number;
}

export function buildAdsSalesReportRows(input: BuildInput): AdsSalesReportRow[] {
  const provider = input.provider ?? "all";
  const rows = new Map<string, MutableReportRow>();
  const opportunitiesByContact = groupByContact(input.opportunities);
  const appointmentsByContact = groupByContact(input.appointments);

  for (const contact of input.contacts) {
    const platform = inferContactPlatform(contact);
    if (!platform || !providerMatches(platform, provider)) continue;
    const identity = buildCampaignIdentity(contact, platform);
    const row = ensureRow(rows, platform, identity);
    row.contactIds.add(contact.id);
    identity.terms.forEach((term) => row.terms.add(term));
  }

  for (const cost of input.costs) {
    const platform = inferCostPlatform(cost);
    if (!platform || !providerMatches(platform, provider)) continue;
    const spendCents = Math.round(Number(cost.spend_amount ?? 0) * 100);
    if (spendCents <= 0) continue;

    const costTerms = [cost.campaign_name, cost.source].map(normalizeLookup).filter(Boolean);
    const existing = Array.from(rows.values()).find(
      (row) => row.platform === platform && termsOverlap(Array.from(row.terms), costTerms),
    );

    if (existing) {
      existing.spendCents += spendCents;
      costTerms.forEach((term) => existing.terms.add(term));
      continue;
    }

    const fallbackName =
      cleanLabel(cost.campaign_name) || (platform === "meta" ? "Meta Ads senza campagna" : "Google Ads senza campagna");
    const row = ensureRow(rows, platform, {
      key: normalizeLookup(fallbackName),
      name: fallbackName,
      sourceLabel: cleanLabel(cost.source) || platformLabel(platform),
      terms: costTerms.length ? costTerms : [normalizeLookup(fallbackName)],
    });
    row.spendCents += spendCents;
  }

  return Array.from(rows.values())
    .map((row) => {
      const contactIds = Array.from(row.contactIds);
      const opportunities = contactIds.flatMap((id) => opportunitiesByContact.get(id) ?? []);
      const appointments = contactIds.flatMap((id) => appointmentsByContact.get(id) ?? []);
      const won = opportunities.filter((opportunity) => isWonStatus(opportunity.status)).length;
      const revenueCents = opportunities
        .filter((opportunity) => isWonStatus(opportunity.status))
        .reduce((sum, opportunity) => sum + Math.round(Number(opportunity.value ?? 0) * 100), 0);

      return {
        id: `${row.platform}:${row.campaignKey}`,
        platform: row.platform,
        campaignKey: row.campaignKey,
        campaignName: row.campaignName,
        sourceLabel: row.sourceLabel,
        metrics: buildAdsAttributionMetrics({
          spendCents: row.spendCents,
          leads: contactIds.length,
          opportunities: opportunities.length,
          appointments: appointments.filter((appointment) => !isCancelledStatus(appointment.status)).length,
          won,
          revenueCents,
        }),
      };
    })
    .sort((a, b) => b.metrics.revenueCents - a.metrics.revenueCents || b.metrics.spendCents - a.metrics.spendCents);
}

export function summarizeAdsSalesReportRows(
  rows: AdsSalesReportRow[],
  provider: AdsSalesProviderFilter = "all",
): AdsAttributionMetrics {
  const relevantRows = provider === "all" ? rows : rows.filter((row) => row.platform === provider);
  return relevantRows.reduce(
    (acc, row) =>
      buildAdsAttributionMetrics({
        spendCents: acc.spendCents + row.metrics.spendCents,
        leads: acc.leads + row.metrics.leads,
        opportunities: acc.opportunities + row.metrics.opportunities,
        appointments: acc.appointments + row.metrics.appointments,
        won: acc.won + row.metrics.won,
        revenueCents: acc.revenueCents + row.metrics.revenueCents,
      }),
    buildAdsAttributionMetrics({}),
  );
}

function ensureRow(
  rows: Map<string, MutableReportRow>,
  platform: AdsSalesPlatform,
  identity: { key: string; name: string; sourceLabel: string; terms: string[] },
) {
  const campaignKey = identity.key || normalizeLookup(identity.name) || "unknown";
  const mapKey = `${platform}:${campaignKey}`;
  const existing = rows.get(mapKey);
  if (existing) return existing;

  const row: MutableReportRow = {
    platform,
    campaignKey,
    campaignName: identity.name,
    sourceLabel: identity.sourceLabel,
    terms: new Set(identity.terms.filter(Boolean)),
    contactIds: new Set(),
    spendCents: 0,
  };
  row.terms.add(campaignKey);
  row.terms.add(normalizeLookup(identity.name));
  rows.set(mapKey, row);
  return row;
}

function buildCampaignIdentity(contact: AdsSalesContactRow, platform: AdsSalesPlatform) {
  const campaignId = platform === "google" ? contact.google_campaign_id : contact.meta_campaign_id;
  const fallbackName = platform === "google" ? "Google Ads senza campagna" : "Meta Ads senza campagna";
  const name =
    cleanLabel(contact.attr_campaign) ||
    cleanLabel(contact.source_campaign_id) ||
    cleanLabel(campaignId) ||
    cleanLabel(contact.source) ||
    fallbackName;
  const key = normalizeLookup(campaignId || contact.source_campaign_id || contact.attr_campaign || name);
  const terms = [
    campaignId,
    contact.source_campaign_id,
    contact.attr_campaign,
    contact.attr_content,
    contact.source,
    contact.attr_source,
    contact.meta_adset_id,
    contact.meta_ad_id,
    contact.google_ad_group_id,
    contact.google_ad_id,
    name,
  ]
    .map(normalizeLookup)
    .filter((term, index, all) => term.length >= 3 && all.indexOf(term) === index);

  return {
    key,
    name,
    sourceLabel: cleanLabel(contact.attr_source) || cleanLabel(contact.source) || platformLabel(platform),
    terms,
  };
}

function inferContactPlatform(contact: AdsSalesContactRow): AdsSalesPlatform | null {
  const source = normalizeLookup(contact.source);
  const attrSource = normalizeLookup(contact.attr_source);
  const attrMedium = normalizeLookup(contact.attr_medium);
  const hasGoogleSignals = Boolean(
    contact.google_campaign_id ||
      contact.google_ad_group_id ||
      contact.google_ad_id ||
      contact.gclid ||
      contact.wbraid ||
      contact.gbraid ||
      /google|adwords/.test(source) ||
      /google|adwords/.test(attrSource) ||
      /cpc|ppc|paid_search/.test(attrMedium),
  );
  const hasMetaSignals = Boolean(
    contact.meta_campaign_id ||
      contact.meta_adset_id ||
      contact.meta_ad_id ||
      /meta|facebook|instagram/.test(source) ||
      /meta|facebook|instagram/.test(attrSource) ||
      /paid_social/.test(attrMedium),
  );

  if (hasGoogleSignals && !hasMetaSignals) return "google";
  if (hasMetaSignals && !hasGoogleSignals) return "meta";
  if (isGoogleAttributedContact(contact) && !isMetaAttributedContact(contact)) return "google";
  if (isMetaAttributedContact(contact) && !isGoogleAttributedContact(contact)) return "meta";
  if (hasGoogleSignals) return "google";
  if (hasMetaSignals) return "meta";
  return null;
}

function inferCostPlatform(cost: AdsSalesCostRow): AdsSalesPlatform | null {
  const source = normalizeLookup(cost.source);
  const name = normalizeLookup(cost.campaign_name);
  if (/google|adwords|paid_search|cpc|ppc/.test(source) || /google ads|search|pmax|performance max/.test(name)) {
    return "google";
  }
  if (/meta|facebook|instagram|paid_social/.test(source) || /meta|facebook|instagram/.test(name)) {
    return "meta";
  }
  return null;
}

function groupByContact<T extends { contact_id?: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.contact_id) continue;
    const list = grouped.get(row.contact_id) ?? [];
    list.push(row);
    grouped.set(row.contact_id, list);
  }
  return grouped;
}

function termsOverlap(a: string[], b: string[]) {
  return a.some((left) =>
    b.some((right) => left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))),
  );
}

function providerMatches(platform: AdsSalesPlatform, provider: AdsSalesProviderFilter) {
  return provider === "all" || provider === platform;
}

function isWonStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return value === "won" || value === "closed_won" || value === "vinto";
}

function isCancelledStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return value === "cancelled" || value === "canceled" || value === "annullato";
}

function cleanLabel(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function platformLabel(platform: AdsSalesPlatform) {
  return platform === "google" ? "Google Ads" : "Meta Ads";
}

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

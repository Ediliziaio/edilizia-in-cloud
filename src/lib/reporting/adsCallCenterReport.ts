import {
  isGoogleAttributedContact,
  isMetaAttributedContact,
  type MetaAttributedContactLike,
} from "@/lib/ads/crmAttribution";

export type AdsCallCenterPlatform = "meta" | "google";
export type AdsCallCenterProviderFilter = AdsCallCenterPlatform | "all";

export interface AdsCallCenterContactRow extends MetaAttributedContactLike {
  id: string;
  created_at?: string | null;
}

export interface AdsCallCenterCallRow {
  id: string;
  contact_id?: string | null;
  outcome?: string | null;
  started_at?: string | null;
  duration_sec?: number | string | null;
}

export interface AdsCallCenterAppointmentRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
}

export interface AdsCallCenterMetrics {
  leads: number;
  calledLeads: number;
  answeredLeads: number;
  totalCalls: number;
  appointments: number;
  calledRatePct: number;
  contactRatePct: number;
  attemptsPerLead: number;
  avgSpeedToLeadMin: number;
  speedSamples: number;
  avgAnsweredDurationMin: number;
  answeredDurationSamples: number;
  appointmentRatePct: number;
}

export interface AdsCallCenterReportRow {
  id: string;
  platform: AdsCallCenterPlatform;
  campaignKey: string;
  campaignName: string;
  sourceLabel: string;
  metrics: AdsCallCenterMetrics;
}

interface BuildInput {
  contacts: AdsCallCenterContactRow[];
  calls: AdsCallCenterCallRow[];
  appointments?: AdsCallCenterAppointmentRow[];
  provider?: AdsCallCenterProviderFilter;
}

interface MutableReportRow {
  platform: AdsCallCenterPlatform;
  campaignKey: string;
  campaignName: string;
  sourceLabel: string;
  contactIds: Set<string>;
  calledContactIds: Set<string>;
  answeredContactIds: Set<string>;
  totalCalls: number;
  appointments: number;
  speedSumMin: number;
  speedSamples: number;
  answeredDurationSumMin: number;
  answeredDurationSamples: number;
}

export function buildAdsCallCenterReportRows(input: BuildInput): AdsCallCenterReportRow[] {
  const provider = input.provider ?? "all";
  const rows = new Map<string, MutableReportRow>();
  const callsByContact = groupByContact(input.calls);
  const appointmentsByContact = groupByContact(input.appointments ?? []);

  for (const contact of input.contacts) {
    const platform = inferContactPlatform(contact);
    if (!platform || !providerMatches(platform, provider)) continue;

    const identity = buildCampaignIdentity(contact, platform);
    const row = ensureRow(rows, platform, identity);
    row.contactIds.add(contact.id);

    const calls = callsByContact.get(contact.id) ?? [];
    if (calls.length > 0) row.calledContactIds.add(contact.id);
    row.totalCalls += calls.length;

    if (calls.some((call) => isAnsweredOutcome(call.outcome))) {
      row.answeredContactIds.add(contact.id);
    }

    const firstCall = firstStartedCall(calls);
    const speedMin = firstCall ? minutesBetween(contact.created_at, firstCall.started_at) : null;
    if (speedMin !== null) {
      row.speedSumMin += speedMin;
      row.speedSamples += 1;
    }

    for (const call of calls) {
      if (!isAnsweredOutcome(call.outcome)) continue;
      const durationMin = Number(call.duration_sec ?? 0) / 60;
      if (Number.isFinite(durationMin) && durationMin > 0) {
        row.answeredDurationSumMin += durationMin;
        row.answeredDurationSamples += 1;
      }
    }

    row.appointments += (appointmentsByContact.get(contact.id) ?? []).filter(
      (appointment) => !isCancelledStatus(appointment.status),
    ).length;
  }

  return Array.from(rows.values())
    .map((row) => ({
      id: `${row.platform}:${row.campaignKey}`,
      platform: row.platform,
      campaignKey: row.campaignKey,
      campaignName: row.campaignName,
      sourceLabel: row.sourceLabel,
      metrics: buildMetrics({
        leads: row.contactIds.size,
        calledLeads: row.calledContactIds.size,
        answeredLeads: row.answeredContactIds.size,
        totalCalls: row.totalCalls,
        appointments: row.appointments,
        speedSumMin: row.speedSumMin,
        speedSamples: row.speedSamples,
        answeredDurationSumMin: row.answeredDurationSumMin,
        answeredDurationSamples: row.answeredDurationSamples,
      }),
    }))
    .sort((a, b) => b.metrics.appointments - a.metrics.appointments || b.metrics.answeredLeads - a.metrics.answeredLeads);
}

export function summarizeAdsCallCenterReportRows(
  rows: AdsCallCenterReportRow[],
  provider: AdsCallCenterProviderFilter = "all",
): AdsCallCenterMetrics {
  const relevantRows = provider === "all" ? rows : rows.filter((row) => row.platform === provider);
  return buildMetrics(
    relevantRows.reduce(
      (acc, row) => ({
        leads: acc.leads + row.metrics.leads,
        calledLeads: acc.calledLeads + row.metrics.calledLeads,
        answeredLeads: acc.answeredLeads + row.metrics.answeredLeads,
        totalCalls: acc.totalCalls + row.metrics.totalCalls,
        appointments: acc.appointments + row.metrics.appointments,
        speedSumMin: acc.speedSumMin + row.metrics.avgSpeedToLeadMin * row.metrics.speedSamples,
        speedSamples: acc.speedSamples + row.metrics.speedSamples,
        answeredDurationSumMin:
          acc.answeredDurationSumMin + row.metrics.avgAnsweredDurationMin * row.metrics.answeredDurationSamples,
        answeredDurationSamples: acc.answeredDurationSamples + row.metrics.answeredDurationSamples,
      }),
      {
        leads: 0,
        calledLeads: 0,
        answeredLeads: 0,
        totalCalls: 0,
        appointments: 0,
        speedSumMin: 0,
        speedSamples: 0,
        answeredDurationSumMin: 0,
        answeredDurationSamples: 0,
      },
    ),
  );
}

function buildMetrics(input: {
  leads: number;
  calledLeads: number;
  answeredLeads: number;
  totalCalls: number;
  appointments: number;
  speedSumMin: number;
  speedSamples: number;
  answeredDurationSumMin: number;
  answeredDurationSamples: number;
}): AdsCallCenterMetrics {
  return {
    leads: input.leads,
    calledLeads: input.calledLeads,
    answeredLeads: input.answeredLeads,
    totalCalls: input.totalCalls,
    appointments: input.appointments,
    calledRatePct: pct(input.calledLeads, input.leads),
    contactRatePct: pct(input.answeredLeads, input.leads),
    attemptsPerLead: round(input.leads > 0 ? input.totalCalls / input.leads : 0, 2),
    avgSpeedToLeadMin: round(input.speedSamples > 0 ? input.speedSumMin / input.speedSamples : 0, 1),
    speedSamples: input.speedSamples,
    avgAnsweredDurationMin: round(
      input.answeredDurationSamples > 0 ? input.answeredDurationSumMin / input.answeredDurationSamples : 0,
      1,
    ),
    answeredDurationSamples: input.answeredDurationSamples,
    appointmentRatePct: pct(input.appointments, input.leads),
  };
}

function inferContactPlatform(contact: AdsCallCenterContactRow): AdsCallCenterPlatform | null {
  const google = isGoogleAttributedContact(contact);
  const meta = isMetaAttributedContact(contact);
  if (google && !meta) return "google";
  if (meta && !google) return "meta";
  if (google) return "google";
  if (meta) return "meta";
  return null;
}

function buildCampaignIdentity(contact: AdsCallCenterContactRow, platform: AdsCallCenterPlatform) {
  const campaignId = platform === "google" ? contact.google_campaign_id : contact.meta_campaign_id;
  const fallbackName = platform === "google" ? "Google Ads senza campagna" : "Meta Ads senza campagna";
  const name =
    cleanLabel(contact.attr_campaign) ||
    cleanLabel(contact.source_campaign_id) ||
    cleanLabel(campaignId) ||
    cleanLabel(contact.source) ||
    fallbackName;

  return {
    key: normalizeLookup(campaignId || contact.source_campaign_id || contact.attr_campaign || name),
    name,
    sourceLabel: cleanLabel(contact.attr_source) || cleanLabel(contact.source) || platformLabel(platform),
  };
}

function ensureRow(
  rows: Map<string, MutableReportRow>,
  platform: AdsCallCenterPlatform,
  identity: { key: string; name: string; sourceLabel: string },
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
    contactIds: new Set(),
    calledContactIds: new Set(),
    answeredContactIds: new Set(),
    totalCalls: 0,
    appointments: 0,
    speedSumMin: 0,
    speedSamples: 0,
    answeredDurationSumMin: 0,
    answeredDurationSamples: 0,
  };
  rows.set(mapKey, row);
  return row;
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

function firstStartedCall(calls: AdsCallCenterCallRow[]) {
  return calls
    .filter((call) => Boolean(call.started_at))
    .sort((a, b) => new Date(a.started_at!).getTime() - new Date(b.started_at!).getTime())[0];
}

function minutesBetween(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return round((toMs - fromMs) / 60_000, 1);
}

function isAnsweredOutcome(outcome: string | null | undefined) {
  const value = normalizeLookup(outcome);
  return ["answered", "connected", "completed", "success", "contacted", "risposto", "contattato"].includes(value);
}

function isCancelledStatus(status: string | null | undefined) {
  const value = normalizeLookup(status);
  return ["cancelled", "canceled", "annullato", "no_show"].includes(value);
}

function providerMatches(platform: AdsCallCenterPlatform, provider: AdsCallCenterProviderFilter) {
  return provider === "all" || provider === platform;
}

function cleanLabel(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function platformLabel(platform: AdsCallCenterPlatform) {
  return platform === "google" ? "Google Ads" : "Meta Ads";
}

function normalizeLookup(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function pct(value: number, total: number) {
  return round(total > 0 ? (value / total) * 100 : 0, 1);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

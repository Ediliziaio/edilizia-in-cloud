import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  buildAdsAttributionMetrics,
  buildOptimizationRecommendations,
  isAdsAttributedContact,
  type AdsAttributionProvider,
  type AdsAttributionMetrics,
  type AdsOptimizationRecommendation,
} from "@/lib/ads/crmAttribution";
import { useMetaInsights } from "@/hooks/useMetaInsights";
import { useGoogleAdsStats } from "@/hooks/useGoogleAdsStats";

export interface AdsCrmAttributionCampaign {
  id: string;
  name: string;
  platform?: AdsAttributionProvider;
  metaCampaignId?: string | null;
  googleCampaignId?: string | null;
  spentCents?: number | null;
  targetCplCents?: number | null;
  createdAt?: string | null;
  builderState?: {
    name?: string;
    landingUrl?: string;
    targetCpl?: number;
  } | null;
}

export interface AdsCrmAttributionResult {
  metrics: AdsAttributionMetrics;
  recommendations: AdsOptimizationRecommendation[];
  contacts: CrmContactRow[];
  opportunities: CrmOpportunityRow[];
  appointments: CrmAppointmentRow[];
  source: "meta_insights" | "google_ads_stats" | "campaign_costs" | "campaign_snapshot" | "none";
  attributionActive: boolean;
  qualityWarnings: string[];
  isLoading: boolean;
}

interface CrmContactRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
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

interface CrmOpportunityRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
  value?: number | string | null;
  source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface CrmAppointmentRow {
  id: string;
  contact_id?: string | null;
  status?: string | null;
  is_completed?: boolean | null;
  appointment_date?: string | null;
  created_at?: string | null;
}

interface CampaignCostRow {
  spend_amount?: number | string | null;
  source?: string | null;
  campaign_name?: string | null;
  date?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (name: string) => (supabase as any).from(name);

export function useAdsCrmAttribution(opts: {
  companyId: string | undefined;
  campaign: AdsCrmAttributionCampaign;
  daysBack?: number;
}): AdsCrmAttributionResult {
  const { companyId, campaign, daysBack = 180 } = opts;
  const platform: AdsAttributionProvider =
    campaign.platform === "google" || campaign.googleCampaignId ? "google" : "meta";
  const metaCampaignId = campaign.metaCampaignId ?? undefined;
  const googleCampaignId = campaign.googleCampaignId ?? undefined;
  const targetCplCents = campaign.targetCplCents ?? (campaign.builderState?.targetCpl ?? 0) * 100;
  const campaignTerms = useMemo(() => buildCampaignTerms(campaign), [campaign]);

  const { summary, isLoading: insightsLoading } = useMetaInsights({
    companyId: platform === "meta" ? companyId : undefined,
    campaignId: metaCampaignId || campaign.id,
    daysBack: Math.min(daysBack, 90),
  });
  const googleStats = useGoogleAdsStats();

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString();
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["ads-crm-attribution", companyId, campaign.id, platform, metaCampaignId, googleCampaignId, daysBack],
    queryFn: async () => {
      if (!companyId) {
        return {
          contacts: [] as CrmContactRow[],
          opportunities: [] as CrmOpportunityRow[],
          appointments: [] as CrmAppointmentRow[],
          campaignCosts: [] as CampaignCostRow[],
        };
      }

      const contacts = await fetchContacts(companyId, fromDate, campaignTerms, platform);
      const contactIds = contacts.map((contact) => contact.id).filter(Boolean);
      const [opportunities, appointments, campaignCosts] = await Promise.all([
        fetchOpportunities(companyId, contactIds),
        fetchAppointments(companyId, contactIds),
        fetchCampaignCosts(companyId, fromDate, campaignTerms),
      ]);

      return { contacts, opportunities, appointments, campaignCosts };
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const contacts = query.data?.contacts ?? [];
  const opportunities = query.data?.opportunities ?? [];
  const appointments = query.data?.appointments ?? [];
  const won = opportunities.filter((opportunity) => isWonStatus(opportunity.status)).length;
  const revenueCents = opportunities
    .filter((opportunity) => isWonStatus(opportunity.status))
    .reduce((sum, opportunity) => sum + Math.round(Number(opportunity.value ?? 0) * 100), 0);
  const costSpendCents = (query.data?.campaignCosts ?? []).reduce(
    (sum, row) => sum + Math.round(Number(row.spend_amount ?? 0) * 100),
    0,
  );
  const insightSpendCents = summary.total_spend_cents;
  const googleSpendCents =
    platform === "google"
      ? Math.round(
          (googleStats.campaigns.find((row) => {
            const id = normalize(row.campaign_id);
            const name = normalize(row.campaign_name);
            return campaignTerms.some((term) => id.includes(term) || name.includes(term));
          })?.spend ?? 0) * 100,
        )
      : 0;
  const snapshotSpendCents = Math.max(0, Math.round(Number(campaign.spentCents ?? 0)));
  const spendSource =
    platform === "google" && googleSpendCents > 0
      ? "google_ads_stats"
      : insightSpendCents > 0
      ? "meta_insights"
      : costSpendCents > 0
        ? "campaign_costs"
        : snapshotSpendCents > 0
          ? "campaign_snapshot"
          : "none";
  const spendCents = googleSpendCents || insightSpendCents || costSpendCents || snapshotSpendCents;
  const metrics = buildAdsAttributionMetrics({
    spendCents,
    leads: contacts.length,
    opportunities: opportunities.length,
    appointments: appointments.filter((appointment) => !isCancelledStatus(appointment.status)).length,
    won,
    revenueCents,
  });
  const hoursSinceLaunch = campaign.createdAt
    ? Math.max(0, (Date.now() - new Date(campaign.createdAt).getTime()) / 36e5)
    : undefined;
  const recommendations = buildOptimizationRecommendations({ metrics, targetCplCents, hoursSinceLaunch });
  const attributionActive = contacts.some((contact) => isAdsAttributedContact(contact, platform));
  const qualityWarnings = buildQualityWarnings({
    campaign,
    contacts,
    spendSource,
    spendCents,
    platform,
    metaCampaignId,
    googleCampaignId,
  });

  return {
    metrics,
    recommendations,
    contacts,
    opportunities,
    appointments,
    source: spendSource,
    attributionActive,
    qualityWarnings,
    isLoading: query.isLoading || insightsLoading || (platform === "google" && googleStats.isLoading),
  };
}

async function fetchContacts(
  companyId: string,
  fromDate: string,
  campaignTerms: string[],
  platform: AdsAttributionProvider,
) {
  try {
    const { data, error } = await fromTable("marketing_contacts")
      .select(
        "id, first_name, last_name, email, phone, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, meta_campaign_id, meta_adset_id, meta_ad_id, google_campaign_id, google_ad_group_id, google_ad_id, gclid, wbraid, gbraid, created_at",
      )
      .eq("company_id", companyId)
      .gte("created_at", fromDate)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return ((data ?? []) as CrmContactRow[]).filter((contact) => matchesCampaign(contact, campaignTerms, platform));
  } catch {
    try {
      const { data, error } = await fromTable("marketing_contacts")
        .select(
          "id, first_name, last_name, email, phone, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, created_at",
        )
        .eq("company_id", companyId)
        .gte("created_at", fromDate)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      return ((data ?? []) as CrmContactRow[]).filter((contact) => matchesCampaign(contact, campaignTerms, platform));
    } catch {
      return [];
    }
  }
}

async function fetchOpportunities(companyId: string, contactIds: string[]) {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await fromTable("marketing_opportunities")
      .select("id, contact_id, status, value, source, created_at, updated_at")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(1000);

    if (error) throw error;
    return (data ?? []) as CrmOpportunityRow[];
  } catch {
    return [];
  }
}

async function fetchAppointments(companyId: string, contactIds: string[]) {
  if (contactIds.length === 0) return [];
  try {
    const { data, error } = await fromTable("appointments")
      .select("id, contact_id, status, is_completed, appointment_date, created_at")
      .eq("company_id", companyId)
      .in("contact_id", contactIds)
      .limit(1000);

    if (error) throw error;
    return (data ?? []) as CrmAppointmentRow[];
  } catch {
    return [];
  }
}

async function fetchCampaignCosts(companyId: string, fromDate: string, campaignTerms: string[]) {
  try {
    const fromDay = fromDate.split("T")[0];
    const { data, error } = await fromTable("campaign_costs")
      .select("spend_amount, source, campaign_name, date")
      .eq("company_id", companyId)
      .gte("date", fromDay)
      .limit(500);

    if (error) throw error;
    return ((data ?? []) as CampaignCostRow[]).filter((row) => {
      const values = [row.campaign_name, row.source].map(normalize);
      return campaignTerms.some((term) => values.some((value) => value.length >= 3 && value.includes(term)));
    });
  } catch {
    return [];
  }
}

function buildCampaignTerms(campaign: AdsCrmAttributionCampaign) {
  return [campaign.metaCampaignId, campaign.googleCampaignId, campaign.name, campaign.builderState?.name]
    .map(normalize)
    .filter((term, index, terms) => term.length >= 3 && terms.indexOf(term) === index);
}

function matchesCampaign(contact: CrmContactRow, campaignTerms: string[], platform: AdsAttributionProvider) {
  if (!isAdsAttributedContact(contact, platform)) return false;
  if (campaignTerms.length === 0) return true;
  const values = [
    contact.source_campaign_id,
    contact.attr_campaign,
    contact.attr_content,
    contact.source,
    contact.meta_campaign_id,
    contact.meta_adset_id,
    contact.meta_ad_id,
    contact.google_campaign_id,
    contact.google_ad_group_id,
    contact.google_ad_id,
  ].map(normalize);
  return campaignTerms.some((term) => values.some((value) => value.length >= 3 && value.includes(term)));
}

function isWonStatus(status: string | null | undefined) {
  const value = normalize(status);
  return value === "won" || value === "closed_won" || value === "vinto";
}

function isCancelledStatus(status: string | null | undefined) {
  const value = normalize(status);
  return value === "cancelled" || value === "canceled" || value === "annullato";
}

function buildQualityWarnings(input: {
  campaign: AdsCrmAttributionCampaign;
  contacts: CrmContactRow[];
  spendSource: AdsCrmAttributionResult["source"];
  spendCents: number;
  platform: AdsAttributionProvider;
  metaCampaignId?: string;
  googleCampaignId?: string;
}) {
  const warnings: string[] = [];
  if (input.platform === "meta" && !input.metaCampaignId) {
    warnings.push("Nessun ID campagna Meta ancora collegato: il match usa nome campagna e UTM.");
  }
  if (input.platform === "google" && !input.googleCampaignId) {
    warnings.push("Nessun ID campagna Google ancora collegato: il match usa nome campagna, UTM e GCLID quando presenti.");
  }
  if (input.contacts.length === 0) {
    warnings.push("Nessun lead CRM attribuito a questa campagna nel periodo.");
  }
  if (input.spendCents === 0 || input.spendSource === "none") {
    warnings.push(
      input.platform === "google"
        ? "Spesa non trovata: sincronizza Google Ads stats o registra il costo campagna."
        : "Spesa non trovata: sincronizza Meta Insights o registra il costo campagna.",
    );
  }
  return warnings;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

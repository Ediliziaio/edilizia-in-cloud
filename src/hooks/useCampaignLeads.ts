/**
 * useCampaignLeads — recupera i lead Meta arrivati per una specifica campagna.
 *
 * Source: webhook_events processati da meta-process-leads → `marketing_contacts`.
 * Il CRM resta la fonte primaria: Pubblicità legge contatti già attribuiti
 * tramite source_campaign_id / attr_* / meta_*.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isAdsAttributedContact, type AdsAttributionProvider } from "@/lib/ads/crmAttribution";

export interface CampaignLead {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  status: string | null;
  created_at: string;
  /** Meta lead form ID dal payload */
  meta_lead_id?: string;
  /** Campo "tipo intervento" o qualificazione */
  qualification?: string;
}

interface MarketingContactLeadRow {
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
  notes?: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (n: string) => (supabase as any).from(n);

export function useCampaignLeads(opts: {
  companyId: string | undefined;
  /** Meta campaign_id (testo Meta, non UUID locale) */
  metaCampaignId?: string | null;
  googleCampaignId?: string | null;
  platform?: AdsAttributionProvider;
  daysBack?: number;
}) {
  const { companyId, metaCampaignId, googleCampaignId, daysBack = 90 } = opts;
  const platform: AdsAttributionProvider = opts.platform === "google" || googleCampaignId ? "google" : "meta";

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString();
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["campaign-leads", companyId, platform, metaCampaignId, googleCampaignId, daysBack],
    queryFn: async (): Promise<CampaignLead[]> => {
      if (!companyId) return [];
      try {
        const { data, error } = await fromTable("marketing_contacts")
          .select("id, first_name, last_name, email, phone, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, meta_campaign_id, meta_adset_id, meta_ad_id, google_campaign_id, google_ad_group_id, google_ad_id, gclid, wbraid, gbraid, notes, created_at")
          .eq("company_id", companyId)
          .gte("created_at", fromDate)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist")) return [];
          throw error;
        }
        return mapLeadRows(data ?? [], platform, metaCampaignId, googleCampaignId);
      } catch {
        try {
          const { data, error } = await fromTable("marketing_contacts")
            .select("id, first_name, last_name, email, phone, source, source_campaign_id, attr_source, attr_medium, attr_campaign, attr_content, notes, created_at")
            .eq("company_id", companyId)
            .gte("created_at", fromDate)
            .order("created_at", { ascending: false })
            .limit(100);
          if (error) throw error;
          return mapLeadRows(data ?? [], platform, metaCampaignId, googleCampaignId);
        } catch {
          return [];
        }
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  return {
    leads: query.data ?? [],
    isLoading: query.isLoading,
    count: query.data?.length ?? 0,
  };
}

function mapLeadRows(
  rows: unknown[],
  platform: AdsAttributionProvider,
  metaCampaignId?: string | null,
  googleCampaignId?: string | null,
): CampaignLead[] {
  return (rows as MarketingContactLeadRow[])
    .filter((row) => isLeadForCampaign(row, platform, metaCampaignId, googleCampaignId))
    .map((row) => ({
      id: row.id,
      full_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || (platform === "google" ? "Lead Google" : "Lead Meta"),
      email: row.email ?? null,
      phone: row.phone ?? null,
      city: null,
      status: row.source ?? null,
      created_at: row.created_at,
      meta_lead_id: row.source_campaign_id ?? row.google_campaign_id ?? undefined,
      qualification: row.attr_content ?? row.attr_campaign ?? undefined,
    }));
}

function isLeadForCampaign(
  row: MarketingContactLeadRow,
  platform: AdsAttributionProvider,
  metaCampaignId?: string | null,
  googleCampaignId?: string | null,
) {
  const values = [
    row.source,
    row.source_campaign_id,
    row.attr_source,
    row.attr_medium,
    row.attr_campaign,
    row.attr_content,
    row.meta_campaign_id,
    row.meta_adset_id,
    row.meta_ad_id,
    row.google_campaign_id,
    row.google_ad_group_id,
    row.google_ad_id,
    row.gclid,
    row.wbraid,
    row.gbraid,
    row.notes,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  if (!isAdsAttributedContact(row, platform)) return false;
  const campaignId = platform === "google" ? googleCampaignId : metaCampaignId;
  if (!campaignId) return true;
  return values.includes(campaignId.toLowerCase());
}

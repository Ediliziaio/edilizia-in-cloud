import type { MetaCampaignRow, MetaCampaignStatus } from "@/types/metaAds";

export type AdsCampaignStatus = Exclude<MetaCampaignStatus, "archived">;

export type AdsMetaCampaign = MetaCampaignRow;

export interface AdsLocalCampaignDraft {
  id: string;
  name: string;
  objective: string;
  status: AdsCampaignStatus;
  budgetCents: number;
  zone: string;
  adSets: number;
  ads: number;
  targetCplCents: number;
  createdAt: string;
  updatedAt?: string;
  copyVariants: string[];
  imagePrompt: string;
  builderState?: Record<string, unknown>;
  adAccountId?: string | null;
  integrationId?: string | null;
  metaCampaignId?: string | null;
  publishError?: string | null;
}

export interface AdsCampaignRow {
  id: string;
  name: string;
  objective: string;
  status: AdsCampaignStatus;
  budgetCents: number;
  spentCents: number;
  leads: number;
  opportunities: number;
  jobs: number;
  adSets: number;
  ads: number;
  targetCplCents: number;
  source: "local";
  draftRef: AdsLocalCampaignDraft;
  metaCampaignId?: string | null;
  publishError?: string | null;
}

export interface AdsAssetRef {
  id: string;
  asset_id?: string | null;
}

export interface BuildMetaPublishRequestInput {
  companyId: string;
  draft: AdsLocalCampaignDraft;
  adAccountAsset?: AdsAssetRef | null;
  dryRun?: boolean;
}

export interface MetaPublishRequest {
  company_id: string;
  ad_account_id: string;
  builder_state: Record<string, unknown>;
  dry_run: boolean;
  draft_id: string;
}

export function metaCampaignToDraft(campaign: AdsMetaCampaign): AdsLocalCampaignDraft {
  const builderState = (campaign.builder_state ?? {}) as Record<string, unknown>;
  const adSets = Array.isArray(builderState.adSets) ? builderState.adSets.length : 0;
  const creatives = Array.isArray(builderState.creatives) ? builderState.creatives.length : 0;

  return {
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status === "archived" ? "draft" : campaign.status,
    budgetCents: campaign.daily_budget_cents ?? 0,
    zone: typeof builderState.zone === "string" ? builderState.zone : "-",
    adSets: adSets || 1,
    ads: Math.max(1, adSets * Math.max(1, creatives)),
    targetCplCents: typeof builderState.targetCpl === "number" ? builderState.targetCpl * 100 : 2500,
    createdAt: campaign.created_at,
    updatedAt: campaign.updated_at,
    copyVariants: Array.isArray(builderState.copyVariants)
      ? (builderState.copyVariants as string[])
      : [],
    imagePrompt: typeof builderState.imagePrompt === "string" ? builderState.imagePrompt : "",
    builderState,
    adAccountId: campaign.ad_account_id,
    integrationId: campaign.integration_id,
    metaCampaignId: campaign.meta_campaign_id,
    publishError: campaign.publish_error,
  };
}

export function draftToCampaignRow(draft: AdsLocalCampaignDraft): AdsCampaignRow {
  return {
    id: draft.id,
    name: draft.name,
    objective: draft.objective,
    status: draft.status,
    budgetCents: draft.budgetCents,
    spentCents: 0,
    leads: 0,
    opportunities: 0,
    jobs: 0,
    adSets: draft.adSets ?? 1,
    ads: draft.ads ?? Math.max(1, draft.copyVariants.length),
    targetCplCents: draft.targetCplCents ?? 0,
    source: "local",
    draftRef: draft,
    metaCampaignId: draft.metaCampaignId,
    publishError: draft.publishError,
  };
}

export function buildMetaPublishRequest(
  input: BuildMetaPublishRequestInput,
): MetaPublishRequest {
  const builderState = input.draft.builderState;
  if (!builderState) {
    throw new Error("missing_builder_state");
  }

  const adAccountId =
    input.adAccountAsset?.asset_id ??
    input.draft.adAccountId ??
    input.adAccountAsset?.id;

  if (!adAccountId) {
    throw new Error("missing_ad_account");
  }

  return {
    company_id: input.companyId,
    ad_account_id: adAccountId,
    builder_state: builderState,
    dry_run: input.dryRun ?? true,
    draft_id: input.draft.id,
  };
}

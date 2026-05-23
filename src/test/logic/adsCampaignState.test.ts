import { describe, expect, it } from "vitest";

import {
  buildMetaPublishRequest,
  draftToCampaignRow,
  metaCampaignToDraft,
  type AdsMetaCampaign,
} from "@/lib/ads/campaignState";

const baseCampaign: AdsMetaCampaign = {
  id: "campaign-1",
  company_id: "company-1",
  integration_id: "integration-1",
  ad_account_id: "ad-account-1",
  meta_campaign_id: "238500000",
  name: "Serramenti - Lead qualificati",
  objective: "OUTCOME_LEADS",
  status: "review",
  buying_type: "AUCTION",
  budget_mode: "adset",
  daily_budget_cents: 2500,
  lifetime_budget_cents: null,
  special_ad_categories: [],
  special_ad_category_country: null,
  start_time: null,
  stop_time: null,
  builder_state: {
    zone: "Monza",
    targetCpl: 25,
    copyVariants: ["Copy A"],
    imagePrompt: "Immagine cantiere serramenti",
    adSets: [{ id: "a1" }, { id: "a2" }],
    creatives: [{ id: "c1" }, { id: "c2" }],
  },
  raw: null,
  last_published_at: null,
  last_synced_at: null,
  publish_error: "Serve approvazione titolare",
  created_at: "2026-05-22T10:00:00.000Z",
  updated_at: "2026-05-22T11:00:00.000Z",
  created_by: "user-1",
};

describe("ads campaign state mapping", () => {
  it("preserves DB status and publish metadata when converting to a UI draft", () => {
    const draft = metaCampaignToDraft(baseCampaign);

    expect(draft.status).toBe("review");
    expect(draft.metaCampaignId).toBe("238500000");
    expect(draft.publishError).toBe("Serve approvazione titolare");
    expect(draft.adAccountId).toBe("ad-account-1");
    expect(draft.adSets).toBe(2);
    expect(draft.ads).toBe(4);
  });

  it("uses the draft status in campaign rows instead of forcing every row to draft", () => {
    const draft = metaCampaignToDraft({
      ...baseCampaign,
      status: "error",
      publish_error: "Meta rejected the creative",
    });

    const row = draftToCampaignRow(draft);

    expect(row.status).toBe("error");
    expect(row.publishError).toBe("Meta rejected the creative");
    expect(row.source).toBe("local");
  });

  it("builds publish requests from existing draft ids and Meta asset ids", () => {
    const draft = metaCampaignToDraft(baseCampaign);

    const request = buildMetaPublishRequest({
      companyId: "company-1",
      draft,
      adAccountAsset: {
        id: "local-meta-asset-row",
        asset_id: "act_123456789",
      },
      dryRun: false,
    });

    expect(request.draft_id).toBe("campaign-1");
    expect(request.ad_account_id).toBe("act_123456789");
    expect(request.builder_state).toBe(draft.builderState);
    expect(request.dry_run).toBe(false);
  });
});

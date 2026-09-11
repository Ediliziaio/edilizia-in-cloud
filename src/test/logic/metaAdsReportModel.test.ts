import { describe, expect, it } from "vitest";
import {
  buildCrmIndex,
  buildLevelRows,
  computeReportKpis,
  filtraPerPercorso,
  type AccountReport,
} from "@/lib/metaAdsReportModel";

// Forma reale di get-ads-report (account Best Infissi, settembre 2026), ridotta.
const riga = (o: Record<string, unknown>) => ({
  objective: "OUTCOME_LEADS",
  impressions: "1000",
  reach: "400",
  frequency: "2.5",
  clicks: "60",
  spend: "100",
  ctr: "6",
  cpm: "100",
  actions: [
    { action_type: "link_click", value: "20" },
    { action_type: "lead", value: "5" },
    { action_type: "onsite_conversion.lead_grouped", value: "5" },
  ],
  ...o,
});

const report: AccountReport = {
  accountId: "act_1",
  accountName: "Best Infissi",
  payload: {
    campaigns_insights: [riga({ campaign_id: "C1", campaign_name: "TOFU Bologna", reach: "700", impressions: "2000", spend: "200" })],
    adsets_insights: [riga({ campaign_id: "C1", campaign_name: "TOFU Bologna", adset_id: "S1", adset_name: "Broad", impressions: "2000", spend: "200" })],
    ads_insights: [
      riga({ campaign_id: "C1", campaign_name: "TOFU Bologna", adset_id: "S1", adset_name: "Broad", ad_id: "A1", ad_name: "ad1", quality_ranking: "ABOVE_AVERAGE" }),
      riga({ campaign_id: "C1", campaign_name: "TOFU Bologna", adset_id: "S1", adset_name: "Broad", ad_id: "A2", ad_name: "ad2" }),
    ],
    account: riga({ reach: "700", impressions: "2000", spend: "200", actions: [{ action_type: "link_click", value: "40" }, { action_type: "lead", value: "10" }] }),
    account_prev: riga({ spend: "100", actions: [{ action_type: "lead", value: "4" }] }),
    daily: [],
    campaigns: [
      { id: "C1", name: "TOFU Bologna", effective_status: "ACTIVE", objective: "OUTCOME_LEADS", daily_budget: "2500" },
      { id: "C2", name: "Retargeting", effective_status: "ACTIVE" },
      { id: "C3", name: "Vecchia", effective_status: "PAUSED" },
    ],
    adsets: [{ id: "S1", name: "Broad", campaign_id: "C1", effective_status: "ACTIVE" }],
    ads: [
      { id: "A1", name: "ad1", adset_id: "S1", campaign_id: "C1", effective_status: "ACTIVE", creative: { thumbnail_url: "https://x/t.jpg", title: "Infissi -50%" } },
      { id: "A2", name: "ad2", adset_id: "S1", campaign_id: "C1", effective_status: "ADSET_PAUSED", creative: {} },
    ],
  },
};

const crm = buildCrmIndex(
  [
    { id: "k1", meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A1" },
    { id: "k2", meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A1" },
    { id: "k3", meta_campaign_id: "C1", meta_adset_id: "S1", meta_ad_id: "A2" },
  ],
  [
    { contact_id: "k1", status: "won", value: 8000 },
    { contact_id: "k2", status: "open", value: 5000 },
    { contact_id: "k3", status: "lost", value: 3000 },
  ],
);

describe("report Meta per livello", () => {
  it("campagne: stato reale, budget in euro, attive senza consegna comprese, spente senza dati escluse", () => {
    const rows = buildLevelRows([report], "campaign", crm);
    expect(rows.map((r) => r.id).sort()).toEqual(["C1", "C2"]);
    const c1 = rows.find((r) => r.id === "C1")!;
    expect(c1.status).toBe("ACTIVE");
    expect(c1.budget_daily).toBe(25);
    expect(c1.reach).toBe(700); // dal livello campagna, non sommato dalle inserzioni
    expect(c1.figli).toBe(1);
    expect(c1.lead_crm).toBe(3);
    expect(c1.vinte).toBe(1);
    expect(c1.valore_vinto).toBe(8000);
    expect(c1.costo_vinta).toBe(200);
  });

  it("gruppi: budget ereditato dalla campagna (CBO) segnalato come tale", () => {
    const [s1] = buildLevelRows([report], "adset", crm);
    expect(s1.name).toBe("Broad");
    expect(s1.budget_da_campagna).toBe(true);
    expect(s1.figli).toBe(2);
  });

  it("inserzioni: stato proprio (non della campagna), creatività, qualità, CTR sul clic al link", () => {
    const rows = buildLevelRows([report], "ad", crm);
    const a1 = rows.find((r) => r.id === "A1")!;
    const a2 = rows.find((r) => r.id === "A2")!;
    expect(a2.status).toBe("ADSET_PAUSED");
    expect(a1.thumbnail_url).toBe("https://x/t.jpg");
    expect(a1.creative_title).toBe("Infissi -50%");
    expect(a1.quality_ranking).toBe("ABOVE_AVERAGE");
    expect(a1.link_clicks).toBe(20);
    expect(a1.ctr).toBeCloseTo(2); // 20 clic sul link / 1000 impressioni
    expect(a1.lead_crm).toBe(2);
    expect(a2.perse).toBe(1);
  });

  it("il percorso filtra gruppi e inserzioni", () => {
    const ads = buildLevelRows([report], "ad", crm);
    expect(filtraPerPercorso(ads, "ad", { adsetId: "S1" })).toHaveLength(2);
    expect(filtraPerPercorso(ads, "ad", { adsetId: "ALTRO" })).toHaveLength(0);
    expect(filtraPerPercorso(ads, "ad", { campaignId: "C1" })).toHaveLength(2);
  });

  it("KPI: totali dell'account con confronto; con una campagna scelta, i numeri di quella", () => {
    const { attuale, precedente } = computeReportKpis([report], crm, {});
    expect(attuale.spend).toBe(200);
    expect(attuale.leads).toBe(10);
    expect(attuale.cpl).toBe(20);
    expect(attuale.lead_crm).toBe(3);
    expect(precedente?.leads).toBe(4);

    const campagna = computeReportKpis([report], crm, { campaignId: "C1" });
    expect(campagna.attuale.reach).toBe(700);
    expect(campagna.precedente).toBeNull();
  });
});

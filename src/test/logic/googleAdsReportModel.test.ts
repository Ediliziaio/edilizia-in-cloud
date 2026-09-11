import { describe, expect, it } from "vitest";
import { buildCrmIndex } from "@/lib/metaAdsReportModel";
import {
  buildGoogleRows,
  computeGoogleKpis,
  filtraGooglePercorso,
  type GoogleReportPayload,
} from "@/lib/googleAdsReportModel";

const m = (spend: number, clicks: number, conv: number) => ({ impressions: clicks * 20, clicks, spend, conversions: conv, conversion_value: 0 });

const payload: GoogleReportPayload = {
  campaigns: [
    { id: "10", name: "Infissi Bologna", status: "ENABLED", primary_status: "LIMITED", campaign_id: "10", campaign_name: "Infissi Bologna", budget_daily: 30, search_is: 0.4, lost_budget_is: 0.35, lost_rank_is: 0.25, ...m(300, 150, 10) },
  ],
  ad_groups: [
    { id: "100", name: "Finestre PVC", status: "ENABLED", campaign_id: "10", campaign_name: "Infissi Bologna", ad_group_id: "100", search_is: 0.5, ...m(200, 100, 8) },
    { id: "101", name: "Porte blindate", status: "PAUSED", campaign_id: "10", campaign_name: "Infissi Bologna", ad_group_id: "101", ...m(100, 50, 2) },
  ],
  ads: [
    { id: "1000", name: null, status: "ENABLED", campaign_id: "10", campaign_name: "Infissi Bologna", ad_group_id: "100", ad_group_name: "Finestre PVC", headlines: ["Finestre in PVC", "Preventivo gratis"], ad_strength: "GOOD", ...m(200, 100, 8) },
  ],
  keywords: [
    { id: "100~1", name: "finestre pvc bologna", status: "ENABLED", match_type: "PHRASE", quality_score: 7, campaign_id: "10", ad_group_id: "100", ...m(150, 70, 6) },
  ],
  search_terms: [
    { id: "100~finestre usate", name: "finestre usate", status: "NONE", campaign_id: "10", ad_group_id: "100", ...m(40, 20, 0) },
  ],
  active_campaigns: [
    { id: "10", name: "Infissi Bologna", status: "ENABLED" },
    { id: "11", name: "Brand", status: "ENABLED", budget_daily: 5 },
  ],
  active_ad_groups: [{ id: "100", name: "Finestre PVC", status: "ENABLED", campaign_id: "10", campaign_name: "Infissi Bologna" }],
  account: m(300, 150, 10),
  account_prev: m(250, 100, 5),
  daily: [],
};

const crm = buildCrmIndex(
  [
    { id: "c1", meta_campaign_id: "10", meta_adset_id: "100", meta_ad_id: "1000" },
    { id: "c2", meta_campaign_id: "10", meta_adset_id: "100", meta_ad_id: "1000" },
  ],
  [{ contact_id: "c1", status: "won", value: 12000 }],
);

describe("report Google Ads per livello", () => {
  it("campagne: attive senza spesa comprese, quote e figli", () => {
    const rows = buildGoogleRows(payload, "campaign", crm);
    expect(rows.map((r) => r.id)).toEqual(["10", "11"]);
    const c = rows[0];
    expect(c.cpc).toBe(2);
    expect(c.cpa).toBe(30);
    expect(c.figli).toBe(2);
    expect(c.lead_crm).toBe(2);
    expect(c.vinte).toBe(1);
    expect(c.costo_vinta).toBe(300);
    expect(rows[1].spend).toBe(0);
  });

  it("annunci: CRM agganciato all'annuncio; parole chiave e termini senza CRM", () => {
    const [ad] = buildGoogleRows(payload, "ad", crm);
    expect(ad.lead_crm).toBe(2);
    expect(ad.headlines?.[0]).toBe("Finestre in PVC");
    const [kw] = buildGoogleRows(payload, "keyword", crm);
    expect(kw.lead_crm).toBeNull();
    const [st] = buildGoogleRows(payload, "search_term", crm);
    expect(st.status).toBe("NONE");
    expect(st.cpa).toBe(0);
  });

  it("percorso: gruppi della campagna, annunci del gruppo", () => {
    const gruppi = buildGoogleRows(payload, "ad_group", crm);
    expect(filtraGooglePercorso(gruppi, "ad_group", { campaignId: "10" })).toHaveLength(2);
    expect(filtraGooglePercorso(gruppi, "ad_group", { campaignId: "99" })).toHaveLength(0);
    const kw = buildGoogleRows(payload, "keyword", crm);
    expect(filtraGooglePercorso(kw, "keyword", { campaignId: "10", adGroupId: "101" })).toHaveLength(0);
  });

  it("KPI: account con confronto e quote pesate; con un gruppo scelto, i suoi numeri", () => {
    const { attuale, precedente } = computeGoogleKpis(payload, crm, {});
    expect(attuale.spend).toBe(300);
    expect(attuale.lost_budget_is).toBeCloseTo(0.35);
    expect(attuale.vinte).toBe(1);
    expect(precedente?.conversions).toBe(5);
    const gruppo = computeGoogleKpis(payload, crm, { campaignId: "10", adGroupId: "100" });
    expect(gruppo.attuale.spend).toBe(200);
    expect(gruppo.attuale.lead_crm).toBe(2);
    expect(gruppo.precedente).toBeNull();
  });
});

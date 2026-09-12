import { describe, expect, it } from "vitest";
import { buildMetaPublishRequest, metaCampaignToDraft } from "@/lib/ads/campaignState";
import type { AdsLocalCampaignDraft, AdsMetaCampaign } from "@/lib/ads/campaignState";

/**
 * La pubblicazione su Meta falliva SEMPRE: la pagina chiamava
 * buildMetaPublishRequest senza la bozza, e il controllo tipi non lo vedeva
 * perché su AdsManagerBeta.tsx (8.043 righe) va in OOM. L'errore arrivava
 * all'utente come un TypeError illeggibile, prima ancora di contattare Meta.
 */
const bozza = {
  id: "draft-1",
  name: "Serramenti - Lead zona locale",
  platform: "meta",
  status: "draft",
  builderState: {
    platform: "meta",
    name: "Serramenti - Lead zona locale",
    objective: "leads",
    dailyBudget: 25,
    budgetMode: "adset",
    adSets: [{ id: "a1", name: "Freddo locale", dailyBudget: 15 }],
    copyVariants: [{ id: "c1", headline: "Serramenti nuovi", body: "Preventivo in 48h" }],
  },
} as unknown as AdsLocalCampaignDraft;

describe("buildMetaPublishRequest", () => {
  it("costruisce la richiesta quando la bozza c'è", () => {
    const req = buildMetaPublishRequest({
      companyId: "azienda-1",
      draft: bozza,
      adAccountAsset: { id: "asset-1", asset_id: "act_123" },
      dryRun: true,
    });
    expect(req.company_id).toBe("azienda-1");
    expect(req.dry_run).toBe(true);
    expect(req.builder_state).toBeTruthy();
  });

  it("senza bozza fallisce in modo esplicito, non con un TypeError", () => {
    expect(() =>
      // @ts-expect-error: è esattamente la chiamata sbagliata che stava in pagina
      buildMetaPublishRequest({ companyId: "azienda-1", adAccountAsset: { id: "a" }, dryRun: false }),
    ).toThrow();
  });

  it("una bozza senza builderState non parte", () => {
    expect(() =>
      buildMetaPublishRequest({
        companyId: "azienda-1",
        draft: { ...bozza, builderState: undefined } as unknown as AdsLocalCampaignDraft,
        adAccountAsset: { id: "asset-1", asset_id: "act_123" },
      }),
    ).toThrow(/missing_builder_state/);
  });
});

/**
 * Il tetto di spesa rifiutava ogni budget sopra 30 €/giorno chiedendo un
 * «super_admin», cioè l'amministratore della piattaforma e non il titolare
 * dell'impresa: nessun cliente poteva pubblicare una campagna vera. Ora la
 * soglia guarda l'ok del titolare, e quell'ok deve arrivare fino alla bozza.
 */
describe("metaCampaignToDraft", () => {
  const riga = {
    id: "camp-1",
    name: "Serramenti Monza",
    objective: "OUTCOME_LEADS",
    status: "draft",
    daily_budget_cents: 5000,
    builder_state: { zone: "Monza", targetCpl: 30 },
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
    ad_account_id: "acc-1",
    integration_id: "int-1",
    meta_campaign_id: null,
    publish_error: null,
  } as unknown as AdsMetaCampaign;

  it("porta con sé la data dell'ok del titolare", () => {
    const conOk = metaCampaignToDraft({
      ...riga,
      approved_at: "2026-09-03T09:30:00Z",
    } as unknown as AdsMetaCampaign);
    expect(conOk.approvedAt).toBe("2026-09-03T09:30:00Z");
  });

  it("senza ok la bozza resta senza data", () => {
    expect(metaCampaignToDraft(riga).approvedAt).toBeNull();
  });

  it("una campagna archiviata torna in elenco come bozza", () => {
    const archiviata = metaCampaignToDraft({ ...riga, status: "archived" } as unknown as AdsMetaCampaign);
    expect(archiviata.status).toBe("draft");
  });
});

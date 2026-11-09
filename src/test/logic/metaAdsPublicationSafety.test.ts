import { describe, expect, it } from "vitest";
import { acquireCampaignPublicationLock, campaignApprovalMatches, selectCampaignPage } from "../../../supabase/functions/_shared/metaAdsPublicationSafety";

const pages = [
  { id: "row-a", asset_id: "page-a", selected: true },
  { id: "row-b", asset_id: "page-b", selected: true },
  { id: "row-c", asset_id: "page-c", selected: false },
];
describe("Pagina della campagna", () => {
  it("non sceglie tra più pagine né accetta pagine estranee o deselezionate", () => {
    expect(selectCampaignPage(pages, {}).error).toContain("più Pagine");
    expect(selectCampaignPage(pages, { pageMetaId: "estranea" }).error).toContain("non è più collegata");
    expect(selectCampaignPage(pages, { pageMetaId: "page-c" }).error).toContain("non è più collegata");
    expect(selectCampaignPage(pages, { pageId: "row-scomparsa" }).error).toContain("non è più collegata");
  });
  it("rispetta la scelta per ID Meta o ID locale e usa solo l'unica pagina selezionata", () => {
    expect(selectCampaignPage(pages, { pageMetaId: "page-b" }).page?.id).toBe("row-b");
    expect(selectCampaignPage(pages, { pageId: "row-b" }).page?.id).toBe("row-b");
    expect(selectCampaignPage([pages[0], pages[2]], {}).page?.id).toBe("row-a");
    expect(selectCampaignPage([pages[2]], {}).error).toContain("Collega e seleziona");
  });
});

describe("approvazione vincolata alla configurazione", () => {
  const state = { dailyBudget: 50, pageMetaId: "page-a", creatives: [{ title: "A" }] };
  const approved = { approved_at: "2026-11-09", daily_budget_cents: 5000, builder_state: state };
  it("accetta lo stesso stato indipendentemente dall'ordine delle chiavi", () => {
    expect(campaignApprovalMatches(approved, { creatives: [{ title: "A" }], pageMetaId: "page-a", dailyBudget: 50 }, 5000)).toBe(true);
  });
  it("rifiuta budget, pagina o creatività modificati anche se il client invia la vecchia approvazione", () => {
    expect(campaignApprovalMatches(approved, { ...state, dailyBudget: 80 }, 8000)).toBe(false);
    expect(campaignApprovalMatches(approved, { ...state, pageMetaId: "page-b" }, 5000)).toBe(false);
    expect(campaignApprovalMatches(approved, { ...state, creatives: [{ title: "B" }] }, 5000)).toBe(false);
    expect(campaignApprovalMatches({ ...approved, approved_at: null }, state, 5000)).toBe(false);
  });
});

describe("claim atomico della pubblicazione", () => {
  function database() {
    const locks = new Map<string, { campaign_id: string; company_id: string; request_id: string }>();
    const admin = { from: () => ({
      insert: async (row: { campaign_id: string; company_id: string; request_id: string }) => {
        await Promise.resolve();
        if (locks.has(row.campaign_id)) return { error: { code: "23505" } };
        locks.set(row.campaign_id, row); return { error: null };
      },
      delete: () => {
        const filters: Record<string, string> = {};
        const q = { eq: (key: string, value: string) => { filters[key] = value; return q; },
          then: (resolve: (value: unknown) => unknown) => {
            const row = locks.get(filters.campaign_id);
            if (row && row.company_id === filters.company_id && row.request_id === filters.request_id) locks.delete(filters.campaign_id);
            return Promise.resolve({ error: null }).then(resolve);
          } };
        return q;
      },
    }) };
    return { admin, locks };
  }
  it("due richieste simultanee sulla stessa bozza producono un solo vincitore", async () => {
    const { admin, locks } = database();
    const outcomes = await Promise.allSettled([
      acquireCampaignPublicationLock(admin, "company", "draft"),
      acquireCampaignPublicationLock(admin, "company", "draft"),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason.code).toBe("publication_in_progress");
    const winner = outcomes.find((outcome) => outcome.status === "fulfilled") as PromiseFulfilledResult<() => Promise<void>>;
    await winner.value();
    expect(locks.size).toBe(0);
  });
  it("bozze diverse possono procedere e un errore DB non disabilita la protezione", async () => {
    const { admin, locks } = database();
    const releases = await Promise.all([acquireCampaignPublicationLock(admin, "company", "a"), acquireCampaignPublicationLock(admin, "company", "b")]);
    expect(locks.size).toBe(2); await Promise.all(releases.map((release) => release()));
    await expect(acquireCampaignPublicationLock({ from: () => ({ insert: async () => ({ error: { code: "42P01" } }) }) }, "company", "a")).rejects.toMatchObject({ code: "publication_lock_failed" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const proxy = vi.hoisted(() => vi.fn());
vi.mock("@/modules/ai-agents/hooks/useElevenLabsProxy", () => ({ callElevenLabsProxy: proxy }));
import { campaignPreparationRequest, readPreparedCampaignRecipients } from "@/lib/campaignPreparation";
beforeEach(() => { proxy.mockReset(); });
describe("campaign preparation deployment compatibility", () => {
  it.each([null, [], { preparazione_destinatari: { recipients: "broken", excluded: [] } }])("malformed legacy metadata cannot break the campaign view: %j", metadata => {
    expect(readPreparedCampaignRecipients(metadata)).toBeNull();
  });
  it("discards malformed rows instead of treating them as prepared contacts", () => {
    expect(readPreparedCampaignRecipients({ preparazione_destinatari: { recipients: [null, { contact_id: "contact", nome: "Demo", telefono: "+393331234567" }], excluded: ["broken"] } }))
      .toMatchObject({ recipients: [{ contact_id: "contact" }], excluded: [] });
  });
  it("never sends a campaign action to a backend without preparation support", async () => {
    proxy.mockResolvedValue({ version: 2 });
    await expect(campaignPreparationRequest("company", "create_campaign")).rejects.toThrow("servizio server aggiornato");
    expect(proxy).toHaveBeenCalledTimes(1);
  });
  it.each(["Azione non supportata: get_capabilities", "Nessuna azienda associata"])("shows a deployment instruction for the old server response: %s", async message => {
    proxy.mockRejectedValue(new Error(message));
    await expect(campaignPreparationRequest("company", "list_campaigns")).rejects.toThrow("Pubblica frontend e funzioni server insieme");
    expect(proxy).toHaveBeenCalledTimes(1);
  });
  it("passes through an actual authorization denial instead of suggesting a deployment", async () => {
    proxy.mockRejectedValue(new Error("Forbidden: tenant access denied"));
    await expect(campaignPreparationRequest("company", "list_campaigns")).rejects.toThrow("tenant access denied");
  });
  it("forwards the selected company and campaign payload after checking capability", async () => {
    proxy.mockResolvedValueOnce({ campaign_preparation: true }).mockResolvedValueOnce({ prepared: 2 });
    expect(await campaignPreparationRequest("company", "prepare_campaign", { contact_ids: ["contact"] })).toEqual({ prepared: 2 });
    expect(proxy).toHaveBeenLastCalledWith({ action: "prepare_campaign", company_id: "company", payload: { contact_ids: ["contact"] } });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverWhatsAppReply } from "../../../supabase/functions/whatsapp-ai-processor/delivery";

describe("WhatsApp reply acceptance — fake transport only", () => {
  beforeEach(() => vi.stubGlobal("Deno", { env: { get: (key: string) => key === "SUPABASE_URL" ? "https://test.invalid" : "not-a-secret" } }));
  afterEach(() => vi.unstubAllGlobals());
  it("accepts only the sender's explicit acknowledgement and message ID", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ success: true, meta_message_id: "wamid.fake" })));
    vi.stubGlobal("fetch", fetcher);
    await deliverWhatsAppReply({ company_id: "test", to: "0000", text: "fittizio" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: JSON.stringify({ company_id: "test", to: "0000", text: "fittizio" }),
    }));
  });
  it.each([402, 422, 500, 502])("does not swallow HTTP %s or retry the send", async (status) => {
    const fetcher = vi.fn(async () => new Response("failed", { status })); vi.stubGlobal("fetch", fetcher);
    await expect(deliverWhatsAppReply({})).rejects.toMatchObject({ reason: status >= 500 ? "unknown" : "rejected", status });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([{ success: false }, { success: true }, {}, { success: true, meta_message_id: "" }])("does not count ambiguous 200 as sent: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
    await expect(deliverWhatsAppReply({})).rejects.toMatchObject({ reason: "unknown" });
  });
  it("does not repeat an unknown network outcome", async () => {
    const fetcher = vi.fn(async () => { throw new Error("network timeout"); }); vi.stubGlobal("fetch", fetcher);
    await expect(deliverWhatsAppReply({})).rejects.toMatchObject({ reason: "unknown" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

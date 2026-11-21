import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avviaIndicatoreScrittura, deliverWhatsAppReply } from "../../../supabase/functions/whatsapp-ai-processor/delivery";
import { DbMinimo } from "../helpers/edgeFinto";

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

describe("Indicatore di scrittura WhatsApp", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("usa soltanto il numero Meta che ha ricevuto il messaggio", async () => {
    const db = new DbMinimo();
    db.rpcs.resolve_company_feature = () => ({ is_enabled: true });
    db.tabelle.ai_whatsapp_numbers = [{
      id: "altra-linea", company_id: "demo", stato: "active", webhook_verified: true,
      phone_number_id: "654321", access_token_encrypted: "token-fittizio",
    }];
    const fetcher = vi.fn();
    const inCorso: Promise<unknown>[] = [];
    vi.stubGlobal("Deno", { env: { get: () => "chiave-fittizia" } });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("EdgeRuntime", { waitUntil: (invio: Promise<unknown>) => inCorso.push(invio) });
    avviaIndicatoreScrittura(db as unknown as Parameters<typeof avviaIndicatoreScrittura>[0], {
      id: "messaggio", company_id: "demo", wa_number_id: "linea-originale",
      wa_message_id: "wamid.test", to_phone: "123456", message_type: "text",
    });
    await Promise.all(inCorso);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

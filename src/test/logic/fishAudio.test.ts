import { createHmac, webcrypto } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FishAudioClient, buildFishOutboundRequest, buildFishSipPlan, fishPhone, verifyFishWebhook } from "../../../supabase/functions/_shared/fishAudio";

const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeAll(() => vi.stubGlobal("crypto", webcrypto));
afterAll(() => vi.unstubAllGlobals());

describe("Fish Audio API adapter", () => {
  it("uses the documented Bearer API and consumes all pages before returning", async () => {
    const request = vi.fn().mockResolvedValueOnce(response({ agents: [{ agent_id: "one" }], has_more: true, next_cursor: "cursor+2" }))
      .mockResolvedValueOnce(response({ agents: [{ agent_id: "two" }], has_more: false }));
    const agents = await new FishAudioClient("private-key", request).listAgents();
    expect(agents.map(a => a.agent_id)).toEqual(["one", "two"]);
    expect(request.mock.calls[0][0]).toBe("https://api.fish.audio/v1/agent/agents");
    expect(request.mock.calls[1][0]).toContain("cursor=cursor%2B2");
    expect(request.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer private-key" }, redirect: "error" });
  });
  it("does not mistake a partial or malformed inventory for a successful sync", async () => {
    const request = vi.fn().mockImplementation(async () => response({ phone_numbers: [], has_more: true, next_cursor: "same" }));
    await expect(new FishAudioClient("key", request).listPhoneNumbers()).rejects.toThrow("incompleto");
    expect(request).toHaveBeenCalledTimes(2);
    await expect(new FishAudioClient("key", vi.fn().mockResolvedValue(response({}))).listAgents()).rejects.toThrow("non riconosciuta");
  });
  it("reports missing credentials without making requests, and redacts upstream errors", async () => {
    const request = vi.fn();
    expect(() => new FishAudioClient(" ", request)).toThrow("FISH_API_KEY");
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(response({ error: "private-key" }, 401));
    await expect(new FishAudioClient("private-key", request).listAgents()).rejects.toThrow("Chiave Fish Audio non valida");
    request.mockRejectedValue(new Error("Bearer private-key"));
    try { await new FishAudioClient("private-key", request).listAgents(); } catch (e) { expect(String(e)).not.toContain("private-key"); }
  });
  it("keeps the preview at the saved speaking speed and normalizes Italian numbers",async()=>{const request=vi.fn().mockResolvedValue(new Response(new Uint8Array([1])));const client=new FishAudioClient("key",request);await client.previewSpeech("Appuntamento alle 10:30","voice-it","s2.1-pro",{speed:1.05,language:"it"});expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({reference_id:"voice-it",prosody:{speed:1.05},language:"it"});await expect(client.previewSpeech("Prova","voice-it","s2.1-pro",{speed:9})).rejects.toThrow("Velocità");expect(request).toHaveBeenCalledTimes(1);});
  it("generates a short mp3 preview using voice id and model as separate fields", async () => {
    const request = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }));
    const fish = new FishAudioClient("key", request);
    expect((await fish.previewSpeech(" Buongiorno ", "voice-it", "s2.1-pro-free")).byteLength).toBe(3);
    const init = request.mock.calls[0][1];
    expect(init.headers.model).toBe("s2.1-pro-free");
    expect(JSON.parse(init.body)).toEqual({ text: "Buongiorno", format: "mp3", latency: "balanced", reference_id: "voice-it" });
    await expect(fish.previewSpeech("x".repeat(501))).rejects.toThrow("500");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("existing number and outbound plans", () => {
  it("preserves Italian fixed-line zeros and refuses to guess an international prefix", () => {
    expect(fishPhone("+39 (02) 1234-5678")).toBe("+390212345678");
    expect(() => fishPhone("0212345678")).toThrow("internazionale");
    expect(() => fishPhone("+3902123#123")).toThrow();
  });
  it("requires a stable idempotency key and uses Fish phone_number_id rather than the ElevenLabs field", () => {
    const input = { agentId: "fish-agent", phoneNumberId: "fish-number", toNumber: "+39 02 12345678", idempotencyKey: "callback-123-attempt-1", companyId: "company-a" };
    const first = buildFishOutboundRequest(input);
    const retry = buildFishOutboundRequest(input);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({ url: "https://api.fish.audio/v1/agent/phone-calls", headers: { "Idempotency-Key": input.idempotencyKey }, body: { phone_number_id: "fish-number", to_number: "+390212345678", metadata: { company_id: "company-a" } } });
    expect(first.body).not.toHaveProperty("agent_phone_number_id");
    expect(() => buildFishOutboundRequest({ ...input, idempotencyKey: "" })).toThrow("idempotenza");
  });
  it("marks an existing SIP number as a plan requiring authentication, not as ready to activate", () => {
    const plan = buildFishSipPlan("+390212345678", "agent");
    expect(plan.body.provider).toBe("sip");
    expect(plan.readyToSubmit).toBe(false);
    expect(plan.requiredBeforeSubmit.join(" ")).toContain("autenticazione inbound");
    expect(plan.requiredBeforeSubmit.join(" ")).toContain("termination SIP");
    expect(() => buildFishSipPlan("+390212345678", "agent", "sip:user:password@host")).toThrow("solo host");
  });
});

describe("Fish signed webhooks", () => {
  const secret = "dedicated-test-secret";
  const timestamp = 1_795_000_000;
  const raw = new TextEncoder().encode('{"event":"call.analyzed", "text":"È pronto"}');
  const signature = (time = timestamp) => `t=${time},v1=${createHmac("sha256", secret).update(`${time}.`).update(raw).digest("hex")}`;
  it("verifies original UTF-8 bytes with constant-time WebCrypto verification", async () => {
    expect(await verifyFishWebhook(raw, signature(), secret, timestamp)).toBe(true);
    const reserialized = new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(raw))));
    expect(await verifyFishWebhook(reserialized, signature(), secret, timestamp)).toBe(false);
  });
  it("rejects tampering, missing secrets and stale or future timestamps", async () => {
    expect(await verifyFishWebhook(raw, signature(), "wrong", timestamp)).toBe(false);
    expect(await verifyFishWebhook(raw, signature(), "", timestamp)).toBe(false);
    expect(await verifyFishWebhook(raw, null, secret, timestamp)).toBe(false);
    expect(await verifyFishWebhook(raw, signature(), secret, timestamp + 301)).toBe(false);
    expect(await verifyFishWebhook(raw, signature(), secret, timestamp - 301)).toBe(false);
    expect(await verifyFishWebhook(raw, signature() + ",t=1", secret, timestamp)).toBe(false);
  });
});

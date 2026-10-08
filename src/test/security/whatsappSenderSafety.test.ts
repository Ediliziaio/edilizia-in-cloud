import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isTrustedInternalSender, metaSendOutcome } from "../../../supabase/functions/whatsapp-send/safety";

const source = readFileSync("supabase/functions/whatsapp-send/index.ts", "utf8");

describe("WhatsApp sender authentication — local fixtures only", () => {
  it("rejects a fabricated service_role claim and requires authenticated user lookup", () => {
    const token = `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.fake`;
    expect(isTrustedInternalSender(`Bearer ${token}`, null, "configured-service-key", "cron-key")).toBe(false);
    expect(source).not.toContain("extractJwtRole");
    expect(source).toContain("isTrustedInternalSender(");
    expect(source).toContain("supabaseUser.auth.getUser(token)");
  });
  it("accepts only the configured nonempty service key or internal secret", () => {
    expect(isTrustedInternalSender("Bearer configured", null, "configured", "cron")).toBe(true);
    expect(isTrustedInternalSender("", "cron", "configured", "cron")).toBe(true);
    expect(isTrustedInternalSender("", "configured", "configured", undefined)).toBe(true);
    expect(isTrustedInternalSender("Bearer configured-wrong", "wrong", "configured", "cron")).toBe(false);
  });
  it.each(["Bearer undefined", "Bearer null", "Bearer ", ""])("fails closed without keys: %s", (authorization) => {
    expect(isTrustedInternalSender(authorization, "", undefined, undefined)).toBe(false);
  });
});

describe("WhatsApp provider acknowledgement", () => {
  it("accepts only a real nonempty provider ID", () => {
    expect(metaSendOutcome(200, { messages: [{ id: "wamid.fixture" }] })).toEqual({ kind: "accepted", messageId: "wamid.fixture" });
    expect(source).not.toContain("`out_${Date.now()}");
  });
  it.each([null, {}, { messages: [] }, { messages: [{ id: "" }] }, { messages: [{ id: 42 }] }, { error: { message: "error" } }])("does not fabricate success for %j", (body) => {
    expect(metaSendOutcome(200, body)).toEqual({ kind: "unknown" });
  });
  it("distinguishes a definite rejection from uncertain server failures", () => {
    expect(metaSendOutcome(400, { error: { message: "invalid recipient" } })).toEqual({ kind: "rejected" });
    expect(metaSendOutcome(503, { error: { message: "upstream failed" } })).toEqual({ kind: "unknown" });
    expect(metaSendOutcome(502, { messages: [{ id: "unexpected" }] })).toEqual({ kind: "unknown" });
    expect(metaSendOutcome(401, "invalid body")).toEqual({ kind: "unknown" });
  });
  it("bounds provider wait and does not refund or retry network ambiguity", () => {
    expect(source).toContain("signal: AbortSignal.timeout(25_000)");
    const handler = source.slice(source.indexOf("if (providerAttempted) {"));
    expect(handler).toContain('code: "delivery_unknown"');
    expect(handler).not.toContain("rimborsaMessaggioWhatsApp(");
    expect(handler).not.toContain("fetch(");
  });
  it("checks the conversation window for interactive replies too", () => {
    const interactive = source.split('} else if (type === "interactive") {')[1].split('} else if (type === "template") {')[0];
    expect(interactive).toContain("getWhatsAppWindowStatus(adminClient, companyId, to)");
    expect(interactive).toContain('code: "window_closed"');
  });
});

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BotSessionState } from "../../../supabase/functions/whatsapp-ai-processor/sessionState";

function fakeStore() {
  let state: unknown = { other: "keep", bot_conferma: { azione: "carica_ddt", chiesta_il: "2026-10-07T10:00:00Z" } };
  let unavailable = false;
  const db = { from: () => {
    let next: unknown; const filters = new Map<string, unknown>();
    const q = { update: (p: { state_data: unknown }) => { next = p.state_data; return q; },
      eq: (k: string, v: unknown) => { filters.set(k, v); return q; },
      is: (k: string, v: unknown) => { filters.set(k, v); return q; },
      select: async () => {
        if (unavailable) return { error: { message: "offline" } };
        if (filters.get("company_id") !== "company" || filters.get("id") !== "session" ||
          filters.get("state_data") !== (state == null ? null : JSON.stringify(state))) return { data: [] };
        state = next; return { data: [{ id: "session" }] };
      } };
    return q;
  } } as unknown as SupabaseClient;
  return { db, read: () => state, fail: () => { unavailable = true; } };
}

describe("WhatsApp confirmation consumption — simulated CAS", () => {
  it("only one of two concurrent turns consumes the same pending confirmation", async () => {
    const store = fakeStore();
    const a = new BotSessionState(store.db, "company", "session", store.read());
    const b = new BotSessionState(store.db, "company", "session", store.read());
    const results = await Promise.allSettled([a.consume(), b.consume()]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(store.read()).toEqual({ other: "keep" });
    expect(await a.consume()).toBe(false);
  });
  it("does not overwrite a later question with an older turn", async () => {
    const store = fakeStore();
    const a = new BotSessionState(store.db, "company", "session", store.read());
    const b = new BotSessionState(store.db, "company", "session", store.read());
    await b.save({ domini: ["crm"] });
    await expect(a.consume()).rejects.toThrow("changed_or_unavailable");
    expect(store.read()).toHaveProperty("bot_conferma");
  });
  it.each(["wrong-company", "company"])("fails closed for missing scope/state: %s", async (company) => {
    const store = fakeStore(); if (company === "company") store.fail();
    await expect(new BotSessionState(store.db, company, "session", store.read()).consume()).rejects.toThrow();
  });
  it("does not authorize writes without a session", async () => {
    const store = fakeStore();
    await expect(new BotSessionState(store.db, "company", null, null).consume()).rejects.toThrow("session_unavailable");
  });
});

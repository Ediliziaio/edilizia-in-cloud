import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverMessage } from "../../../supabase/functions/whatsapp-ai-recovery/recoverMessage";

const message = { id: "fake-inbound", company_id: "company", processing_attempts: 0 };
function fakeStore(attempts = 0) {
  const row: Record<string, unknown> = { ...message, direction: "inbound", processing_status: "received", processing_attempts: attempts };
  let offline = false;
  const db = { from: () => {
    let patch: Record<string, unknown> = {}; const filters = new Map<string, unknown>();
    const execute = (): { error: { message: string } | null; data: Array<{ id: unknown }> | null } => {
      if (offline) return { error: { message: "offline" }, data: null };
      if ([...filters].some(([k, v]) => row[k] !== v)) return { error: null, data: [] };
      Object.assign(row, patch); return { error: null, data: [{ id: row.id }] };
    };
    const q = { update: (p: Record<string, unknown>) => { patch = p; return q; },
      eq: (k: string, v: unknown) => { filters.set(k, v); return q; },
      select: async () => execute(),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve(execute()).then(resolve) };
    return q;
  } } as unknown as SupabaseClient;
  return { row, db, fail: () => { offline = true; } };
}
const response = (body: unknown) => new Response(JSON.stringify(body));

describe("WhatsApp recovery — simulated processor and database", () => {
  it("reserves dispatch once for competing workers", async () => {
    const store = fakeStore(); const invoke = vi.fn(async () => response({ ok: true, status: "processed" }));
    const results = await Promise.all([recoverMessage(store.db, message, invoke), recoverMessage(store.db, message, invoke)]);
    expect(results.sort()).toEqual(["processed", "skipped"]); expect(invoke).toHaveBeenCalledOnce();
    expect(store.row.processing_attempts).toBe(1);
  });
  it.each(["processed", "processing", "failed"])("does not dispatch stale candidates in %s", async status => {
    const store = fakeStore(); store.row.processing_status = status;
    const invoke = vi.fn(); expect(await recoverMessage(store.db, message, invoke)).toBe("skipped");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("never dispatches outbound messages", async () => {
    const store = fakeStore(); store.row.direction = "outbound";
    const invoke = vi.fn(); expect(await recoverMessage(store.db, message, invoke)).toBe("skipped");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("does not dispatch when the attempt cannot be saved", async () => {
    const store = fakeStore(); store.fail(); const invoke = vi.fn();
    expect(await recoverMessage(store.db, message, invoke)).toBe("failed"); expect(invoke).not.toHaveBeenCalled();
  });
  it.each([{ ok: false, status: "failed" }, {}, { ok: true, status: "processing" }])("does not count unsuccessful HTTP 200 as completed: %j", async body => {
    const store = fakeStore(); expect(await recoverMessage(store.db, message, async () => response(body))).toBe("failed");
  });
  it("counts already claimed as skipped, not a completed AI response", async () => {
    const store = fakeStore();
    expect(await recoverMessage(store.db, message, async () => response({ skip: "already_claimed" }))).toBe("skipped");
  });
  it("waiting in the conversation queue does not exhaust recovery attempts", async () => {
    const store = fakeStore(4);
    expect(await recoverMessage(store.db, { ...message, processing_attempts: 4 }, async () => response({ skip: "conversation_busy" }))).toBe("skipped");
    expect(store.row.processing_attempts).toBe(4);
    expect(store.row.processing_status).toBe("received");
  });
  it.each(["processing", "processed"])("does not clobber %s after the dispatch times out", async status => {
    const store = fakeStore(4);
    expect(await recoverMessage(store.db, { ...message, processing_attempts: 4 }, async () => {
      store.row.processing_status = status; throw new Error("timeout after dispatch");
    })).toBe("failed");
    expect(store.row.processing_status).toBe(status);
  });
  it("marks final failure only while no processor has claimed the message", async () => {
    const store = fakeStore(4);
    expect(await recoverMessage(store.db, { ...message, processing_attempts: 4 }, async () => new Response("down", { status: 503 }))).toBe("failed");
    expect(store.row.processing_status).toBe("failed_max_retries");
  });
});

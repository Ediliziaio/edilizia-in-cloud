import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimWhatsAppOperation, runWhatsAppTool } from "../../../supabase/functions/_shared/whatsappOperations";
import { recoveryBatch } from "../../../supabase/functions/whatsapp-ai-recovery/recoveryBatch";
import { assignedSiteIds, requireSiteAccess } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/siteAccess";
import type { ToolCtx } from "../../../supabase/functions/whatsapp-ai-processor/tools/shared/types";

describe("Durable operation boundary (simulated RPC)", () => {
  it("replays a completed tool without repeating the business write", async () => {
    const db = { rpc: vi.fn(async () => ({ data: { state: "completed", id: "operation", result: { ok: true, id: "record" } }, error: null })) } as unknown as SupabaseClient;
    const write = vi.fn();
    expect(await runWhatsAppTool(db, "company", "same-intent", "tool", { amount: 5 }, write)).toEqual({ ok: true, id: "record" });
    expect(write).not.toHaveBeenCalled();
  });
  it.each(["running", "unknown", "conflict", "rejected"])("does not restart %s", async state => {
    const db = { rpc: vi.fn(async () => ({ data: { state, id: "operation" }, error: null })) } as unknown as SupabaseClient;
    const write = vi.fn();
    await expect(runWhatsAppTool(db, "company", "key", "tool", {}, write)).rejects.toThrow(state === "running" ? "operation_in_progress" : `operation_${state}`);
    expect(write).not.toHaveBeenCalled();
  });
  it("leaves failed receipt persistence unknown, never re-executes the tool", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { state: "claimed", id: "operation" } })
      .mockResolvedValueOnce({ error: { message: "lost acknowledgement" } }).mockResolvedValueOnce({ data: true });
    const write = vi.fn(async () => ({ ok: true, id: "record" }));
    await expect(runWhatsAppTool({ rpc } as unknown as SupabaseClient, "company", "key", "tool", {}, write)).rejects.toThrow("result_not_saved");
    expect(write).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_status: "unknown" });
  });
  it("fails closed on unavailable reservation storage", async () => {
    await expect(claimWhatsAppOperation({ rpc: async () => ({ error: {} }) } as unknown as SupabaseClient,
      "company", "send", "key", {}, {})).rejects.toThrow("store_unavailable");
  });
});

describe("Recovery batch scheduling", () => {
  it("runs separate conversations concurrently, keeps their message order and bounds workers", async () => {
    const items = [{ scope: "a", id: 1 }, { scope: "a", id: 2 }, { scope: "b", id: 3 }, { scope: "c", id: 4 }];
    const active = new Set<string>(); const completed: number[] = []; let max = 0;
    const counts = await recoveryBatch(items, item => item.scope, async item => {
      expect(active.has(item.scope)).toBe(false); active.add(item.scope); max = Math.max(max, active.size);
      await new Promise(resolve => setTimeout(resolve, 2)); completed.push(item.id); active.delete(item.scope);
      return "processed";
    }, 2);
    expect(max).toBe(2); expect(completed.indexOf(1)).toBeLessThan(completed.indexOf(2));
    expect(counts).toEqual({ processed: 4, failed: 0, skipped: 0 });
  });
  it("does not dispatch later messages behind an uncertain turn", async () => {
    const run = vi.fn(async () => "skipped" as const);
    expect(await recoveryBatch([1, 2, 3], () => "one", run)).toEqual({ processed: 0, failed: 0, skipped: 3 });
    expect(run).toHaveBeenCalledOnce();
  });
});

describe("Worker site access", () => {
  const setup = (fail = false) => {
    const tables: string[] = [];
    const db = { from: (table: string) => {
      tables.push(table);
      const result = { data: table === "order_campo_assignments" ? [
        { order_id: "assigned", data_inizio: "2026-01-01", data_fine_prevista: null as string | null },
        { order_id: "expired", data_fine_prevista: "2025-01-01" }] : table === "order_phase_assignments" ? [{ order_id: "phase" }] : { id: "assigned" },
        error: fail ? { message: "offline" } : null };
      const q = { select: () => q, eq: () => q, maybeSingle: async () => result,
        then: (done: (value: unknown) => void) => Promise.resolve(result).then(done) };
      return q;
    } } as unknown as SupabaseClient;
    return { ctx: { supabase: db, company_id: "company", user_id: "user", employee_id: "employee", kind: "operaio" } as ToolCtx, tables };
  };
  it("combines direct and phase assignments, excluding expired direct access", async () => {
    expect(await assignedSiteIds(setup().ctx, "2026-10-07")).toEqual(new Set(["assigned", "phase"]));
  });
  it("blocks an unassigned ID before loading another site's data", async () => {
    const { ctx, tables } = setup(); await expect(requireSiteAccess(ctx, "unassigned")).rejects.toThrow("non assegnato");
    expect(tables).not.toContain("orders");
  });
  it("does not grant access on assignment lookup failure", async () => {
    await expect(assignedSiteIds(setup(true).ctx)).rejects.toThrow("unavailable");
  });
});

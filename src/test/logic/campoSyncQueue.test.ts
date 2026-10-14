import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canProcessSyncItem, syncOperationId, type SyncItem } from "@/lib/campo/sync-queue";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const item = (patch: Partial<SyncItem> = {}): SyncItem => ({ id: "sq-legacy-1", type: "timbratura", payload: {}, status: "pending", retryCount: 0, createdAt: 0, updatedAt: 0, ...patch });
describe("Recupero della coda", () => {
  it("riprende un invio interrotto dopo il lease, non durante l'invio", () => {
    expect(canProcessSyncItem(item({ status: "syncing" }), 300001)).toBe(true); expect(canProcessSyncItem(item({ status: "syncing" }), 10000)).toBe(false);
  });
  it("non ritenta automaticamente elementi esauriti o completati", () => {
    expect(canProcessSyncItem(item({ retryCount: 5, status: "failed" }), 99999999)).toBe(false); expect(canProcessSyncItem(item({ status: "done" }), 99999999)).toBe(false);
  });
  it("rispetta il backoff", () => {
    expect(canProcessSyncItem(item({ retryCount: 3 }), 3999)).toBe(false); expect(canProcessSyncItem(item({ retryCount: 3 }), 4000)).toBe(true);
  });
  it("il vecchio id produce sempre lo stesso UUID anche in due tab", async () => {
    const a = await syncOperationId(item()); expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await syncOperationId(item())).toBe(a); expect(await syncOperationId(item({ id: "sq-legacy-2" }))).not.toBe(a);
  });
  it("conserva la chiave del primo tentativo", async () => {
    expect(await syncOperationId(item({ operationId: "esistente" }))).toBe("esistente");
  });
});

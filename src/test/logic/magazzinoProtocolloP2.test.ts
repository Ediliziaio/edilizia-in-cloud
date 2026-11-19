import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { warehouseCapabilities, warehouseRequestScope, WarehouseRequestSlot } from "@/lib/magazzino/protocolloMovimenti";
beforeEach(() => { sessionStorage.clear(); rpc.mockReset(); });
describe("Identità delle operazioni di magazzino", () => {
  it("mantiene le capacità dei movimenti precedenti nel protocollo 3", async () => {
    const capabilities = { version: 3, idempotent_carichi: true, idempotent_uscite: true, serial_returns: true, atomic_transfers: true, inventory_counts: true, reorder: true };
    rpc.mockResolvedValue({ data: capabilities, error: null });
    expect(await warehouseCapabilities("company")).toEqual(capabilities);
  });
  it("riusa la chiave dopo timeout e riapertura, senza accettare dati diversi", () => {
    const slot = new WarehouseRequestSlot("test", sessionStorage);
    const first = slot.request({ qty: 1.25 });
    slot.failed(new Error("Failed to fetch"));
    const reopened = new WarehouseRequestSlot("test", sessionStorage);
    expect(reopened.request({ qty: 1.25 })).toBe(first);
    expect(() => reopened.request({ qty: 2 })).toThrow(/esito da verificare/);
    reopened.succeeded();
    expect(reopened.request({ qty: 1.25 })).not.toBe(first);
  });
  it("dopo un rifiuto esplicito permette di correggere la richiesta", () => {
    const slot = new WarehouseRequestSlot("test", sessionStorage);
    const first = slot.request({ qty: 9 });
    slot.failed({ code: "PT409", message: "Disponibilità insufficiente" });
    expect(slot.request({ qty: 2 })).not.toBe(first);
  });
  it("una funzione mancante mantiene il flusso precedente", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Missing public.warehouse_capabilities_v2" } });
    expect(await warehouseCapabilities("company")).toEqual({ version: 1 });
  });
  it.each([{ code: "42501", message: "Permesso negato" }, { message: "Failed to fetch" }, { code: "PGRST202", message: "Different missing function" }])("non retrocede al flusso precedente per errori diversi: %o", async (error) => {
    rpc.mockResolvedValue({ data: null, error });
    await expect(warehouseCapabilities("company")).rejects.toEqual(error);
  });
});

it("separa le chiavi del collaudo da quelle del servizio ordinario", () => {
  sessionStorage.removeItem("eic-magazzino-local-preview");
  const real = warehouseRequestScope("c", "u", "uscita");
  sessionStorage.setItem("eic-magazzino-local-preview", "1");
  expect(warehouseRequestScope("c", "u", "uscita")).not.toBe(real);
  sessionStorage.removeItem("eic-magazzino-local-preview");
});

it("recupera la richiesta confermata dopo riapertura e sblocca l’hook già montato", () => {
  const original = new WarehouseRequestSlot("audit-recovery", sessionStorage);
  const payload = { p_stock_item_id: "stock", p_counted: 8.25, p_snapshot: { quantity: 10 } };
  const id = original.request(payload);
  original.failed(new Error("Timeout"));
  const recovery = new WarehouseRequestSlot("audit-recovery", sessionStorage);
  expect(recovery.pendingRequest()).toEqual({ id, payload });
  recovery.succeeded();
  expect(original.hasPending()).toBe(false);
  expect(original.request({ ...payload, p_counted: 9 })).not.toBe(id);
});
it("conserva la stessa chiave in memoria se lo storage del browser è indisponibile", () => {
  const broken = { getItem: () => { throw new Error("Storage disabled"); }, setItem: () => { throw new Error("Storage disabled"); }, removeItem: () => { throw new Error("Storage disabled"); } };
  const original = new WarehouseRequestSlot("audit-no-storage", broken);
  const id = original.request({ quantity: 1.25 });
  expect(new WarehouseRequestSlot("audit-no-storage", broken).request({ quantity: 1.25 })).toBe(id);
  new WarehouseRequestSlot("audit-no-storage", broken).succeeded();
});

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOrderDraft, type OrderDraftData } from "@/hooks/useOrderDraft";
import { indirizzoCantiereDaTesto } from "@/lib/orders/indirizzoCantiere";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const bozza: Omit<OrderDraftData, "savedAt"> = {
  customerId: "cliente", orderCode: "TEST", description: "Bagno", internalNotes: "", statusId: "", salespersonId: "", salespersonData: null,
  assignedTo: "", destinationWarehouseId: null, expectedDate: null, warehouseArrivalDate: null,
  workStartDate: "2026-10-09T00:00:00.000Z", workEndDate: "2026-12-03T00:00:00.000Z",
  paymentType: "standard", totalAmount: "10000", vatRate: "10", financingCost: "", installments: [], orderItems: [], hasBuildingBonus: false,
  cantiereAddress: "Via Test 42", cantiereAddressManuale: true, modelloFasiId: "bagno",
  fasiLavoro: [{ nome: "Preparazione", sottofasi: [{ nome: "Proteggere", peso: 2 }] }], durataLavori: "40", settimanaLavorativa: 5,
};

describe("bozza completa della pianificazione", () => {
  it("conserva anche i dati del suggerimento indirizzo e le coordinate", () => {
    const { result } = renderHook(() => useOrderDraft("uno"));
    const address = { ...indirizzoCantiereDaTesto("Via Test 42"), lat: 45, lng: 9, place_id: "demo" };
    act(() => result.current.saveDraft({ ...bozza, cantiereAddressData: address }));
    expect(result.current.loadDraft()?.cantiereAddressData).toEqual(address);
  });
  it("conserva indirizzo manuale, modello, modifiche alle fasi, calendario e durata dopo riapertura", () => {
    const prima = renderHook(() => useOrderDraft("azienda-demo"));
    act(() => prima.result.current.saveDraft(bozza));
    prima.unmount();
    const dopo = renderHook(() => useOrderDraft("azienda-demo"));
    expect(dopo.result.current.loadDraft()).toMatchObject(bozza);
  });
  it("mantiene la scelta esplicita di non inserire fasi e separa le aziende", () => {
    const { result, rerender } = renderHook(({ azienda }) => useOrderDraft(azienda), { initialProps: { azienda: "uno" } });
    act(() => result.current.saveDraft({ ...bozza, modelloFasiId: "", fasiLavoro: [] }));
    expect(result.current.loadDraft()).toMatchObject({ modelloFasiId: "", fasiLavoro: [] });
    rerender({ azienda: "due" });
    expect(result.current.loadDraft()).toBeNull();
  });
  it("le bozze v2 precedenti restano leggibili senza nuovi campi", () => {
    localStorage.setItem("order-draft-uno", JSON.stringify({ version: 2, savedAt: new Date().toISOString(), description: "Bozza precedente" }));
    const { result } = renderHook(() => useOrderDraft("uno"));
    expect(result.current.loadDraft()?.description).toBe("Bozza precedente");
    expect(result.current.isoToDate("non-data")).toBeUndefined();
  });
  it("conserva l'id della commessa già creata se il completamento è stato interrotto", () => {
    const { result } = renderHook(() => useOrderDraft("uno"));
    act(() => result.current.saveDraft({ ...bozza, commessaCreataId: "d1d16e2e-437a-42eb-a7a0-60c38c22dfbe" }));
    expect(result.current.loadDraft()).toMatchObject({ commessaCreataId: "d1d16e2e-437a-42eb-a7a0-60c38c22dfbe", fasiLavoro: bozza.fasiLavoro });
  });
});

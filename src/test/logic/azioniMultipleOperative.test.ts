import { describe, expect, it, vi } from "vitest";
import { executeBulkPhase, reviewBulkPhase } from "@/lib/orders/operationalBulkActions";
import type { PipelineDocument } from "@/lib/orders/pipelineTransitions";

const doc: PipelineDocument = { id: "a", label: "ODA-A", href: "/detail/a", status: "bozza", stage: "da_ordinare" };
describe("Azioni multiple operative", () => {
  it("rende verificabili gli invii manuali e non abilita ricezioni o firme fittizie", () => {
    expect(reviewBulkPhase("oda", [doc], "ordinato")[0].plan?.status).toBe("inviato");
    expect(() => reviewBulkPhase("oda", [doc], "consegnato")).toThrow();
    expect(() => reviewBulkPhase("survey", [doc], "firmato")).toThrow();
  });
  it("blocca selezioni miste prima del salvataggio e conserva le regole delle offerte", () => {
    const result = reviewBulkPhase("rfq", [
      { ...doc, status: "inviata", stage: "inviata", responses: 2 },
      { ...doc, id: "b", status: "bozza", stage: "bozza", responses: 0 },
    ], "in_valutazione");
    expect(result[0].plan?.status).toBe("in_valutazione");
    expect(result[1].plan).toBeNull();
    expect(result[1].reason).toContain("risposta");
  });
  it("non verifica DDT con danni o senza merce ricevuta", () => {
    for (const [damages, quantity] of [[true, 2], [false, 0]] as const) {
      expect(reviewBulkPhase("ddt", [{ ...doc, status: "ricevuto", stage: "ricevuto", damages, quantity }], "verificato")[0].plan).toBeNull();
    }
  });
  it("riporta ogni esito senza nascondere un errore intermedio o ripetere i successi", async () => {
    const plans = ["a", "b", "c"].map(id => ({ document: { id, label: id } }));
    const save = vi.fn(async (p: typeof plans[number]) => { if (p.document.id === "b") throw new Error("Modificato da un collega"); });
    const result = await executeBulkPhase(plans, save, () => true);
    expect(result.map(r => r.ok)).toEqual([true, false, true]);
    expect(result[1].error).toContain("collega");
    expect(save).toHaveBeenCalledTimes(3);
  });
  it("interrompe le azioni rimanenti se cambia azienda o vengono revocati i permessi", async () => {
    let current = true;
    const save = vi.fn(async () => { current = false; });
    const result = await executeBulkPhase(["a", "b"].map(id => ({ document: { id, label: id } })), save, () => current);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.map(r => r.ok)).toEqual([true, false]);
    expect(result[1].error).toContain("interrotta");
  });
});

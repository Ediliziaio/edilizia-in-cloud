import { describe, expect, it } from "vitest";
import { anomalyPatch, anomalyNotes, anomalyPriority, type AnomalyDraft, type AnomalyWorkflowRecord } from "@/lib/orders/anomalyWorkflow";
const original: AnomalyWorkflowRecord = { id: "a1", order_id: "o1", description: "Dettaglio: Materiale danneggiato\nCausa precisa: Trasporto", amount: 500, error_date: "2026-01-01", error_type: "merce", error_category: "danno_materiale" };
const draft = (patch: Partial<AnomalyDraft> = {}): AnomalyDraft => ({ orderId: "o1", description: original.description!, date: "2026-01-01", type: "merce", category: "danno_materiale", estimate: "500", status: "aperta", priority: "high", actorName: "", actorKind: "internal", actorId: "", action: "", dueDate: "", finalCost: "", recovered: "0", resolution: "", ...patch });
const save = (d: AnomalyDraft, record = original) => anomalyPatch(record, d, "user1", "2026-01-02T10:00:00Z");
describe("Gestione anomalie", () => {
  it("mantiene contesto e stima, salvando priorità operativa e storico", () => {
    const patch = save(draft()); const next = { ...original, ...patch };
    expect(anomalyNotes(next)).toMatchObject({ body: original.description, estimate: 500, finalCost: null, recovered: 0, priority: "high" });
    expect(anomalyPriority(next)).toBe("high"); expect(anomalyNotes(next).history).toHaveLength(1);
  });
  it("impedisce assegnazioni senza responsabile o azione", () => {
    expect(() => save(draft({ status: "assegnata" }))).toThrow(/responsabile/);
    expect(() => save(draft({ status: "assegnata", actorName: "Mario" }))).toThrow(/azione/);
    expect(save(draft({ status: "assegnata", actorName: "Mario", action: "Sostituisci" })).confirmed_responsibility_name).toBe("Mario");
  });
  it("richiede soluzione e costo finale per risolvere", () => {
    expect(() => save(draft({ status: "risolta", finalCost: "0" }))).toThrow(/cosa è stato fatto/);
    expect(() => save(draft({ status: "risolta", resolution: "Sostituito" }))).toThrow(/costo finale/);
    const patch = save(draft({ status: "risolta", resolution: "Sostituzione gratuita", finalCost: "0" }));
    expect(patch).toMatchObject({ amount: 0, resolved_by: "user1", resolved_at: "2026-01-02T10:00:00Z" });
  });
  it("sottrae i recuperi una volta e conserva la stima", () => {
    const patch = save(draft({ finalCost: "600", recovered: "100", resolution: "Sostituito" }));
    expect(patch.amount).toBe(500); expect(anomalyNotes({ ...original, ...patch })).toMatchObject({ estimate: 500, finalCost: 600, recovered: 100 });
  });
  it("non azzera il costo di un caso non imputabile e richiede motivazione", () => {
    expect(() => save(draft({ status: "non_imputabile" }))).toThrow(/motivazione/);
    expect(save(draft({ status: "non_imputabile", resolution: "Danno del cliente" })).amount).toBe(500);
  });
  it("rifiuta costi negativi, non numerici e recuperi eccessivi", () => {
    for (const patch of [{ finalCost: "-1" }, { recovered: "10" }, { estimate: "NaN" }, { finalCost: "10", recovered: "11" }]) expect(() => save(draft(patch))).toThrow();
  });
  it("riaprendo azzera la chiusura ma conserva lo storico e il contesto", () => {
    const first = { ...original, ...save(draft({ status: "risolta", resolution: "Riparato", finalCost: "300" })) };
    const notes = anomalyNotes(first);
    const patch = save(draft({ description: notes.body, finalCost: "300", status: "in_verifica" }), first);
    expect(patch.resolved_at).toBeNull(); expect(patch.resolved_by).toBeNull();
    expect(anomalyNotes({ ...first, ...patch }).history).toHaveLength(2);
    expect(anomalyNotes({ ...first, ...patch }).body).toBe(original.description);
  });
});

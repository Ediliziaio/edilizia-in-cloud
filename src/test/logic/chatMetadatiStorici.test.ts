import { describe, expect, it } from "vitest";
import { normalizzaMetadatiMessaggio } from "@/lib/chat/normalizzaMetadatiMessaggio";
describe("metadati storici chat", () => {
  it("conserva il testo anche se i campi JSON sono malformati", () => {
    const row = normalizzaMetadatiMessaggio({ content: "Risposta", rag_sources: {}, council_data: [], reactions: { ok: 12 }, followup_suggestions: 1, ai_confidence: "inventata" });
    expect(row).toEqual({ content: "Risposta", rag_sources: null, council_data: null, reactions: null, followup_suggestions: null, ai_confidence: null });
  });
  it("conserva fonti e indicazioni valide senza inventare affidabilità", () => {
    const source = { id: "S1", title: "Documento", similarity: 0.8, scope: "company" };
    const row = normalizzaMetadatiMessaggio({ rag_sources: [source], ai_confidence: "low", followup_suggestions: ["Approfondisci"], reactions: { ok: ["utente"] }, council_data: { is_multi_area: true, involved_areas: ["finance"] } });
    expect(row.rag_sources).toEqual([source]); expect(row.ai_confidence).toBe("low");
    expect(row.council_data?.involved_areas).toEqual(["finance"]); expect(row.reactions).toEqual({ ok: ["utente"] });
  });
});

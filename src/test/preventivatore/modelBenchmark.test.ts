import { describe, expect, it, vi } from "vitest";
import { quoteBenchmarkCases, runQuoteBenchmarkCase, QUOTE_BENCHMARK_MODELS, assessQuoteBenchmarkTurn } from "../../../supabase/functions/_shared/quoteModelBenchmark";
import { readQuoteChatRequest, readQuoteChatResult, type QuoteChatResult, type QuoteChatTurn } from "../../../supabase/functions/_shared/quoteConversation";
const turn = (): QuoteChatTurn => ({ version: 1, title: "Progetto sintetico", message: "Quali misure confermi?", questions: [], proposals: [], warnings: [], searches: [] });
describe("Confronto isolato dei modelli: nessun dato cliente o modifica al preventivo", () => {
  it("i due modelli ricevono gli stessi sei input deterministici e indipendenti", () => {
    const cases = quoteBenchmarkCases(); expect(cases).toEqual(quoteBenchmarkCases()); expect(cases).toHaveLength(6);
    for (const c of cases) for (const model of QUOTE_BENCHMARK_MODELS) {
      const request = readQuoteChatRequest({ ...c.request, modelTest: { model, caseId: c.id } });
      expect(request.messages).toEqual(c.request.messages); expect(request.context).toEqual(c.request.context);
      expect(request.companyId).toBe("d2000000-0000-4000-a000-000000000002");
    }
    cases[0].request.context!.brief = "non deve contaminare il caso seguente";
    expect(quoteBenchmarkCases()[0].request.context!.brief).not.toContain("contaminare");
  });
  it("rifiuta modello arbitrario e caso non previsto", () => {
    const c = quoteBenchmarkCases()[0];
    expect(() => readQuoteChatRequest({ ...c.request, modelTest: { model: "untrusted/model", caseId: c.id } })).toThrow("non consentito");
    expect(() => readQuoteChatRequest({ ...c.request, modelTest: { model: QUOTE_BENCHMARK_MODELS[0], caseId: "arbitrary_prompt" } })).toThrow("non consentito");
  });
  it("distingue la risposta grezza errata dalla protezione applicata dal software", async () => {
    const c = quoteBenchmarkCases()[0]; const raw = turn(); raw.proposals = [{ id: "ceiling", title: "Cucina · Tinteggiatura soffitto", description: "Da verificare", unit: "m²", quantity: null, quantityBasis: "Da rilevare", referenceId: null }];
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify(raw), model: QUOTE_BENCHMARK_MODELS[0] });
    const result = await runQuoteBenchmarkCase(c, complete);
    expect(result.rawChecks[0].respectsRoomMemory).toBe(false); expect(result.guardedChecks.respectsRoomMemory).toBe(true);
    expect(result.finalTurn.proposals).toEqual([]); expect(c.request.lines).toEqual([]); expect(complete).toHaveBeenCalledOnce();
  });
  it("segnala riferimenti incompatibili, righe manuali e false esclusioni senza attribuire un vincitore", () => {
    const cases = quoteBenchmarkCases(); const raw = turn(); raw.proposals = [{ ...cases[3].request.lines[0], referenceId: "a6000000-0000-4000-a000-000000000002" }]; raw.message = "Ho escluso la rimozione, esce dal totale.";
    expect(assessQuoteBenchmarkTurn(cases[3], raw).manualRowsNotReproposed).toBe(false);
    expect(assessQuoteBenchmarkTurn(cases[4], raw).noIncompatibleReference).toBe(false);
    expect(assessQuoteBenchmarkTurn(cases[5], raw).noCompletedExclusionClaim).toBe(false);
  });
  it("valida l’audit e non trasforma un costo ignoto in zero", () => {
    const c = quoteBenchmarkCases()[0]; const result: QuoteChatResult = { version: 1, revision: 1, turnId: c.request.turnId, model: QUOTE_BENCHMARK_MODELS[0], simulated: false, references: [], turn: turn(),
      modelTest: { requestedModel: QUOTE_BENCHMARK_MODELS[0], caseId: c.id, calls: 1, inputTokens: 100, outputTokens: 40, costUsd: null, rawTurns: [turn()] } };
    expect(readQuoteChatResult(result).modelTest?.costUsd).toBeNull();
    for (const patch of [{ calls: 3 }, { costUsd: -1 }, { inputTokens: 1.5 }, { outputTokens: 999999 }, { rawTurns: [turn(), turn(), turn()] }]) expect(() => readQuoteChatResult({ ...result, modelTest: { ...result.modelTest, ...patch } })).toThrow();
  });
});

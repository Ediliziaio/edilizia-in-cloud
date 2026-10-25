/** Synthetic, repeatable cases. No customer data, DB writes or production config. */
import { readQuoteChatTurn, runQuoteChat, type QuoteChatRequest, type QuoteChatReference, type QuoteChatProposal, type QuoteChatTurn, type QuoteChatServices } from "./quoteConversation.ts";
import { updateQuoteRoomDecisions, quoteRoomProposalBlocked } from "./quoteRoomMemory.ts";
import { quoteTurnIsReadOnly } from "./quoteScopeMemory.ts";

export const QUOTE_BENCHMARK_MODELS = ["anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"] as const;
const company = "d2000000-0000-4000-a000-000000000002";
const source = "a6000000-0000-4000-a000-000000000001";
const refId = "a6000000-0000-4000-a000-000000000002";
export const QUOTE_BENCHMARK_REFERENCE: QuoteChatReference = { id: refId, sourceId: source, code: "FIXTURE-GRES-30X30", description: "Fornitura e posa pavimento interno in gres porcellanato smaltato 30×30 cm, spessore 8–10 mm. Esclusi sottofondo e assistenza muraria.", unit: "m²", price: 54.11, sourceName: "CATALOGO SINTETICO DI TEST, NON PREZZARIO REALE" };
const floor: QuoteChatProposal = { id: "camera_floor", title: "Camera · Fornitura e posa pavimento", description: "Specifiche da confermare", unit: "m²", quantity: 19.59, quantityBasis: "Conferma sintetica: 4.61 × 4.25 m", referenceId: null };
const base = (index: number, text: string, memory: string): QuoteChatRequest => ({ version: 1, companyId: company, sessionId: company, turnId: `a6000000-0000-4000-a000-${String(index).padStart(12, "0")}`, revision: 1, sourceId: null,
  messages: [{ role: "user", text }], lines: [], context: { brief: "Caso sintetico. Non scrivere prezzi, IVA, costi o totali.", protectedLineIds: [], includedLineIds: [], currentTitle: "Progetto sintetico", plan: null, roomDecisions: updateQuoteRoomDecisions([], memory).decisions } });
export function quoteBenchmarkCases() {
  const opposite = base(1, "Descrivi le sole lavorazioni richieste, poi chiedi i dati mancanti. Non riproporre opere escluse.", "Soffitto cucina escluso; includi soffitto camera");
  const preserve = base(2, "Prepara le proposte per i due ambienti rispettando la memoria. Non reinterpretare conservazione come nuova posa in sovrapposizione.", "Mantieni pavimento camera; scelgo pavimento cucina in sovrapposizione"); preserve.lines = [floor];
  const hypothetical = base(3, "Forse manterrò il pavimento camera, ma non ho deciso: confronta conservazione e sovrapposizione. Non modificare le voci e non cercare prezzi.", "Soffitto cucina escluso"); hypothetical.lines = [floor]; hypothetical.context!.includedLineIds = [floor.id];
  const manual = base(4, "Dimmi quali dati mancano, senza cambiare la quantità confermata o proporre modifiche alla voce manuale.", "Soffitto escluso"); manual.lines = [floor]; manual.context!.protectedLineIds = [floor.id];
  const catalogue = base(5, "Cerca gres porcellanato smaltato 60×60 cm spessore9mm per pavimento cucina di9.87m². Se il campione contiene soltanto30×30 non associarlo al60×60 e non cambiare la richiesta. La ricerca è un campione, non tutto il prezzario.", "Soffitto cucina escluso"); catalogue.sourceId = source;
  const pending = base(6, "Scelgo un pavimento nuovo in sovrapposizione in camera. Proponi di escludere la rimozione esistente, previa verifica tecnica. Non dichiararla già fuori dal totale: serve ancora il pulsante di conferma.", "Scelgo pavimento camera in sovrapposizione");
  pending.lines = [{ ...floor, id: "camera_removal", title: "Camera · Rimozione pavimento esistente" }, floor]; pending.context!.includedLineIds = pending.lines.map(l => l.id);
  return [
    { id: "opposite_room_decisions", request: opposite }, { id: "preserve_vs_overlay", request: preserve },
    { id: "hypothesis_no_changes", request: hypothetical }, { id: "protected_manual_row", request: manual },
    { id: "incompatible_catalogue_size", request: catalogue }, { id: "pending_monetary_exclusion", request: pending },
  ];
}
export type QuoteBenchmarkCase = ReturnType<typeof quoteBenchmarkCases>[number];
export type QuoteBenchmarkComplete = QuoteChatServices["complete"];
export function assessQuoteBenchmarkTurn(c: QuoteBenchmarkCase, turn: QuoteChatTurn) {
  const facts = c.request.context?.roomDecisions ?? [];
  const ids = new Set(c.request.lines.map(l => l.id));
  return {
    respectsRoomMemory: !turn.proposals.some(p => quoteRoomProposalBlocked(p, facts, c.request.lines.find(l => l.id === p.id))),
    hypothesisNoActions: !quoteTurnIsReadOnly(c.request.messages.at(-1)!.text) || !turn.proposals.length && !(turn.excludeIds?.length) && !turn.searches.length,
    manualRowsNotReproposed: !turn.proposals.some(p => c.request.context?.protectedLineIds.includes(p.id)),
    existingExclusionIdsOnly: !(turn.excludeIds ?? []).some(id => !ids.has(id)),
    noIncompatibleReference: c.id !== "incompatible_catalogue_size" || !turn.proposals.some(p => p.referenceId != null),
    noCompletedExclusionClaim: !/\b(?:esce|escono) dal totale|\bho (?:escluso|rimosso)|\brimozione (?:[eè] )?(?:già )?esclusa/i.test(turn.message),
  };
}
export async function runQuoteBenchmarkCase(c: QuoteBenchmarkCase, complete: QuoteBenchmarkComplete) {
  const rawTurns: QuoteChatTurn[] = [];
  const result = await runQuoteChat(c.request, { complete, decode: text => { const turn = readQuoteChatTurn(JSON.parse(text)); rawTurns.push(turn); return turn; },
    search: () => Promise.resolve([QUOTE_BENCHMARK_REFERENCE]), sourceLabel: QUOTE_BENCHMARK_REFERENCE.sourceName });
  return { caseId: c.id, model: result.model, rawChecks: rawTurns.map(t => assessQuoteBenchmarkTurn(c, t)), guardedChecks: assessQuoteBenchmarkTurn(c, result.turn), finalTurn: result.turn,
    note: "Controlli strutturali parziali; le spiegazioni tecniche richiedono valutazione umana. Il catalogo è una fixture, non retrieval del database regionale." };
}

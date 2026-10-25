import { describe, expect, it, vi } from "vitest";
import { AiTurnControl } from "../../../supabase/functions/_shared/aiTurnControl";
import { updateQuoteScopeFacts, quoteTurnIsReadOnly, quoteScopeQuestions, readQuoteScopeFacts } from "../../../supabase/functions/_shared/quoteScopeMemory";
import { runQuoteChat, type QuoteChatRequest, type QuoteChatTurn } from "../../../supabase/functions/_shared/quoteConversation";
import { applyChatResult, emptyChatDocument } from "@/lib/preventivi/quoteChatDocument";
import { readLocalQuoteSnapshot } from "@/lib/preventivi/localQuoteMemory";
import { localSnapshot } from "./localPlanFixtures";
const id = "d2000000-0000-4000-a000-000000000002";
const source = "9b9bb854-9317-43b0-bab1-d3b706bc4993";
const refId = "a2000000-0000-4000-a000-000000000002";
const ref = { id: refId, sourceId: source, code: "COD-TEST", description: "Pavimentazione interna", unit: "m²", price: 54.11, sourceName: "Fonte test" };
const row = { id: "floor", title: "Pavimento", description: "Pavimentazione interna", unit: "m²", quantity: 9.87, quantityBasis: "Conferma utente", referenceId: refId };
const turn: QuoteChatTurn = { version: 1, title: "Titolo non richiesto", message: "Rispondo alla domanda", questions: [], proposals: [], warnings: [], searches: [], excludeIds: [] };
const request = (latest = "Quali dati mancano?"): QuoteChatRequest => ({ version: 1, companyId: id, sessionId: id, turnId: id, revision: 0, sourceId: source, lines: [row], messages: [{ role: "user", text: latest }], context: { brief: "", protectedLineIds: [], plan: null, currentTitle: "Titolo mio", includedLineIds: [] } });
describe("Affidabilità e memoria della chat preventivi", () => {
  it("una domanda con riferimento già presente usa DB ma UNA sola chiamata AI", async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify(turn), model: "stub" });
    const search = vi.fn().mockResolvedValue([ref]);
    const r = await runQuoteChat(request(), { complete, search, decode: JSON.parse });
    expect(complete).toHaveBeenCalledTimes(1); expect(search).toHaveBeenCalledExactlyOnceWith(source, [], [refId], []);
    expect(r.turn.title).toBe("Titolo mio"); expect(complete.mock.calls[0][2].json_schema.schema.properties.proposals.items.properties.referenceId).not.toEqual({ type: "null" });
  });
  it("ricerca nuova: seconda chiamata solo quando richiesta, sempre su fonte verificata", async () => {
    const complete = vi.fn().mockResolvedValueOnce({ content: JSON.stringify({ ...turn, searches: ["pavimento"] }), model: "stub" }).mockResolvedValueOnce({ content: JSON.stringify(turn), model: "stub" });
    const search = vi.fn().mockResolvedValue([ref]); await runQuoteChat(request(), { complete, search, decode: JSON.parse });
    expect(complete).toHaveBeenCalledTimes(2); expect(search).toHaveBeenCalledTimes(2);
  });
  it("ipotesi non confermata: scarta proposte, ricerche e azioni di esclusione anche se il modello insiste", async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify({ ...turn, brief: "Pavimento ormai confermato come mantenuto", proposals: [{ ...row, quantity: 100 }], searches: ["pavimento"], excludeIds: ["floor"] }), model: "stub" });
    const search = vi.fn().mockResolvedValue([ref]);
    const r = await runQuoteChat(request("Forse mantengo il pavimento ma non ho deciso, non è una conferma"), { complete, search, decode: JSON.parse });
    expect(complete).toHaveBeenCalledTimes(1); expect(search).toHaveBeenCalledTimes(1); expect(r.turn.proposals).toEqual([]); expect(r.turn.excludeIds).toEqual([]);
    expect(r.turn.brief).toBe("");
  });
  it("non ripropone l’esclusione di una voce già fuori dal totale", async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify({ ...turn, excludeIds: ["floor"] }), model: "stub" });
    const r = await runQuoteChat(request(), { complete, search: vi.fn().mockResolvedValue([ref]), decode: JSON.parse }); expect(r.turn.excludeIds).toEqual([]);
  });
  it("permette una ricerca di sola lettura ma non modifiche o esclusioni", async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify({ ...turn, searches: ["pavimento"], proposals: [row] }), model: "stub" });
    const search = vi.fn().mockResolvedValue([ref]);
    const r = await runQuoteChat(request("Non modificare le voci, cerca nel prezzario la specifica originale"), { complete, search, decode: JSON.parse });
    expect(search).toHaveBeenCalledTimes(2); expect(complete).toHaveBeenCalledTimes(2); expect(r.turn.proposals).toEqual([]);
  });
  it("non cerca quando l’utente dice esplicitamente di non farlo, anche se il modello insiste", async () => {
    const complete = vi.fn().mockResolvedValue({ content: JSON.stringify({ ...turn, searches: ["pavimento"] }), model: "stub" });
    await runQuoteChat(request("Aggiorna solo la quantità. Non cercare prezzi ora"), { complete, search: vi.fn().mockResolvedValue([ref]), decode: JSON.parse });
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it("l’editor conserva il titolo iniziale, anche con un backend non conforme", () => {
    const raw = { version: 1, turnId: id, revision: 0, model: "stub", simulated: false, references: [] as Array<typeof ref>, turn };
    expect(applyChatResult({ ...emptyChatDocument(), title: "Titolo mio" }, raw, id, null).document.title).toBe("Titolo mio");
    expect(applyChatResult(emptyChatDocument(), raw, id, null).document.title).toBe(turn.title);
  });
  it("memorizza liste di esclusioni utente e le mantiene senza il riepilogo del modello", () => {
    const facts = updateQuoteScopeFacts([], "Impianti, soffitto, bagno e terrazzi esclusi. Serramenti mantenuti.");
    expect(facts).toHaveLength(5); expect(facts.find(f => f.topic === "soffitto")?.state).toBe("excluded");
    expect(updateQuoteScopeFacts(facts, "Ora quali dati mancano?")).toEqual(facts);
    const s = localSnapshot(); s.scopeFacts = facts; s.brief = "Riepilogo modello incompleto";
    expect(readLocalQuoteSnapshot(s).scopeFacts).toEqual(facts);
  });
  it("una domanda ipotetica non cancella una precedente esclusione; la riapertura esplicita sì", () => {
    const facts = updateQuoteScopeFacts([], "Soffitto escluso.");
    expect(updateQuoteScopeFacts(facts, "Forse includiamo il soffitto, non ho deciso")).toEqual(facts);
    expect(updateQuoteScopeFacts(facts, "Ora includi il soffitto")[0].state).toBe("included");
    expect(updateQuoteScopeFacts(facts, "Terrazzi esclusi, ma includi il soffitto").find(f => f.topic === "terrazzi")?.state).toBe("excluded");
  });
  it("non interpreta negazione e ipotesi come nuove esclusioni", () => {
    expect(updateQuoteScopeFacts([], "Il soffitto non è escluso")).toEqual([]);
    expect(updateQuoteScopeFacts([], "Forse terrazzi esclusi")).toEqual([]);
    expect(updateQuoteScopeFacts([], "Non ho ancora deciso se includiamo il soffitto")).toEqual([]);
    expect(quoteTurnIsReadOnly("Aggiorna la quantità della cucina, non cambiare i prezzi manuali")).toBe(false);
  });
  it("filtra le domande sui lavori esclusi, non un riferimento geometrico al soffitto", () => {
    const facts = updateQuoteScopeFacts([], "Soffitto escluso.");
    expect(quoteScopeQuestions(["Vuoi tinteggiare il soffitto?", "Qual è l’altezza dal pavimento al soffitto?", "Larghezza totale di porte e finestre?"], facts, "Completa la tinteggiatura pareti")).toEqual(["Qual è l’altezza dal pavimento al soffitto?", "Quali sono larghezza e altezza di ciascuna porta e finestra da detrarre, oppure la loro superficie complessiva in m²?"]);
  });
  it("rifiuta memoria non valida o eccessiva", () => {
    expect(() => readQuoteScopeFacts([{ topic: "soffitto", state: "excluded", evidence: "x".repeat(601) }])).toThrow();
    expect(() => readQuoteScopeFacts([{ topic: "soffitto", state: "invented", evidence: "x" }])).toThrow();
  });
  it("timeout opt-in limitato al laboratorio, senza cambiare default o superare la scadenza globale", () => {
    let now = 0;
    const standard = new AiTurnControl({}, () => now); expect(standard.attemptTimeoutMs(30_000)).toBe(30_000);
    const demo = new AiTurnControl({ durationMs: 80_000, providerTimeoutMs: 45_000 }, () => now); expect(demo.attemptTimeoutMs(30_000)).toBe(45_000);
    now = 70_000; expect(demo.attemptTimeoutMs(30_000)).toBe(10_000);
    expect(() => new AiTurnControl({ providerTimeoutMs: 60_001 })).toThrow();
  });
});

import { describe, expect, it, vi } from "vitest";
import { attachChatReference, applyChatResult, chatLineIssue, chatQuoteItems, patchChatLine, type ChatLine, type ChatDocument } from "@/lib/preventivi/quoteChatDocument";
import { quoteLineOverlaps, replaceQuoteLine, sameQuoteLineIdentity } from "@/lib/preventivi/quoteLineDuplicates";
import { quoteConfirmedWorkReply, updateQuoteRoomDecisions, quoteRoomProposalBlocked, refreshQuoteRoomDecisions } from "../../../supabase/functions/_shared/quoteRoomMemory";
import { explicitCatalogueCodes } from "../../../supabase/functions/_shared/quoteCatalogue";
import { runQuoteChat, type QuoteChatRequest, type QuoteChatProposal, type QuoteChatResult } from "../../../supabase/functions/_shared/quoteConversation";
import { readLocalQuoteSnapshot } from "@/lib/preventivi/localQuoteMemory";
import { buildQuoteChatContext } from "@/lib/preventivi/quoteChatContext";
import { localSnapshot } from "./localPlanFixtures";
const source = "9b9bb854-9317-43b0-bab1-d3b706bc4993";
const code = "LOM252.OC.EEA.Pa02.C1206.L0005.0220.-";
const row = (id: string, title: string): ChatLine => { const p: QuoteChatProposal = { id, title, description: "Da verificare", unit: "cad", quantity: 1, quantityBasis: "Confermato nel test", referenceId: null }; return { ...p, price: 10, included: false, manual: false, reference: null, original: p }; };
const doc = (): ChatDocument => ({ revision: 5, title: "Prova bagno", lines: [row("generic", "Bagno · Sanitari"), row("wc", "Bagno · WC"), row("bidet", "Bagno · Bidet"), row("wash", "Bagno · Lavabo")] });
describe("Doppioni e sostituzioni controllate", () => {
  it('non elimina manodopera di montaggio distinta da forniture pure; avvisa ancora sui pacchetti comprensivi', () => {
    const d = doc(); d.lines[0].title = 'Montaggio e collegamento sanitari'; d.lines[0].description = 'Manodopera per quattro apparecchi; esclude fornitura tubazioni.';
    d.lines.slice(1).forEach(r => { r.title = `Fornitura ${r.title}`; r.description = 'Solo apparecchio in ceramica'; });
    expect(quoteLineOverlaps(d)).toHaveLength(0);
    d.lines[1].description = 'Fornitura con posa compresa'; expect(quoteLineOverlaps(d)).toHaveLength(1);
    d.lines[1].description = 'Solo apparecchio in ceramica'; d.lines[0].description = 'Montaggio con fornitura sanitari compresa'; expect(quoteLineOverlaps(d)).toHaveLength(1);
  });
  it("non confonde metri e metri quadri; segnala stesso titolo con contenuti diversi senza fonderli", () => {
    const a = { ...row("a", "Pavimento cucina"), unit: "m²" }, b = { ...row("b", "Pavimento cucina"), unit: "m" };
    expect(sameQuoteLineIdentity(a, b)).toBe(false);
    b.unit = "m²"; b.description = "Specifica diversa da verificare";
    expect(sameQuoteLineIdentity(a, b)).toBe(false);
    expect(quoteLineOverlaps({ revision: 0, title: "", lines: [a, b] })).toHaveLength(1);
  });
  it("riconosce generico/dettagli, impedisce somma e sostituisce solo su revisione esatta", () => {
    const d = doc(); const group = quoteLineOverlaps(d)[0]; expect(group.childIds).toHaveLength(3);
    expect(patchChatLine(d, "generic", { included: true }).lines[0].included).toBe(false);
    expect(() => replaceQuoteLine(d, "generic", group.childIds, 4)).toThrow("superata");
    const next = replaceQuoteLine(d, "generic", group.childIds, 5);
    expect(next.lines).toHaveLength(4); expect(next.lines[0].original).toEqual(d.lines[0].original);
    expect(chatLineIssue(next.lines[0])).toContain("storico"); expect(quoteLineOverlaps(next)).toHaveLength(0);
    expect(patchChatLine(next, "generic", { included: true }).lines[0].included).toBe(false);
    expect(chatQuoteItems(patchChatLine(next, "wc", { included: true }))).toHaveLength(1);
    const snapshot = localSnapshot(); snapshot.document = next;
    expect(readLocalQuoteSnapshot(snapshot).document.lines[0].supersededBy).toEqual(["wc", "bidet", "wash"]);
  });
  it("non sovrappone stanze diverse o demolizioni con nuovi apparecchi", () => {
    const d = doc(); d.lines[0].title = "Bagno 1 · Sanitari"; d.lines.slice(1).forEach(r => r.title = `Bagno 2 · ${r.title}`);
    expect(quoteLineOverlaps(d)).toHaveLength(0);
    d.lines[0].title = "Rimozione sanitari"; expect(quoteLineOverlaps(d)).toHaveLength(0);
  });
  it("un nuovo ID per lo stesso titolo riusa la riga; manuali e storico non vengono sovrascritti", () => {
    const d = doc(); d.lines = [row("old", "Bagno · WC")];
    const result: QuoteChatResult = { version: 1, turnId: "a2000000-0000-4000-a000-000000000001", revision: 5, simulated: false, model: "test", references: [], turn: { version: 1, title: "", message: "Proposta", questions: [], warnings: [], searches: [], proposals: [{ ...d.lines[0].original, id: "new" }] } };
    const applied = applyChatResult(d, result, result.turnId, null); expect(applied.document.lines).toHaveLength(1); expect(applied.document.lines[0].id).toBe("old");
    d.lines[0].manual = true; expect(applyChatResult(d, result, result.turnId, null).document.lines[0]).toEqual(d.lines[0]);
  });
});
describe("Memoria per singola lavorazione", () => {
  it("non interpreta una negazione o il mantenimento delle posizioni come conservazione degli impianti", () => {
    const evidence = "Correzione importante: sono invariate SOLO le posizioni, non voglio conservare gli impianti vecchi";
    expect(updateQuoteRoomDecisions([], evidence).decisions).toHaveLength(0);
    expect(refreshQuoteRoomDecisions([{ room: "*", work: "impianti", state: "preserved", evidence }])).toHaveLength(0);
    expect(updateQuoteRoomDecisions([], "Impianti da rifare mantenendo soltanto le posizioni, non conservare gli impianti vecchi").decisions).toContainEqual(expect.objectContaining({ work: "impianti", state: "included" }));
    const specific = updateQuoteRoomDecisions([], "Rifai impianti bagno, cioè sostituisci idrico, scarichi ed elettrico").decisions;
    expect(specific).toEqual(expect.arrayContaining([expect.objectContaining({ room: 'bagno', work: 'impianto_idrico', state: 'included' }), expect.objectContaining({ room: 'bagno', work: 'impianto_elettrico', state: 'included' })]));
    expect(specific).not.toContainEqual(expect.objectContaining({ work: 'impianti' }));
  });
  it("registra soffitto aperto e pavimento richiesto, senza trasferirli alla cucina", () => {
    const text = "Rifai pavimento soggiorno 22 m²; non ho ancora deciso il soffitto soggiorno; impianti esclusi.";
    const memory = updateQuoteRoomDecisions([], text).decisions;
    expect(memory).toContainEqual(expect.objectContaining({ room: "soggiorno", work: "pavimento", state: "included" }));
    expect(memory).toContainEqual(expect.objectContaining({ room: "soggiorno", work: "soffitto", state: "undecided" }));
    expect(quoteRoomProposalBlocked(row("ceiling", "Soggiorno · Soffitto"), memory)).toBe(true);
    expect(quoteRoomProposalBlocked(row("floor", "Soggiorno · Pavimento"), memory)).toBe(false);
    const reply = quoteConfirmedWorkReply(text)!; expect(reply).toContain("Rifai pavimento soggiorno"); expect(reply).not.toContain("non ho ancora deciso");
    const context = buildQuoteChatContext(doc(), "", null, [], null, null, [], memory);
    expect(context.roomDecisions?.some(d => d.state === "undecided")).toBe(false); expect(context.brief).toContain("undecided");
  });
  it("non lascia negare nella descrizione una demolizione richiesta e non confonde il computo separato", () => {
    const memory = updateQuoteRoomDecisions([], "Rifai pavimento soggiorno con rimozione del vecchio").decisions;
    const p = { ...row("floor", "Pavimento soggiorno"), description: "Posa su letto di malta senza rimozione del pavimento esistente" };
    expect(quoteRoomProposalBlocked(p, memory)).toBe(true);
    expect(quoteRoomProposalBlocked({ ...p, description: "Posa su letto di malta; rimozione computata separatamente" }, memory)).toBe(false);
  });
  it("un’ipotesi non annulla una decisione già confermata e una spiegazione non registra nuove scelte", () => {
    const first = updateQuoteRoomDecisions([], "Soffitto cucina escluso").decisions;
    expect(updateQuoteRoomDecisions(first, "Forse rifai soffitto cucina").decisions).toEqual(first);
    expect(updateQuoteRoomDecisions([], "Solo spiegazione: rifai pavimento soggiorno").decisions).toHaveLength(0);
    expect(quoteConfirmedWorkReply("Forse rifai pavimento soggiorno")).toBeNull();
  });
});
describe("Codici del catalogo espliciti", () => {
  it("estrae il codice letterale e il server locale lo cerca prima dell’LLM, anche con searches vuoto", async () => {
    expect(explicitCatalogueCodes(`Cerca codice ${code}, non inventarlo.`)).toEqual([code]);
    const request: QuoteChatRequest = { version: 1, companyId: "d2000000-0000-4000-a000-000000000002", sessionId: "a2000000-0000-4000-a000-000000000001", turnId: "a2000000-0000-4000-a000-000000000002", revision: 0, sourceId: source, messages: [{ role: "user", text: `Cerca codice ${code}` }], lines: [] };
    const ref = { id: "a2000000-0000-4000-a000-000000000003", sourceId: source, code, description: "Fonte test", price: 54.11, unit: "m²", sourceName: "Lombardia test" };
    const search = vi.fn().mockResolvedValue([ref]);
    const complete = vi.fn().mockImplementation(async messages => { expect(messages[1].content).toContain(code); return { content: JSON.stringify({ version: 1, title: "", message: "Riferimento ricevuto", proposals: [], searches: [], warnings: [], questions: [] }), model: "test" }; });
    const r = await runQuoteChat(request, { search, complete, decode: JSON.parse });
    expect(search).toHaveBeenCalledWith(source, [code], [], []); expect(complete).toHaveBeenCalledOnce(); expect(r.references).toEqual([ref]);
    request.messages[0].text = `Non cercare ${code}`; await runQuoteChat(request, { search: vi.fn().mockRejectedValue("non deve cercare"), complete: vi.fn().mockResolvedValue({ content: JSON.stringify({ version: 1, title: "", message: "Nessuna ricerca", proposals: [], searches: [], warnings: [], questions: [] }), model: "test" }), decode: JSON.parse });
  });
  it("collega un riferimento senza includerlo o sovrascrivere un prezzo manuale, rifiuta unità diverse", () => {
    const d = doc(); d.lines = [{ ...row("floor", "Pavimento interno"), unit: "m²", price: 77, manual: true }];
    const ref = { id: "a2000000-0000-4000-a000-000000000003", sourceId: source, code, description: "Pavimento interno", price: 54.11, unit: "m²", sourceName: "Lombardia test" };
    const next = attachChatReference(d, 0, ref, 5); expect(next.lines[0].price).toBe(77); expect(next.lines[0].reference?.price).toBe(54.11); expect(next.lines[0].included).toBe(false);
    expect(() => attachChatReference(d, 0, { ...ref, unit: "kg" }, 5)).toThrow("unità"); expect(() => attachChatReference(d, 0, ref, 4)).toThrow("superato");
  });
});

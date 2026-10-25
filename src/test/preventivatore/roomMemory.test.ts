import { describe, expect, it, vi } from "vitest";
import { readQuoteRoomDecisions, refreshQuoteRoomDecisions, updateQuoteRoomDecisions, quoteRoomDecisionFor, quoteRoomProposalBlocked, quoteRoomQuestions, roomDecisionsFromLegacy, quoteRoomBrief, type QuoteRoomDecision } from "../../../supabase/functions/_shared/quoteRoomMemory";
import { readQuoteChatContext, runQuoteChat, type QuoteChatRequest, type QuoteChatProposal } from "../../../supabase/functions/_shared/quoteConversation";
import { localSnapshot } from "./localPlanFixtures";
import { readLocalQuoteSnapshot } from "@/lib/preventivi/localQuoteMemory";
import { buildQuoteChatContext, quoteChatHistory } from "@/lib/preventivi/quoteChatContext";
import { applyChatResult, patchChatLine } from "@/lib/preventivi/quoteChatDocument";
import { coherentQuoteReply, quoteActionReceipt } from "@/lib/preventivi/quoteActionReceipt";
const decisions = (text: string, previous: QuoteRoomDecision[] = []) => updateQuoteRoomDecisions(previous, text).decisions;
const row = (title: string): QuoteChatProposal => ({ id: "row", title, description: "Da verificare", quantity: null, unit: "m²", quantityBasis: "Da rilevare", referenceId: null });
const id = "d2000000-0000-4000-a000-000000000002";
describe("Memoria utente per ambiente e lavorazione", () => {
  it("soffitto cucina escluso e camera richiesta sono due fatti indipendenti", () => {
    const facts = decisions("Soffitto cucina escluso; includi soffitto camera.");
    expect(facts).toHaveLength(2);
    expect(quoteRoomDecisionFor(facts, "cucina", "soffitto")?.state).toBe("excluded");
    expect(quoteRoomDecisionFor(facts, "camera", "soffitto")?.state).toBe("included");
    expect(updateQuoteRoomDecisions([], "Soffitto cucina escluso").globalText).toBe("");
  });
  it("una riapertura specifica non annulla il divieto generale per gli altri ambienti", () => {
    const facts = decisions("Includi soffitto camera", decisions("Soffitto escluso"));
    expect(quoteRoomProposalBlocked(row("Tinteggiatura soffitto cucina"), facts)).toBe(true);
    expect(quoteRoomProposalBlocked(row("Tinteggiatura soffitto camera"), facts)).toBe(false);
    expect(quoteRoomQuestions(["Vuoi tinteggiare il soffitto cucina?", "Vuoi tinteggiare il soffitto camera?", "Qual è l’altezza dal pavimento al soffitto cucina?"], facts)).toEqual(["Vuoi tinteggiare il soffitto camera?", "Qual è l’altezza dal pavimento al soffitto cucina?"]);
  });
  it("conservare il pavimento camera non significa sovrapposizione o decisione per cucina", () => {
    const facts = decisions("Mantieni pavimento camera; scelgo pavimento cucina in sovrapposizione");
    expect(quoteRoomDecisionFor(facts, "camera", "pavimento")).toMatchObject({ state: "preserved", detail: "conservazione" });
    expect(quoteRoomDecisionFor(facts, "cucina", "pavimento")).toMatchObject({ state: "included", detail: "sovrapposizione" });
    expect(quoteRoomProposalBlocked(row("Camera · Fornitura e posa pavimento"), facts)).toBe(true);
    expect(quoteRoomProposalBlocked(row("Camera · Tinteggiatura pareti"), facts)).toBe(false);
    expect(quoteRoomProposalBlocked(row("Cucina · Fornitura e posa pavimento"), facts)).toBe(false);
  });
  it("le finiture restano associate all’ambiente e non generano misure", () => {
    const facts = decisions("Scelgo tinteggiatura pareti cucina lavabile opaca; scelgo tinteggiatura pareti camera satinata");
    expect(facts.map(f => [f.room, f.detail])).toEqual([["cucina", "opaca"], ["camera", "satinata"]]);
    expect(facts.every(f => !("quantity" in f))).toBe(true);
  });
  it("non usa la misura successiva come numero della stanza", () => {
    expect(decisions("Scelgo tinteggiatura pareti cucina 34,44 m² lavabile opaca")[0].room).toBe("cucina");
    expect(decisions("Scelgo pavimento camera 19.59 mq")[0].room).toBe("camera");
    expect(decisions("Includi pavimento camera 1")[0].room).toBe("camera 1");
  });
  it.each(["Camera e pavimento cucina invariati", "camera e altre quantità restano invariati", "Mantieni prezzo pavimento camera"])("non scambia invariance contabile per conservazione fisica: %s", text => {
    expect(decisions(text)).toEqual([]);
  });
  it("corregge l’evidenza delle vecchie simulazioni senza toccare quantità o valori", () => {
    const old: QuoteRoomDecision[] = [{ room: "cucina 34", work: "tinteggiatura", state: "included", detail: "opaca", evidence: "Scelgo tinteggiatura pareti cucina 34,44 m² lavabile opaca" }, { room: "cucina", work: "pavimento", state: "preserved", evidence: "Camera e pavimento cucina invariati" }];
    expect(refreshQuoteRoomDecisions(old)).toEqual([{ ...old[0], room: "cucina" }]);
  });
  it("posizioni impianti invariate non è una conservazione né un fatto legacy globale", () => {
    const next = updateQuoteRoomDecisions([], "Posizioni impianti invariate. Soffitto escluso.");
    expect(next.decisions.map(d => d.work)).toEqual(["soffitto"]); expect(next.globalText).not.toContain("Posizioni");
    const context = buildQuoteChatContext(localSnapshot().document, "", null, [], null, null, [{ topic: "impianti", state: "preserved", evidence: "posizioni impianti invariate" }], next.decisions);
    expect(context.scopeFacts).toEqual([]);
  });
  it("una lista bagno, serramenti e impianti esclusi non limita il divieto al solo bagno", () => {
    const next = decisions("Bagno, serramenti e impianti sono esclusi");
    expect(quoteRoomDecisionFor(next, "cucina", "impianti")?.state).toBe("excluded");
    expect(quoteRoomDecisionFor(next, "camera", "serramenti")?.state).toBe("excluded");
    expect(quoteRoomProposalBlocked(row("Bagno · Sostituzione sanitari"), next)).toBe(true);
  });
  it("escludere un bidet non esclude automaticamente tutto il bagno", () => {
    const next = updateQuoteRoomDecisions([], "Escludi bidet bagno");
    expect(next.decisions).toEqual([]); expect(next.notices[0]).toContain("non estendo");
    expect(decisions("Bagno escluso")[0]).toMatchObject({ room: "bagno", work: "ambito", state: "excluded" });
  });
  it("la lista generale storica non viene attribuita solo al bagno o ai terrazzi", () => {
    const facts = decisions("Impianti, soffitto, bagno e terrazzi esclusi");
    expect(facts).toHaveLength(4);
    expect(quoteRoomDecisionFor(facts, "cucina", "soffitto")?.state).toBe("excluded");
    expect(quoteRoomDecisionFor(facts, "bagno", "pavimento")?.state).toBe("excluded");
  });
  it.each(["Forse includi soffitto cucina, non ho deciso", "Solo spiegazione: includi soffitto cucina", "Non modificare le voci. Rifai pavimento camera", "Il soffitto cucina non è escluso"])("non promuove ipotesi, sola lettura o negazione: %s", text => {
    const old = decisions("Soffitto cucina escluso"); expect(decisions(text, old)).toEqual(old);
  });
  it("non risolve un pronome trasferendo l’ultima scelta", () => {
    const old = decisions("Mantieni pavimento camera");
    const next = updateQuoteRoomDecisions(old, "Rifai anche qui il pavimento");
    expect(next.decisions).toEqual(old); expect(next.notices[0]).toContain("Specifica l’ambiente");
  });
  it("chiede quale camera se i nomi conosciuti sono ambigui", () => {
    const next = updateQuoteRoomDecisions([], "Mantieni pavimento camera", ["camera 1", "camera 2"]);
    expect(next.decisions).toEqual([]); expect(next.notices[0]).toContain("più ambienti");
  });
  it("non applica azioni diverse a tutte le stanze della stessa frase", () => {
    const next = updateQuoteRoomDecisions([], "Rifai pavimento cucina e mantieni pavimento camera");
    expect(next.decisions).toEqual([]); expect(next.notices).not.toHaveLength(0);
  });
  it.each(["Includi soffitto cucina e pavimento camera", "Soffitto cucina escluso e soffitto camera incluso", "Non mantenere pavimento camera"])("frase incrociata o negata non produce conservazioni errate: %s", text => {
    expect(decisions(text)).toEqual([]);
  });
  it("corregge solo la chiave ambiente/lavorazione interessata", () => {
    const old = decisions("Soffitto cucina escluso; soffitto camera escluso");
    const next = decisions("Ora includi soffitto cucina", old);
    expect(next).toHaveLength(2); expect(quoteRoomDecisionFor(next, "camera", "soffitto")?.state).toBe("excluded");
    expect(quoteRoomDecisionFor(next, "cucina", "soffitto")?.state).toBe("included");
  });
  it("migra le vecchie decisioni senza duplicare infissi/serramenti", () => {
    expect(roomDecisionsFromLegacy([{ topic: "infissi", state: "preserved", evidence: "Infissi mantenuti" }, { topic: "serramenti", state: "preserved", evidence: "Serramenti mantenuti" }])).toHaveLength(1);
  });
  it("salva fatti, riscontro e revisione azioni; accetta ancora gli snapshot precedenti", () => {
    const old = localSnapshot(); expect(readLocalQuoteSnapshot(old).roomDecisions).toBeUndefined();
    old.roomDecisions = decisions("Soffitto cucina escluso; includi soffitto camera");
    old.messages.push({ role: "assistant", text: "Proposta", receipt: "Nessuna esclusione applicata", actionRevision: 4 });
    expect(readLocalQuoteSnapshot(old).roomDecisions).toEqual(old.roomDecisions);
    expect(readLocalQuoteSnapshot(old).messages.at(-1)).toMatchObject({ receipt: "Nessuna esclusione applicata", actionRevision: 4 });
  });
  it("il vecchio endpoint riceve le decisioni nel brief senza perdere eccezioni", () => {
    const snapshot = localSnapshot(); const facts = decisions("Soffitto escluso; includi soffitto camera");
    const context = buildQuoteChatContext(snapshot.document, "Riepilogo inesatto: soffitti tutti esclusi", null, [], null, null, [{ topic: "soffitto", state: "excluded", evidence: "Soffitto escluso" }], facts);
    expect(context.scopeFacts).toEqual([]); expect(context.brief).toContain('["camera","soffitto","included"');
    expect(context.brief).toContain('["*","soffitto","excluded"'); expect(readQuoteChatContext(context).roomDecisions).toEqual(facts);
  });
  it("rifiuta duplicati, stati/modelli inventati, HTML e memoria oltre il limite", () => {
    const fact = decisions("Soffitto cucina escluso")[0];
    for (const raw of [[fact, fact], [{ ...fact, room: "<script>" }], [{ ...fact, state: "approved" }], [{ ...fact, detail: "prezzo 1000" }], Array.from({ length: 33 }, (_, n) => ({ ...fact, room: `camera ${n}` }))]) expect(() => readQuoteRoomDecisions(raw)).toThrow();
  });
  it("non tronca silenziosamente i fatti se il brief legacy è troppo piccolo", () => {
    const facts: QuoteRoomDecision[] = Array.from({ length: 32 }, (_, n) => ({ room: `camera ${n} ${"x".repeat(60)}`, work: "soffitto", state: "excluded", evidence: "Esplicito" }));
    expect(() => quoteRoomBrief("riepilogo", facts)).toThrow("troppo ampia");
  });
  it("anche il motore server scarta proposte su opere escluse per ambiente", async () => {
    const turn = { version: 1, title: "", message: "Propongo il soffitto", questions: ["Vuoi tinteggiare il soffitto cucina?"], warnings: [] as string[], searches: [] as string[], proposals: [row("Tinteggiatura soffitto cucina")] };
    const request: QuoteChatRequest = { version: 1, companyId: id, sessionId: id, turnId: id, revision: 0, sourceId: null, lines: [], messages: [{ role: "user", text: "Prosegui con la camera" }], context: { brief: "", plan: null, protectedLineIds: [], roomDecisions: decisions("Soffitto cucina escluso") } };
    const result = await runQuoteChat(request, { complete: vi.fn().mockResolvedValue({ content: JSON.stringify(turn), model: "stub" }), search: vi.fn(), decode: JSON.parse });
    expect(result.turn.proposals).toEqual([]); expect(result.turn.questions).toEqual([]); expect(result.turn.warnings[0]).toContain("memoria per ambiente");
  });
});
describe("Riscontro delle azioni effettive, separato dalla prosa AI", () => {
  it("non ripete una esclusione falsamente dichiarata già applicata", () => {
    expect(coherentQuoteReply("La rimozione esce dal totale; la posa resta.")).not.toContain("esce dal totale");
    expect(coherentQuoteReply("Ho escluso la rimozione.")).not.toContain("Ho escluso");
    expect(coherentQuoteReply("Ho creato tre voci distinte per i serramenti")).not.toContain("Ho creato");
    expect(coherentQuoteReply("✓ Rimozione pavimento: esclusa (non demolire)")).not.toContain("esclusa");
    expect(coherentQuoteReply("✓ Pavimento: fornitura e posa in sovrapposizione confermata")).not.toContain("confermata");
  });
  it("conserva spiegazioni ipotetiche e formule ma non l’asserzione di aggiornamento", () => {
    const text = "Perimetro: (4,61 + 2,14) × 2 = 13,5 m.\n\nSuperficie netta: 37,8 − 3,36 = 34,44 m².\n\nQuantità aggiornata nella voce cucina.";
    expect(coherentQuoteReply(text)).toContain("34,44 m²"); expect(coherentQuoteReply(text)).not.toContain("Quantità aggiornata");
    expect(coherentQuoteReply("Se scegliessi A, escluderesti entrambe le voci.")).toContain("escluderesti");
  });
  it("il riscontro dice che la voce è ancora inclusa fino al comando esplicito", () => {
    const before = localSnapshot().document; before.lines[0].price = 15; before.lines[0].included = true;
    const turn = { version: 1 as const, title: "", message: "", proposals: [] as QuoteChatProposal[], questions: [] as string[], warnings: [] as string[], searches: [] as string[], excludeIds: [before.lines[0].id] };
    const text = quoteActionReceipt(before, before, turn);
    expect(text).toContain("ancora da confermare"); expect(text).toContain("ancora incluse"); expect(before.lines[0].included).toBe(true);
    expect(text).toContain(`Incluse adesso nel parziale: «${before.lines[0].title}»`);
    const after = patchChatLine(before, before.lines[0].id, { included: false });
    expect(quoteActionReceipt(after, after, turn)).not.toContain("ancora da confermare");
  });
  it("non invia i risultati diagnostici dei benchmark come conversazione del progetto", () => {
    const history = quoteChatHistory([{ role: "user", text: "Soffitto cucina escluso" }, { role: "assistant", text: "Fixture: cucina 60×60", diagnostic: true }, { role: "assistant", text: "Confronto completato: 12/12 turni" }, { role: "assistant", text: "Risposta grezza", benchmarkRaw: [] }], "Quali misure servono?");
    expect(history).toEqual([{ role: "user", text: "Soffitto cucina escluso" }, { role: "user", text: "Quali misure servono?" }]);
  });
  it("non dichiara aggiornate le righe manuali che il software ha protetto", () => {
    const before = localSnapshot().document; before.lines[0].manual = true;
    const turn = { version: 1 as const, title: "", message: "Ho aggiornato", proposals: [{ ...row(before.lines[0].title), id: before.lines[0].id, quantity: 99 }], questions: [] as string[], warnings: [] as string[], searches: [] as string[] };
    const applied = applyChatResult(before, { version: 1, turnId: id, revision: before.revision, model: "stub", simulated: false, references: [], turn }, id, null);
    const receipt = quoteActionReceipt(before, applied.document, turn);
    expect(receipt).toContain("Nessuna modifica"); expect(receipt).toContain("manuali conservate"); expect(applied.document.lines[0].quantity).not.toBe(99);
  });
});

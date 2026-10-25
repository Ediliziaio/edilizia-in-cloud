import { describe, expect, it, vi } from "vitest";
import { assessCatalogueMatch, assessProposedCatalogueMatch, catalogueQueries, catalogueUnit, CATALOGUE_LIMITS, rankCatalogueReferences } from "../../../supabase/functions/_shared/quoteCatalogue";
import { runQuoteChat, type QuoteChatProposal, type QuoteChatReference, type QuoteChatRequest, type QuoteChatTurn } from "../../../supabase/functions/_shared/quoteConversation";
import { applyChatResult, chatReferenceInfo, emptyChatDocument, patchChatLine } from "@/lib/preventivi/quoteChatDocument";
import { normalizzaUnita } from "@/lib/prezzario/confronto";
const source = "9b9bb854-9317-43b0-bab1-d3b706bc4993";
const uid = (n: number) => `a0000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const proposal = (patch: Partial<QuoteChatProposal> = {}): QuoteChatProposal => ({ id: "kitchen_floor", title: "Cucina · Fornitura e posa gres porcellanato smaltato 30×30 cm, spessore 9 mm", description: "Finitura chiara per interno. Sottofondo da verificare, non incluso.", quantity: 9.87, quantityBasis: "Misura confermata nella simulazione", unit: "m²", referenceId: null, ...patch });
// Read-only real catalogue description sampled during diagnosis; not a provider stub price.
const reference = (patch: Partial<QuoteChatReference> = {}): QuoteChatReference => ({ id: uid(1), sourceId: source, code: "LOM252.OC.EEA.Pa02.C1206.L0005.0220.-", description: "OPERA: Strato di pavimentazione, in piastrelle di ceramica gres porcellanato; finitura: smaltato | colore chiaro; impiego: interno; lato x [cm] = 30 | lato y [cm] = 30 | spessore [cm] = 0,8 ÷ 1. Incluso: boiacca di puro cemento. — LAVORO: Posa. Incluso: pulizia finale. Escluso: formazione sottofondo/letto di posa; assistenza muraria. — SPECIFICHE TECNICHE: su letto in malta di legante idraulico.", unit: "m²", price: 54.11, sourceName: "Prezzario Regione Lombardia 2025 (ed. 2)", ...patch });
describe("Ricerca indicizzata e abbinamento tecnico conservativo", () => {
  it.each([
    'OPERA: Strato di isolamento di materiale generico; impiego: a parete | a pavimento. — LAVORO: Rimozione.',
    'OPERA: Griglia di materiale generico; impiego: pavimento. — LAVORO: Rimozione.',
    'OPERA: Pozzetto prefabbricato; impiego: pavimento. — LAVORO: Rimozione.',
    'OPERA: Massetto in malta; impiego: pavimento. — LAVORO: Demolizione.',
  ])('non collega %s alla rimozione di piastrelle solo perché coincide il m²', description => {
    for (const title of ['Rimozione pavimento vecchio', 'Rimozione rivestimenti vecchi']) expect(assessCatalogueMatch(proposal({ title, description: 'Piastrelle esistenti da rimuovere', unit: 'm²' }), reference({ description })).join()).toContain('oggetto diverso');
  });
  it('cerca prima piastrelle e poi il sinonimo ampio, senza perdere i limiti', () => {
    const p = proposal({ title: 'Rimozione pavimento vecchio', description: 'Piastrelle' });
    const queries = catalogueQueries([p.title], [p]); expect(queries[0].text).toBe('rimozione piastrelle or demolizione piastrelle');
    expect(queries.some(q => q.text.includes('rimozione pavimenti'))).toBe(true); expect(queries.length).toBeLessThanOrEqual(6);
  });
  it('un titolo generico non autorizza pavimentazioni da esterno né lo scambio pavimento/parete', () => {
    const floor = proposal({ title: 'Rimozione pavimento vecchio', description: 'Piastrelle da rimuovere' });
    const outdoor = reference({ description: 'OPERA: Strato di pavimentazione in piastrelle di gomma; impiego: esterno | arredo urbano. — LAVORO: Rimozione.' });
    expect(assessCatalogueMatch(floor, outdoor).join()).toContain('esterno non confermato');
    const wall = proposal({ title: 'Rimozione rivestimenti vecchi', description: 'Pareti bagno' });
    expect(assessCatalogueMatch(wall, reference({ description: 'OPERA: Strato di pavimentazione in piastrelle di materiale generico; impiego: interno. — LAVORO: Demolizione.' })).join()).toContain('rivestimento a parete');
  });
  it("conserva il prezzo ufficiale, il testo e l’unità; non ordina per il prezzo più basso", () => {
    const exact = reference(), cheaperWrong = reference({ id: uid(2), code: "A-PRIMO", description: "Pavimento di piscine in gres porcellanato non smaltato 12,5×25 cm spessore 7,8 mm, posa", price: .01 });
    expect(assessCatalogueMatch(proposal(), exact)).toEqual([]);
    const ranked = rankCatalogueReferences([cheaperWrong, exact], [proposal()]);
    expect(ranked[0]).toBe(exact); expect(ranked[0].price).toBe(54.11); expect(ranked[0].description).toBe(exact.description);
  });
  it.each(["mq", "m²", "m2", "metriquadri", "mc", "m³", "ml", "metrolineare", "nr", "pz", "cadauno", "ora", "ton", "litro", "a corpo"])("unità allineata al motore esistente: %s", unit => expect(catalogueUnit(unit)).toBe(normalizzaUnita(unit)));
  it.each([
    { label: "unità mancante", patch: { unit: "" } }, { label: "unità lineare", patch: { unit: "m" } },
    { label: "prezzo mancante", patch: { price: null } }, { label: "formato diverso", patch: { description: reference().description.replace(/= 30/g, "= 15") } },
    { label: "spessore fuori intervallo", patch: { description: reference().description.replace("0,8 ÷ 1", "1,2 ÷ 1,5") } },
    { label: "finitura diversa", patch: { description: reference().description.replace("finitura: smaltato", "finitura: non smaltato") } },
    { label: "finitura non documentata", patch: { description: reference().description.replace("smaltato", "liscio") } },
    { label: "colore diverso", patch: { description: reference().description.replace("colore chiaro", "colore forte") } },
    { label: "materiale senza posa", patch: { code: "LOM252.RM.06.00.00.L0005.0000.-" } },
    { label: "sola posa", patch: { description: reference().description + " Solo posa, esclusa la fornitura." } },
    { label: "impiego piscine", patch: { description: reference().description + " Impiego piscine." } },
    { label: "impiego tattile", patch: { description: reference().description + " Percorsi tattili." } },
    { label: "pavimento galleggiante", patch: { description: reference().description + " Pavimenti sopraelevati galleggianti." } },
    { label: "battiscopa al posto di pavimento", patch: { description: "OPERA: Battiscopa in gres porcellanato smaltato 30×30 cm spessore 9 mm. — LAVORO: Posa." } },
  ])("non valorizza una somiglianza sbagliata: $label", ({ patch }) => expect(assessCatalogueMatch(proposal(), reference(patch))).not.toEqual([]));
  it("range spessore, formato ruotato e millimetri: equivalenze dimensionali, non prezzi derivati", () => {
    expect(assessCatalogueMatch(proposal({ title: "Fornitura e posa gres porcellanato smaltato 300×300 mm spessore 0,9 cm" }), reference())).toEqual([]);
    const r = reference({ description: reference().description.replace("lato y [cm] = 30", "lato y [cm] = 60") });
    expect(assessCatalogueMatch(proposal({ title: "Fornitura e posa gres porcellanato smaltato 60×30 cm spessore 9 mm" }), r)).toEqual([]);
  });
  it("rimozione diversa dalla posa e nessuna sostituzione dell'unità mancante", () => {
    expect(assessCatalogueMatch(proposal({ title: "Rimozione pavimento cucina", description: "", unit: "mq" }), reference()).join()).toContain("rimozione");
    expect(assessCatalogueMatch(proposal(), reference({ unit: "" })).join()).toContain("unità");
  });
  it("non tratta posa su malta e sovrapposizione adesiva come la stessa opera", () => {
    expect(assessCatalogueMatch(proposal({ description: "Posa in sovrapposizione con adesivo" }), reference()).join()).toContain("metodo");
  });
  it("non elimina il formato richiesto per far combaciare il candidato", () => {
    const previous = proposal({ title: proposal().title.replace("30×30", "60×60") });
    expect(assessProposedCatalogueMatch(proposal(), reference(), previous, "Trova la voce giusta").join()).toContain("formato");
    expect(assessProposedCatalogueMatch(proposal(), reference(), previous, "Non confermo il formato 30×30 cm").join()).toContain("formato");
    expect(assessProposedCatalogueMatch(proposal(), reference(), previous, "Confermo per questa simulazione il formato 30×30 cm")).toEqual([]);
  });
  it("un cambio esplicito di formato e metodo non resta bloccato sulla specifica precedente", () => {
    const previous = proposal({ title: proposal().title.replace("30×30", "60×60"), description: "Posa in sovrapposizione su supporto da verificare." });
    const next = proposal({ description: "Posa su letto di malta; supporto da verificare." });
    expect(assessProposedCatalogueMatch(next, reference(), previous, "Confermo 30×30 cm. Per il caso di prova considero la posa su letto di malta.")).toEqual([]);
    expect(assessProposedCatalogueMatch(next, reference(), previous, "Non confermo 30×30 cm. Non considero la posa su letto di malta.").length).toBeGreaterThan(0);
  });
  it("ricerche limitate, senza regione, query arbitrarie o scansione del listino", () => {
    const queries = catalogueQueries(["Fornitura posa gres porcellanato Lombardia", "demolizione pavimenti", "battiscopa"], [proposal()]);
    expect(queries.length).toBeLessThanOrEqual(6); expect(queries.some(q => q.text.includes("-piscine"))).toBe(true);
    expect(queries.some(q => q.text.includes("rimozione pavimenti"))).toBe(true);
    expect(queries.every(q => !/lombardia|%|\*/i.test(q.text))).toBe(true);
    expect(catalogueQueries([reference().code], [proposal()])).toEqual([{ kind: "code", text: reference().code }]);
    expect(catalogueQueries(["di per con", ""], [])).toEqual([]);
    expect(CATALOGUE_LIMITS.rowsPerQuery).toBe(48);
  });
  it("non esclude gli impieghi speciali se sono effettivamente richiesti", () => {
    const p = proposal({ title: "Pavimento piscina in gres porcellanato" });
    expect(catalogueQueries(["gres porcellanato"], [p]).some(q => /-piscine/.test(q.text))).toBe(false);
  });
  it("non reinvia più di 24 candidati e 30 riferimenti esistenti e deduplica", () => {
    const refs = Array.from({ length: 300 }, (_, i) => reference({ id: uid(i + 1), code: `C${String(i).padStart(3, "0")}` }));
    const existing = refs.slice(200, 230).map(r => r.id);
    const ranked = rankCatalogueReferences([...refs, refs[0]], [proposal()], existing);
    expect(ranked).toHaveLength(54); expect(new Set(ranked.map(r => r.id)).size).toBe(54); expect(ranked.slice(0, 30).map(r => r.id)).toEqual(existing);
  });
  it("ranking massimo limitato: 288 candidati e 100 righe non bloccano l’editor", () => {
    const refs = Array.from({ length: 288 }, (_, i) => reference({ id: uid(i + 1), code: `C${i}` }));
    const targets = Array.from({ length: 100 }, (_, i) => proposal({ id: `line${i}` }));
    const start = performance.now(); const ranked = rankCatalogueReferences(refs, targets); const elapsed = performance.now() - start;
    console.info("QUOTE_CATALOGUE_LOCAL_BENCHMARK", JSON.stringify({ candidates: 288, targets: 100, evaluatedTargets: 30, ms: elapsed, selected: ranked.length, scope: "CPU pura, non latenza LLM/DB" }));
    expect(ranked).toHaveLength(24); expect(elapsed).toBeLessThan(1500);
  });
  it("la presenza di un’esclusione nel testo del listino non diventa l’operazione richiesta", () => {
    expect(assessCatalogueMatch(proposal(), reference({ description: reference().description + " Esclusa demolizione preesistente." }))).toEqual([]);
  });
});
describe("Pipeline chat: il LLM sceglie, il server verifica, l’editor protegge", () => {
  const req = (p = proposal()): QuoteChatRequest => ({ version: 1, companyId: "d2000000-0000-4000-a000-000000000002", sessionId: uid(9), turnId: uid(8), revision: 0, sourceId: source, messages: [{ role: "user", text: "Trova la voce ufficiale, conserva le specifiche." }], lines: [p] });
  const turn = (p = proposal()): QuoteChatTurn => ({ version: 1, title: "Cucina", message: "Ecco i candidati", questions: [], proposals: [p], warnings: [], searches: ["gres porcellanato"] });
  const io = (p = proposal()) => ({ complete: vi.fn().mockResolvedValueOnce({ content: JSON.stringify(turn(p)), model: "fixture" }).mockResolvedValueOnce({ content: JSON.stringify(turn({ ...p, referenceId: uid(1) })), model: "fixture" }), search: vi.fn().mockResolvedValue([reference()]), decode: JSON.parse });
  it("una corrispondenza verificata trasferisce solo il prezzo DB, mai il prezzo inventato dal modello", async () => {
    const result = await runQuoteChat(req(), io());
    const doc = applyChatResult(emptyChatDocument(), result, uid(8), source).document;
    expect(doc.lines[0]).toMatchObject({ price: 54.11, included: false, referenceId: uid(1) });
  });
  it("un abbinamento errato non blocca la conversazione: prezzo nullo e motivazione visibile", async () => {
    const p = proposal({ title: proposal().title.replace("30×30", "60×60") });
    const result = await runQuoteChat(req(p), io(p));
    expect(result.turn.proposals[0].referenceId).toBeNull(); expect(result.turn.warnings.join()).toContain("formato");
    const doc = applyChatResult(emptyChatDocument(), result, uid(8), source).document;
    expect(doc.lines[0].price).toBeNull(); expect(doc.lines[0].included).toBe(false);
  });
  it("il server controlla anche la specifica originale se il LLM cambia il titolo", async () => {
    const result = await runQuoteChat(req(proposal({ title: proposal().title.replace("30×30", "60×60") })), io());
    expect(result.turn.proposals[0].referenceId).toBeNull(); expect(result.turn.warnings.join()).toContain("formato");
    expect(result.turn.proposals[0].title).toContain("60×60");
  });
  it("la ricerca dà priorità alle righe modificate anche oltre la trentesima riga del progetto", async () => {
    const r = req(); r.lines = Array.from({ length: 70 }, (_, i) => proposal({ id: `old${i}` }));
    const services = io(); await runQuoteChat(r, services);
    expect(services.search.mock.calls[0][3][0].id).toBe(proposal().id);
  });
  it("un editor con valori manuali resta protetto, anche con riferimento regionale valido", async () => {
    const result = await runQuoteChat(req(), io());
    const doc = patchChatLine(applyChatResult(emptyChatDocument(), result, uid(8), source).document, proposal().id, { price: 70, included: true });
    const next = applyChatResult(doc, { ...result, revision: doc.revision }, uid(8), source).document;
    expect(next.lines[0]).toMatchObject({ price: 70, included: true, manual: true });
  });
  it("riscontro locale: codice e prezzo originali distinti dal prezzo modificato manualmente", async () => {
    const result = await runQuoteChat(req(), io());
    const doc = patchChatLine(applyChatResult(emptyChatDocument(), result, uid(8), source).document, proposal().id, { price: 70 });
    const info = chatReferenceInfo(doc, 0);
    expect(info).toContain(reference().code); expect(info).toContain("54,11"); expect(info).toContain("70,00"); expect(info).toContain("Nessuna chiamata AI"); expect(doc.lines[0].included).toBe(false);
    expect(chatReferenceInfo(doc, 99)).toContain("non esiste");
    expect(chatReferenceInfo({ ...doc, lines: [{ ...doc.lines[0], reference: null }] }, 0)).toContain("non ha un riferimento");
  });
  it("anche l’editor rifiuta un riferimento incompatibile se riceve una risposta non filtrata", () => {
    const p = proposal({ title: proposal().title.replace("30×30", "60×60"), referenceId: uid(1) });
    const result = { version: 1, turnId: uid(8), revision: 0, turn: turn(p), references: [reference()], model: "fixture", simulated: true };
    const applied = applyChatResult(emptyChatDocument(), result, uid(8), source);
    expect(applied.document.lines[0].price).toBeNull(); expect(applied.notices.join()).toContain("formato");
  });
  it("mostra il codice ufficiale al posto dell’UUID, e non inventa codici per ID sconosciuti", async () => {
    const services = io(); services.complete.mockReset().mockResolvedValueOnce({ content: JSON.stringify(turn()), model: "fixture" }).mockResolvedValueOnce({ content: JSON.stringify({ ...turn(), message: `Codice ${uid(1)}, altro ${uid(999)}` }), model: "fixture" });
    const result = await runQuoteChat(req(), services);
    expect(result.turn.message).toContain(reference().code); expect(result.turn.message).toContain("riferimento non verificato"); expect(result.turn.message).not.toMatch(/[a-f\d]{8}-[a-f\d-]{27,}/i);
  });
});

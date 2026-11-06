import { beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ calls: [] as Array<[string, ...unknown[]]>, result: { data: [] as unknown[], error: null as unknown } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  mocked.calls.push(["from", table]);
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "in", "or", "textSearch", "order", "limit"]) chain[method] = (...args: unknown[]) => { mocked.calls.push([method, ...args]); return chain; };
  chain.abortSignal = (...args: unknown[]) => { mocked.calls.push(["abortSignal", ...args]); return Promise.resolve(mocked.result); };
  return chain;
} } }));
vi.mock("@/lib/limitHeavyReads", () => ({ withHeavyDatabaseRead: async (task: (signal: AbortSignal) => Promise<unknown>, _label: string, _ms: number, signal: AbortSignal) => { signal.throwIfAborted(); return task(signal); } }));
import { readLocalQuoteCatalogue } from "@/lib/preventivi/quoteLocalCatalogue";
import type { QuoteChatProposal } from "../../../supabase/functions/_shared/quoteConversation";
const source = "9b9bb854-9317-43b0-bab1-d3b706bc4993", code = "LOM252.OC.EEA.Pa02.C1206.L0005.0220.-";
beforeEach(() => { mocked.calls.length = 0; mocked.result = { data: [], error: null }; });
it('filtra le unità prima del limite dei candidati senza toccare le letture per codice', async () => {
  await readLocalQuoteCatalogue(source, [], [{ id: 'test', title: 'Rivestimento gres', description: '', unit: 'm²', quantity: null, quantityBasis: '', referenceId: null }], new AbortController().signal);
  // Le voci senza unità restano (16 prezzari su 19 non l'hanno): le segnala assessCatalogueMatch.
  expect(mocked.calls).toContainEqual(['or', 'unita_misura.in.("m²","m2","mq"),unita_misura.is.null']);
  expect(mocked.calls.some(c => c[0] === 'in' && c[1] === 'unita_misura')).toBe(false);
});
it('una voce senza unità torna come candidato da verificare, non come prezzo compatibile', async () => {
  mocked.result.data = [{ id: 'a2000000-0000-4000-a000-000000000009', fonte_id: source, codice: 'MAR25.02.03.017', descrizione: 'Demolizione di solaio misto. La misurazione sarà eseguita al m² per ogni cm di spessore del solaio.', unita_misura: null, prezzo: '3.18', fonte: { nome: 'Marche', stato: 'pubblicato' } }];
  const target: QuoteChatProposal = { id: 'dem', title: 'Demolizione solaio', description: '', unit: 'm²', quantity: null, quantityBasis: '', referenceId: null };
  const r = await readLocalQuoteCatalogue(source, [], [target], new AbortController().signal);
  expect(r.references.map(x => x.unit)).toEqual(['']);
  const { assessCatalogueMatch } = await import('../../../supabase/functions/_shared/quoteCatalogue');
  expect(assessCatalogueMatch(target, r.references[0])).toContain('unità di misura mancante o incompatibile');
});
it("legge il codice esatto nella fonte pubblicata con limite2, senza ricerca testuale o scritture", async () => {
  mocked.result.data = [{ id: "a2000000-0000-4000-a000-000000000001", fonte_id: source, codice: code, descrizione: "Pavimento", unita_misura: "m²", prezzo: "54.11", fonte: { nome: "Lombardia", stato: "pubblicato" } }];
  const r = await readLocalQuoteCatalogue(source, [code], [], new AbortController().signal);
  expect(r.references[0].price).toBe(54.11); expect(r.missingCodes).toEqual([]);
  expect(mocked.calls).toContainEqual(["eq", "codice", code]); expect(mocked.calls).toContainEqual(["eq", "fonte_id", source]); expect(mocked.calls).toContainEqual(["eq", "fonte.stato", "pubblicato"]); expect(mocked.calls).toContainEqual(["limit", 2]); expect(mocked.calls.some(c => c[0] === "textSearch")).toBe(false);
});
it("distingue codice senza prezzo, codice non restituito ed errore di lettura", async () => {
  mocked.result.data = [{ id: "a2000000-0000-4000-a000-000000000001", fonte_id: source, codice: code, descrizione: "Pavimento", unita_misura: "m²", prezzo: null }];
  expect((await readLocalQuoteCatalogue(source, [code], [], new AbortController().signal)).references[0].price).toBeNull();
  mocked.result.data = []; expect((await readLocalQuoteCatalogue(source, [code], [], new AbortController().signal)).missingCodes).toEqual([code]);
  mocked.result.error = { message: "timeout" }; await expect(readLocalQuoteCatalogue(source, [code], [], new AbortController().signal)).rejects.toThrow("non equivale");
});
it('trova l’idrosemina anche quando il codice utente non contiene il suffisso terminale Lombardia', async () => {
  const typed = 'LOM252.OC.AAA.Pa23.A0000.Na000.0015';
  mocked.result.data = [{ id: 'a2000000-0000-4000-a000-000000000001', fonte_id: source, codice: `${typed}.-`, descrizione: 'Idrosemina, esclusa preparazione', unita_misura: 'm²', prezzo: '6.71', fonte: { nome: 'Lombardia', stato: 'pubblicato' } }];
  const result = await readLocalQuoteCatalogue(source, [typed], [], new AbortController().signal);
  expect(mocked.calls).toContainEqual(['in', 'codice', [typed, `${typed}.-`]]);
  expect(result.references[0]).toMatchObject({ code: `${typed}.-`, price: 6.71 });
  expect(result.missingCodes).toEqual([]);
  expect(mocked.calls.some(c => c[0] === 'textSearch')).toBe(false);
});
it("annullamento e codici non validi impediscono letture", async () => {
  await expect(readLocalQuoteCatalogue(source, ["%"], [], new AbortController().signal)).rejects.toThrow();
  const ctrl = new AbortController(); ctrl.abort(); await expect(readLocalQuoteCatalogue(source, [code], [], ctrl.signal)).rejects.toThrow(); expect(mocked.calls).toHaveLength(0);
});

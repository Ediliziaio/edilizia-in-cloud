import { describe, expect, it } from "vitest";
import { leggiPreventivoAi, confermaPreventivoAi, datiMancantiPreventivoAi } from "../../../supabase/functions/_shared/preventivoAiContract";
import { riepilogoPreventivoAi } from "@/lib/preventivi/aiQuoteReview";
import { importoRiga } from "@/hooks/usePreventivoCosti";

const row = (patch: Record<string, unknown> = {}) => ({ item_category: "posa", nome: "Lavorazione test", descrizione: "", quantita: 2, unita_misura: "mq", unit_price: 12.5, ...patch });
const response = (rows = [row()]) => ({ sezioni: [{ nome: "Lavori", righe: rows }] });

describe("contratto AI condiviso fra funzione e app", () => {
  it.each([null, undefined, 0, 0.001, 1e20, -2, NaN, Infinity, "2", "1,25"])("quantità %s non diventa un pezzo", quantita => {
    const value = leggiPreventivoAi(response([row({ quantita })]));
    expect(value.sezioni[0].righe[0].quantita).toBeNull();
    expect(datiMancantiPreventivoAi(value.sezioni)).toHaveLength(1);
    expect(() => confermaPreventivoAi(value.sezioni)).toThrow("Completa");
  });
  it.each([null, undefined, -2, NaN, Infinity, "0"])("prezzo %s non diventa gratuito", unit_price => {
    const parsed = leggiPreventivoAi(response([row({ unit_price })]));
    expect(parsed.sezioni[0].righe[0].unit_price).toBeNull();
    expect(riepilogoPreventivoAi(parsed.sezioni)).toMatchObject({ completo: false, totale: 0 });
  });
  it("distingue uno zero esplicito dal prezzo assente", () => {
    const parsed = leggiPreventivoAi(response([row({ unit_price: 0 })]));
    expect(confermaPreventivoAi(parsed.sezioni)[0].righe[0].unit_price).toBe(0);
    expect(riepilogoPreventivoAi(parsed.sezioni).completo).toBe(true);
  });
  it.each([null, [], {}, { success: false }, { error: "fallita" }, { sezioni: [] }, { sezioni: [null] }, { sezioni: [{ righe: "no" }] }, { sezioni: [{ righe: [] }] }, { schema_version: 2, ...response() }])("rifiuta payload corrotto %j", data => {
    expect(() => leggiPreventivoAi(data)).toThrow();
  });
  it("limita righe e opzioni prima di elaborarle senza troncare silenziosamente", () => {
    expect(() => leggiPreventivoAi(response(Array.from({ length: 101 }, () => row())))).toThrow("Troppe righe");
    expect(() => leggiPreventivoAi(response([row({ axis_selections: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [i, "x"])) })]))).toThrow("Troppe opzioni");
  });
  it("blocca categorie inventate, fonti incompatibili e unità mancanti", () => {
    expect(() => leggiPreventivoAi(response([row({ item_category: "inventata" })]))).toThrow();
    expect(() => leggiPreventivoAi(response([row({ family_id: "f", article_template_id: "a" })]))).toThrow("fonti");
    expect(() => confermaPreventivoAi(leggiPreventivoAi(response([row({ unita_misura: "" })])).sezioni)).toThrow();
  });
  it("le note non chiedono quantità o prezzi e non entrano nel totale", () => {
    const parsed = leggiPreventivoAi(response([row({ item_category: "nota", unit_price: 9000, quantita: null })]));
    expect(riepilogoPreventivoAi(parsed.sezioni)).toMatchObject({ totale: 0, completo: true });
  });
  it("valida una copia senza cambiare il contenuto originario", () => {
    const original = response([row({ family_id: "f", axis_selections: { colore: "bianco" } })]);
    const before = structuredClone(original);
    const parsed = leggiPreventivoAi(original);
    parsed.sezioni[0].righe[0].axis_selections!.colore = "nero";
    expect(original).toEqual(before);
  });
  it("totale parziale esplicito e arrotondamento uguale all'editor", () => {
    const parsed = leggiPreventivoAi(response([row({ quantita: 0.333, unit_price: 122.265 }), row({ unit_price: null })]));
    expect(riepilogoPreventivoAi(parsed.sezioni)).toMatchObject({ completo: false, totale: importoRiga({ quantity: 0.333, unit_price: 122.265 }) });
  });
});

// These rates are fictional test inputs, NOT regional prices or technical
// estimates. They exercise integration without calling an AI or a database.
describe("campioni sintetici bagno cappotto e campo da tennis", () => {
  it.each([
    { nome: "Bagno", q: 24, prezzo: 30, expected: 720 },
    { nome: "Cappotto", q: 120, prezzo: 50, expected: 6000 },
    { nome: "Campo da tennis", q: 600, prezzo: 40, expected: 24000 },
  ])("$nome: conserva quantità e fonte e passa agli stessi conti", ({ nome, q, prezzo, expected }) => {
    const parsed = leggiPreventivoAi(response([row({ nome, quantita: q, unit_price: prezzo, tariffa_id: "fixture-only" })]));
    const ready = confermaPreventivoAi(parsed.sezioni);
    expect(ready[0].righe[0]).toMatchObject({ nome, quantita: q, tariffa_id: "fixture-only" });
    expect(riepilogoPreventivoAi(ready).totale).toBe(expected);
  });
});

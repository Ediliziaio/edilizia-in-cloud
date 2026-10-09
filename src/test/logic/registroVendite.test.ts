import { describe, expect, it, vi } from "vitest";
import { documentoNelRegistro, importoConSegno, nomeIntestatario, tutteLePagine, unisciRegistroVendite, type RigaVendite } from "@/lib/fatturazione/registroVendite";
import { classificaClienti, conteggiPreparazione, fatturatoPeriodo } from "@/lib/fatturazione/statisticheVendite";

const riga = (extra: Partial<RigaVendite> = {}): RigaVendite => ({ id: "1", origine: "nativa", numero: "1/26", data_emissione: "2026-10-01", tipo: "fattura", stato: "emessa", cliente_snapshot: { nome: "Mario", cognome: "Rossi", codice_fiscale: "RSSMRA80A01H501U" }, imponibile_totale: 100, iva_totale: 22, totale_documento: 122, importo_pagato: 0, ...extra });
describe("Registro vendite unico", () => {
  it.each([400, -400])("sottrae una NC anche se già negativa (%s)", value => expect(importoConSegno("credit_note", value)).toBe(-400));
  it("esclude bozze, annullate, proforma e autofatture dai ricavi", () => {
    for (const extra of [{ stato: "bozza" }, { stato: "draft" }, { stato: "annullata" }, { stato: "cancelled" }, { tipo: "autofattura" }, { tipo: "proforma" }]) expect(documentoNelRegistro(riga(extra))).toBe(false);
  });
  it.each(["TD02", "TD03", "acconto_fattura", "acconto_parcella", "nota_debito", "fattura_riepilogativa", "fattura_differita_b"])("include il documento di vendita %s", tipo => expect(documentoNelRegistro(riga({ tipo }))).toBe(true));
  it("unisce storico e nativo, netti IVA, senza bozze, NC o anno successivo gonfiati", () => {
    const docs = [riga(), riga({ id: "2", origine: "importata", tipo: "invoice", imponibile_totale: 200 }), riga({ id: "3", tipo: "nota_credito", imponibile_totale: -30 }), riga({ stato: "bozza", imponibile_totale: 999 }), riga({ data_emissione: "2027-01-01", imponibile_totale: 999 })];
    expect(fatturatoPeriodo(docs, "2026-01-01", "2027-01-01")).toEqual({ imponibile: 270, fatture: 2 });
    expect(conteggiPreparazione(docs).bozze).toBe(1);
  });
  it("deduplica solo la copia importata identica di un documento emesso", () => {
    const n = riga();
    expect(unisciRegistroVendite([n], [riga({ origine: "importata", tipo: "invoice" })])).toHaveLength(1);
    for (const extra of [{ numero: "2/26" }, { data_emissione: "2025-10-01" }, { totale_documento: 123 }, { cliente_snapshot: {} }, { tipo: "credit_note" }, { cliente_snapshot: { codice_fiscale: "ALTROCLIENTE" } }]) expect(unisciRegistroVendite([n], [riga({ origine: "importata", ...extra })])).toHaveLength(2);
    expect(unisciRegistroVendite([riga({ stato: "bozza" })], [riga({ origine: "importata" })])).toHaveLength(2);
  });
  it("classifica per identità fiscale, mantiene persone omonime separate e non inventa insoluti storici", () => {
    const docs = [riga(), riga({ id: "2", origine: "importata", imponibile_totale: 200 }), riga({ id: "3", tipo: "nota_credito", imponibile_totale: -30 }), riga({ id: "4", cliente_snapshot: { nome: "Mario", cognome: "Rossi", codice_fiscale: "ALTRO" }, imponibile_totale: 50 })];
    const c = classificaClienti(docs, new Map([["1", 61], ["2", 244], ["3", 30]]), "2026-01-01", "2027-01-01", 10);
    expect(c).toHaveLength(2); expect(c[0]).toMatchObject({ nome: "Mario Rossi", fatturato: 270, daIncassare: 61 });
    expect(nomeIntestatario({ nome: "Maria", cognome: "Bianchi" })).toBe("Maria Bianchi");
  });
  it("paginazione oltre il limite e pagina esattamente piena", async () => {
    const fn = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: [3, 4], error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect(await tutteLePagine(fn, 2)).toEqual([1, 2, 3, 4]);
    expect(fn.mock.calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
  it("non restituisce totali parziali se una pagina fallisce", async () => {
    const fn = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: null, error: new Error("Rete") });
    await expect(tutteLePagine(fn, 2)).rejects.toThrow("Rete");
  });
});

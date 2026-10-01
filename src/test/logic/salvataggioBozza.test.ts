/**
 * Il salvataggio della bozza (01/10/2026, Renova): un cliente creato dal modulo
 * portava anagrafica_id = "" e il database rifiutava ogni salvataggio con
 * «invalid input syntax for type uuid» (HTTP 400). La bozza non si salvava più e
 * uscendo il lavoro andava perso. Qui il payload non può più contenere stringhe
 * vuote dove il database vuole un uuid, una data o un numero.
 */
import { describe, expect, it } from "vitest";
import { buildSavePayload } from "@/pages/azienda/fatturazione/editor/useEditorState";

const stato = (extra: Record<string, unknown> = {}) => ({
  id: "d1", _initialized: true, stato: "bozza", tipo: "fattura", righe: [], cliente_snapshot: { ragione_sociale: "Mario Rossi" },
  subtotale: 100, imponibile_totale: 100, iva_totale: 10, totale_documento: 110, totale_da_pagare: 110,
  ritenuta_importo: 0, cassa_importo: 0, rivalsa_importo: 0, altra_ritenuta_importo: 0, ...extra,
}) as never;

describe("payload di salvataggio della bozza", () => {
  it("anagrafica_id vuoto (cliente creato dal modulo) diventa null, non \"\"", () => {
    const p = buildSavePayload(stato({ anagrafica_id: "" })) as Record<string, unknown>;
    expect(p.anagrafica_id).toBeNull();
  });

  it("date, orari e numeri svuotati diventano null", () => {
    const p = buildSavePayload(stato({ data_scadenza: "", data_validita: "", ddt_data_ora_consegna: "", ddt_numero_colli: "", arrotondamento: NaN })) as Record<string, unknown>;
    expect(p.data_scadenza).toBeNull();
    expect(p.data_validita).toBeNull();
    expect(p.ddt_data_ora_consegna).toBeNull();
    expect(p.ddt_numero_colli).toBeNull();
    expect(p.arrotondamento).toBeNull();
  });

  it("un uuid vero resta com'è", () => {
    const id = "644d382c-d808-4bfb-8a23-528b6dd11035";
    expect((buildSavePayload(stato({ anagrafica_id: id })) as Record<string, unknown>).anagrafica_id).toBe(id);
  });

  it("nessuna stringa vuota nei campi che a database non sono testo", () => {
    const p = buildSavePayload(stato({ anagrafica_id: "", data_scadenza: "", ddt_data_ora_consegna: "" })) as Record<string, unknown>;
    for (const k of ["anagrafica_id", "data_scadenza", "data_validita", "ddt_data_ora_consegna", "ddt_numero_colli", "probabilita_chiusura"]) {
      expect(p[k] === "" ).toBe(false);
    }
  });

  it("i totali sono sempre numeri: un NaN diventa 0 (le colonne sono NOT NULL)", () => {
    const p = buildSavePayload(stato({ subtotale: NaN, totale_documento: undefined })) as Record<string, number>;
    expect(p.subtotale).toBe(0);
    expect(p.totale_documento).toBe(0);
    expect(p.imponibile_totale).toBe(100);
  });
});

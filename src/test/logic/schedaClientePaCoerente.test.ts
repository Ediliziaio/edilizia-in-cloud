/**
 * Scheda cliente coerente col tipo fiscale (15/11/2026): cosa manca per tipo (a un Comune si
 * chiedeva la partita IVA), le etichette dei documenti nell'elenco attività («Fattura_pa»),
 * il lotto senza «Lotto Lotto 1» e i riferimenti raggruppati per commessa.
 */
import { describe, expect, it } from "vitest";
import { campiDaCompletare } from "@/lib/clienti/anagraficaCliente";
import { etichettaStatoDocumento, etichettaTipoDocumento } from "@/lib/fatturazione/etichetteDocumento";
import { etichettaLotto, raggruppaRiferimentiPerCommessa, type RiferimentoPa } from "@/lib/orders/riferimentiPa";

const pieno = { email: "a@b.it", phone: "333", address: "Via Roma 1", city: "Roma" };

describe("cosa manca, secondo il tipo fiscale", () => {
  it("PA: chiede il codice fiscale dell'ente, mai la partita IVA", () => {
    expect(campiDaCompletare({ ...pieno, is_business: true }, { tipo_cliente: "PA", codice_fiscale: null, partita_iva: null })).toEqual(["Codice fiscale"]);
    expect(campiDaCompletare({ ...pieno, is_business: true }, { tipo_cliente: "PA", codice_fiscale: "80012345676", partita_iva: null })).toEqual([]);
  });
  it("il codice fiscale dell'anagrafica fiscale vale anche se il profilo non lo ha", () => {
    expect(campiDaCompletare({ ...pieno, fiscal_code: null, is_business: true }, { tipo_cliente: "PA", codice_fiscale: "80012345676" })).toEqual([]);
  });
  it("Azienda: partita IVA; Privato: codice fiscale; Estero: nessuno dei due", () => {
    expect(campiDaCompletare({ ...pieno, is_business: true }, { tipo_cliente: "B2B" })).toEqual(["Partita IVA"]);
    expect(campiDaCompletare({ ...pieno, is_business: true }, { tipo_cliente: "B2B", partita_iva: "01234567890" })).toEqual([]);
    expect(campiDaCompletare({ ...pieno, is_business: false }, { tipo_cliente: "B2C" })).toEqual(["Codice fiscale"]);
    expect(campiDaCompletare({ ...pieno, is_business: true }, { tipo_cliente: "Estero" })).toEqual([]);
  });
  it("senza anagrafica fiscale resta la regola del profilo", () => {
    expect(campiDaCompletare({ ...pieno, is_business: true })).toEqual(["Partita IVA"]);
    expect(campiDaCompletare({ ...pieno, is_business: false })).toEqual(["Codice fiscale"]);
    expect(campiDaCompletare({ ...pieno, is_business: true }, null)).toEqual(["Partita IVA"]);
  });
});

describe("etichette dei documenti", () => {
  it("nessuna chiave interna a schermo", () => {
    expect(etichettaTipoDocumento("fattura_pa")).toBe("Fattura PA");
    expect(etichettaTipoDocumento("nota_credito")).toBe("Nota di credito");
    expect(etichettaTipoDocumento("nota_debito")).toBe("Nota di debito");
    expect(etichettaTipoDocumento("fattura")).toBe("Fattura");
    expect(etichettaTipoDocumento("proforma")).toBe("Proforma");
    expect(etichettaTipoDocumento(null)).toBe("Fattura");
    // un tipo nuovo, che la mappa non conosce ancora: leggibile lo stesso
    expect(etichettaTipoDocumento("tipo_nuovo_x")).toBe("Tipo nuovo x");
    expect(etichettaStatoDocumento("inviata_sdi")).toBe("Inviata allo SDI");
    expect(etichettaStatoDocumento("parzialmente_pagata")).toBe("Pagata in parte");
    expect(etichettaStatoDocumento(null)).toBe("");
  });
});

describe("lotto", () => {
  it("non ripete «Lotto»", () => {
    expect(etichettaLotto("Lotto 1")).toBe("Lotto 1");
    expect(etichettaLotto("lotto unico")).toBe("lotto unico");
    expect(etichettaLotto("1")).toBe("Lotto 1");
    expect(etichettaLotto("Lottizzazione A")).toBe("Lotto Lottizzazione A");
    expect(etichettaLotto("  ")).toBeNull();
  });
});

describe("riferimenti per commessa", () => {
  const r = (id: string, order_id: string, ordinamento: number) => ({ id, order_id, ordinamento, created_at: "2026-11-15" }) as RiferimentoPa;
  it("nell'ordine delle commesse, solo quelle con riferimenti, righe in ordine", () => {
    const gruppi = raggruppaRiferimentiPerCommessa(
      [r("b", "o2", 1), r("a", "o2", 0), r("c", "o1", 0)],
      [{ id: "o1", order_code: "C-1", description: null }, { id: "o3", order_code: "C-3", description: null }, { id: "o2", order_code: "C-2", description: null }],
    );
    expect(gruppi.map((g) => g.commessa.order_code)).toEqual(["C-1", "C-2"]);
    expect(gruppi[1].righe.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

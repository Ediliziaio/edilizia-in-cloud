import { describe, expect, it } from "vitest";
import { calcolaCostoLavorazione, campiConCostoLavorazione, costoLavorazioneModificato, gruppoLavorazione, leggiCostoLavorazione, numeroCosto, type CostoLavorazione } from "@/lib/tariffe/costoLavorazione";

const interno: CostoLavorazione = { versione: 1, modalita: "interna", subappalto: 150, altri_costi_interni: 10,
  risorse: [{ id: "a", nome: "Operatore", operatori: 2, ore: 2, costo_orario: 25 }, { id: "b", nome: "Specialista", operatori: 1, ore: 1, costo_orario: 40 }] };
describe("Costo unitario lavorazioni", () => {
  it("somma ore-uomo a tariffe diverse e costi aggiuntivi", () => {
    expect(calcolaCostoLavorazione(interno, 99)).toEqual({ interno: 150, subappalto: 150, applicato: 150, oreUomo: 5 });
  });
  it("subappalto e interno sono alternativi, non si sommano", () => {
    expect(calcolaCostoLavorazione({ ...interno, modalita: "subappalto", subappalto: 95 }, 99).applicato).toBe(95);
    expect(calcolaCostoLavorazione({ ...interno, modalita: "manuale" }, 99).applicato).toBe(99);
  });
  it.each([null, -5, NaN, Infinity])("non scambia un costo orario mancante/errato per zero: %s", costo_orario => {
    expect(calcolaCostoLavorazione({ ...interno, risorse: [{ ...interno.risorse[0], costo_orario }] }, 0).applicato).toBeNull();
  });
  it("zero esplicito è diverso da importo mancante", () => {
    expect(calcolaCostoLavorazione({ ...interno, modalita: "subappalto", subappalto: 0 }, 99).applicato).toBe(0);
    expect(calcolaCostoLavorazione({ ...interno, modalita: "subappalto", subappalto: null as null }, 99).applicato).toBeNull();
  });
  it("richiede operatori interi positivi e ore maggiori di zero", () => {
    for (const patch of [{ operatori: 1.5 }, { operatori: 0 }, { ore: 0 }, { ore: null as null }]) {
      expect(calcolaCostoLavorazione({ ...interno, risorse: [{ ...interno.risorse[0], ...patch }] }, 0).applicato).toBeNull();
    }
  });
  it("supporta frazioni di ora per m² e arrotonda solo il totale", () => {
    expect(calcolaCostoLavorazione({ ...interno, altri_costi_interni: 0, risorse: [{ ...interno.risorse[0], operatori: 1, ore: 0.15, costo_orario: 27.5 }] }, 0).applicato).toBe(4.13);
  });
  it("mantiene costo storico e campi estranei, e conserva entrambi gli scenari", () => {
    const precedente = { _catalog_standard: { version: 1 }, nota: "conservare" };
    const salvato = campiConCostoLavorazione(precedente, interno, 150, "posa");
    expect(salvato).toHaveProperty("nota", "conservare");
    expect(salvato).toHaveProperty("_catalog_standard", { version: 1 });
    expect(leggiCostoLavorazione(salvato)).toEqual({ ...interno, costo_applicato: 150 });
    expect(leggiCostoLavorazione(precedente).modalita).toBe("manuale");
    expect(precedente).not.toHaveProperty("_costo_lavorazione");
  });
  it("rileva variazioni esterne al costo, senza riapplicare il vecchio calcolo", () => {
    const config = { ...interno, costo_applicato: 150 };
    expect(costoLavorazioneModificato(config, 165)).toBe(true);
    expect(costoLavorazioneModificato(config, 150)).toBe(false);
  });
  it("gestisce metadati assenti/malformati e numeri italiani", () => {
    expect(leggiCostoLavorazione(null).modalita).toBe("manuale");
    expect(leggiCostoLavorazione({ _costo_lavorazione: { modalita: "interna", risorse: [null] } }).modalita).toBe("manuale");
    expect(numeroCosto("25,50")).toBe(25.5);
    expect(numeroCosto("25abc")).toBeNull();
    expect(numeroCosto("-2")).toBeNull();
    expect(numeroCosto("")).toBeNull();
  });
});

describe("Gruppi di lavoro", () => {
  it.each([
    ["Rimozione vasca", "demolizioni"], ["Posa pavimento", "posa"], ["Cablaggio quadro", "impianti"],
    ["Tinteggiatura pareti", "finiture"], ["Sigillature bagno", "finiture"], ["Collaudo impianto", "collaudo"], ["Manutenzione caldaia", "manutenzione"],
    ["Trasporto sanitari", "logistica"], ["Massetto bagno", "opere_edili"],
  ])("propone gruppo per %s", (nome, gruppo) => expect(gruppoLavorazione({ nome, tipo: "manodopera" })).toBe(gruppo));
  it("rispetta sempre la classificazione scelta dall'azienda", () => {
    expect(gruppoLavorazione({ nome: "Posa pavimento", tipo: "posa", custom_field_values: { _gruppo_lavorazione: "finiture" } })).toBe("finiture");
  });
});

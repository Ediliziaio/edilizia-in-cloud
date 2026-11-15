/**
 * Una variante letta da un documento con l'AI (15/11/2026): cosa si prende e cosa no.
 */
import { describe, expect, it } from "vitest";
import { bozzaVarianteDaDocumento, leggiVarianteDaAi, tipoVariante } from "@/lib/orders/varianteDaDocumento";
import { prepareVariation } from "@/lib/orders/variationDraft";

describe("Lettura difensiva", () => {
  it("scarta voci senza descrizione, prezzi negativi diventano voci tolte", () => {
    const l = leggiVarianteDaAi({
      titolo: "Punti luce", voci: [
        { descrizione: "Punto luce cucina", quantita: "2", prezzo_unitario_eur: "85,50", segno: "aggiunta" },
        { descrizione: "  " },
        { descrizione: "Controsoffitto bagno", quantita: 1, prezzo_unitario_eur: -600 },
      ],
      giorni_aggiuntivi: 9999, importo_a_corpo_eur: null,
    });
    expect(l.voci).toEqual([
      { descrizione: "Punto luce cucina", quantita: 2, unita: null, prezzo_unitario_eur: 85.5, segno: "aggiunta" },
      { descrizione: "Controsoffitto bagno", quantita: 1, unita: null, prezzo_unitario_eur: 600, segno: "tolta" },
    ]);
    expect(l.giorni_aggiuntivi).toBeNull();
  });

  it("una voce col prezzo e senza quantità vale 1 (la mail del 15/11: «il controsoffitto era 600 euro»)", () => {
    const l = leggiVarianteDaAi({ voci: [
      { descrizione: "Controsoffitto del bagno", quantita: null, prezzo_unitario_eur: 600, segno: "tolta" },
      { descrizione: "Punto luce", quantita: null, prezzo_unitario_eur: null },
    ] });
    expect(l.voci.map((v) => v.quantita)).toEqual([1, null]);
  });

  it("il tipo viene dalle voci", () => {
    expect(tipoVariante([{ segno: "aggiunta" }])).toBe("aggiunta");
    expect(tipoVariante([{ segno: "tolta" }, { segno: "tolta" }])).toBe("riduzione");
    expect(tipoVariante([{ segno: "aggiunta" }, { segno: "tolta" }])).toBe("modifica");
    expect(tipoVariante([])).toBe("aggiunta");
  });
});

describe("Bozza dalla lettura", () => {
  it("voci tutte prezzate: variante a voci, che passa il controllo di salvataggio", () => {
    const { bozza, avvisi } = bozzaVarianteDaDocumento(leggiVarianteDaAi({
      titolo: "Due punti luce", descrizione: "Richiesta del cliente del 12/11.", giorni_aggiuntivi: 2, richiesto_da: "Cliente",
      voci: [{ descrizione: "Punto luce cucina", quantita: 2, unita: "pz", prezzo_unitario_eur: 85.5 }],
    }));
    expect(bozza).toMatchObject({ kind: "aggiunta", pricing: "voci", title: "Due punti luce", days: "2", requester: "Cliente" });
    expect(bozza.lines).toEqual([{ id: "doc-1", description: "Punto luce cucina", quantity: "2", price: "85,5", unit: "pz" }]);
    expect(avvisi).toEqual([]);
    expect(prepareVariation(bozza).impatto_economico).toBe(171);
  });

  it("aggiunte e tolte insieme: modifica, con le tolte in negativo", () => {
    const { bozza } = bozzaVarianteDaDocumento(leggiVarianteDaAi({
      titolo: "Cambio lavori", descrizione: "x",
      voci: [
        { descrizione: "Punto luce", quantita: 2, prezzo_unitario_eur: 100 },
        { descrizione: "Controsoffitto", quantita: 1, prezzo_unitario_eur: 600, segno: "tolta" },
      ],
    }));
    expect(bozza.kind).toBe("modifica");
    expect(bozza.lines.map((l) => [l.description, l.price])).toEqual([["Punto luce", "100"], ["Da togliere: Controsoffitto", "-600"]]);
    expect(prepareVariation(bozza).impatto_economico).toBe(-400);
  });

  it("solo tolte: riduzione con prezzi positivi, che si sottraggono da sé", () => {
    const { bozza } = bozzaVarianteDaDocumento(leggiVarianteDaAi({
      titolo: "Niente controsoffitto", descrizione: "x", voci: [{ descrizione: "Controsoffitto", quantita: 1, prezzo_unitario_eur: 600, segno: "tolta" }],
    }));
    expect(bozza.kind).toBe("riduzione");
    expect(prepareVariation(bozza).impatto_economico).toBe(-600);
  });

  it("un prezzo che manca: a corpo, elenco nella descrizione, e lo dice", () => {
    const { bozza, avvisi } = bozzaVarianteDaDocumento(leggiVarianteDaAi({
      titolo: "Punti luce", descrizione: "Dalla mail del cliente.",
      voci: [{ descrizione: "Punto luce cucina", quantita: 2 }, { descrizione: "Presa bagno", quantita: 1, prezzo_unitario_eur: 40 }],
    }));
    expect(bozza.pricing).toBe("corpo");
    expect(bozza.amount).toBe("");
    expect(bozza.lines).toEqual([]);
    expect(bozza.description).toBe("Dalla mail del cliente.\n\nLavori:\n- Punto luce cucina (2)\n- Presa bagno (1)");
    expect(avvisi).toContain("Il documento non dice l'importo: scrivilo prima di salvare.");
  });

  it("a corpo con l'importo del documento", () => {
    const { bozza, avvisi } = bozzaVarianteDaDocumento(leggiVarianteDaAi({
      titolo: "Rifacimento terrazzo", descrizione: "x", importo_a_corpo_eur: 3200, voci: [],
    }));
    expect(bozza).toMatchObject({ pricing: "corpo", amount: "3200" });
    expect(avvisi).toEqual([]);
  });

  it("la mail vera del collaudo: due punti luce e una presa in più, niente controsoffitto", () => {
    const { bozza, avvisi } = bozzaVarianteDaDocumento(leggiVarianteDaAi({
      titolo: "Aggiunta punti luce e presa, eliminazione controsoffitto", descrizione: "Si aggiungono due punti luce e una presa.", giorni_aggiuntivi: 1,
      voci: [
        { descrizione: "Punti luce in cucina", prezzo_unitario_eur: 85, quantita: 2, segno: "aggiunta", unita: "pz" },
        { descrizione: "Presa in bagno", prezzo_unitario_eur: 40, quantita: 1, segno: "aggiunta", unita: "pz" },
        { descrizione: "Controsoffitto del bagno", prezzo_unitario_eur: 600, quantita: null, segno: "tolta", unita: null },
      ],
    }));
    expect(bozza).toMatchObject({ kind: "modifica", pricing: "voci", days: "1" });
    expect(avvisi).toEqual([]);
    expect(prepareVariation(bozza).impatto_economico).toBe(-390);
  });

  it("tiene i dati di impresa e cliente della base", () => {
    const { bozza } = bozzaVarianteDaDocumento(leggiVarianteDaAi({ titolo: "A", descrizione: "b" }),
      { ...bozzaVarianteDaDocumento(leggiVarianteDaAi({})).bozza, documentCustomerName: "Famiglia Rossi" });
    expect(bozza.documentCustomerName).toBe("Famiglia Rossi");
  });
});

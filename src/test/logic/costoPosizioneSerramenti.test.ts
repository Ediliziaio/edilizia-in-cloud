import { describe, expect, it } from "vitest";
import { applyMaggiorazioniAssi, calcolaCostoPosizione, type AsseCosto, type FamigliaCosto } from "@/lib/serramenti/pricing";

const famiglia = (over: Partial<FamigliaCosto> = {}): FamigliaCosto => ({
  modalita_prezzo_base: "pz",
  prezzo_base_mode: "vendita",
  prezzo_base_acquisto: 0,
  sconto_fornitore_1: 0,
  sconto_fornitore_2: 0,
  manodopera_modalita: "nessuna",
  posa_tariffa_default_id: null,
  posa_quantita_default: 1,
  manodopera_costo_acquisto: 0,
  ...over,
});

const base = { larghezza: 1200, altezza: 1400, quantita: 1 };

describe("costo di una posizione del preventivo serramenti", () => {
  it("a pezzo e al metro quadro usa il costo del listino, anche senza griglia", () => {
    expect(calcolaCostoPosizione({ ...base, quantita: 2, family: famiglia({ prezzo_base_acquisto: 100 }) }).prodotto).toBe(200);
    // 1,2 × 1,4 = 1,68 m² × 80 €
    expect(calcolaCostoPosizione({ ...base, family: famiglia({ modalita_prezzo_base: "mq", prezzo_base_acquisto: 80 }) }).prodotto).toBe(134.4);
  });

  it("senza costo nel listino il costo è sconosciuto, non zero", () => {
    expect(calcolaCostoPosizione({ ...base, family: famiglia() }).prodotto).toBeNull();
    expect(calcolaCostoPosizione({ ...base, family: famiglia({ modalita_prezzo_base: "griglia" }) }).prodotto).toBeNull();
  });

  it("un prodotto a ricarico toglie gli sconti fornitore dal lordo, come il prezzo", () => {
    const f = famiglia({ prezzo_base_mode: "acquisto_markup", prezzo_base_acquisto: 1000, sconto_fornitore_1: 55, sconto_fornitore_2: 3 });
    expect(calcolaCostoPosizione({ ...base, family: f }).prodotto).toBe(436.5);
  });

  it("a griglia prende la cella della riga: netta degli sconti, o così com'è se è di una linea fornitore", () => {
    const f = famiglia({ modalita_prezzo_base: "griglia", prezzo_base_mode: "acquisto_markup", sconto_fornitore_1: 32 });
    expect(calcolaCostoPosizione({ ...base, quantita: 2, family: f, cella: { prezzo_acquisto: 500 } }).prodotto).toBe(680);
    expect(
      calcolaCostoPosizione({ ...base, family: f, cella: { prezzo_acquisto: 500, supplier_product_line_id: "linea" } }).prodotto,
    ).toBe(500);
  });

  it("le varianti aggiungono il loro costo d'acquisto", () => {
    const assi: AsseCosto[] = [
      { codice: "colore", values: [{ id: "ral", maggiorazione_tipo: "percentuale", maggiorazione_acquisto: 10 }] },
      { codice: "maniglia", values: [{ id: "ottone", maggiorazione_tipo: "fisso_pz", maggiorazione_acquisto: 20 }] },
    ];
    const costo = calcolaCostoPosizione({
      ...base,
      quantita: 2,
      family: famiglia({ prezzo_base_acquisto: 100 }),
      selections: { colore: "ral", maniglia: "ottone" },
      axes: assi,
    });
    // (100 × 2) × 1,10 + 20 × 2
    expect(costo.prodotto).toBe(260);
  });

  it("una variante col suo prezzo prende anche il suo costo", () => {
    const assi: AsseCosto[] = [
      { codice: "potenza", values: [{ id: "450w", maggiorazione_tipo: "none", prezzo_vendita: 400, prezzo_acquisto: 300 }] },
    ];
    expect(
      calcolaCostoPosizione({ ...base, family: famiglia({ prezzo_base_acquisto: 100 }), selections: { potenza: "450w" }, axes: assi }).prodotto,
    ).toBe(300);
  });

  it("la posa compresa costa la tariffa o l'importo manuale, e niente se esclusa", () => {
    const tariffeCosti = new Map([["posa", 30]]);
    const conTariffa = famiglia({ prezzo_base_acquisto: 100, manodopera_modalita: "tariffa", posa_tariffa_default_id: "posa" });
    expect(calcolaCostoPosizione({ ...base, quantita: 2, family: conTariffa, tariffeCosti }).posa).toBe(60);
    expect(calcolaCostoPosizione({ ...base, quantita: 2, family: conTariffa, tariffeCosti, posaEsclusa: true }).posa).toBe(0);
    const manuale = famiglia({ prezzo_base_acquisto: 100, manodopera_modalita: "manuale", manodopera_costo_acquisto: 25 });
    expect(calcolaCostoPosizione({ ...base, family: manuale }).posa).toBe(25);
  });

  it("un ribasso della variante più grande del prezzo non porta né il prezzo né il costo sotto zero", () => {
    const assi = [{ codice: "linea", values: [
      { id: "svendita", maggiorazione_tipo: "fisso_pz" as const, maggiorazione_valore: -150, maggiorazione_acquisto: -150 },
    ] }];
    expect(applyMaggiorazioniAssi(100, { linea: "svendita" }, assi, 1200, 1400, 1, "pz")).toBe(0);
    expect(
      calcolaCostoPosizione({ ...base, family: famiglia({ prezzo_base_acquisto: 60 }), selections: { linea: "svendita" }, axes: assi }).prodotto,
    ).toBe(0);
    // Un ribasso che ci sta resta un ribasso: 100 − 8%.
    const meno8 = [{ codice: "linea", values: [{ id: "eco", maggiorazione_tipo: "percentuale" as const, maggiorazione_valore: -8 }] }];
    expect(applyMaggiorazioniAssi(100, { linea: "eco" }, meno8, null, null, 1, "pz")).toBe(92);
  });
});

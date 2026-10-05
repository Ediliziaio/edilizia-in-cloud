import { describe, expect, it } from "vitest";
import { allineaRigheAlKm, quantitaInizialeTariffa } from "@/lib/listino/tariffaAlKm";

/**
 * Tariffe al km nel preventivo generico (05/10/2026): la quantità della riga
 * sono i km, e le righe seguono la distanza del cantiere quando cambia.
 */

describe("quantità con cui nasce la riga", () => {
  const alKm = { unita: "km", unita_fatturazione: "km" };

  it("al km vale la distanza del cantiere", () => {
    expect(quantitaInizialeTariffa(alKm, 45)).toEqual({ quantita: 45, mancaDistanza: false });
    expect(quantitaInizialeTariffa(alKm, 12.345)).toEqual({ quantita: 12.35, mancaDistanza: false });
  });

  it("senza distanza nasce a 1 da correggere, e lo dice", () => {
    expect(quantitaInizialeTariffa(alKm, 0)).toEqual({ quantita: 1, mancaDistanza: true });
    expect(quantitaInizialeTariffa(alKm, null)).toEqual({ quantita: 1, mancaDistanza: true });
  });

  it("riconosce il km anche sotto il «pz» di default", () => {
    expect(quantitaInizialeTariffa({ unita: "km", unita_fatturazione: "pz" }, 30).quantita).toBe(30);
  });

  it("le altre unità nascono a 1, distanza o no", () => {
    expect(quantitaInizialeTariffa({ unita_fatturazione: "a_corpo" }, 45)).toEqual({ quantita: 1, mancaDistanza: false });
    expect(quantitaInizialeTariffa({ unita_fatturazione: "h" }, 0)).toEqual({ quantita: 1, mancaDistanza: false });
  });
});

describe("le righe al km seguono la distanza", () => {
  const riga = (quantity: number, extra: Record<string, unknown> = {}) => ({
    tariffa_id: "t-km", unit_of_measure: "km", quantity, ...extra,
  });

  it("le righe con la distanza di prima prendono la nuova; il doppio scritto a mano resta", () => {
    const righe = [riga(45), riga(90), riga(45, { tariffa_id: null }), riga(45, { unit_of_measure: "pz" })];
    expect(allineaRigheAlKm(righe, 45, 60).map((r) => r.quantity)).toEqual([60, 90, 45, 45]);
  });

  it("senza una distanza prima, le righe nate a 1 km prendono quella nuova", () => {
    expect(allineaRigheAlKm([riga(1), riga(7)], 0, 30).map((r) => r.quantity)).toEqual([30, 7]);
  });

  it("una distanza cancellata non tocca niente, e senza cambi torna lo stesso array", () => {
    const righe = [riga(45)];
    expect(allineaRigheAlKm(righe, 45, 0)).toBe(righe);
    expect(allineaRigheAlKm(righe, 30, 60)).toBe(righe);
  });
});

import { describe, expect, it } from "vitest";
import { voceVuota } from "@/lib/computo/editorNativo";
import { fasiDaRighe, fasiPerIlDatabase, righeDaPreventivo, righeDaVociComputo } from "@/lib/orders/fasiDaComputo";

const voce = (capitolo: string, descrizione: string, unita: string, quantita: string, prezzo: string, extra = {}) =>
  ({ ...voceVuota(), capitolo, descrizione, unita, quantita, prezzo, ...extra });

describe("Computo → fasi della commessa (14/11/2026)", () => {
  it("un capitolo, una fase; una riga, una voce con quantità, unità e importo", () => {
    const righe = righeDaVociComputo([
      voce("Demolizioni", "Demolizione tramezze", "mq", "120", "20"),
      voce("Murature", "Tramezza in laterizio", "mq", "80", "40"),
      voce("Demolizioni", "Trasporto a discarica", "mc", "18", "50"),
    ]);
    const fasi = fasiDaRighe(righe, []);
    expect(fasi.map((f) => f.nome)).toEqual(["Demolizioni", "Murature"]);
    expect(fasi[0]).toMatchObject({ importo: 3300, presente: false });
    expect(fasi[0].voci).toEqual([
      { descrizione: "Demolizione tramezze", unita: "mq", quantita: 120, importo: 2400 },
      { descrizione: "Trasporto a discarica", unita: "mc", quantita: 18, importo: 900 },
    ]);
  });

  it("detrazioni e righe senza descrizione restano fuori; senza capitolo: «Lavorazioni»", () => {
    const righe = righeDaVociComputo([
      voce("", "Pulizia finale", "a corpo", "1", "300"),
      voce("Bonus", "Sconto in fattura", "a corpo", "1", "-500", { detrazione: true }),
      voce("Murature", "   ", "mq", "1", "1"),
    ]);
    expect(righe).toEqual([{ capitolo: "Lavorazioni", descrizione: "Pulizia finale", unita: "a corpo", quantita: 1, importo: 300 }]);
  });

  it("le fasi che la commessa ha già sono segnate e non partono, anche scritte diverse", () => {
    const fasi = fasiDaRighe(righeDaVociComputo([voce("Demolizioni", "A", "mq", "1", "1"), voce("Murature", "B", "mq", "1", "1")]), ["  demolizioni "]);
    expect(fasi.map((f) => f.presente)).toEqual([true, false]);
    expect(fasiPerIlDatabase(fasi, new Set(["Demolizioni", "Murature"])).map((f) => f.nome)).toEqual(["Murature"]);
  });

  it("dal preventivo: il capitolo se c'è, altrimenti il titolo; le righe opzionali restano fuori", () => {
    const righe = righeDaPreventivo([
      { name: "Massetto", description: null, quantity: 50, unit_of_measure: "mq", line_total: 1500, custom_field_values: { computo: { capitolo: "Sottofondi" } } },
      { name: "Posa pavimento", description: null, quantity: 50, unit_of_measure: "mq", line_total: 1750 },
      { name: "Battiscopa", description: null, quantity: 30, unit_of_measure: "ml", line_total: 300, is_optional: true },
    ], "Bagno Rossi");
    expect(fasiDaRighe(righe, []).map((f) => [f.nome, f.voci.length, f.importo])).toEqual([["Sottofondi", 1, 1500], ["Bagno Rossi", 1, 1750]]);
  });
});

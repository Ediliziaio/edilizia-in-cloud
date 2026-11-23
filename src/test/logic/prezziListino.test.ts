import { describe, expect, it } from "vitest";
import { chiaveCalcestruzzo, chiaveEquivalenza, confrontaConListino, voceDelListino } from "../../../shared/acquisti/prezziListino.ts";

const v = (id: string, descrizione: string, prezzo: number, unita = "mc", codice: string | null = null, sconto_pct = 0) => ({ id, codice, descrizione, unita, prezzo, sconto_pct });
const listino = [
  v("a", "CLS Rck C 25/30 S4 XC1 XC2", 112),
  v("b", "CLS Rck C 28/35 S4 XC1 XC2", 117),
  v("c", "CLS Rck C 30/37 S4 XC1 XC2", 119),
  v("d", "CLS Rck C 32/40 S4 XS1", 127),
  v("e", "Fornitura di cubetti in PVC", 5, "cad"),
  v("f", "Servizio di pompaggio", 5),
  v("g", "Tubo corrugato", 2, "m", "TC-40", 10),
];

describe("calcestruzzo: la classe conta, non le parole", () => {
  it("RCK35 = C 28/35, RCK 37 = C 30/37", () => {
    expect(chiaveCalcestruzzo("126 CLS RCK35 S4 XC1XC2")).toBe(chiaveCalcestruzzo("CLS Rck C 28/35 S4 XC1 XC2"));
    expect(chiaveCalcestruzzo("CLS RCK 37 S4 XC1 XC2")).toBe(chiaveCalcestruzzo("CLS Rck C 30/37 S4 XC1 XC2"));
    expect(chiaveCalcestruzzo("Cubiere PVC")).toBeNull();
    expect(chiaveCalcestruzzo("Cls C 28-35 S4 XC1XC2")).toBe(chiaveCalcestruzzo("CLS Rck C 28/35 S4 XC1 XC2"));
  });
  it("esposizione diversa: un'altra voce", () => {
    expect(voceDelListino({ numero: 1, descrizione: "CLS C32/40 S4 XC1 XC2", codice: null, um: "MC", prezzo: 127 }, listino)).toBeNull();
    expect(voceDelListino({ numero: 1, descrizione: "CLS C32/40 S4 XS1", codice: null, um: "MC", prezzo: 127 }, listino)?.id).toBe("d");
  });
});

describe("fattura contro listino", () => {
  it("in linea, più cara, più bassa; unità diversa o voce sconosciuta: niente", () => {
    const esiti = confrontaConListino([
      { numero: 45, descrizione: "126 CLS RCK35 S4 XC1XC2", codice: "126", um: "MC", prezzo: 117 },
      { numero: 46, descrizione: "CLS RCK 37 S4 XC1 XC2", codice: "169", um: "MC", prezzo: 121 },
      { numero: 47, descrizione: "CLS Rck C 25/30 S4 XC1 XC2", codice: null, um: "MC", prezzo: 110 },
      { numero: 48, descrizione: "Servizio di pompaggio", codice: null, um: "ORA", prezzo: 50 },
      { numero: 49, descrizione: "CUBIERE PVC", codice: null, um: "NR", prezzo: 5 },
    ], listino);
    expect(esiti.map((e) => [e.numero, e.esito, e.prezzoListino])).toEqual([
      [45, "in_linea", 117],
      [46, "piu_caro", 119],
      [47, "piu_basso", 112],
    ]);
    expect(esiti[1].differenzaPct).toBe(1.7);
  });
  it("il codice vince, con lo sconto del listino", () => {
    const [e] = confrontaConListino([{ numero: 1, descrizione: "Corrugato d40", codice: "tc 40", um: "m", prezzo: 2 }], listino);
    expect(e).toMatchObject({ esito: "piu_caro", prezzoListino: 1.8 });
  });
});

describe("abbinamenti ricordati", () => {
  it("«CUBIERE PVC» abbinata una volta ai «cubetti in PVC»: da lì si confronta, per codice o per descrizione", () => {
    const eq = new Map([[chiaveEquivalenza("203", "CUBIERE PVC")!, "e"]]);
    expect(chiaveEquivalenza("203", "CUBIERE PVC")).toBe("C:203");
    const [e] = confrontaConListino([{ numero: 5, descrizione: "CUBIERE PVC", codice: "203", um: "NR", prezzo: 5 }], listino, eq);
    expect(e).toMatchObject({ esito: "in_linea", voce: expect.objectContaining({ id: "e" }) });
    const perDescrizione = new Map([[chiaveEquivalenza(null, "Pompaggio al mc autopompa")!, "f"]]);
    expect(voceDelListino({ numero: 3, descrizione: "POMPAGGIO AL MC AUTOPOMPA", codice: null, um: "MC", prezzo: 5 }, listino, perDescrizione)?.id).toBe("f");
  });
  it("una voce del listino che non c'è più: si torna alle regole", () => {
    const eq = new Map([["C:203", "sparita"]]);
    expect(voceDelListino({ numero: 5, descrizione: "CUBIERE PVC", codice: "203", um: "NR", prezzo: 5 }, listino, eq)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { dataEstesa, formattaEuro, formattaQuantita, rigaDaPrezzare, righeDaPrezzare } from "@/lib/preventivatore/anteprima";
import { faseAperta, minutiRimasti } from "@/lib/preventivatore/fasi";

describe("Anteprima: formati all'italiana", () => {
  it("l'euro ha sempre il punto delle migliaia, anche sotto le cinque cifre", () => {
    expect(formattaEuro(5121)).toBe("€ 5.121");
    expect(formattaEuro(12345.6, 2)).toBe("€ 12.345,60");
    expect(formattaEuro(null)).toBe("—");
    expect(formattaEuro(Number.NaN)).toBe("—");
  });

  it("la quantità come la scrive una riga di preventivo", () => {
    expect(formattaQuantita(3, "pz")).toBe("3");
    expect(formattaQuantita(3)).toBe("3");
    expect(formattaQuantita(12.5, "mq")).toBe("12,5 mq");
    expect(formattaQuantita(1, "a corpo")).toBe("a corpo");
    expect(formattaQuantita(2, "ore")).toBe("2 ore");
  });

  it("la data per esteso", () => {
    expect(dataEstesa(new Date("2026-10-05T10:00:00"))).toBe("5 ottobre 2026");
  });
});

describe("Anteprima: voci da prezzare", () => {
  it("senza totale o a 0 € una riga è da prezzare; i gruppi si sommano", () => {
    expect(rigaDaPrezzare({ totale: null })).toBe(true);
    expect(rigaDaPrezzare({ totale: 0 })).toBe(true);
    expect(rigaDaPrezzare({ totale: 120 })).toBe(false);
    const gruppi = [
      { id: "a", titolo: "A", righe: [{ id: "1", titolo: "x", quantita: 1, prezzoUnitario: null, totale: null }, { id: "2", titolo: "y", quantita: 1, prezzoUnitario: 5, totale: 5 }] },
      { id: "b", titolo: "B", righe: [{ id: "3", titolo: "z", quantita: 1, prezzoUnitario: 0, totale: 0 }] },
    ];
    expect(righeDaPrezzare({ gruppi })).toBe(2);
  });
});

describe("Barra delle fasi: regole", () => {
  it("indietro sempre libero; avanti solo se completata o la successiva; mai se bloccata", () => {
    expect(faseAperta(0, 2, false, false)).toBe(true); // indietro
    expect(faseAperta(2, 2, false, false)).toBe(true); // la corrente
    expect(faseAperta(3, 2, false, false)).toBe(true); // la successiva
    expect(faseAperta(4, 2, false, false)).toBe(false); // due avanti, non completata
    expect(faseAperta(4, 2, true, false)).toBe(true); // già completata
    expect(faseAperta(0, 2, false, true)).toBe(false); // bloccata vince su tutto
  });

  it("i minuti che restano: un minuto e mezzo per fase, mai zero se manca ancora qualcosa", () => {
    expect(minutiRimasti(6, 5)).toBe(0);
    expect(minutiRimasti(6, 4)).toBe(2);
    expect(minutiRimasti(6, 0)).toBe(8);
    expect(minutiRimasti(2, 0)).toBe(2);
  });
});

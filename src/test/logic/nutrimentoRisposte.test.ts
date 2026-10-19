import { describe, expect, it } from "vitest";
import { classificaRispostaNutrimento, testoNuovoRisposta } from "../../../supabase/functions/_shared/nutrimentoRisposte";
import { giornoAmmesso, inPeriodoEscluso, leggiPeriodi } from "../../../supabase/functions/_shared/attesaCalendario";

describe("nutrimento: le risposte «meno» e «basta così»", () => {
  it("riconosce «meno» e «basta così» nel testo scritto dalla persona", () => {
    expect(classificaRispostaNutrimento("Meno")).toBe("meno");
    expect(classificaRispostaNutrimento("meno grazie, troppe email")).toBe("meno");
    expect(classificaRispostaNutrimento("Basta così")).toBe("basta");
    expect(classificaRispostaNutrimento("basta così, grazie.")).toBe("basta");
    expect(classificaRispostaNutrimento("Per favore cancellatemi")).toBe("basta");
  });

  it("non si fa ingannare dalla citazione della nostra email", () => {
    const risposta = "Mattina, ho 4 cantieri aperti.\n\nIl giorno lun 19 ott 2026 Flo ha scritto:\n> basta rispondere «meno» per scendere a 1 a settimana\n> o «basta così» per uscire";
    expect(testoNuovoRisposta(risposta)).toBe("Mattina, ho 4 cantieri aperti.");
    expect(classificaRispostaNutrimento(risposta)).toBe("altro");
  });

  it("una risposta normale non tocca il nutrimento", () => {
    expect(classificaRispostaNutrimento("Pomeriggio, dopo le 17")).toBe("altro");
    expect(classificaRispostaNutrimento("Ne ho almeno di meno di quello che pensi")).toBe("altro");
  });
});

describe("nutrimento: ferie a date esatte", () => {
  const ferie = leggiPeriodi("08-10/08-24, 12-24/01-06");
  const giorno = (anno: number, mese: number, g: number) => ({ anno, mese, giorno: g, giornoSettimana: new Date(Date.UTC(anno, mese - 1, g)).getUTCDay() });

  it("legge i periodi, anche a cavallo dell'anno", () => {
    expect(ferie).toEqual([{ da: 810, a: 824 }, { da: 1224, a: 106 }]);
    expect(inPeriodoEscluso(giorno(2026, 8, 10), ferie)).toBe(true);
    expect(inPeriodoEscluso(giorno(2026, 8, 25), ferie)).toBe(false);
    expect(inPeriodoEscluso(giorno(2026, 12, 31), ferie)).toBe(true);
    expect(inPeriodoEscluso(giorno(2027, 1, 6), ferie)).toBe(true);
    expect(inPeriodoEscluso(giorno(2027, 1, 7), ferie)).toBe(false);
  });

  it("in ferie il giorno non è ammesso; fuori sì, tutti i giorni della settimana", () => {
    const regole = { giorni: [], settimane: [], settimaneEscluse: [], periodiEsclusi: ferie };
    expect(giornoAmmesso(giorno(2026, 12, 25), regole)).toBe(false);
    expect(giornoAmmesso(giorno(2026, 10, 25), regole)).toBe(true);
  });

  it("scarta i periodi scritti male", () => {
    expect(leggiPeriodi("13-01/14-02, ciao, 08-10/08-24")).toEqual([{ da: 810, a: 824 }]);
  });
});

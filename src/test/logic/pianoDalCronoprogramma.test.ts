import { describe, expect, it } from "vitest";
import {
  datePerFasi, giorniDelPiano, giorniLavorativiDellaDurata, pianoDaCronoprogrammaComputo, pianoDaFasiDelPreventivo,
  piuGiorniLavorativi, primoGiornoLavorativo,
} from "@/lib/orders/pianoDalCronoprogramma";

/** Le fasi della commessa prendono i tempi dal cronoprogramma del preventivo firmato (31/10/2026). */
describe("cronoprogramma del preventivo → date delle fasi della commessa", () => {
  it("legge le durate scritte a parole in giorni lavorativi", () => {
    expect(giorniLavorativiDellaDurata("3 giorni")).toBe(3);
    expect(giorniLavorativiDellaDurata("2 settimane")).toBe(10);
    expect(giorniLavorativiDellaDurata("1-2 settimane")).toBe(8);
    expect(giorniLavorativiDellaDurata("un mese")).toBe(22);
    expect(giorniLavorativiDellaDurata("5 gg")).toBe(5);
    expect(giorniLavorativiDellaDurata("a seconda del meteo")).toBeNull();
  });

  it("le fasi del preventivo vanno una dopo l'altra; quella senza durata conta un giorno e si dice", () => {
    const { piano, senzaDurata } = pianoDaFasiDelPreventivo([
      { fase: "Demolizioni", durata: "3 giorni", descrizione: null },
      { fase: "Impianti", durata: "2 settimane", descrizione: null },
      { fase: "Pulizie", durata: null, descrizione: null },
      { fase: "  ", durata: "1 giorno", descrizione: null },
    ]);
    expect(piano).toEqual([
      { nome: "Demolizioni", giornoInizio: 1, giorni: 3 },
      { nome: "Impianti", giornoInizio: 4, giorni: 10 },
      { nome: "Pulizie", giornoInizio: 14, giorni: 1 },
    ]);
    expect(senzaDurata).toEqual(["Pulizie"]);
    expect(giorniDelPiano(piano)).toBe(14);
  });

  it("il computo tiene giorni e sovrapposizioni, e la sua data d'inizio", () => {
    const { piano, inizioSuggerito } = pianoDaCronoprogrammaComputo({
      dataInizio: "9/11/2026",
      fasi: [{ nome: "Impianti", inizio: 3, durata: 4 }, { nome: "Scavi", inizio: 1, durata: 3 }],
    });
    expect(piano).toEqual([{ nome: "Scavi", giornoInizio: 1, giorni: 3 }, { nome: "Impianti", giornoInizio: 3, giorni: 4 }]);
    expect(inizioSuggerito).toBe("2026-11-09");
  });

  it("le date saltano sabato e domenica", () => {
    expect(primoGiornoLavorativo("2026-11-07")).toBe("2026-11-09"); // sabato → lunedì
    expect(piuGiorniLavorativi("2026-11-13", 1)).toBe("2026-11-16"); // venerdì + 1 → lunedì
    expect(datePerFasi([
      { nome: "Demolizioni", giornoInizio: 1, giorni: 3 },
      { nome: "Impianti", giornoInizio: 4, giorni: 5 },
    ], "2026-11-09")).toEqual([
      { nome: "Demolizioni", inizio: "2026-11-09", fine: "2026-11-11" },
      { nome: "Impianti", inizio: "2026-11-12", fine: "2026-11-18" },
    ]);
  });
});

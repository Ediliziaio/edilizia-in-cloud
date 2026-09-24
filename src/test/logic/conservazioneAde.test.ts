// Conservazione a norma: la convenzione con l'Agenzia delle Entrate dura tre
// anni e si rinnova da sola (FAQ n. 34, aggiornata il 23/04/2021). Non scade:
// la pagina ricorda solo di controllare che il rinnovo risulti nel portale.
import { describe, it, expect } from "vitest";
import { conservazioneRetroattivaDal, statoConservazione } from "@/lib/fatturazione/conservazioneAde";

describe("statoConservazione", () => {
  it("senza data: da segnare", () => {
    expect(statoConservazione(null, "2026-09-24")).toEqual({ stato: "da_segnare" });
    expect(statoConservazione("", "2026-09-24")).toEqual({ stato: "da_segnare" });
    expect(statoConservazione("24/09/2026", "2026-09-24")).toEqual({ stato: "da_segnare" });
  });

  it("aderito oggi: il primo rinnovo fra tre anni", () => {
    expect(statoConservazione("2026-09-24", "2026-09-24")).toEqual({ stato: "attiva", prossimoRinnovo: "2029-09-24", giorni: 1096 });
  });

  it("il giorno del rinnovo e per 30 giorni dopo: da controllare nel portale, mai «scaduta»", () => {
    expect(statoConservazione("2023-09-24", "2026-09-24"))
      .toEqual({ stato: "da_controllare", rinnovataIl: "2026-09-24", prossimoRinnovo: "2029-09-24" });
    expect(statoConservazione("2023-08-25", "2026-09-24").stato).toBe("da_controllare");
    expect(statoConservazione("2023-08-24", "2026-09-24"))
      .toEqual({ stato: "attiva", prossimoRinnovo: "2029-08-24", giorni: 1065 });
  });

  it("si rinnova ogni tre anni, anche dopo il primo", () => {
    expect(statoConservazione("2018-12-15", "2026-09-24")).toMatchObject({ stato: "attiva", prossimoRinnovo: "2027-12-15" });
    expect(statoConservazione("2020-09-20", "2026-09-24")).toMatchObject({ stato: "da_controllare", rinnovataIl: "2026-09-20" });
  });

  it("dal 29 febbraio: i rinnovi cadono il 1° marzo", () => {
    expect(statoConservazione("2024-02-29", "2026-09-24")).toMatchObject({ prossimoRinnovo: "2027-03-01" });
  });
});

describe("conservazioneRetroattivaDal", () => {
  it("dal 1° gennaio del secondo anno prima dell'adesione", () => {
    expect(conservazioneRetroattivaDal(2026)).toBe("2024-01-01");
  });
});

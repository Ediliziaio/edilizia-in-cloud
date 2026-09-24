// Conservazione a norma: l'adesione al servizio dell'Agenzia delle Entrate dura
// tre anni, e la pagina delle impostazioni deve dire quando rinnovarla.
import { describe, it, expect } from "vitest";
import { statoConservazione } from "@/lib/fatturazione/conservazioneAde";

describe("statoConservazione", () => {
  it("senza data: da segnare", () => {
    expect(statoConservazione(null, "2026-09-24")).toEqual({ stato: "da_segnare" });
    expect(statoConservazione("", "2026-09-24")).toEqual({ stato: "da_segnare" });
    expect(statoConservazione("24/09/2026", "2026-09-24")).toEqual({ stato: "da_segnare" });
  });

  it("aderito oggi: valida per tre anni", () => {
    expect(statoConservazione("2026-09-24", "2026-09-24")).toEqual({ stato: "attiva", scade: "2029-09-24", giorni: 1096 });
  });

  it("a 90 giorni dalla scadenza chiede di rinnovare, a 91 no", () => {
    expect(statoConservazione("2023-12-23", "2026-09-24").stato).toBe("in_scadenza");
    expect(statoConservazione("2023-12-24", "2026-09-24").stato).toBe("attiva");
  });

  it("l'ultimo giorno è ancora valida, il giorno dopo è scaduta", () => {
    expect(statoConservazione("2023-09-24", "2026-09-24")).toEqual({ stato: "in_scadenza", scade: "2026-09-24", giorni: 0 });
    expect(statoConservazione("2023-09-23", "2026-09-24")).toEqual({ stato: "scaduta", scade: "2026-09-23", giorni: -1 });
  });

  it("dal 29 febbraio: scade il 1° marzo del terzo anno", () => {
    expect(statoConservazione("2024-02-29", "2026-09-24")).toMatchObject({ scade: "2027-03-01" });
  });
});

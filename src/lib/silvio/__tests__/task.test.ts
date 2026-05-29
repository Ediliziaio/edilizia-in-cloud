import { describe, it, expect } from "vitest";
import { prossimoPassoEseguibile, statoTaskDaPassi, taskChiuso, avanzamento, type Passo } from "../task";

const P = (ordine: number, stato: Passo["stato"]): Passo => ({ ordine, azione_chiave: "x", stato });

describe("prossimoPassoEseguibile — ripresa senza rifare", () => {
  it("salta i fatti, ritorna il primo da_fare", () => {
    expect(prossimoPassoEseguibile([P(0, "fatto"), P(1, "fatto"), P(2, "da_fare"), P(3, "da_fare")])).toBe(2);
  });
  it("si ferma al passo che attende conferma (bloccante)", () => {
    expect(prossimoPassoEseguibile([P(0, "fatto"), P(1, "attende_conferma"), P(2, "da_fare")])).toBeNull();
  });
  it("si ferma su un fallito", () => {
    expect(prossimoPassoEseguibile([P(0, "fatto"), P(1, "fallito"), P(2, "da_fare")])).toBeNull();
  });
  it("tutti terminati → null", () => {
    expect(prossimoPassoEseguibile([P(0, "fatto"), P(1, "saltato")])).toBeNull();
  });
  it("ordine non garantito in input → riordina", () => {
    expect(prossimoPassoEseguibile([P(2, "da_fare"), P(0, "fatto"), P(1, "fatto")])).toBe(2);
  });
});

describe("statoTaskDaPassi", () => {
  it("vuoto → aperto", () => expect(statoTaskDaPassi([])).toBe("aperto"));
  it("conferma ha precedenza", () => expect(statoTaskDaPassi([P(0, "fatto"), P(1, "attende_conferma"), P(2, "fallito")])).toBe("in_attesa_conferma"));
  it("fallito se nessuna conferma", () => expect(statoTaskDaPassi([P(0, "fatto"), P(1, "fallito")])).toBe("fallito"));
  it("tutti fatti/saltati → completato", () => expect(statoTaskDaPassi([P(0, "fatto"), P(1, "saltato")])).toBe("completato"));
  it("misti senza blocchi → in_corso", () => expect(statoTaskDaPassi([P(0, "fatto"), P(1, "da_fare")])).toBe("in_corso"));
});

describe("taskChiuso + avanzamento", () => {
  it("chiuso", () => {
    expect(taskChiuso("completato")).toBe(true);
    expect(taskChiuso("in_corso")).toBe(false);
  });
  it("avanzamento conta i terminati", () => {
    expect(avanzamento([P(0, "fatto"), P(1, "saltato"), P(2, "da_fare")])).toEqual({ fatti: 2, totale: 3 });
  });
});

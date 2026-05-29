import { describe, it, expect } from "vitest";
import {
  sostituisciVariabili,
  calcolaProssimoInvio,
  isDovuto,
  valutaStop,
  entroLimiteInvii,
  richiedeOptOut,
  buildOptOutFooter,
  avanzaEsecuzione,
  normalizzaEmail,
  type SequenzaStep,
} from "../sequenze";

const STEP: SequenzaStep[] = [
  { offset_giorni: 3, oggetto: "Ha visto il preventivo {{numero}}?", corpo_template: "Ciao {{nome}}, le ricordo il preventivo da {{importo}}." },
  { offset_giorni: 7, oggetto: "Secondo promemoria", corpo_template: "Resto a disposizione, {{nome}}." },
];

describe("sostituisciVariabili", () => {
  it("sostituisce le chiavi note", () => {
    expect(sostituisciVariabili("Ciao {{nome}}", { nome: "Mario" })).toBe("Ciao Mario");
  });
  it("tollera spazi nei segnaposto", () => {
    expect(sostituisciVariabili("Importo {{ importo }}", { importo: 1500 })).toBe("Importo 1500");
  });
  it("chiavi sconosciute → stringa vuota (mai 'undefined')", () => {
    expect(sostituisciVariabili("Ciao {{nome}} {{cognome}}", { nome: "Mario" })).toBe("Ciao Mario ");
  });
  it("null/undefined → stringa vuota", () => {
    expect(sostituisciVariabili("X{{a}}Y", { a: null })).toBe("XY");
    expect(sostituisciVariabili("X{{a}}Y", { a: undefined })).toBe("XY");
  });
  it("template vuoto → vuoto", () => expect(sostituisciVariabili("", { a: 1 })).toBe(""));
});

describe("calcolaProssimoInvio", () => {
  it("step 0 = ancora + offset giorni", () => {
    const r = calcolaProssimoInvio("2026-05-01T10:00:00Z", STEP, 0);
    expect(r?.toISOString()).toBe("2026-05-04T10:00:00.000Z");
  });
  it("step 1 = ancora + 7gg", () => {
    const r = calcolaProssimoInvio("2026-05-01T10:00:00Z", STEP, 1);
    expect(r?.toISOString()).toBe("2026-05-08T10:00:00.000Z");
  });
  it("stepIndex fuori range → null", () => {
    expect(calcolaProssimoInvio("2026-05-01T10:00:00Z", STEP, 2)).toBeNull();
    expect(calcolaProssimoInvio("2026-05-01T10:00:00Z", STEP, -1)).toBeNull();
  });
  it("offset mancante → 0 giorni", () => {
    const r = calcolaProssimoInvio("2026-05-01T00:00:00Z", [{ offset_giorni: undefined as unknown as number, oggetto: "", corpo_template: "" }], 0);
    expect(r?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("isDovuto", () => {
  const ora = new Date("2026-05-10T12:00:00Z");
  it("attiva + scaduto → true", () => expect(isDovuto("2026-05-10T11:00:00Z", "attiva", ora)).toBe(true));
  it("attiva + futuro → false", () => expect(isDovuto("2026-05-11T00:00:00Z", "attiva", ora)).toBe(false));
  it("non attiva → false anche se scaduto", () => expect(isDovuto("2026-05-01T00:00:00Z", "in_attesa_conferma", ora)).toBe(false));
  it("prossimo_invio null → false", () => expect(isDovuto(null, "attiva", ora)).toBe(false));
});

describe("valutaStop — la risposta vince su tutto", () => {
  it("risposta → fermata_risposta (priorità assoluta)", () => {
    expect(valutaStop({ haRisposto: true, suppression: "hard_bounce", optOut: true })).toBe("fermata_risposta");
  });
  it("hard bounce → bounce", () => expect(valutaStop({ suppression: "hard_bounce" })).toBe("bounce"));
  it("spam complaint → bounce", () => expect(valutaStop({ suppression: "spam_complaint" })).toBe("bounce"));
  it("unsubscribe → opt_out", () => expect(valutaStop({ suppression: "unsubscribe" })).toBe("opt_out"));
  it("optOut esplicito → opt_out", () => expect(valutaStop({ optOut: true })).toBe("opt_out"));
  it("obiettivo raggiunto → completata", () => expect(valutaStop({ obiettivoRaggiunto: true })).toBe("completata"));
  it("nessuna condizione → null (prosegue)", () => expect(valutaStop({})).toBeNull());
});

describe("entroLimiteInvii", () => {
  it("sotto il limite → true", () => expect(entroLimiteInvii(10, 50)).toBe(true));
  it("al limite → false", () => expect(entroLimiteInvii(50, 50)).toBe(false));
  it("limite 0/negativo → false (blocca)", () => {
    expect(entroLimiteInvii(0, 0)).toBe(false);
    expect(entroLimiteInvii(0, -1)).toBe(false);
  });
});

describe("opt-out: marketing sì, transazionale no", () => {
  it("ricontatto_opportunita richiede opt-out", () => expect(richiedeOptOut("ricontatto_opportunita")).toBe(true));
  it("altro richiede opt-out", () => expect(richiedeOptOut("altro")).toBe(true));
  it("sollecito_pagamento NON richiede opt-out (transazionale)", () => expect(richiedeOptOut("sollecito_pagamento")).toBe(false));
  it("followup_preventivo NON richiede opt-out", () => expect(richiedeOptOut("followup_preventivo")).toBe(false));
  it("footer presente solo per marketing", () => {
    expect(buildOptOutFooter("ricontatto_opportunita", "https://x/optout?t=abc")).toContain("Disiscriviti");
    expect(buildOptOutFooter("sollecito_pagamento", "https://x/optout?t=abc")).toBe("");
    expect(buildOptOutFooter("ricontatto_opportunita", "")).toBe("");
  });
});

describe("avanzaEsecuzione", () => {
  it("dopo step 0 → attiva, prossimo = step 1", () => {
    const r = avanzaEsecuzione("2026-05-01T10:00:00Z", STEP, 0);
    expect(r.stato).toBe("attiva");
    expect(r.stepCorrente).toBe(1);
    expect(r.prossimoInvioAt?.toISOString()).toBe("2026-05-08T10:00:00.000Z");
  });
  it("dopo l'ultimo step → completata", () => {
    const r = avanzaEsecuzione("2026-05-01T10:00:00Z", STEP, 1);
    expect(r.stato).toBe("completata");
    expect(r.prossimoInvioAt).toBeNull();
  });
});

describe("normalizzaEmail", () => {
  it("trim + lowercase", () => expect(normalizzaEmail("  Mario.Rossi@Example.IT ")).toBe("mario.rossi@example.it"));
  it("stringa vuota tollerata", () => expect(normalizzaEmail("")).toBe(""));
});

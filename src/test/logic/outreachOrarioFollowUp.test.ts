import { describe, it, expect } from "vitest";
import {
  distanzaTraOrari, orarioTroppoVicino, orarioFollowUp, minutoDelGiorno, isWithinSendWindow, type SendWindow,
} from "../../../supabase/functions/_shared/outreach-schedule";

// Settembre 2026 = ora legale (CEST, +2): 2026-09-14 lunedì, 2026-09-17 giovedì.
// Gennaio 2026 = ora solare (CET, +1): 2026-01-12 lunedì, 2026-01-15 giovedì.
const ROMA = "Europe/Rome";
const THERMODMR: SendWindow = { days: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 19, timeZone: ROMA };
const TRE_GIORNI = 3 * 86_400_000;
const giornoLocale = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ROMA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

describe("distanzaTraOrari — sul giro delle 24 ore", () => {
  it("stessa ora = 0, tre ore = 180", () => {
    expect(distanzaTraOrari(550, 550)).toBe(0);
    expect(distanzaTraOrari(550, 730)).toBe(180);
  });
  it("a cavallo della mezzanotte: 23:30 e 00:30 distano un'ora", () => {
    expect(distanzaTraOrari(23 * 60 + 30, 30)).toBe(60);
  });
});

describe("orarioTroppoVicino — mai alla stessa ora dell'email prima", () => {
  const prima = new Date("2026-09-14T07:10:00Z"); // lunedì 09:10 a Roma
  it("tre giorni dopo alle 09:40 è troppo vicino", () => {
    expect(orarioTroppoVicino(new Date("2026-09-17T07:40:00Z"), prima, ROMA)).toBe(true);
  });
  it("tre giorni dopo alle 07:30, un'ora e quaranta prima, è ancora troppo vicino", () => {
    expect(orarioTroppoVicino(new Date("2026-09-17T05:30:00Z"), prima, ROMA)).toBe(true);
  });
  it("tre ore esatte dopo va bene", () => {
    expect(orarioTroppoVicino(new Date("2026-09-17T10:10:00Z"), prima, ROMA)).toBe(false);
  });
  it("tre ore esatte prima va bene", () => {
    expect(orarioTroppoVicino(new Date("2026-09-17T04:10:00Z"), prima, ROMA)).toBe(false);
  });
});

describe("orarioFollowUp — l'orario del follow-up", () => {
  const casi = [0, 0.13, 0.5, 0.87, 0.999999];

  it("email del mattino (09:10) → follow-up al pomeriggio del giorno previsto, ad almeno 3 ore", () => {
    const prima = new Date("2026-09-14T07:10:00Z");
    const previsto = new Date(prima.getTime() + TRE_GIORNI);
    for (const caso of casi) {
      const d = orarioFollowUp(previsto, prima, THERMODMR, caso);
      const minuto = minutoDelGiorno(d, ROMA);
      expect(giornoLocale(d)).toBe("2026-09-17");
      expect(minuto).toBeGreaterThanOrEqual(12 * 60 + 10);
      expect(minuto).toBeLessThan(18 * 60 + 45);
      expect(isWithinSendWindow(d, THERMODMR)).toBe(true);
      expect(orarioTroppoVicino(d, prima, ROMA)).toBe(false);
    }
  });

  it("email del pomeriggio (16:40) → follow-up al mattino, ad almeno 3 ore", () => {
    const prima = new Date("2026-09-14T14:40:00Z");
    const previsto = new Date(prima.getTime() + TRE_GIORNI);
    for (const caso of casi) {
      const d = orarioFollowUp(previsto, prima, THERMODMR, caso);
      const minuto = minutoDelGiorno(d, ROMA);
      expect(giornoLocale(d)).toBe("2026-09-17");
      expect(minuto).toBeGreaterThanOrEqual(7 * 60);
      expect(minuto).toBeLessThan(13 * 60 + 40);
      expect(orarioTroppoVicino(d, prima, ROMA)).toBe(false);
    }
  });

  it("casi diversi = orari diversi: i follow-up non partono tutti allo stesso minuto", () => {
    const prima = new Date("2026-09-14T07:10:00Z");
    const previsto = new Date(prima.getTime() + TRE_GIORNI);
    const orari = new Set(casi.map((c) => orarioFollowUp(previsto, prima, THERMODMR, c).getTime()));
    expect(orari.size).toBe(casi.length);
  });

  it("vale anche con l'ora solare (+1)", () => {
    const prima = new Date("2026-01-12T08:10:00Z"); // lunedì 09:10 a Roma
    const previsto = new Date(prima.getTime() + TRE_GIORNI);
    const d = orarioFollowUp(previsto, prima, THERMODMR, 0.5);
    expect(giornoLocale(d)).toBe("2026-01-15");
    expect(isWithinSendWindow(d, THERMODMR)).toBe(true);
    expect(orarioTroppoVicino(d, prima, ROMA)).toBe(false);
  });

  it("finestra troppo stretta per stare a 3 ore: l'orario resta com'è e decide il controllo all'invio", () => {
    const stretta: SendWindow = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 12, timeZone: ROMA };
    const prima = new Date("2026-09-14T08:00:00Z"); // 10:00 a Roma
    const previsto = new Date(prima.getTime() + TRE_GIORNI);
    expect(orarioFollowUp(previsto, prima, stretta, 0.5).getTime()).toBe(previsto.getTime());
  });
});

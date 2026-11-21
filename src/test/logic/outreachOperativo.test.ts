import { describe, expect, it } from "vitest";
import { esitoPagina } from "../../../supabase/functions/_shared/outreach-enroll-page";
import { pianoAvvio, type AnteprimaAvvio } from "@/components/admin/outreach/outreachLaunchPlan";

describe("Iscrizioni a pagine", () => {
  it("salva solo il prefisso completato se un contatto attende l'inserimento", () => {
    const contatti = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    expect(esitoPagina(contatti, new Map([["a", "optout"], ["c", "iscritto"], ["d", "optout"]]), false))
      .toEqual({ optout: 1, valutati: 1, altri: true, next_cursor: "a" });
  });

  it("avanza anche dopo 5.000 esclusioni, senza saltare il primo idoneo", () => {
    const contatti = Array.from({ length: 5505 }, (_, i) => ({ id: String(i).padStart(5, "0") }));
    let after: string | null = null;
    let valutati = 0;
    let iscritti = 0;
    do {
      const restanti = contatti.filter(({ id }) => after === null || id > after);
      const pagina = restanti.slice(0, 500);
      const report = esitoPagina(pagina, new Map(pagina.map(({ id }) => [id, id < "05000" ? "optout" : "iscritto"])), restanti.length > 500);
      valutati += report.valutati;
      iscritti += report.iscritto ?? 0;
      after = report.next_cursor;
    } while (after);
    expect({ valutati, iscritti }).toEqual({ valutati: 5505, iscritti: 505 });
  });
});

const anteprima: AnteprimaAvvio = {
  versione: "ver-1", blocco: null, stato: "paused", brand: "Prova", mittente: null, risposte_a: null,
  nuovi_per_casella: 4, calcolato_il: "2026-11-20T10:00:00Z",
  finestra: { days: [1, 2, 3, 4, 5, 6], startHour: 8, endHour: 19, timeZone: "Europe/Rome", endHourByDay: { 6: 13 } },
  caselle: [{ id: "box", email: "prova@example.invalid", provider: "smtp", status: "active", tetto: 16,
    base: 16, giorno: 5, passo: 0, daily_sent: 3, daily_sent_date: "2026-11-20", primi_oggi: 3 }],
  destinatari: 30, invii: 30, email: 30, primi_email: 30, arretrati_email: 30, arretrati_primi: 30,
  prima_email: "2026-11-19T10:00:00Z", altri_canali: 0, chiamate: 0, esclusi: 2, cause: { "Email esclusa": 2 },
};

describe("Finestra di ripresa", () => {
  it("stima al massimo il posto residuo dei nuovi, anche con più posti email disponibili", () => {
    const plan = pianoAvvio(anteprima);
    expect(plan.residuo).toBeGreaterThan(1);
    expect(plan.primi).toBe(1);
    expect(plan.arretratiOggi).toBe(1);
    expect(plan.prima?.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("usa la chiusura anticipata del sabato e la prossima apertura a Roma", () => {
    const plan = pianoAvvio({ ...anteprima, calcolato_il: "2026-11-21T13:05:00Z" });
    expect(plan.prima?.toISOString()).toBe("2026-11-23T07:00:00.000Z");
    expect(plan.arretratiOggi).toBe(0);
  });
});

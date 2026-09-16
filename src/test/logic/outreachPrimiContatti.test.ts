import { describe, expect, it } from "vitest";
import {
  assignSenders, effectiveDailyCap, statoPerPrimiContatti, type SenderState,
} from "../../../supabase/functions/_shared/outreach-dispatch-logic";

/**
 * Il tetto dei PRIMI contatti al giorno, separato dai follow-up.
 *
 * Con «5 nuovi al giorno» e sei follow-up, a regime una casella ne spedisce
 * 30-35, non 5: il tetto totale contava tutto insieme. È il numero di
 * sconosciuti raggiunti ogni giorno a decidere la reputazione di una casella,
 * non le risposte a chi già ci conosce.
 */
function casella(over: Partial<SenderState> = {}): SenderState {
  return {
    id: "a", daily_cap_target: 30, warmup_base: 30, warmup_step: 0, warmup_day: 0,
    daily_sent: 0, daily_sent_date: "2026-09-10", ...over,
  } as SenderState;
}

describe("statoPerPrimiContatti", () => {
  it("senza tetto dei nuovi lascia la casella com'è", () => {
    const s = casella();
    expect(statoPerPrimiContatti(s, null, 0, "2026-09-10")).toBe(s);
    expect(statoPerPrimiContatti(s, 0, 0, "2026-09-10")).toBe(s);
  });

  it("i posti per i nuovi sono «nuovi al giorno» meno quelli già spediti", () => {
    const s = statoPerPrimiContatti(casella(), 3, 1, "2026-09-10");
    expect(effectiveDailyCap(s) - s.daily_sent).toBe(2);
  });

  it("i follow-up spediti oggi non mangiano il budget dei nuovi…", () => {
    // 10 già spediti oggi (tutti follow-up), tetto nuovi 3, nessun nuovo ancora.
    const s = statoPerPrimiContatti(casella({ daily_sent: 10 }), 3, 0, "2026-09-10");
    expect(effectiveDailyCap(s) - s.daily_sent).toBe(3);
  });

  it("…ma i nuovi non sfondano mai il tetto totale", () => {
    // Tetto totale 30, 28 già spediti: restano 2 posti, anche se i nuovi sarebbero 5.
    const s = statoPerPrimiContatti(casella({ daily_sent: 28 }), 5, 0, "2026-09-10");
    expect(effectiveDailyCap(s) - s.daily_sent).toBe(2);
  });

  it("rispetta la rampa del warm-up", () => {
    // Giorno 0 di warm-up: base 2 → al massimo 2 anche se i nuovi sarebbero 5.
    const s = statoPerPrimiContatti(casella({ warmup_base: 2, warmup_step: 1, warmup_day: 0 }), 5, 0, "2026-09-10");
    expect(effectiveDailyCap(s) - s.daily_sent).toBe(2);
  });

  it("i contatori di un altro giorno non contano", () => {
    const s = statoPerPrimiContatti(casella({ daily_sent: 25, daily_sent_date: "2026-09-09" }), 3, 0, "2026-09-10");
    expect(effectiveDailyCap(s) - s.daily_sent).toBe(3);
  });

  it("la variazione del tetto non si mangia l'ultimo posto dei nuovi (16/09/2026)", () => {
    // ThermoDMR alle 14:38: tetto 16 (base 10, +3, giorno 2), 5 spediti di cui 4
    // nuovi, nuovi al giorno 5. Il tetto artificiale 6 passava dalla variazione
    // (fino a −15%) e diventava 5: zero posti, per il resto del giorno.
    for (const giorno of ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]) {
      for (const id of ["contatti@thermodmr.eu", "filippo@thermodmr.it", "info@thermodmrinfissi.eu"]) {
        const s = casella({ id, status: "warming", daily_cap_target: 50, warmup_base: 10, warmup_step: 3, warmup_day: 2, daily_sent: 5, daily_sent_date: giorno });
        const stato = statoPerPrimiContatti(s, 5, 4, giorno, giorno);
        const r = assignSenders(["q1", "q2"], [stato], giorno);
        expect(r.assignments).toHaveLength(1);
      }
    }
  });

  it("i nuovi non superano il tetto con la variazione del giorno", () => {
    // Tetto 16, 15 già spediti: con la variazione il tetto del giorno può essere
    // 13-16, quindi al massimo un posto e mai più di quelli che restano davvero.
    const s = casella({ daily_cap_target: 50, warmup_base: 10, warmup_step: 3, warmup_day: 2, daily_sent: 15 });
    const stato = statoPerPrimiContatti(s, 5, 0, "2026-09-10", "2026-09-10");
    expect(effectiveDailyCap(stato) - stato.daily_sent).toBeLessThanOrEqual(1);
  });

  it("dentro assignSenders: tre nuovi al giorno vuol dire tre", () => {
    const stati = [statoPerPrimiContatti(casella(), 3, 0, "2026-09-10")];
    const r = assignSenders(["q1", "q2", "q3", "q4", "q5"], stati, "2026-09-10");
    expect(r.assignments.length).toBeLessThanOrEqual(3);
    expect(r.unassigned.length).toBeGreaterThanOrEqual(2);
  });
});

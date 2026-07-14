import { describe, it, expect } from "vitest";
import {
  remainingTodayOpenWa,
  numberServesContact,
  pickOpenWaNumber,
  totalRemainingOpenWa,
  effectiveCapOpenWa,
  isThrottledOpenWa,
  weekKeyOf,
  weeklyRemainingOpenWa,
  type OpenWaNumberState,
} from "../../../supabase/functions/_shared/openwaPickNumber";

const TODAY = "2026-07-14";

function num(over: Partial<OpenWaNumberState> = {}): OpenWaNumberState {
  return {
    id: "n1",
    stato: "connected",
    tags: [],
    daily_cap: 10,
    daily_sent: 0,
    daily_sent_date: TODAY,
    ...over,
  };
}

describe("remainingTodayOpenWa", () => {
  it("è il cap pieno per un numero connesso mai usato oggi", () => {
    expect(remainingTodayOpenWa(num({ daily_sent: 0 }), TODAY)).toBe(10);
  });

  it("scala con gli inviati di oggi", () => {
    expect(remainingTodayOpenWa(num({ daily_sent: 7 }), TODAY)).toBe(3);
  });

  it("resetta se il contatore è di un altro giorno", () => {
    expect(remainingTodayOpenWa(num({ daily_sent: 9, daily_sent_date: "2026-07-13" }), TODAY)).toBe(10);
  });

  it("è 0 se il numero non è connesso", () => {
    expect(remainingTodayOpenWa(num({ stato: "disconnected" }), TODAY)).toBe(0);
    expect(remainingTodayOpenWa(num({ stato: "connecting" }), TODAY)).toBe(0);
    expect(remainingTodayOpenWa(num({ stato: "banned" }), TODAY)).toBe(0);
  });

  it("non va mai negativo anche se daily_sent supera il cap", () => {
    expect(remainingTodayOpenWa(num({ daily_cap: 5, daily_sent: 9 }), TODAY)).toBe(0);
  });
});

describe("numberServesContact", () => {
  it("un numero senza tag è jolly (serve tutti)", () => {
    expect(numberServesContact([], ["lombardia"])).toBe(true);
    expect(numberServesContact([], [])).toBe(true);
  });

  it("un numero taggato serve solo chi condivide un tag", () => {
    expect(numberServesContact(["lombardia"], ["lombardia", "lead"])).toBe(true);
    expect(numberServesContact(["lombardia"], ["veneto"])).toBe(false);
  });

  it("un numero taggato non serve un contatto senza tag", () => {
    expect(numberServesContact(["lombardia"], [])).toBe(false);
  });
});

describe("pickOpenWaNumber", () => {
  it("ritorna null se non c'è nessun numero", () => {
    expect(pickOpenWaNumber([], ["x"], TODAY)).toBeNull();
  });

  it("ritorna null se tutti i numeri hanno cap esaurito", () => {
    const pool = [num({ id: "a", daily_cap: 3, daily_sent: 3 })];
    expect(pickOpenWaNumber(pool, [], TODAY)).toBeNull();
  });

  it("sceglie il numero meno carico (max capacità residua)", () => {
    const pool = [
      num({ id: "a", daily_sent: 8 }), // residuo 2
      num({ id: "b", daily_sent: 1 }), // residuo 9  ← atteso
      num({ id: "c", daily_sent: 5 }), // residuo 5
    ];
    expect(pickOpenWaNumber(pool, [], TODAY)?.id).toBe("b");
  });

  it("rispetta il match per tag: scarta i numeri di altri segmenti", () => {
    const pool = [
      num({ id: "veneto", tags: ["veneto"], daily_sent: 0 }),      // non idoneo
      num({ id: "lomb", tags: ["lombardia"], daily_sent: 5 }),      // idoneo, residuo 5
    ];
    expect(pickOpenWaNumber(pool, ["lombardia"], TODAY)?.id).toBe("lomb");
  });

  it("un numero jolly copre un contatto senza tag quando i taggati non lo servono", () => {
    const pool = [
      num({ id: "lomb", tags: ["lombardia"], daily_sent: 0 }), // non serve un contatto senza tag
      num({ id: "jolly", tags: [], daily_sent: 9 }),            // jolly, residuo 1 ← unico idoneo
    ];
    expect(pickOpenWaNumber(pool, [], TODAY)?.id).toBe("jolly");
  });

  it("tie-break deterministico per id a parità di residuo", () => {
    const pool = [
      num({ id: "zeta", daily_sent: 2 }),
      num({ id: "alfa", daily_sent: 2 }),
    ];
    expect(pickOpenWaNumber(pool, [], TODAY)?.id).toBe("alfa");
  });
});

describe("totalRemainingOpenWa", () => {
  it("somma i residui dei soli numeri connessi", () => {
    const pool = [
      num({ id: "a", daily_sent: 8 }),              // 2
      num({ id: "b", daily_sent: 0 }),              // 10
      num({ id: "c", stato: "disconnected" }),      // 0
    ];
    expect(totalRemainingOpenWa(pool, TODAY)).toBe(12);
  });
});

describe("effectiveCapOpenWa (warm-up)", () => {
  it("senza parametri warm-up ritorna il daily_cap pieno (retro-compat)", () => {
    expect(effectiveCapOpenWa(num({ daily_cap: 10 }), TODAY)).toBe(10);
  });

  it("giorno 0 = warmup_base", () => {
    const n = num({ daily_cap: 20, warmup_base: 3, warmup_step: 2, connected_since: TODAY });
    expect(effectiveCapOpenWa(n, TODAY)).toBe(3);
  });

  it("cresce di warmup_step al giorno", () => {
    // connesso 4 giorni fa: 3 + 4*2 = 11
    const n = num({ daily_cap: 20, warmup_base: 3, warmup_step: 2, connected_since: "2026-07-10" });
    expect(effectiveCapOpenWa(n, TODAY)).toBe(11);
  });

  it("non supera mai il daily_cap (tetto a regime)", () => {
    const n = num({ daily_cap: 8, warmup_base: 3, warmup_step: 2, connected_since: "2026-01-01" });
    expect(effectiveCapOpenWa(n, TODAY)).toBe(8);
  });

  it("connesso ma senza data → conservativo (warmup_base)", () => {
    const n = num({ daily_cap: 20, warmup_base: 3, warmup_step: 2, connected_since: null });
    expect(effectiveCapOpenWa(n, TODAY)).toBe(3);
  });

  it("un numero nuovo in warm-up ha residuo ridotto", () => {
    const n = num({ daily_cap: 20, warmup_base: 3, warmup_step: 2, connected_since: TODAY, daily_sent: 2 });
    expect(remainingTodayOpenWa(n, TODAY)).toBe(1); // cap 3 − 2 inviati
  });
});

describe("isThrottledOpenWa", () => {
  const NOW = Date.parse("2026-07-14T12:00:00Z");

  it("non throttlato senza last_message_at", () => {
    expect(isThrottledOpenWa(num({ min_gap_seconds: 60 }), NOW)).toBe(false);
  });

  it("throttlato se ha inviato da meno di min_gap_seconds", () => {
    const n = num({ min_gap_seconds: 60, last_message_at: "2026-07-14T11:59:30Z" }); // 30s fa
    expect(isThrottledOpenWa(n, NOW)).toBe(true);
  });

  it("non throttlato se il gap è passato", () => {
    const n = num({ min_gap_seconds: 60, last_message_at: "2026-07-14T11:58:00Z" }); // 120s fa
    expect(isThrottledOpenWa(n, NOW)).toBe(false);
  });

  it("pickOpenWaNumber esclude i numeri throttlati quando si passa nowMs", () => {
    const pool = [
      num({ id: "fresco", last_message_at: "2026-07-14T11:59:40Z", min_gap_seconds: 60 }), // throttlato (20s)
      num({ id: "libero", last_message_at: "2026-07-14T11:50:00Z", min_gap_seconds: 60 }), // libero
    ];
    expect(pickOpenWaNumber(pool, [], TODAY, NOW)?.id).toBe("libero");
  });

  it("senza nowMs il throttle è ignorato (retro-compat)", () => {
    const pool = [num({ id: "x", last_message_at: "2026-07-14T11:59:59Z", min_gap_seconds: 60 })];
    expect(pickOpenWaNumber(pool, [], TODAY)?.id).toBe("x");
  });
});

describe("tetto settimanale", () => {
  it("weekKeyOf: stessa settimana → stessa chiave, oltre 7gg → diversa", () => {
    expect(weekKeyOf("2026-07-14")).toBe(weekKeyOf("2026-07-15"));
    expect(weekKeyOf("2026-07-14")).not.toBe(weekKeyOf("2026-07-25"));
  });

  it("weeklyRemainingOpenWa: senza weekly_cap è infinito (retro-compat)", () => {
    expect(weeklyRemainingOpenWa(num(), "W1")).toBe(Number.POSITIVE_INFINITY);
  });

  it("weeklyRemainingOpenWa: cap − inviati nella settimana corrente", () => {
    const wk = weekKeyOf(TODAY);
    const n = num({ weekly_cap: 40, weekly_sent: 30, weekly_sent_week: wk });
    expect(weeklyRemainingOpenWa(n, wk)).toBe(10);
  });

  it("weeklyRemainingOpenWa: resetta se la settimana è cambiata", () => {
    const n = num({ weekly_cap: 40, weekly_sent: 40, weekly_sent_week: "W_vecchia" });
    expect(weeklyRemainingOpenWa(n, weekKeyOf(TODAY))).toBe(40);
  });

  it("pickOpenWaNumber esclude il numero col settimanale esaurito anche se il giornaliero è libero", () => {
    const wk = weekKeyOf(TODAY);
    const pool = [
      num({ id: "sett-pieno", daily_sent: 0, weekly_cap: 40, weekly_sent: 40, weekly_sent_week: wk }), // daily ok, weekly 0
      num({ id: "ok", daily_sent: 0, weekly_cap: 40, weekly_sent: 0, weekly_sent_week: wk }),
    ];
    expect(pickOpenWaNumber(pool, [], TODAY, undefined, wk)?.id).toBe("ok");
  });
});

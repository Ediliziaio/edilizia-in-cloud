import { describe, expect, it } from "vitest";
import { domenicaDi, incassiPerSettimana, lunediDi } from "@/lib/finance/incassiSettimanali";
import type { ForecastMovement } from "@/lib/finance/forecastLedger";

const mov = (patch: Partial<ForecastMovement>): ForecastMovement => ({
  id: "fattura:1", description: "X", counterparty: "", category: "clienti", direction: "in", cents: 10_000,
  date: "2026-11-05", source: "Fattura", href: "/", estimated: false, ...patch,
});
// 04/11/2026 è un mercoledì: la settimana va dal 2 all'8.
const OGGI = "2026-11-04";

describe("gli incassi settimana per settimana", () => {
  it("la settimana va da lunedì a domenica, anche a cavallo del mese", () => {
    expect(lunediDi(OGGI)).toBe("2026-11-02");
    expect(domenicaDi(OGGI)).toBe("2026-11-08");
    expect(lunediDi("2026-11-08")).toBe("2026-11-02");
    expect(lunediDi("2026-11-09")).toBe("2026-11-09");
    expect(domenicaDi("2026-12-30")).toBe("2027-01-03");
  });

  it("ogni incasso finisce nella sua settimana, fatture e rate distinte", () => {
    const r = incassiPerSettimana([
      mov({ id: "fattura:a", date: OGGI, cents: 100 }),
      mov({ id: "scadenza:b", date: "2026-11-08", cents: 200 }),
      mov({ id: "rata:c", date: "2026-11-09", cents: 400 }),
    ], OGGI);
    expect(r.settimane[0]).toMatchObject({ inizio: "2026-11-02", fine: "2026-11-08", cents: 300, fattureCents: 300, rateCents: 0 });
    expect(r.settimane[1]).toMatchObject({ inizio: "2026-11-09", cents: 400, fattureCents: 0, rateCents: 400 });
  });

  it("una rata che ha già la sua fattura conta fra le fatture, non fra le rate da fatturare", () => {
    const r = incassiPerSettimana([mov({ id: "rata:a", rataFatturata: true, cents: 700 }), mov({ id: "rata:b", cents: 300 })], OGGI);
    expect(r.settimane[0]).toMatchObject({ cents: 1000, fattureCents: 700, rateCents: 300 });
  });

  it("lo scaduto sta a parte, anche se è di questa settimana: ha già passato la sua data", () => {
    const r = incassiPerSettimana([mov({ date: "2026-11-03" }), mov({ id: "fattura:b", date: "2026-01-10" })], OGGI);
    expect(r.scaduto.cents).toBe(20_000);
    expect(r.settimane[0].cents).toBe(0);
  });

  it("senza data, oltre l'orizzonte e possibili doppioni non entrano nelle settimane", () => {
    const r = incassiPerSettimana([
      mov({ id: "rata:a", date: null }),
      mov({ id: "fattura:b", date: "2027-06-01" }),
      mov({ id: "scadenza:c", possibleDuplicate: true }),
    ], OGGI);
    expect(r.senzaData.cents).toBe(10_000);
    expect(r.piuAvanti.cents).toBe(10_000);
    expect(r.daControllare.cents).toBe(10_000);
    expect(r.settimane.reduce((s, w) => s + w.cents, 0)).toBe(0);
  });

  it("i pagamenti da fare non contano come incassi", () => {
    const r = incassiPerSettimana([mov({ direction: "out" })], OGGI);
    expect(r.settimane[0].cents).toBe(0);
  });

  it("i prossimi 30 giorni partono da oggi: niente scaduto, niente doppioni, niente oltre il trentesimo giorno", () => {
    const r = incassiPerSettimana([
      mov({ id: "fattura:scaduta", date: "2026-11-03", cents: 1 }),
      mov({ id: "fattura:oggi", date: OGGI, cents: 10 }),
      mov({ id: "rata:trentesimo", date: "2026-12-04", cents: 100 }),
      mov({ id: "fattura:dopo", date: "2026-12-05", cents: 1000 }),
      mov({ id: "rata:senza", date: null, cents: 10_000 }),
      mov({ id: "scadenza:doppia", date: OGGI, cents: 100_000, possibleDuplicate: true }),
    ], OGGI);
    expect(r.prossimi30Cents).toBe(110);
  });

  it("l'ultimo giorno mostrato è dentro, quello dopo è più avanti", () => {
    const r = incassiPerSettimana([mov({ id: "fattura:a", date: "2026-12-27" }), mov({ id: "fattura:b", date: "2026-12-28" })], OGGI, 8);
    expect(r.settimane[7]).toMatchObject({ fine: "2026-12-27", cents: 10_000 });
    expect(r.piuAvanti.cents).toBe(10_000);
  });
});

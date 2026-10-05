/**
 * La fascia scelta sul WhatsApp → quando chiamare (06/10/2026, Green Energy Group).
 * Martedì 6 ottobre 2026, 11:04 a Roma (09:04 UTC).
 */
import { describe, expect, it } from "vitest";
import { fasciaDalMessaggio, giornoDellaChiamata, inizioChiamata } from "../../../supabase/functions/_shared/chiamataDaFascia";
import { hhmm } from "../../../supabase/functions/_shared/outreach-richiesta-chiamata";

const MAR_1104 = new Date("2026-10-06T09:04:00Z");
const q = (da: number, a: number, adesso = MAR_1104) => {
  const r = giornoDellaChiamata({ da: da * 60, a: a * 60 }, adesso);
  return { giorno: r.giorno, fascia: `${hhmm(r.fascia.da)}-${hhmm(r.fascia.a)}` };
};

describe("fasciaDalMessaggio", () => {
  it("legge i pulsanti vecchi e nuovi", () => {
    expect(fasciaDalMessaggio("15-16")).toEqual({ da: 900, a: 960 });
    expect(fasciaDalMessaggio("Mattina (11-13)")).toEqual({ da: 660, a: 780 });
    expect(fasciaDalMessaggio("Pomeriggio (16-18)")).toEqual({ da: 960, a: 1080 });
    expect(fasciaDalMessaggio("17 – 18")).toEqual({ da: 1020, a: 1080 });
  });
  it("niente oltre le 18, niente testo libero", () => {
    expect(fasciaDalMessaggio("18-19")).toBeNull();
    expect(fasciaDalMessaggio("16-20")).toBeNull();
    expect(fasciaDalMessaggio("16-14")).toBeNull();
    expect(fasciaDalMessaggio("Non mi conviene")).toBeNull();
    expect(fasciaDalMessaggio("")).toBeNull();
  });
});

describe("giornoDellaChiamata", () => {
  it("fascia ancora davanti: oggi", () => {
    expect(q(15, 16)).toEqual({ giorno: "2026-10-06", fascia: "15:00-16:00" });
  });
  it("fascia in corso: oggi, da mezz'ora dopo il tocco", () => {
    expect(q(11, 12)).toEqual({ giorno: "2026-10-06", fascia: "11:45-12:00" });
  });
  it("fascia finita (o troppo vicina): domani, la fascia intera", () => {
    expect(q(9, 10)).toEqual({ giorno: "2026-10-07", fascia: "09:00-10:00" });
    expect(q(11, 12, new Date("2026-10-06T09:40:00Z"))).toEqual({ giorno: "2026-10-07", fascia: "11:00-12:00" });
  });
  it("il venerdì sera passa a lunedì; la domenica non si chiama", () => {
    expect(q(17, 18, new Date("2026-10-09T16:30:00Z"))).toEqual({ giorno: "2026-10-10", fascia: "17:00-18:00" });
    expect(q(9, 10, new Date("2026-10-10T10:00:00Z"))).toEqual({ giorno: "2026-10-12", fascia: "09:00-10:00" });
    expect(q(15, 16, new Date("2026-10-11T10:00:00Z"))).toEqual({ giorno: "2026-10-12", fascia: "15:00-16:00" });
  });
});

describe("inizioChiamata", () => {
  const fascia = { da: 15 * 60, a: 16 * 60 };
  it("primo slot libero a passi di 15", () => {
    expect(hhmm(inizioChiamata(fascia, []))).toBe("15:00");
    expect(hhmm(inizioChiamata(fascia, [{ da: 900, a: 915 }]))).toBe("15:15");
    expect(hhmm(inizioChiamata(fascia, [{ da: 900, a: 945 }]))).toBe("15:45");
  });
  it("fascia piena: comunque all'inizio", () => {
    const piena = [{ da: 900, a: 915 }, { da: 915, a: 930 }, { da: 930, a: 945 }, { da: 945, a: 960 }];
    expect(hhmm(inizioChiamata(fascia, piena))).toBe("15:00");
  });
});

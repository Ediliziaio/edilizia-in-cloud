import { describe, expect, it } from "vitest";
import { giorniDallaFattura } from "@/pages/azienda/fatturazione/FattureRicevutePage";

describe("fatture ricevute: arrivata il", () => {
  it("conta i giorni fra la data della fattura e la consegna dello SDI", () => {
    expect(giorniDallaFattura({ data_fattura: "2026-10-07", data_ricezione_sdi: "2026-10-19T23:35:06Z" })).toBe(13);
    expect(giorniDallaFattura({ data_fattura: "2026-10-16", data_ricezione_sdi: "2026-10-16T11:42:05Z" })).toBe(0);
  });

  it("usa il giorno italiano: le 23:30 UTC sono già il giorno dopo", () => {
    expect(giorniDallaFattura({ data_fattura: "2026-10-14", data_ricezione_sdi: "2026-10-14T22:30:00Z" })).toBe(1);
  });

  it("senza data di arrivo non inventa niente", () => {
    expect(giorniDallaFattura({ data_fattura: "2026-09-09", data_ricezione_sdi: null })).toBeNull();
  });
});

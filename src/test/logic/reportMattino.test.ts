import { describe, expect, it } from "vitest";
import { componiReportMattino } from "../../../supabase/functions/_shared/reportMattino";

const OGGI = new Date("2026-09-28T06:00:00Z");

describe("report del mattino", () => {
  it("mette i numeri veri, in grassetto WhatsApp", () => {
    const t = componiReportMattino("Demo", {
      commesse_attive: 61,
      scaduto: { n: 30, tot: 319058 },
      sotto_scorta: 1,
    }, OGGI);
    expect(t).toContain("*61* commesse in corso");
    expect(t).toContain("*30* rate scadute");
    expect(t).toContain("€ 319.058");
    expect(t).toContain("*1* articoli sotto scorta");
    expect(t).not.toContain("in scadenza questa settimana"); // sezione vuota, non scritta
  });
  it("se non c'è niente da segnalare lo dice", () => {
    const t = componiReportMattino(null, { commesse_attive: 0, scaduto: { n: 0, tot: 0 } }, OGGI);
    expect(t).toContain("Tutto tranquillo");
  });
  it("intesta con la data italiana", () => {
    expect(componiReportMattino("X", { commesse_attive: 1 }, OGGI)).toContain("lunedì 28 settembre");
  });
});

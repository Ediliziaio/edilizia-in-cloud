import { describe, expect, it } from "vitest";
import { dayBounds, hours, number, percentage, reportAsset, reportSummary } from "../../../supabase/functions/genera-pdf-rapportino/model";

describe("PDF rapportino - dati non ambigui", () => {
  it("squadra sostituisce ore autore, non le duplica", () => {
    const s = reportSummary({ ore_lavorate: 8, ore_straordinario: 2, presenze: [{ nome: "A", ore: 7.5 }, { nome: "B", ore: 4 }] });
    expect(s.total).toBe(11.5);
    expect(hours(s.total)).toBe("11 h 30 min");
  });
  it("individuale mantiene ordinario più straordinario", () => expect(reportSummary({ ore_lavorate: 7.5, ore_straordinario: 1 }).total).toBe(8.5));
  it("presenza senza ore rende totale non disponibile", () => expect(reportSummary({ presenze: [{ nome: "A" }] }).total).toBeNull());
  it.each([undefined, null, "", "   ", {}, [], NaN, Infinity, -1, true])("non inventa zero da %s", value => expect(number(value)).toBeNull());
  it("zero esplicito è diverso da mancante", () => { expect(hours(0)).toBe("0 h"); expect(percentage(null)).toBe("Non rilevato"); expect(percentage(0)).toBe("0%"); });
  it("non inventa capocantiere dal tipo employee", () => expect(reportSummary({ role_type: "employee" }).authorRole).toBe("Personale interno"));
  it("riconosce subappaltatore e stato", () => { const s = reportSummary({ role_type: "subcontractor", stato: "rifiutato" }); expect(s.authorRole).toBe("Subappaltatore"); expect(s.statusLabel).toBe("RIFIUTATO"); });
  it("stato esplicito prevale sul flag legacy", () => expect(reportSummary({ stato: "rifiutato", approvato: true }).statusLabel).toBe("RIFIUTATO"));
});
describe("giornata italiana delle timbrature PDF", () => {
  it.each([["2026-09-24", 24], ["2026-03-29", 23], ["2026-10-25", 25]])("%s dura %s ore", (day, duration) => { const b = dayBounds(String(day))!; expect((Date.parse(b.end) - Date.parse(b.start)) / 3600000).toBe(duration); });
  it("non usa la timezone del server", () => expect(dayBounds("2026-09-24")).toEqual({ start: "2026-09-23T22:00:00.000Z", end: "2026-09-24T22:00:00.000Z" }));
  it.each(["2026-02-31", "bad", "", "2026-13-01"])("rifiuta data %s", d => expect(dayBounds(d)).toBeNull());
});
describe("allegati privati tenant-scoped", () => {
  const base = "https://project.supabase.co";
  it.each(["campo-rapportini/tenant/order/a.jpg", `${base}/storage/v1/object/public/campo-rapportini/tenant/order/a.jpg`, `${base}/storage/v1/object/sign/campo-rapportini/tenant/order/a.jpg?token=old`])("legge il riferimento storico %s", ref => expect(reportAsset(ref, "tenant", base)).toEqual({ bucket: "campo-rapportini", path: "tenant/order/a.jpg" }));
  it.each(["https://evil.invalid/storage/v1/object/public/campo-rapportini/tenant/x.jpg", "campo-rapportini/other/x.jpg", "campo-rapportini/tenant/../x.jpg", "campo-rapportini/tenant//x.jpg", "http://127.0.0.1/private", "campo-rapportini/tenant", "other-bucket/tenant/x.jpg"])("blocca %s", ref => expect(reportAsset(ref, "tenant", base)).toBeNull());
});

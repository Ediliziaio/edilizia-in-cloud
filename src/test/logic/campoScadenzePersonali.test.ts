import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scadenzeDaAvvisare } from "@/lib/campo/scadenzePersonali";

describe("Scadenze personali da avvisare in Home (collaudo 23/11)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-23T10:00:00")); });
  afterEach(() => { vi.useRealTimers(); });
  const doc = (id: string, data_scadenza: string | null, alert_giorni_prima: number | null = 30) =>
    ({ id, categoria: "visita_medica", titolo: id, data_scadenza, alert_giorni_prima });

  it("prima gli scaduti, poi quelli entro la soglia del documento; i validi e senza data no", () => {
    const r = scadenzeDaAvvisare([
      doc("corso", "2026-12-10"),
      doc("valido", "2027-06-01"),
      doc("visita", "2026-10-01"),
      doc("patente", "2027-01-15", 60),
      doc("senza", null),
    ]);
    expect(r.map(d => [d.id, d.stato])).toEqual([["visita", "scaduto"], ["corso", "in_scadenza"], ["patente", "in_scadenza"]]);
  });
});

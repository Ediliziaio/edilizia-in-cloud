/**
 * Il mese di vendita di una commessa e il fatturato medio del punto di
 * pareggio (08/11/2026). Bonarrigo aveva creato in tre giorni di novembre
 * commesse iniziate dal 2023: il pareggio divideva 8,39 milioni per un mese.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { dataVendita, fatturatoMedioMensile } from "@/lib/dataVendita";

describe("dataVendita", () => {
  it("è la data più antica che la commessa porta con sé", () => {
    expect(dataVendita({ created_at: "2026-11-06T10:00:00Z", work_start_date: "2025-03-19" }, ["2025-05-01"])).toBe("2025-03-19");
    expect(dataVendita({ created_at: "2026-11-06T10:00:00Z", deposit_paid_date: "2024-12-31" })).toBe("2024-12-31");
    expect(dataVendita({ created_at: "2026-11-06T10:00:00Z" }, ["2025-01-24", null])).toBe("2025-01-24");
  });

  it("per chi crea la commessa quando firma resta la creazione", () => {
    expect(dataVendita({ created_at: "2026-10-02T08:00:00Z", work_start_date: "2026-11-15", deposit_expected_date: "2026-10-10" })).toBe("2026-10-02");
  });

  it("senza nessuna data non inventa niente", () => {
    expect(dataVendita({ created_at: null })).toBeNull();
  });
});

describe("fatturatoMedioMensile", () => {
  const oggi = new Date("2026-11-08T12:00:00");

  it("con commesse più vecchie di un anno divide per 12 mesi pieni", () => {
    const r = fatturatoMedioMensile([
      { giorno: "2023-07-11", importo: 5_000_000 },
      { giorno: "2026-11-06", importo: 120_000 },
    ], oggi);
    expect(r).toBe(10_000);
  });

  it("un'azienda nata da poco divide per i mesi che ha davvero", () => {
    const r = fatturatoMedioMensile([
      { giorno: "2026-08-10", importo: 30_000 },
      { giorno: "2026-10-10", importo: 30_000 },
    ], oggi);
    expect(r).toBeGreaterThan(60_000 / 3.1);
    expect(r).toBeLessThan(60_000 / 2.8);
  });

  it("le commesse datate nel futuro non contano", () => {
    expect(fatturatoMedioMensile([{ giorno: "2026-12-19", importo: 31_818 }], oggi)).toBe(0);
  });

  it("il punto di pareggio usa questa regola", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/useMarginData.ts"), "utf8");
    expect(src).toContain("fatturatoMedioMensile(");
    expect(src).toContain("dataVendita(o, dateRate.get(o.id))");
  });
});

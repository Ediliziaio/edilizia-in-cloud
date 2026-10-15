import { describe, it, expect } from "vitest";
import {
  consumptionRanking,
  footprintCoverage,
  parseDatabaseFootprint,
  consumptionCsv,
  consumptionShareLabel,
} from "@/lib/companyConsumption";
import { report, footprint } from "../fixtures/companyConsumption";
describe("Classifica consumi: reali, stimati e mancanti", () => {
  it("mantiene visibili le quote positive che arrotonderebbero a zero", () => {
    expect(consumptionShareLabel(0.001)).toBe("<0,1%");
    expect(consumptionShareLabel(0)).toBe("0%");
    expect(consumptionShareLabel(null)).toBe("Non disponibile");
  });
  it("non classifica come gratuito un costo interamente non misurato", () => {
    const rows = consumptionRanking(
      {
        ...report,
        costs: [
          {
            company_id: "a",
            kind: "email",
            events: 4,
            recorded_eur: 0,
            estimated_events: 0,
            missing_events: 4,
          },
        ],
      },
      null,
      "cost",
    );
    const company = rows.find((r) => r.company.id === "a")!;
    expect(company.value).toBeNull();
    expect(company.rank).toBeNull();
    expect(company.share).toBeNull();
  });
  it("ordina i costi diretti senza sommare comuni, non attribuiti o previsioni", () => {
    const rows = consumptionRanking(report, footprint, "cost");
    expect(rows.map((r) => r.company.id)).toEqual(["b", "a"]);
    expect(rows[0].value).toBe(10);
    expect(rows[0].share).toBeCloseTo((100 * 10) / 15);
    expect(rows[1].estimated).toBe(2);
    expect(rows[1].missing).toBe(1);
  });
  it("usa i metadati file, include backup senza contarli due volte ed esclude gli orfani", () => {
    const rows = consumptionRanking(report, footprint, "files");
    expect(rows[0].value).toBe(900);
    expect(rows[0].share).toBe(90);
  });
  it("stima i bytes per proporzione in ogni tabella, non per quota uniforme", () => {
    const rows = consumptionRanking(report, footprint, "database");
    expect(rows.find((r) => r.company.id === "a")?.value).toBe(1700);
    expect(rows.find((r) => r.company.id === "b")?.value).toBe(1100);
  });
  it("conta i record nelle sole tabelle misurate e ordina diversamente dallo spazio", () => {
    const rows = consumptionRanking(report, footprint, "records");
    expect(rows[0].company.id).toBe("b");
    expect(rows[0].records).toBe(61);
    expect(rows[1].records).toBe(23);
  });
  it("riconcilia byte attribuiti e orfani senza caricare questi ultimi ai clienti", () => {
    const coverage = footprintCoverage(footprint, ["a", "b"]);
    expect(coverage.unassignedRecords).toBe(20);
    expect(coverage.unassignedBytes).toBe(200);
    expect(coverage.coveredBytes).toBe(3000);
    expect(coverage.databasePercent).toBe(30);
    expect(
      consumptionRanking(report, footprint, "database").reduce(
        (s, r) => s + r.value!,
        0,
      ) + coverage.unassignedBytes,
    ).toBe(3000);
  });
  it("distingue misura assente da zero e non assegna una posizione al dato assente", () => {
    expect(
      consumptionRanking(report, null, "database").every(
        (r) => r.value === null && r.rank === null && r.share === null,
      ),
    ).toBe(true);
    const rows = consumptionRanking(
      {
        ...report,
        storage: [{ company_id: "a", bytes: 0, exports_bytes: 0, files: 0 }],
      },
      null,
      "files",
    );
    expect(rows[0].value).toBe(0);
    expect(rows[1].value).toBeNull();
    expect(rows[1].rank).toBeNull();
  });
  it("non inventa conteggi su un campione vuoto", () => {
    expect(
      consumptionRanking(report, { ...footprint, tables: [] }, "records")[0]
        .records,
    ).toBeNull();
  });
  it("assegna la stessa posizione ai pari merito", () => {
    const rows = consumptionRanking({ ...report, costs: [] }, null, "cost");
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
    expect(rows.every((r) => r.share === null)).toBe(true);
  });
  it("mantiene le pagine di una tabella vuota nel residuo non attribuito", () => {
    const coverage = footprintCoverage(
      {
        ...footprint,
        tables: [{ name: "empty", total_bytes: 500, companies: [] }],
      },
      ["a"],
    );
    expect(coverage.unassignedBytes).toBe(500);
  });
  it("rifiuta dati corrotti, duplicati, CPU inventata e conteggi negativi", () => {
    expect(() => parseDatabaseFootprint(footprint)).not.toThrow();
    expect(() =>
      parseDatabaseFootprint({ ...footprint, query_load_available: true }),
    ).toThrow();
    expect(() =>
      parseDatabaseFootprint({
        ...footprint,
        tables: [footprint.tables[0], footprint.tables[0]],
      }),
    ).toThrow();
    expect(() =>
      parseDatabaseFootprint({
        ...footprint,
        tables: [
          {
            ...footprint.tables[0],
            companies: [{ company_id: "a", records: -1 }],
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseDatabaseFootprint({
        ...footprint,
        tables: [
          {
            ...footprint.tables[0],
            companies: [
              { company_id: "a", records: 1 },
              { company_id: "a", records: 2 },
            ],
          },
        ],
      }),
    ).toThrow();
  });
  it("esporta tutte le aziende, date, limiti e stime senza formule eseguibili", () => {
    const csv = consumptionCsv(
      {
        ...report,
        companies: report.companies.map((c) => ({
          ...c,
          name: c.id === "a" ? "=1+1" : c.name,
        })),
      },
      footprint,
      "records",
    );
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("Azienda Beta");
    expect(csv).toContain("STIMATI");
    expect(csv).toContain("nessuna misura CPU");
    expect(csv).toContain(footprint.measured_at);
  });
});

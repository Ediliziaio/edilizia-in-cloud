import { describe, expect, it } from "vitest";
import {
  aliquotaBonifico,
  previsioneBonifico,
  validaBonifico,
} from "@/lib/fatturazione/bonificiParlanti";
describe("bonifici parlanti: amounts independent of invoice VAT", () => {
  it("uses the right historical rate and rejects invalid dates", () => {
    expect(aliquotaBonifico("2024-02-29")).toBe(8);
    expect(aliquotaBonifico("2024-03-01")).toBe(11);
    for (const date of ["2014-01-01", "2026-02-30", "2026-99-99", "", "bad"])
      expect(aliquotaBonifico(date)).toBeNull();
  });
  it("does not round the base prematurely or use invoice VAT", () => {
    expect(previsioneBonifico(11000, "2026-10-01")).toMatchObject({
      ritenuta: 991.8,
      netto: 10008.2,
    });
    expect(previsioneBonifico(12200, "2026-10-01")).toMatchObject({
      ritenuta: 1100,
      netto: 11100,
    });
    expect(previsioneBonifico(5500, "2026-10-01")).toMatchObject({
      ritenuta: 495.9,
      netto: 5004.1,
    });
    expect(previsioneBonifico(12200, "2024-02-29")).toMatchObject({
      ritenuta: 800,
    });
  });
  const valid = {
    lordo: 11000,
    ritenuta: 991.8,
    commissioni: 2,
    netto: 10006.2,
    data: "2026-10-01",
    banca: "Banca prova",
    riferimento: "TRN-123",
    confermato: true,
  };
  it("requires actual balanced amounts, evidence and explicit review", () => {
    expect(validaBonifico(valid)).toBeNull();
    for (const patch of [
      { netto: 11000 },
      { ritenuta: 0 },
      { ritenuta: NaN },
      { commissioni: -1 },
      { lordo: 11000.001 },
      { confermato: false },
      { banca: "" },
      { riferimento: "" },
    ])
      expect(validaBonifico({ ...valid, ...patch })).not.toBeNull();
    // A documented discrepancy is allowed, never silently replaced by a forecast.
    expect(
      validaBonifico({ ...valid, ritenuta: 990, netto: 10008 }),
    ).toBeNull();
  });
});

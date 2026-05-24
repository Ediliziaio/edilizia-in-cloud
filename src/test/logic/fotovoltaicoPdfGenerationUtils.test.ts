import { describe, expect, it } from "vitest";
import {
  assertFvPdfQueryOk,
  mapFvManodoperaRowsToPdfServices,
  safeFvPdfStorageSegment,
} from "../../../supabase/functions/_shared/fvPdfGenerationUtils.ts";

describe("fotovoltaico PDF generation utils", () => {
  it("sanitizes project numbers before using them in storage filenames", () => {
    expect(safeFvPdfStorageSegment("FV/2026: Mario Rossi")).toBe("FV-2026-Mario-Rossi");
    expect(safeFvPdfStorageSegment("   ")).toBe("preventivo-fv");
    expect(safeFvPdfStorageSegment("../secret")).toBe("secret");
    expect(safeFvPdfStorageSegment("A".repeat(120))).toHaveLength(80);
  });

  it("throws labeled errors instead of silently generating incomplete PDFs", () => {
    expect(() =>
      assertFvPdfQueryOk("macrocategorie listino", {
        error: { message: "relation does not exist" },
      }),
    ).toThrow("Errore macrocategorie listino: relation does not exist");

    expect(() => assertFvPdfQueryOk("componenti", { data: [], error: null })).not.toThrow();
  });

  it("maps saved labor rows into PDF-visible services", () => {
    expect(
      mapFvManodoperaRowsToPdfServices([
        {
          descrizione: "Installazione premium impianto 6 kWp",
          ore: 12.5,
          tariffa_oraria_vendita: 55,
        },
        { descrizione: "", ore: 3, tariffa_oraria_vendita: 40 },
      ]),
    ).toEqual([
      {
        tipo: "installazione",
        descrizione: "Installazione premium impianto 6 kWp",
        quantita: 1,
        prezzo_vendita: 687.5,
        note_operative: "Ore previste: 12.5",
      },
    ]);
  });
});

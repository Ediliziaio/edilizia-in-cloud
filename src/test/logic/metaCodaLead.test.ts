import { describe, expect, it } from "vitest";
import { filtroSenzaCollegamentiScaduti, minutiDiAttesa, MINUTI_CODA_FERMA } from "../../../supabase/functions/_shared/metaCodaLead";

const A = "71280427-60ec-40d6-a402-42df46fd9f55";
const B = "1dd68284-d0db-4a71-a1ee-7d9204b4f487";

describe("filtroSenzaCollegamentiScaduti", () => {
  it("senza collegamenti scaduti non filtra niente", () => {
    expect(filtroSenzaCollegamentiScaduti([])).toBeNull();
  });

  it("tiene fuori gli eventi dei collegamenti scaduti ma non quelli senza collegamento", () => {
    expect(filtroSenzaCollegamentiScaduti([A, B])).toBe(`integration_id.is.null,integration_id.not.in.(${A},${B})`);
  });

  it("ignora doppioni e valori che non sono id (niente da iniettare nel filtro)", () => {
    expect(filtroSenzaCollegamentiScaduti([A, A, null, undefined, "", "x),status.eq.(y"])).toBe(
      `integration_id.is.null,integration_id.not.in.(${A})`,
    );
    expect(filtroSenzaCollegamentiScaduti([null, "non-un-id"])).toBeNull();
  });
});

describe("minutiDiAttesa", () => {
  const ADESSO = new Date("2026-09-17T07:10:00Z");

  it("il primo lead fermo del 16/09 aspettava da undici ore: coda ferma", () => {
    const minuti = minutiDiAttesa("2026-09-16T20:08:06Z", ADESSO);
    expect(minuti).toBe(661);
    expect((minuti ?? 0) > MINUTI_CODA_FERMA).toBe(true);
  });

  it("un lead arrivato da pochi minuti non è un allarme", () => {
    expect(minutiDiAttesa("2026-09-17T07:05:30Z", ADESSO)).toBe(4);
  });

  it("senza data o con una data rotta non si decide niente", () => {
    expect(minutiDiAttesa(null, ADESSO)).toBeNull();
    expect(minutiDiAttesa("ieri sera", ADESSO)).toBeNull();
  });

  it("un orologio avanti non dà attese negative", () => {
    expect(minutiDiAttesa("2026-09-17T07:12:00Z", ADESSO)).toBe(0);
  });
});

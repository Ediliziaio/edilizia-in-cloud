import { describe, expect, it } from "vitest";
import { aggiungiOreRapportini } from "@/lib/campo/presenzeDaRapportini";

describe("Presenze: le ore dei rapportini contano (collaudo 23/11)", () => {
  it("senza timbrature, il giorno risulta presente con le ore dei rapportini sommate", () => {
    const g = aggiungiOreRapportini({}, [
      { data_lavoro: "2026-11-22", ore_lavorate: "3.50", stato: "inviato" },
      { data_lavoro: "2026-11-22", ore_lavorate: 2, ore_straordinario: 1, stato: "approvato" },
    ]);
    expect(g["2026-11-22"]).toEqual({ status: "presente", ore: 6.5, daRapportino: true });
  });

  it("le timbrature con ore restano la presenza vera", () => {
    const g = aggiungiOreRapportini({ "2026-11-22": { status: "presente", ore: 8, entrata: "07:30" } },
      [{ data_lavoro: "2026-11-22", ore_lavorate: 3.5, stato: "inviato" }]);
    expect(g["2026-11-22"]).toEqual({ status: "presente", ore: 8, entrata: "07:30" });
  });

  it("una timbratura senza ore (solo entrata) prende le ore del rapportino e tiene l'orario", () => {
    const g = aggiungiOreRapportini({ "2026-11-23": { status: "presente", ore: 0, entrata: "14:54" } },
      [{ data_lavoro: "2026-11-23", ore_lavorate: 3.5, stato: "inviato" }]);
    expect(g["2026-11-23"]).toMatchObject({ status: "presente", ore: 3.5, entrata: "14:54", daRapportino: true });
  });

  it("bozze, respinti e annullati non contano; ferie approvate non vengono coperte", () => {
    const g = aggiungiOreRapportini({ "2026-11-20": { status: "ferie" } }, [
      { data_lavoro: "2026-11-19", ore_lavorate: 8, stato: "bozza" },
      { data_lavoro: "2026-11-18", ore_lavorate: 8, stato: "rifiutato" },
      { data_lavoro: "2026-11-17", ore_lavorate: 8, stato: "inviato", annullato_at: "2026-11-18T10:00:00Z" },
      { data_lavoro: "2026-11-20", ore_lavorate: 4, stato: "inviato" },
    ]);
    expect(g).toEqual({ "2026-11-20": { status: "ferie" } });
  });
});

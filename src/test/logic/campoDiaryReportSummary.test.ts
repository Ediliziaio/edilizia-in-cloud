import { describe, expect, it } from "vitest";
import { diaryReportSummary } from "@/lib/campo/diaryReportSummary";
describe("Il diario descrive lo stato vero, non applica la proposta", () => {
  it.each(["inviato", "rifiutato", "bozza"])("una proposta %s non è avanzamento applicato", stato => {
    const result = diaryReportSummary({ stato, ore_lavorate: 4, ore_straordinario: 1, percentuale_avanzamento: 60 });
    expect(result.description).toContain("5h dichiarate"); expect(result.description).toContain("60% proposto, non applicato");
  });
  it("un rapporto approvato non sostituisce la percentuale attuale della commessa", () => {
    const result = diaryReportSummary({ stato: "approvato", percentuale_avanzamento: 60 });
    expect(result.description).toContain("60% dichiarato nel rapporto approvato");
  });
  it.each([{ lavoro_completato: true }, { firma_cliente_url: "firma-storica.png" }])("un documento cliente %j non viene presentato come altre ore o avanzamento", kind => {
    const result = diaryReportSummary({ ...kind, ore_lavorate: 8, percentuale_avanzamento: 100, presenze: [{ ore: 8 }] });
    expect(result.title).toBe("Rapporto cliente"); expect(result.description).not.toMatch(/8h|100%|presenze/);
  });
  it("nel rapporto del capo mostra la squadra, non somma nuovamente le ore dell'autore", () => {
    const result = diaryReportSummary({ ore_lavorate: 8, presenze: [{ ore: 8 }, { ore: 4 }] });
    expect(result.description).toContain("2 presenze di squadra"); expect(result.description).not.toContain("8h");
  });
  it("un rifiutato prevale sul vecchio flag approvato", () => {
    expect(diaryReportSummary({ stato: "rifiutato", approvato: true }).description).toContain("Respinto");
  });
});

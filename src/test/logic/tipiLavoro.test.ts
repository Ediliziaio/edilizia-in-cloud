import { describe, expect, it } from "vitest";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { modelliDaOffrire, type ModelloFasi } from "@/lib/orders/modelliFasi";
import { modelliDiPartenzaDelProfilo, profiloLavori, tipiDalDb, tipiDaSettore, TIPI_LAVORO } from "@/lib/orders/tipiLavoro";

const nomi = (m: ModelloFasi[]) => m.map((x) => x.nome);

describe("profilo lavori", () => {
  it("dal settore quando l'azienda non ha scelto", () => {
    expect(profiloLavori(null, "serramenti")).toEqual({ tipi: ["serramenti"], origine: "settore" });
    expect(profiloLavori(null, "infissi").tipi).toEqual(["serramenti"]);
    expect(profiloLavori(null, "bagni").tipi).toEqual(["bagno"]);
    expect(profiloLavori(null, "altro")).toEqual({ tipi: [], origine: "nessuno" });
    expect(tipiDaSettore("ristrutturazioni")).toContain("bagno");
    expect(tipiDaSettore("ristrutturazioni")).not.toContain("fotovoltaico");
  });
  it("la scelta dell'azienda vince sul settore", () => {
    expect(profiloLavori(["bagno", "impianti"], "serramenti")).toEqual({ tipi: ["bagno", "impianti"], origine: "scelti" });
    expect(profiloLavori([], "serramenti").origine).toBe("settore");
  });
  it("dal database tiene solo i tipi validi, nell'ordine del catalogo", () => {
    expect(tipiDalDb(["piscine", "astronavi", "bagno"])).toEqual(["bagno", "piscine"]);
    expect(tipiDalDb(null)).toBeNull();
  });
  it("ogni modello standard ha un tipo di lavoro del catalogo", () => {
    for (const t of PHASE_TEMPLATES) expect(modelliDiPartenzaDelProfilo([t], { tipi: [...TIPI_LAVORO], origine: "scelti" })).toHaveLength(1);
    expect(modelliDiPartenzaDelProfilo(PHASE_TEMPLATES, { tipi: ["manutenzione"], origine: "scelti" })).toHaveLength(0);
  });
});

describe("modelli proposti", () => {
  it("un'azienda di soli serramenti non vede fotovoltaico né nuova costruzione", () => {
    const profilo = profiloLavori(null, "serramenti");
    const offerti = modelliDaOffrire(false, [], modelliDiPartenzaDelProfilo(PHASE_TEMPLATES, profilo));
    expect(nomi(offerti)).toEqual(["Serramenti / Infissi"]);
  });
  it("i modelli che l'azienda ha già restano tutti, anche di altri lavori (simulazione 07/11 su Innovasol e renova)", () => {
    const suoi: ModelloFasi[] = ["FOTOVOLTAICO", "Impianti", "IMPIANTO IDRICO-SANITARIO"].map((nome, i) => ({ id: `m${i}`, origine: "azienda", nome, descrizione: "", fasi: [] as ModelloFasi["fasi"] }));
    const profilo = profiloLavori(null, "fotovoltaico");
    expect(nomi(modelliDaOffrire(true, suoi, modelliDiPartenzaDelProfilo(PHASE_TEMPLATES, profilo)))).toEqual(["FOTOVOLTAICO", "Impianti", "IMPIANTO IDRICO-SANITARIO"]);
  });
  it("senza profilo non filtra niente", () => {
    expect(modelliDiPartenzaDelProfilo(PHASE_TEMPLATES, profiloLavori(null, "altro"))).toHaveLength(PHASE_TEMPLATES.length);
  });
});

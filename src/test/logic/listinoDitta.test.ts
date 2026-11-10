import { describe, expect, it } from "vitest";
import { prezziPerVoce, righeDaSalvare, scartoDalCosto, type PrezzoDitta } from "@/lib/subappaltatori/listinoDitta";
import { prezzoValidoIl, varianteDellaSquadra, vociListinoPerDitta } from "@/lib/orders/costoDitta";

const p = (x: Partial<PrezzoDitta>): PrezzoDitta => ({
  id: "x", tariffa_id: "posa", nome: "Vais", costo: 90, is_default: false, attivo: true, sort_order: 0, valid_from: "2026-09-01", valid_to: null, ...x,
});

describe("listino della ditta: il prezzo che vale oggi", () => {
  it("il prezzo chiuso va nella storia; vince il predefinito, poi l'ordine", () => {
    const voci = prezziPerVoce([
      p({ id: "vecchio", costo: 85, valid_from: "2026-01-01", valid_to: "2026-08-31" }),
      p({ id: "smontaggio", nome: "Vais — con smontaggio", costo: 120, sort_order: 1 }),
      p({ id: "nuovo", nome: "Vais — su nuovo", costo: 90, is_default: true }),
    ], "2026-11-10");
    const posa = voci.get("posa")!;
    expect(posa.principale?.id).toBe("nuovo");
    expect(posa.altri.map((x) => x.id)).toEqual(["smontaggio"]);
    expect(posa.storia.map((x) => x.id)).toEqual(["vecchio"]);
  });

  it("un prezzo che comincia domani non vale oggi", () => {
    expect(prezziPerVoce([p({ valid_from: "2026-11-11" })], "2026-11-10").get("posa")?.principale).toBeNull();
    expect(prezzoValidoIl({ valid_from: "2026-11-10", valid_to: "2026-11-10" }, "2026-11-10")).toBe(true);
    expect(prezzoValidoIl({ valid_from: null, valid_to: null }, "2026-11-10")).toBe(true);
  });

  it("la commessa non propone un prezzo della ditta chiuso", () => {
    const varianti = [{ tariffa_id: "posa", external_team_id: "vais", costo: 85, valid_from: "2026-01-01", valid_to: "2026-08-31" }];
    expect(varianteDellaSquadra(varianti, "posa", "vais", "2026-11-10")).toBeNull();
    expect(varianteDellaSquadra(varianti, "posa", "vais", "2026-05-01")?.costo).toBe(85);
  });
});

describe("listino della ditta: cosa si salva", () => {
  const attuali = prezziPerVoce([p({ tariffa_id: "intonaco", costo: 14 })], "2026-11-10");

  it("solo i prezzi cambiati davvero, letti all'italiana", () => {
    expect(righeDaSalvare({ intonaco: "14,00", rasatura: "7,5", massetto: "1.250,50" }, attuali)).toEqual({
      righe: [{ tariffa_id: "rasatura", costo: 7.5 }, { tariffa_id: "massetto", costo: 1250.5 }], errori: [],
    });
  });

  it("casella svuotata = la ditta non ha più quel prezzo; vuota su vuota = niente", () => {
    expect(righeDaSalvare({ intonaco: "", rasatura: "  " }, attuali)).toEqual({ righe: [{ tariffa_id: "intonaco", costo: null }], errori: [] });
  });

  it("un numero che non si legge resta fuori e si segnala", () => {
    expect(righeDaSalvare({ rasatura: "7,5,3", massetto: "abc" }, attuali)).toEqual({ righe: [], errori: ["rasatura", "massetto"] });
  });

  it("scarto dal costo dell'azienda", () => {
    expect(scartoDalCosto(14, 15)).toBe(-6.7);
    expect(scartoDalCosto(18, 15)).toBe(20);
    expect(scartoDalCosto(14, 0)).toBeNull();
    expect(scartoDalCosto(null, 15)).toBeNull();
  });
});

describe("voci proprie di una ditta", () => {
  const voci = [
    { id: "aziendale", external_team_id: null, subappaltatore_id: null },
    { id: "rossi-squadra", external_team_id: "sq-rossi", subappaltatore_id: "rossi" },
    { id: "rossi-anagrafica", external_team_id: null, subappaltatore_id: "rossi" },
    { id: "bianchi", external_team_id: null, subappaltatore_id: "bianchi" },
  ];
  it("per Rossi: le aziendali e le sue, per squadra o per anagrafica; mai quelle di Bianchi", () => {
    expect(vociListinoPerDitta(voci, { squadraId: "sq-rossi", anagraficaId: "rossi" }).map((v) => v.id)).toEqual(["aziendale", "rossi-squadra", "rossi-anagrafica"]);
    expect(vociListinoPerDitta(voci, { squadraId: null, anagraficaId: "rossi" }).map((v) => v.id)).toEqual(["aziendale", "rossi-squadra", "rossi-anagrafica"]);
  });
  it("senza ditta: solo le voci aziendali", () => {
    expect(vociListinoPerDitta(voci, null).map((v) => v.id)).toEqual(["aziendale"]);
  });
});

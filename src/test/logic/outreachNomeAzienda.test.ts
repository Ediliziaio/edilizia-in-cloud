import { describe, it, expect } from "vitest";
import { nomeAzienda, contactToVars, renderTemplate } from "../../../supabase/functions/_shared/outreach-template";

// ThermoDMR, 16/09/2026: l'oggetto «Contratto di Fornitura Serramenti {{azienda}}».
// Le ragioni sociali arrivano dal registro, maiuscole e con la forma giuridica:
// scritte così nell'oggetto dicono che l'email è automatica.
describe("nomeAzienda — la ragione sociale da scrivere in un oggetto", () => {
  it("toglie la forma giuridica e il tutto maiuscolo", () => {
    expect(nomeAzienda("ROSSI SERRAMENTI S.R.L.")).toBe("Rossi Serramenti");
    expect(nomeAzienda("NERI INFISSI SOCIETA' A RESPONSABILITA' LIMITATA SEMPLIFICATA")).toBe("Neri Infissi");
    expect(nomeAzienda("GALLI TETTI S.R.L. - UNIPERSONALE")).toBe("Galli Tetti");
    expect(nomeAzienda("MORO SCALE - S.P.A.")).toBe("Moro Scale");
    expect(nomeAzienda("SERRA IMPIANTI S.R.L. CON UNICO SOCIO")).toBe("Serra Impianti");
  });

  it("toglie «di Rossi Paolo & C.» delle società di persone", () => {
    expect(nomeAzienda("BIANCHI COSTRUZIONI DI BIANCHI PAOLO & C. S.N.C.")).toBe("Bianchi Costruzioni");
    expect(nomeAzienda("VERDI LEGNO SAS DI VERDI FRANCO E C.")).toBe("Verdi Legno");
    expect(nomeAzienda("C.M.A. DI ROSSI GIOVANNI & C. - S.N.C.")).toBe("C.M.A.");
  });

  it("senza «& C.» il «di» resta: spesso è un luogo", () => {
    expect(nomeAzienda("VETRERIA DI MESTRE SRL")).toBe("Vetreria di Mestre");
  });

  it("i confini non tagliano dentro le parole", () => {
    expect(nomeAzienda("SASSI COSTRUZIONI")).toBe("Sassi Costruzioni");
    expect(nomeAzienda("SPAZIO INFISSI SNC")).toBe("Spazio Infissi");
  });

  it("maiuscole: particelle minuscole, apostrofi, sigle intatte", () => {
    expect(nomeAzienda("GHIAIE DELL'ADIGE SRL")).toBe("Ghiaie dell'Adige");
    expect(nomeAzienda("D'ANGELO SERRAMENTI")).toBe("D'Angelo Serramenti");
    expect(nomeAzienda("R.M. EDILIZIA SRL")).toBe("R.M. Edilizia");
    expect(nomeAzienda("KLC snc")).toBe("KLC");
    expect(nomeAzienda("3C COSTRUZIONI")).toBe("3C Costruzioni");
  });

  it("un nome scritto a mano resta com'è", () => {
    expect(nomeAzienda("Infissi Moderni Group SRL")).toBe("Infissi Moderni Group");
    expect(nomeAzienda("Falegnameria all'antica")).toBe("Falegnameria all'antica");
  });

  it("sopra i 35 caratteri tiene il primo pezzo, se ha due parole", () => {
    expect(nomeAzienda("Mario Rossi, Consulente Energetico, Facilitatore Superbonus")).toBe("Mario Rossi");
    expect(nomeAzienda("S.I.A. - Serramenti in Alluminio")).toBe("S.I.A. - Serramenti in Alluminio");
  });

  it("vuota quando non c'è un nome da scrivere", () => {
    expect(nomeAzienda("S.R.L.")).toBe("");
    expect(nomeAzienda("mrossi4")).toBe("");
    expect(nomeAzienda("info@rossi.it")).toBe("");
    expect(nomeAzienda("  ")).toBe("");
    expect(nomeAzienda(null)).toBe("");
  });

  it("nell'oggetto: col nome, e senza quando manca", () => {
    const oggetto = "Contratto di Fornitura Serramenti {{azienda}}";
    expect(renderTemplate(oggetto, contactToVars({ company_name: "BIANCHI COSTRUZIONI DI BIANCHI PAOLO & C. S.N.C." })))
      .toBe("Contratto di Fornitura Serramenti Bianchi Costruzioni");
    expect(renderTemplate(oggetto, contactToVars({ company_name: "S.R.L." })))
      .toBe("Contratto di Fornitura Serramenti");
  });
});

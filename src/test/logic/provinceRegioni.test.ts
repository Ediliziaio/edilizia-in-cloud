import { describe, it, expect } from "vitest";
import { regioneDaProvincia, regioneAzienda } from "@/lib/geo/provinceRegioni";

/**
 * Da questa corrispondenza dipende quale prezzario si usa per confrontare i
 * prezzi. Sbagliare regione significa confrontare i prezzi di Milano con quelli
 * di Palermo e dire all'impresa che è fuori mercato quando non lo è.
 */

describe("regioneDaProvincia", () => {
  it("riconosce le province, con qualunque scrittura", () => {
    expect(regioneDaProvincia("MI")).toBe("Lombardia");
    expect(regioneDaProvincia("mi")).toBe("Lombardia");
    expect(regioneDaProvincia(" rm ")).toBe("Lazio");
    expect(regioneDaProvincia("NA")).toBe("Campania");
    expect(regioneDaProvincia("BZ")).toBe("Trentino-Alto Adige");
    expect(regioneDaProvincia("AO")).toBe("Valle d'Aosta");
  });

  it("copre le province istituite di recente, che spesso mancano nelle tabelle vecchie", () => {
    expect(regioneDaProvincia("BT")).toBe("Puglia");   // Barletta-Andria-Trani
    expect(regioneDaProvincia("FM")).toBe("Marche");   // Fermo
    expect(regioneDaProvincia("MB")).toBe("Lombardia"); // Monza e Brianza
    expect(regioneDaProvincia("SU")).toBe("Sardegna");  // Sud Sardegna
  });

  it("una sigla inesistente non diventa una regione a caso", () => {
    expect(regioneDaProvincia("XX")).toBeNull();
    expect(regioneDaProvincia("")).toBeNull();
    expect(regioneDaProvincia(null)).toBeNull();
    expect(regioneDaProvincia("MILANO")).toBeNull(); // non è una sigla
  });

  it("nessuna provincia sta in due regioni", () => {
    // Un doppione qui manderebbe metà delle aziende sul prezzario sbagliato.
    const sigle = ["AQ","CH","PE","TE","MT","PZ","CS","CZ","KR","RC","VV","AV","BN","CE","NA","SA",
      "BO","FC","FE","MO","PC","PR","RA","RE","RN","GO","PN","TS","UD","FR","LT","RI","RM","VT",
      "GE","IM","SP","SV","BG","BS","CO","CR","LC","LO","MB","MI","MN","PV","SO","VA","AN","AP",
      "FM","MC","PU","CB","IS","AL","AT","BI","CN","NO","TO","VB","VC","BA","BR","BT","FG","LE",
      "TA","CA","NU","OR","SS","SU","AG","CL","CT","EN","ME","PA","RG","SR","TP","AR","FI","GR",
      "LI","LU","MS","PI","PO","PT","SI","BZ","TN","PG","TR","AO","BL","PD","RO","TV","VE","VI","VR"];
    expect(new Set(sigle).size).toBe(sigle.length);
    // e ognuna risolve a qualcosa
    for (const s of sigle) expect(regioneDaProvincia(s), s).not.toBeNull();
  });
});

describe("regioneAzienda", () => {
  it("la regione dichiarata vince su tutto", () => {
    expect(regioneAzienda({ region: "Toscana", operational_province: "MI" })).toBe("Toscana");
  });

  it("senza regione dichiarata usa la provincia OPERATIVA: è dove si lavora", () => {
    expect(regioneAzienda({ region: null, operational_province: "BS", legal_province: "RM" }))
      .toBe("Lombardia");
  });

  it("in mancanza dell'operativa ripiega sulla legale", () => {
    expect(regioneAzienda({ region: "", operational_province: null, legal_province: "TO" }))
      .toBe("Piemonte");
  });

  it("senza niente non inventa una regione", () => {
    expect(regioneAzienda({})).toBeNull();
    expect(regioneAzienda(null)).toBeNull();
    expect(regioneAzienda({ region: "  ", operational_province: "XX", legal_province: "" })).toBeNull();
  });
});

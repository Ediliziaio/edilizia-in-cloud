import { describe, expect, it } from "vitest";
import { mesePartenzaPiano, vociDiPartenzaDalleDate } from "@/lib/orders/generali/pianoCategorie";

/** 15/11/2026: le date scritte alla creazione della generale mettono il piano sul calendario giusto. */
const OGGI = "2026-11";
const mese = (voci: { categoria: string; mese: string | null }[], categoria: string) => voci.find((v) => v.categoria === categoria)?.mese;

describe("da quale mese parte il piano di una generale nuova", () => {
  it("senza date: dal mese corrente", () => {
    expect(mesePartenzaPiano("appalto", {}, OGGI)).toBe(OGGI);
    expect(mesePartenzaPiano("sviluppo", { inizio: "" }, OGGI)).toBe(OGGI);
    expect(mesePartenzaPiano("compravendita", { inizio: null, rogito: null }, OGGI)).toBe(OGGI);
  });

  it("appalto: dalla consegna lavori", () => {
    expect(mesePartenzaPiano("appalto", { inizio: "2027-01-10" }, OGGI)).toBe("2027-01");
  });

  it("sviluppo e compravendita: indietro quanto basta perché i lavori cadano sull'inizio", () => {
    expect(mesePartenzaPiano("sviluppo", { inizio: "2027-03-01" }, OGGI)).toBe("2026-11");
    expect(mesePartenzaPiano("compravendita", { inizio: "2027-05-01" }, OGGI)).toBe("2027-03");
  });

  it("compravendita: il rogito vince sull'inizio, e per gli altri modelli non conta", () => {
    expect(mesePartenzaPiano("compravendita", { inizio: "2027-05-01", rogito: "2027-02-15" }, OGGI)).toBe("2027-02");
    expect(mesePartenzaPiano("sviluppo", { rogito: "2027-02-15" }, OGGI)).toBe(OGGI);
  });

  it("una data non leggibile vale come nessuna data", () => {
    expect(mesePartenzaPiano("appalto", { inizio: "domani" }, OGGI)).toBe(OGGI);
  });
});

describe("le voci tipiche sulle date scritte", () => {
  it("sviluppo: la costruzione sull'inizio lavori", () => {
    const voci = vociDiPartenzaDalleDate("sviluppo", 2_000_000, { inizio: "2027-03-01" }, OGGI);
    expect(mese(voci, "costruzione")).toBe("2027-03");
    expect(voci.find((v) => v.categoria === "vendite")).toMatchObject({ importo: 2_000_000, nota: null });
  });

  it("compravendita: prezzo sulla voce d'acquisto, rogito e inizio ristrutturazione ognuno sulla sua", () => {
    const voci = vociDiPartenzaDalleDate("compravendita", null, { inizio: "2027-05-01", rogito: "2027-02-15", prezzo: 185_000 }, OGGI);
    expect(voci.find((v) => v.categoria === "terreno")).toMatchObject({ importo: 185_000, mese: "2027-02", nota: null });
    expect(mese(voci, "costruzione")).toBe("2027-05");
  });

  it("compravendita senza prezzo: la voce d'acquisto resta da stimare", () => {
    const voci = vociDiPartenzaDalleDate("compravendita", null, { rogito: "2027-02-15", prezzo: null }, OGGI);
    expect(voci.find((v) => v.categoria === "terreno")).toMatchObject({ importo: 0, mese: "2027-02" });
    expect(voci.find((v) => v.categoria === "terreno")?.nota).not.toBeNull();
  });

  it("il prezzo e il rogito non toccano un appalto", () => {
    const voci = vociDiPartenzaDalleDate("appalto", 500_000, { inizio: "2027-01-10", rogito: "2027-06-01", prezzo: 9 }, OGGI);
    expect(mese(voci, "materiali")).toBe("2027-01");
    expect(voci.every((v) => v.importo !== 9)).toBe(true);
  });
});

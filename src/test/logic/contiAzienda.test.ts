import { describe, expect, it } from "vitest";

/**
 * I conti fra cui si sceglie in fattura (19/11/2026). Impresa Vulcano lavora con due banche e in
 * fattura si trovava sempre proposta BPER, con l'unica alternativa di riscrivere l'IBAN a mano.
 */
import { contiDellAzienda, contoDellIban, ibanValido, nomeConto, pulisciIbanConto } from "@/lib/fatturazione/contiAzienda";
import type { AnagraficaAzienda } from "@/types/fatturazione";

const BPER = "IT09B0538722800000035200769";
const BCC = "IT60X0542811101000000123456";

const azienda = (extra: Partial<AnagraficaAzienda> = {}): Partial<AnagraficaAzienda> => ({
  iban_principale: BPER, nome_banca: "BPER BANCA S.P.A.", bic_swift: "BPMOIT22XXX", ...extra,
});

describe("i conti dell'azienda in fattura", () => {
  it("il principale c'è sempre, ed è il primo", () => {
    const conti = contiDellAzienda(azienda());
    expect(conti).toHaveLength(1);
    expect(conti[0].principale).toBe(true);
    expect(conti[0].iban).toBe(BPER);
    expect(conti[0].nome).toBe("BPER BANCA S.P.A.");
    expect(conti[0].ultime).toBe("0769");
  });

  it("gli altri conti vengono dopo, nell'ordine scritto", () => {
    const conti = contiDellAzienda(azienda({
      conti_fatturazione: [{ nome: "BCC conto lavori", iban: BCC, banca: "BCC Busto Garolfo" }],
    }));
    expect(conti.map((c) => c.nome)).toEqual(["BPER BANCA S.P.A.", "BCC conto lavori"]);
    expect(conti[1].principale).toBe(false);
  });

  it("lo stesso IBAN non compare due volte, anche scritto con gli spazi", () => {
    const conti = contiDellAzienda(azienda({
      conti_fatturazione: [{ nome: "Doppione", iban: "it09 b053 8722 8000 0003 5200 769" }, { nome: "BCC", iban: BCC }],
    }));
    expect(conti).toHaveLength(2);
    expect(conti.map((c) => c.nome)).toEqual(["BPER BANCA S.P.A.", "BCC"]);
  });

  it("un conto senza IBAN non si può scegliere: resta fuori", () => {
    const conti = contiDellAzienda(azienda({ conti_fatturazione: [{ nome: "Da compilare", iban: "" }] }));
    expect(conti).toHaveLength(1);
  });

  it("senza conto principale restano gli altri", () => {
    const conti = contiDellAzienda({ conti_fatturazione: [{ nome: "BCC", iban: BCC }] });
    expect(conti.map((c) => c.nome)).toEqual(["BCC"]);
    expect(conti[0].principale).toBe(false);
  });

  it("l'azienda che non ha ancora scritto niente non ha conti, e non si rompe", () => {
    expect(contiDellAzienda(null)).toEqual([]);
    expect(contiDellAzienda({})).toEqual([]);
  });

  it("riconosce il conto dall'IBAN scritto sulla fattura, spazi compresi", () => {
    const conti = contiDellAzienda(azienda({ conti_fatturazione: [{ nome: "BCC", iban: BCC }] }));
    expect(contoDellIban(conti, "it60 x054 2811 1010 0000 0123 456")?.nome).toBe("BCC");
    expect(contoDellIban(conti, "IT99X0000000000000000000000")).toBeNull();
    expect(contoDellIban(conti, null)).toBeNull();
  });

  it("senza nome si legge la banca e le ultime cifre", () => {
    expect(nomeConto({ nome: "", iban: BCC, banca: "BCC Busto Garolfo" })).toBe("BCC Busto Garolfo ···3456");
    expect(nomeConto({ nome: "", iban: BCC })).toBe("···3456");
    expect(nomeConto({ nome: "", iban: "" })).toBe("Conto");
  });

  it("l'IBAN si pulisce e si controlla", () => {
    expect(pulisciIbanConto(" it09 b053 8722 8000 0003 5200 769 ")).toBe(BPER);
    expect(ibanValido(BPER)).toBe(true);
    expect(ibanValido(" it60 x054 2811 1010 0000 0123 456 ")).toBe(true);
    expect(ibanValido("IT00X0542811101000000123456")).toBe(false);
    expect(ibanValido("IT09B05387228000000352007")).toBe(false);
    expect(ibanValido("")).toBe(false);
  });
});

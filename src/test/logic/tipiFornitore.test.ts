import { describe, expect, it } from "vitest";
import { INFO_TIPO_FORNITORE, TIPI_FORNITORE, naturaSubappaltoEdile, proponiTipo, tipoDaCategoria, tipoDaNome } from "@/lib/fornitori/tipiFornitore";

// 30/10/2026 — TIM, il fornitore dei materiali e il subappaltatore erano la stessa
// cosa. Il tipo decide se il costo va su una commessa.

describe("i tipi", () => {
  it("otto, ognuno con etichetta e regola della commessa", () => {
    expect(TIPI_FORNITORE).toHaveLength(8);
    for (const t of TIPI_FORNITORE) expect(INFO_TIPO_FORNITORE[t].etichetta).toBeTruthy();
    expect(INFO_TIPO_FORNITORE.materiali.commessa).toBe("si");
    expect(INFO_TIPO_FORNITORE.generali.commessa).toBe("no");
  });
});

describe("dal nome", () => {
  it.each([
    ["TIM S.p.A.", "generali"], ["Telecom Italia SpA", "generali"], ["ENEL ENERGIA SPA", "generali"],
    ["Intesa Sanpaolo S.p.A.", "finanza_enti"], ["UNIPOLSAI ASSICURAZIONI", "finanza_enti"], ["Cassa Edile di Milano", "finanza_enti"],
    ["Arval Service Lease Italia", "mezzi"], ["Q8 Kuwait Petroleum Italia", "mezzi"],
    ["Studio Tecnico Rossi", "professionisti"], ["Geom. Mario Bianchi", "professionisti"],
    // I più frequenti nelle fatture vere del 30/10/2026.
    ["Leroy Merlin Italia srl", "materiali"], ["BRICOMAN ITALIA S.R.L.", "materiali"], ["Würth S.r.l", "materiali"], ["Wuerth S.r.l", "materiali"],
    ["DAIKIN AIR CONDITIONING ITALY S.p.A", "materiali"], ["Duferco Energia Spa", "generali"], ["OPTIMA ITALIA SPA", "generali"],
    ["DKV EURO SERVICE GmbH + Co.KG", "mezzi"], ["Radius Business Solutions (Italia) SRL", "mezzi"], ["Telepass SpA - IMEL", "mezzi"],
    ["AUTOSTRADE PER L'ITALIA S.P.A.", "mezzi"], ["Meta Platform Ireland Limited", "generali"], ["RYANAIR DAC", "generali"],
  ])("%s → %s", (nome, tipo) => expect(tipoDaNome(nome)).toBe(tipo));

  it("non inventa: un'impresa qualunque resta senza proposta dal nome", () => {
    expect(tipoDaNome("Edilmateriali Rossi Srl")).toBeNull();
    expect(tipoDaNome("Timbri e Targhe Srl")).toBeNull(); // «tim» solo come parola intera
  });
});

describe("dalla categoria (AI, scheda, costi)", () => {
  it.each([
    ["materiali_edili", "materiali"], ["Profili PVC", "materiali"], ["subappalti", "subappalto"], ["manodopera", "subappalto"],
    ["noleggio_mezzi_attrezzature", "noli_servizi"], ["Ponteggi e opere provvisionali", "noli_servizi"], ["carburante", "mezzi"],
    ["utenze", "generali"], ["Telefonia e connettività", "generali"], ["consulenze_professionali", "professionisti"],
    ["assicurazioni", "finanza_enti"], ["tasse_imposte", "finanza_enti"], ["provvigioni", "agenti"], ["Leasing", "mezzi"],
  ])("%s → %s", (c, tipo) => expect(tipoDaCategoria(c)).toBe(tipo));

  it("«altro» e il vuoto non dicono niente", () => {
    expect(tipoDaCategoria("altro")).toBeNull();
    expect(tipoDaCategoria("")).toBeNull();
  });
});

describe("la proposta, dagli indizi più solidi", () => {
  it("subappaltatore in elenco o reverse charge edile battono il resto", () => {
    expect(proponiTipo({ nome: "TIM", traISubappaltatori: true })).toMatchObject({ tipo: "subappalto", sicurezza: "certa" });
    expect(proponiTipo({ reverseChargeEdile: true, categoriaScheda: "materiali_edili" })).toMatchObject({ tipo: "subappalto" });
  });

  it("il nome noto è certo; scheda e fatture sono probabili", () => {
    expect(proponiTipo({ nome: "Vodafone Italia" })).toMatchObject({ tipo: "generali", sicurezza: "certa" });
    expect(proponiTipo({ nome: "Rossi Srl", categoriaScheda: "Calcestruzzo" })).toMatchObject({ tipo: "materiali", sicurezza: "probabile" });
    expect(proponiTipo({ nome: "Rossi Srl", categorieFatture: ["altro", "trasporti_logistica"] })).toMatchObject({ tipo: "noli_servizi" });
  });

  it("le parole del mestiere nel nome: proposta probabile, mai sicura", () => {
    expect(proponiTipo({ nome: "GIELLE SERRAMENTI S.R.L." })).toMatchObject({ tipo: "materiali", sicurezza: "probabile" });
    expect(proponiTipo({ nome: "EKO-OKNA S.A." })).toMatchObject({ tipo: "materiali" });
    expect(proponiTipo({ nome: "C.D.L. LAMIERE S.N.C." })).toMatchObject({ tipo: "materiali" });
    expect(proponiTipo({ nome: "Edil Scavi e Demolizioni Srl" })).toMatchObject({ tipo: "subappalto", sicurezza: "probabile" });
    expect(proponiTipo({ nome: "Autotrasporti Bianchi" })).toMatchObject({ tipo: "noli_servizi" });
    // La categoria della scheda vince sulle parole del nome.
    expect(proponiTipo({ nome: "Rossi Serramenti", categoriaScheda: "subappalti" })).toMatchObject({ tipo: "subappalto" });
  });

  it("senza indizi niente proposta", () => {
    expect(proponiTipo({ nome: "Rossi Srl" })).toBeNull();
  });

  it("reverse charge da subappalto edile: N6.3 e N6.7, non gli altri", () => {
    expect(naturaSubappaltoEdile("N6.3")).toBe(true);
    expect(naturaSubappaltoEdile("N6_7")).toBe(true);
    expect(naturaSubappaltoEdile("N6.2")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { verificaIterNegativa } from "@/lib/sicurezza/posIter";
import { listaControlloCommessa, type DatiControllo } from "@/lib/sicurezza/documentiSicurezza";

const subappalto = { impresa: { ruolo: "esecutrice_subappalto" }, procedure_psc: { psc_presente: false } };
const conCse = { impresa: { ruolo: "affidataria" }, procedure_psc: { psc_presente: true } };
const senza = { impresa: { ruolo: "affidataria" }, procedure_psc: { psc_presente: false } };

describe("verificaIterNegativa (art. 101 c. 3)", () => {
  it("l'esito negativo dell'affidataria conta solo in subappalto", () => {
    expect(verificaIterNegativa(subappalto, { affidataria_esito: "negativo" })).toBe(true);
    expect(verificaIterNegativa(senza, { affidataria_esito: "negativo" })).toBe(false);
  });
  it("l'esito negativo del CSE conta solo con il PSC", () => {
    expect(verificaIterNegativa(conCse, { cse_esito: "negativo" })).toBe(true);
    expect(verificaIterNegativa(senza, { cse_esito: "negativo" })).toBe(false);
  });
  it("positivo, in attesa, iter o contenuto mancanti non bloccano", () => {
    expect(verificaIterNegativa(subappalto, { affidataria_esito: "positivo", cse_esito: null })).toBe(false);
    expect(verificaIterNegativa(conCse, {})).toBe(false);
    expect(verificaIterNegativa(conCse, null)).toBe(false);
    expect(verificaIterNegativa(null, { cse_esito: "negativo" })).toBe(false);
  });
});

const base = (pos: DatiControllo["pos"]): DatiControllo => ({ oggi: "2026-10-30", documenti: [], pos, subappaltatori: [], ponteggiMontati: false });
const vocePos = (pos: DatiControllo["pos"]) => listaControlloCommessa(base(pos)).find((v) => v.chiave === "pos")!;

describe("lista di controllo: POS approvato con verifica negativa", () => {
  it("un POS approvato e verificato resta «ok»", () => {
    expect(vocePos([{ status: "approvato" }]).stato).toBe("ok");
  });
  it("con una verifica negativa non è «ok»: serve una nuova revisione", () => {
    const v = vocePos([{ status: "approvato", verificaNegativa: true }]);
    expect(v.stato).toBe("in_corso");
    expect(v.dettaglio).toMatch(/negativ/i);
  });
  it("una bozza resta in preparazione e nessun POS resta «manca»", () => {
    expect(vocePos([{ status: "bozza" }]).stato).toBe("in_corso");
    expect(vocePos([]).stato).toBe("manca");
  });
});

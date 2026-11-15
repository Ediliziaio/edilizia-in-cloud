// Confronto righe fattura ↔ DDT/ordine: le regole chiudono da sole i casi chiari,
// e lasciano all'AI solo le righe rimaste in dubbio (le altre rientrano nell'unione dei lotti).
import { describe, expect, it } from "vitest";
import { propostaDaRegole } from "../../../supabase/functions/_shared/riconciliazioneRegole.ts";
import { esitiRiconciliazione, validaPropostaRiconciliazione, type ContestoRiconciliazione, type PropostaRiconciliazione } from "../../../supabase/functions/_shared/riconciliazioneFattureAI.ts";
import { contestoLotto, pianificaLotti, unisciLotti } from "../../../supabase/functions/_shared/lottiRiconciliazione.ts";

const rigaF = (n: number, descrizione: string, q: number, um = "PZ", codice?: string, prezzo = 10) => ({
  numero_linea: n,
  descrizione,
  quantita: q,
  unita_misura: um,
  prezzo_unitario: prezzo,
  imponibile: prezzo * q,
  ...(codice ? { codice_articolo: codice } : {}),
});
const rigaD = (id: string, descrizione: string, q: number, um = "PZ", codice: string | null = null) => ({
  id,
  descrizione,
  quantita: q,
  unita_misura: um,
  codice_articolo: codice,
  prezzo_unitario: null as number | null,
  importo: null as number | null,
});

function contesto(over: Partial<ContestoRiconciliazione> = {}): ContestoRiconciliazione {
  return {
    fattura: {
      id: "f",
      company_id: "a",
      fornitore_id: "s",
      tipo_documento: "TD01",
      righe: [rigaF(1, "Cemento 32,5 R", 10, "SAC", "CEM325"), rigaF(2, "Sabbia lavata", 3, "MC")],
    },
    ddt: [{ id: "d1", righe: [rigaD("r1", "CEMENTO 32.5R SACCHI", 10, "SAC", "CEM325"), rigaD("r2", "Sabbia lavata", 3, "MC")] }],
    oda: [],
    valorizzazioni: [],
    altre_fatture: [],
    consumi: [],
    equivalenze: [],
    conversioni: [],
    ...over,
  };
}

describe("regole prima dell'AI nel confronto righe", () => {
  it("codice e descrizione uguali, quantità che torna: chiuso senza AI, e la proposta passa la convalida", () => {
    const c = contesto();
    const r = propostaDaRegole(c);
    expect(r).toMatchObject({ righe: 2, chiuse: 2, motivo: null });
    expect(r.proposta!.righe.map((x) => x.ddt)).toEqual([["r1"], ["r2"]]);
    expect(() => validaPropostaRiconciliazione(r.proposta, c)).not.toThrow();
    expect(() => esitiRiconciliazione(c, r.proposta!)).not.toThrow();
  });

  it("una riga in dubbio (quantità diversa) → niente proposta: decide l'AI su tutto", () => {
    const c = contesto({ ddt: [{ id: "d1", righe: [rigaD("r1", "x", 10, "SAC", "CEM325"), rigaD("r2", "Sabbia lavata", 2, "MC")] }] });
    const r = propostaDaRegole(c);
    expect(r.proposta).toBeNull();
    expect(r.chiuse).toBe(1);
    expect(r.motivo).toMatch(/riga 2/);
  });

  it("codice del fornitore tramite equivalenza confermata", () => {
    const c = contesto({
      fattura: { id: "f", company_id: "a", fornitore_id: "s", tipo_documento: "TD01", righe: [rigaF(1, "CEMENTO TIPO II", 10, "SAC", "F-998")] },
      ddt: [{ id: "d1", righe: [rigaD("r1", "Cemento 32,5", 10, "SAC", "CEM325")] }],
      equivalenze: [{ attiva: true, fattura_codice: "F998", documento_codice: "CEM325" }],
    });
    expect(propostaDaRegole(c).proposta?.righe[0].ddt).toEqual(["r1"]);
  });

  it("conversione autorizzata: 1 bancale = 60 sacchi", () => {
    const c = contesto({
      fattura: { id: "f", company_id: "a", fornitore_id: "s", tipo_documento: "TD01", righe: [rigaF(1, "Cemento", 1, "PAL", "CEM325", 480)] },
      ddt: [{ id: "d1", righe: [rigaD("r1", "Cemento", 60, "SAC", "CEM325")] }],
      conversioni: [{ unita_fattura: "PAL", unita_ddt: "SAC", fattore: 60, codice_articolo: "CEM325" }],
    });
    expect(propostaDaRegole(c).proposta?.righe[0].ddt).toEqual(["r1"]);
  });

  it("riga di bolla già fatturata in parte: non si abbina da sola", () => {
    const c = contesto({ consumi: [{ ddt_id: "d1", riga_id: "r1", quantita: 4, fattura_id: "altra" }] });
    expect(propostaDaRegole(c).proposta).toBeNull();
  });

  it("con gli ordini scelti, ogni riga deve trovare anche la riga d'ordine", () => {
    const oda = [{ id: "o1", righe: [{ id: "p1", sku: "CEM325", description: "Cemento", unit_of_measure: "SAC", quantity: 10, unit_price: 8 }] }];
    expect(propostaDaRegole(contesto({ oda })).proposta).toBeNull(); // la sabbia non è nell'ordine
    const soloCemento = contesto({
      oda,
      fattura: { id: "f", company_id: "a", fornitore_id: "s", tipo_documento: "TD01", righe: [rigaF(1, "Cemento 32,5 R", 10, "SAC", "CEM325")] },
    });
    expect(propostaDaRegole(soloCemento).proposta?.righe[0]).toMatchObject({ ddt: ["r1"], oda: ["p1"], affidabilita: "alta" });
  });

  it("due righe uguali in fattura, una sola in bolla: la seconda resta all'AI", () => {
    const c = contesto({
      fattura: { id: "f", company_id: "a", fornitore_id: "s", tipo_documento: "TD01", righe: [rigaF(1, "Sabbia lavata", 3, "MC"), rigaF(2, "Sabbia lavata", 3, "MC")] },
      ddt: [{ id: "d1", righe: [rigaD("r2", "Sabbia lavata", 3, "MC")] }],
    });
    expect(propostaDaRegole(c).proposta).toBeNull();
  });

  it("una riga in dubbio su due: all'AI va solo quella, senza la riga di bolla già usata; poi l'unione le rimette insieme", () => {
    const c = contesto({ ddt: [{ id: "d1", righe: [rigaD("r1", "x", 10, "SAC", "CEM325"), rigaD("r2", "Sabbia lavata", 2, "MC")] }] });
    const r = propostaDaRegole(c);
    expect(r.chiuseRighe.map((x) => [x.fattura, x.ddt])).toEqual([["1", ["r1"]]]);
    const piano = pianificaLotti(c, r.chiuseRighe);
    expect(piano).toEqual([{ fattura: ["2"], ddt: ["r2"], oda: [] }]);
    const lotto = contestoLotto(c, piano[0]);
    expect((lotto.fattura.righe as unknown[]).length).toBe(1);
    // Quello che risponderebbe l'AI per la sola riga 2.
    const ai: PropostaRiconciliazione = { righe: [{ fattura: "2", ddt: ["r2"], oda: [], affidabilita: "media", motivo: "quantità diversa: 3 contro 2" }], avvisi: [] };
    const unita = unisciLotti(c, [validaPropostaRiconciliazione(ai, lotto)], r.chiuseRighe);
    expect(unita.righe.map((x) => [x.fattura, x.ddt, x.affidabilita])).toEqual([["1", ["r1"], "alta"], ["2", ["r2"], "media"]]);
    expect(unita.righe[0].motivo).toMatch(/Regola, senza AI/);
    expect(() => esitiRiconciliazione(c, unita)).not.toThrow();
  });

  it("senza righe chiuse il piano è quello di sempre", () => {
    const c = contesto({ ddt: [{ id: "d1", righe: [rigaD("r1", "x", 9, "SAC"), rigaD("r2", "y", 2, "MC")] }] });
    expect(pianificaLotti(c, propostaDaRegole(c).chiuseRighe)).toEqual(pianificaLotti(c));
  });
});

import { describe, expect, it } from "vitest";
import { completaRateFornitore, filtriFornitore, unisciFattureScadenze, type FatturaFornitore } from "@/hooks/useFattureFornitoreContestuali";

const fattura = (id: string, piano_pagamento: unknown = []): FatturaFornitore => ({
  id, numero_fattura: id, data_fattura: "2026-11-01", tipo_documento: "TD01", stato: "letta",
  pagata_il: null, company_cost_id: "costo", totale_documento: 300, piano_pagamento,
});

describe("contesto del fornitore nella fattura ricevuta", () => {
  it("usa anagrafica e identificativi fiscali precisi, senza fidarsi di nomi o filtri non validi", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const filtri = filtriFornitore(id, "IT01234567890", null, "IT");
    expect(filtri).toContain(`fornitore_id.eq.${id}`);
    expect(filtri).toContain("and(cedente_piva.eq.01234567890,fornitore_id.is.null,cedente_paese.eq.IT)");
    expect(filtriFornitore("nome,company_id.eq.altro", "test),company_id.eq.altro", null)).toEqual([]);
  });
  it("usa le rate effettive e mantiene sconosciuto il residuo se non è disponibile", () => {
    const [f] = unisciFattureScadenze([fattura("F1", [{ scadenza: "2027-03-01", importo: 300, modalita: "MP12" }])], [
      { id: "r1", fattura_id: "F1", numero: 1, scadenza: "2027-01-30", importo: 100, residuo: null, metodo: "riba", stato: "da_pagare", pagata_il: null, fornitore: "F" },
      { id: "r2", fattura_id: "F1", numero: 2, scadenza: "2027-02-28", importo: 200, residuo: 100, metodo: "riba", stato: "da_pagare", pagata_il: null, fornitore: "F" },
    ]);
    expect(f.scadenze).toHaveLength(2);
    expect(f.scadenze[0]).toMatchObject({ residuo: null, prevista: false, scadenza: "2027-01-30" });
    expect(f.scadenze[1]).toMatchObject({ residuo: 100, stato: "pagamento parziale" });
  });
  it("mostra il piano della fattura non contabilizzata come previsto e da verificare", () => {
    const [f] = unisciFattureScadenze([fattura("F2", [{ scadenza: "2027-01-30", importo: 120, modalita: "MP12" }])], []);
    expect(f.scadenze[0]).toMatchObject({ prevista: true, residuo: null, importo: 120, stato: "da verificare" });
  });
  it("conserva le rate già registrate senza costo e non duplica quelle dello scadenzario", () => {
    const comune: { id: string; numero: number; scadenza: string; importo: number; metodo: string; stato: string; pagata_il: string | null } =
      { id: "r1", numero: 1, scadenza: "2027-02-28", importo: 100, metodo: "riba", stato: "da_pagare", pagata_il: null };
    const rate = completaRateFornitore([{ ...comune, fattura_id: "F1", residuo: 30, fornitore: "F" }], [
      { ...comune, fattura_ricevuta_id: "F1" },
      { ...comune, id: "r2", numero: 2, fattura_ricevuta_id: "F2" },
    ]);
    expect(rate).toHaveLength(2);
    expect(rate[0].residuo).toBe(30);
    expect(rate[1]).toMatchObject({ fattura_id: "F2", residuo: null });
  });
  it("non trasferisce rate fra fatture diverse e ordina i documenti più recenti", () => {
    const vecchia = { ...fattura("F1"), data_fattura: "2026-01-01" };
    const recente = { ...fattura("F2"), data_fattura: "2026-11-20" };
    const list = unisciFattureScadenze([vecchia, recente], [
      { id: "r1", fattura_id: "F1", numero: 1, scadenza: null, importo: 10, residuo: 10, metodo: null, stato: "da_pagare", pagata_il: null, fornitore: "F" },
    ]);
    expect(list.map(x => x.id)).toEqual(["F2", "F1"]);
    expect(list[0].scadenze).toHaveLength(0);
    expect(list[1].scadenze).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { perDitta, riepilogoChiFaCosa, statoVoce, type AffidamentoChiFaCosa, type VoceChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";

const intonaco: VoceChiFaCosa = { id: "v1", phase_id: "f1", descrizione: "Intonaco", unita: "mq", quantita: 420, importo: 11970, costo_materiali: 3 };
const rasatura: VoceChiFaCosa = { id: "v2", phase_id: "f1", descrizione: "Rasatura", unita: "mq", quantita: 420, importo: 6030, costo_materiali: 0 };
const a = (x: Partial<AffidamentoChiFaCosa>): AffidamentoChiFaCosa => ({
  id: "a", voce_id: "v1", subappaltatore_id: "rossi", quantita: 300, prezzo_unitario: 14, origine_prezzo: "listino_ditta", comprende: "fornitura_e_posa", stato: "bozza", ...x,
});

describe("chi fa cosa: una voce", () => {
  it("divisa fra due ditte: la voce resta una, il venduto si divide per quantità", () => {
    const s = statoVoce(intonaco, [a({ id: "a1" }), a({ id: "a2", subappaltatore_id: "bianchi", quantita: 120, prezzo_unitario: 15 })]);
    expect(s.affidata).toBe(420);
    expect(s.piena).toBe(true);
    expect(s.vendutoAffidato).toBe(11970);
    expect(s.costoDitte).toBe(300 * 14 + 120 * 15);
    expect(s.margine).toBe(11970 - 6000);
  });

  it("con «solo posa» i materiali della voce li paga l'impresa: il margine li toglie", () => {
    const s = statoVoce(intonaco, [a({ comprende: "posa", quantita: 420 })]);
    expect(s.materialiNostri).toBe(1260);
    expect(s.margine).toBe(11970 - 420 * 14 - 1260);
  });

  it("parte senza ditta: residuo e venduto residuo", () => {
    const s = statoVoce(intonaco, [a({ quantita: 300 })]);
    expect(s.residua).toBe(120);
    expect(s.piena).toBe(false);
    expect(s.vendutoAffidato).toBe(8550);
    expect(s.vendutoResiduo).toBe(3420);
  });

  it("niente affidato: margine nullo, non zero", () => {
    expect(statoVoce(rasatura, []).margine).toBeNull();
  });

  it("una quota senza prezzo si conta", () => {
    expect(statoVoce(intonaco, [a({ prezzo_unitario: null })]).senzaPrezzo).toBe(1);
  });
});

describe("chi fa cosa: la commessa", () => {
  const voci = [intonaco, rasatura];
  const aff = [a({ id: "a1", quantita: 420 }), a({ id: "a2", voce_id: "v2", subappaltatore_id: "bianchi", quantita: 200, prezzo_unitario: 8, stato: "a_contratto" })];

  it("riepilogo: venduto, affidato, senza ditta, margine e percentuale", () => {
    const r = riepilogoChiFaCosa(voci, aff);
    expect(r.venduto).toBe(18000);
    expect(r.vendutoAffidato).toBe(11970 + 2871.43);
    expect(r.vendutoSenzaDitta).toBe(3158.57);
    expect(r.costoDitte).toBe(420 * 14 + 200 * 8);
    expect(r.vociSenzaDitta).toBe(1);
    expect(r.ditte).toBe(2);
    expect(r.marginePct).toBeCloseTo((r.margine / r.vendutoAffidato) * 100, 0);
  });

  it("per ditta", () => {
    const d = perDitta(voci, aff);
    expect(d.get("rossi")).toEqual({ voci: 1, venduto: 11970, costo: 5880, aContratto: 0 });
    expect(d.get("bianchi")).toEqual({ voci: 1, venduto: 2871.43, costo: 1600, aContratto: 1 });
  });
});

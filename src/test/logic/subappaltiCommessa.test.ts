import { describe, expect, it } from "vitest";
import { righeSubappalti, statoRigaSubappalto, type ContrattoRiga, type SalRiga } from "@/lib/orders/subappaltiCommessa";
import type { Uscita } from "@/lib/orders/quadroPagamenti";

const uscita = (p: Partial<Uscita>): Uscita => ({
  chiave: "x", categoria: "subappalti", controparte: "Rossi Srl", descrizione: "Muratura", riferimento: null, importo: 1000, fatture: null,
  senza_fattura: false, ha_ricevuta: false, pagato: 0, pagato_il: null, residuo: 1000, scadenza: null, stato: "da_pagare", ripartito: false, quota_pct: 100,
  origine_tipo: "subappalto", origine_id: "k1", contratto: 5000, maturato_lordo: 1050, ritenute: 50, ...p,
});
const contratti: ContrattoRiga[] = [{ id: "k1", subappaltatore_id: "s1" }];
const sal = (p: Partial<SalRiga>): SalRiga => ({ id: "x", contratto_id: "k1", subappaltatore_id: "s1", numero_sal: 1, stato: "pagato", ...p });

describe("Subappaltatori della commessa", () => {
  it("prende solo le uscite ai subappaltatori", () => {
    const righe = righeSubappalti([uscita({}), uscita({ chiave: "m", categoria: "materiali" })], [], contratti);
    expect(righe).toHaveLength(1);
  });
  it("trova la ditta dal contratto", () => {
    expect(righeSubappalti([uscita({})], [], contratti)[0]).toMatchObject({ subappaltatoreId: "s1", contrattoId: "k1" });
  });
  it("senza contratto l'origine è già la ditta, e conta i suoi SAL senza contratto", () => {
    const r = righeSubappalti([uscita({ origine_id: "s9" })], [sal({ contratto_id: null, subappaltatore_id: "s9", stato: "ricevuto" })], contratti)[0];
    expect(r).toMatchObject({ subappaltatoreId: "s9", contrattoId: null, salDaVerificare: 1 });
  });
  it("una ditta senza contratto di subappalto o un costo non hanno una scheda da aprire", () => {
    expect(righeSubappalti([uscita({ origine_tipo: "ditta", origine_id: "t1" })], [], contratti)[0].subappaltatoreId).toBeNull();
    expect(righeSubappalti([uscita({ origine_tipo: "costo", origine_id: "c1" })], [], contratti)[0].subappaltatoreId).toBeNull();
  });
  it("conta i SAL per stato solo del suo contratto", () => {
    const r = righeSubappalti([uscita({})], [sal({ stato: "ricevuto" }), sal({ stato: "ricevuto" }), sal({ stato: "verificato" }), sal({ stato: "contestato" }), sal({ contratto_id: "k2", stato: "ricevuto" })], contratti)[0];
    expect(r).toMatchObject({ salDaVerificare: 2, salContestati: 1, salTotali: 4 });
  });
  it.each([
    [{ salContestati: 1, salDaVerificare: 2, residuo: 10 }, "problema", "1 SAL contestato"],
    [{ salContestati: 0, salDaVerificare: 2, residuo: 10 }, "daVerificare", "2 SAL da verificare"],
    [{ salContestati: 0, salDaVerificare: 0, residuo: 10 }, "daPagare", "Da pagare"],
    [{ salContestati: 0, salDaVerificare: 0, residuo: 0, salTotali: 3 }, "inRegola", "Saldato"],
    [{ salContestati: 0, salDaVerificare: 0, residuo: 0, salTotali: 0 }, "nessuno", "Nessun SAL"],
  ])("lo stato di %j", (riga, chiave, testo) => {
    expect(statoRigaSubappalto({ salTotali: 1, ...riga })).toMatchObject({ chiave, testo });
  });
});

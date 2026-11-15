/**
 * Dati appalto e fatturazione PA sulla commessa (lotto 3, 15/11/2026): formati di CIG, CUP e
 * codice ufficio come i CHECK di order_riferimenti_pa, regole «non dovuto», cosa manca, piano di
 * salvataggio e fonti già presenti.
 */
import { describe, expect, it } from "vitest";
import {
  anagraficaEPa, bozzaDaFonte, bozzaDaRiga, bozzaVuota, bozzaVuotaDiContenuto, cigValido, codiceUfficioValido,
  controllaRiferimento, cupValido, eSmartCig, fonteGiaPresente, ordinaRiferimenti, payloadRiferimento, pianoSalvataggio,
  problemiFonte, type RiferimentoPa,
} from "@/lib/orders/riferimentiPa";

const riga = (p: Partial<RiferimentoPa> = {}): RiferimentoPa => ({
  id: "r1", company_id: "c", order_id: "o", tipo: "contratto", numero: "Rep. 12", data: "2026-03-02",
  cig: "1234567ABC", cig_non_dovuto: false, cig_motivo_esclusione: null, cup: "J51B21000140006", cup_non_dovuto: false,
  lotto: null, determina: null, impegno_spesa: null, ufficio_id: null, codice_univoco_ufficio: "UFXYZ1",
  note_fatturazione: null, fonte: "manuale", fonte_id: null, ordinamento: 0, created_at: "2026-11-15T10:00:00Z",
  updated_at: "2026-11-15T10:00:00Z", created_by: null, ...p,
});

describe("formati", () => {
  it("CIG: 10 caratteri alfanumerici, anche SmartCIG, spazi e minuscole tollerati", () => {
    expect(cigValido("1234567ABC")).toBe(true);
    expect(cigValido("z1a2b3c4d5")).toBe(true);
    expect(cigValido("Z1A2 B3C4D5")).toBe(true);
    expect(eSmartCig("Z1A2B3C4D5")).toBe(true);
    expect(eSmartCig("1234567ABC")).toBe(false);
    expect(cigValido("123456789")).toBe(false);
    expect(cigValido("1234567ABCDEF")).toBe(false);
    expect(cigValido("12345-7ABC")).toBe(false);
  });
  it("CUP: 15 caratteri, il primo una lettera", () => {
    expect(cupValido("J51B21000140006")).toBe(true);
    expect(cupValido("j51b21000140006")).toBe(true);
    expect(cupValido("151B21000140006")).toBe(false);
    expect(cupValido("J51B2100014000")).toBe(false);
  });
  it("Codice Univoco Ufficio: 6 caratteri", () => {
    expect(codiceUfficioValido("UFXYZ1")).toBe(true);
    expect(codiceUfficioValido("0000000")).toBe(false);
  });
});

describe("controllaRiferimento", () => {
  it("riga completa: nessun errore, nessuna mancanza", () => {
    expect(controllaRiferimento(bozzaDaRiga(riga()))).toEqual({ errori: {}, mancanze: [] });
  });
  it("riga vuota: niente errori, solo avvisi di cosa manca", () => {
    const { errori, mancanze } = controllaRiferimento(bozzaVuota());
    expect(errori).toEqual({});
    expect(mancanze).toEqual(["Numero del contratto", "Data del contratto", "CIG (o la spunta «non dovuto»)", "CUP (o la spunta «non dovuto»)"]);
  });
  it("CIG e «non dovuto» insieme è un errore", () => {
    const b = { ...bozzaVuota(), cig: "1234567ABC", cig_non_dovuto: true };
    expect(controllaRiferimento(b).errori.cig).toMatch(/non dovuto/);
  });
  it("CIG non dovuto senza motivo: avviso, non errore", () => {
    const b = { ...bozzaVuota(), cig_non_dovuto: true };
    const e = controllaRiferimento(b);
    expect(e.errori).toEqual({});
    expect(e.mancanze).toContain("Motivo per cui il CIG non è dovuto");
    expect(e.mancanze).not.toContain("CIG (o la spunta «non dovuto»)");
  });
  it("numero e lotto: al massimo 20 caratteri (IdDocumento e NumItem dell'XML)", () => {
    const ok = controllaRiferimento({ ...bozzaVuota(), numero: "12345678901234567890", lotto: " Lotto 1 " });
    expect(ok.errori).toEqual({});
    const ko = controllaRiferimento({ ...bozzaVuota(), numero: "Repertorio n. 1234/2026", lotto: "Lotto 1 — scuola media" });
    expect(ko.errori.numero).toMatch(/IdDocumento.*23/);
    expect(ko.errori.lotto).toMatch(/NumItem.*22/);
  });
  it("formati sbagliati dicono quanti caratteri ci sono", () => {
    const e = controllaRiferimento({ ...bozzaVuota(), cig: "ABC123ABC123ABC", cup: "J51", codice_univoco_ufficio: "1234567" });
    expect(e.errori.cig).toMatch(/15/);
    expect(e.errori.cup).toMatch(/3/);
    expect(e.errori.codice_univoco_ufficio).toMatch(/7/);
  });
});

describe("payload e piano di salvataggio", () => {
  it("normalizza e non scrive mai il codice insieme alla spunta", () => {
    const p = payloadRiferimento({ ...bozzaVuota(), cig: " z1a2b3c4d5 ", cup: "x", cup_non_dovuto: true, cig_motivo_esclusione: "ignorato" }, 3);
    expect(p).toMatchObject({ cig: "Z1A2B3C4D5", cup: null, cup_non_dovuto: true, cig_motivo_esclusione: null, ordinamento: 3, numero: null });
  });
  it("inserisce le nuove, aggiorna le cambiate, toglie le sparite, salta le vuote", () => {
    const a = riga({ id: "a" });
    const b = riga({ id: "b", ordinamento: 1, tipo: "ordine_acquisto", cup: null });
    const c = riga({ id: "c", ordinamento: 2 });
    const bozze = [bozzaDaRiga(a), { ...bozzaDaRiga(b), numero: "OdA 7" }, { ...bozzaVuota(), cup: "J51B21000140006" }, bozzaVuota()];
    const piano = pianoSalvataggio(bozze, [a, b, c]);
    expect(piano.inserire).toHaveLength(1);
    expect(piano.inserire[0]).toMatchObject({ cup: "J51B21000140006", ordinamento: 2 });
    expect(piano.aggiornare.map((u) => u.id)).toEqual(["b"]);
    expect(piano.eliminare).toEqual(["c"]);
  });
  it("cambiare l'ordine aggiorna l'ordinamento", () => {
    const a = riga({ id: "a", ordinamento: 0 });
    const b = riga({ id: "b", ordinamento: 1 });
    const piano = pianoSalvataggio([bozzaDaRiga(b), bozzaDaRiga(a)], [a, b]);
    expect(piano.aggiornare.map((u) => [u.id, u.campi.ordinamento])).toEqual([["b", 0], ["a", 1]]);
  });
  it("una bozza senza contenuto è vuota", () => {
    expect(bozzaVuotaDiContenuto(bozzaVuota("convenzione"))).toBe(true);
    expect(bozzaVuotaDiContenuto({ ...bozzaVuota(), cig_non_dovuto: true })).toBe(false);
  });
});

describe("fonti e cliente PA", () => {
  it("fonte già presente per id o per stessi codici", () => {
    const righe = [riga({ fonte: "computo", fonte_id: "k1" })];
    expect(fonteGiaPresente(righe, "computo", "k1", null, null)).toBe(true);
    expect(fonteGiaPresente(righe, "contratto_generale", "g1", "1234567abc", "J51B21000140006")).toBe(true);
    expect(fonteGiaPresente(righe, "contratto_generale", "g1", "9999999ABC", null)).toBe(false);
  });
  it("la bozza da una fonte ricorda la fonte e normalizza", () => {
    const b = bozzaDaFonte({ fonte: "contratto_generale", fonte_id: "g1", etichetta: "x", cig: "1234567abc", cup: null, numero: "Rep. 1", data: "2026-01-02", giaPresente: false, problemi: [] });
    expect(b).toMatchObject({ fonte: "contratto_generale", fonte_id: "g1", cig: "1234567ABC", numero: "Rep. 1", data: "2026-01-02" });
  });
  it("problemi della fonte: formato sbagliato segnalato", () => {
    expect(problemiFonte("123", "J51B21000140006")).toHaveLength(1);
    expect(problemiFonte(null, null)).toEqual([]);
  });
  it("anagrafica PA da tipo_cliente o tipo_soggetto", () => {
    expect(anagraficaEPa({ tipo_cliente: "PA" })).toBe(true);
    expect(anagraficaEPa({ tipo_cliente: "B2B", tipo_soggetto: "pa" })).toBe(true);
    expect(anagraficaEPa({ tipo_cliente: "B2C", tipo_soggetto: "fisico" })).toBe(false);
    expect(anagraficaEPa(null)).toBe(false);
  });
  it("ordina per ordinamento poi per creazione", () => {
    const r = ordinaRiferimenti([riga({ id: "x", ordinamento: 1 }), riga({ id: "y", ordinamento: 0, created_at: "2026-11-16" }), riga({ id: "z", ordinamento: 0, created_at: "2026-11-14" })]);
    expect(r.map((x) => x.id)).toEqual(["z", "y", "x"]);
  });
});

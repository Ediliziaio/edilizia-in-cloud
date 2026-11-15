import { describe, expect, it, vi } from "vitest";
import {
  chiavePiva, conInterruttoreSubappalto, controllaFatturaSubappalto, proveTraccia, periodoDalTesto, progressiviSal, salDalTesto,
  type ContrattoCtrl, type FatturaCtrl, type SalCtrl,
} from "@/lib/subappaltatori/controlloFatturaSubappalto";

const AZ = "az-1";
const PIVA = "01234567890";
const contratto = (over: Partial<ContrattoCtrl> = {}): ContrattoCtrl => ({
  id: "c1", company_id: AZ, numero_contratto: "SUB-2026-07", piva: `IT ${PIVA}`, importo_contrattuale: 30000, oneri_sicurezza: 0, ...over,
});
const sal = (numero: number, importo: number, stato = "verificato", over: Partial<SalCtrl> = {}): SalCtrl => ({
  id: `s${numero}`, company_id: AZ, contratto_id: "c1", numero_sal: numero, importo_lordo: importo, oneri_quota: 0,
  ritenuta_importo: importo * 0.05, importo_netto: importo * 0.95, stato, ...over,
});
const fattura = (over: Partial<FatturaCtrl> = {}): FatturaCtrl => ({
  id: "f-nuova", company_id: AZ, cedente_piva: PIVA, numero_fattura: "12", tipo_documento: "TD01", imponibile_totale: 8000, ...over,
});
// Tre SAL del periodo: 10.000, 8.000, 6.000 (cumulativi 10.000, 18.000, 24.000).
const tre = [sal(1, 10000, "pagato"), sal(2, 8000), sal(3, 6000)];

describe("SAL del periodo e SAL cumulativo restano distinti", () => {
  it("il cumulativo si ricava dai periodi, i contestati non entrano", () => {
    expect(progressiviSal([sal(2, 8000), sal(1, 10000), sal(3, 5000, "contestato"), sal(4, 6000)]))
      .toEqual([
        { id: "s1", numero: 1, periodo: 10000, cumulativo: 10000 },
        { id: "s2", numero: 2, periodo: 8000, cumulativo: 18000 },
        { id: "s3", numero: 3, periodo: 5000, cumulativo: 18000 },
        { id: "s4", numero: 4, periodo: 6000, cumulativo: 24000 },
      ]);
  });

  it("una fattura sul cumulativo «a tutto il SAL 2» si blocca: conterebbe due volte il SAL 1", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 18000, testo: "SAL n. 2 lavori a tutto il 30/09" }), { contratti: [contratto()], sal: tre, altreFatture: [] });
    expect(r.esito).toBe("conflitto");
    expect(r.problemi.map((p) => p.codice)).toContain("importo_cumulativo");
  });

  it("subappalto con SAL cumulativi e variante: la fattura del periodo del SAL 3 passa in automatico", () => {
    // Variante approvata: il contratto da 20.000 è salito a 30.000 (importo_contrattuale aggiornato).
    const altre = [fattura({ id: "f1", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s1", imponibile_totale: 10000 }),
      fattura({ id: "f2", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s2", imponibile_totale: 8000 })];
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 6000, testo: "Rif. contratto n. SUB-2026-07 - 3° SAL" }), { contratti: [contratto()], sal: tre, altreFatture: altre });
    expect(r).toMatchObject({ esito: "automatico", contrattoId: "c1", salId: "s3", problemi: [] });
    expect(r.prove.map((p) => p.dato)).toContain("SAL trovato per numero");
  });
});

describe("fatture oltre l'autorizzato e SAL già fatturati", () => {
  it("fattura oltre il valore del contratto: blocco", () => {
    const altre = [fattura({ id: "f1", contratto_subappalto_id: "c1", imponibile_totale: 25000 })];
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 6000, testo: "SAL 3" }), { contratti: [contratto()], sal: tre, altreFatture: altre });
    expect(r.esito).toBe("conflitto");
    expect(r.problemi.find((p) => p.codice === "oltre_contratto")?.blocca).toBe(true);
  });

  it("oltre i SAL approvati ma dentro il contratto: avviso, non blocco", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 6000, testo: "SAL 3" }), { contratti: [contratto()], sal: [sal(1, 10000, "pagato"), sal(2, 8000, "ricevuto"), sal(3, 6000, "ricevuto")], altreFatture: [fattura({ id: "f1", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s1", imponibile_totale: 10000 })] });
    expect(r.esito).toBe("proposta");
    expect(r.problemi.map((p) => p.codice)).toEqual(expect.arrayContaining(["oltre_approvato", "sal_non_verificato"]));
  });

  it("SAL già fatturato da un'altra fattura: blocco", () => {
    const altre = [fattura({ id: "f2", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s2", imponibile_totale: 8000 })];
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 8000, testo: "SAL n.2" }), { contratti: [contratto()], sal: tre, altreFatture: altre });
    expect(r.esito).toBe("conflitto");
    expect(r.problemi.map((p) => p.codice)).toContain("sal_gia_fatturato");
  });

  it("due fatture parziali sullo stesso SAL entro il suo importo: nessun blocco", () => {
    const altre = [fattura({ id: "f2", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s2", imponibile_totale: 3000 })];
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 5000, testo: "SAL 2 saldo" }), { contratti: [contratto()], sal: tre, altreFatture: altre });
    expect(r.problemi.some((p) => p.blocca)).toBe(false);
    expect(r.esito).toBe("proposta");
  });

  it("una nota di credito riduce il fatturato e non chiede un SAL", () => {
    const altre = [fattura({ id: "f1", contratto_subappalto_id: "c1", imponibile_totale: 30000 })];
    const r = controllaFatturaSubappalto(fattura({ tipo_documento: "TD04", imponibile_totale: 2000, contratto_subappalto_id: "c1" }), { contratti: [contratto()], sal: tre, altreFatture: altre });
    expect(r.problemi.map((p) => p.codice)).not.toContain("sal_mancante");
    expect(r.problemi.some((p) => p.blocca)).toBe(false);
  });
});

describe("identità e riferimenti", () => {
  it("P.IVA diversa da quella del contratto collegato: blocco, qualunque sia il resto", () => {
    const r = controllaFatturaSubappalto(fattura({ cedente_piva: "09999999999", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s2", imponibile_totale: 8000, testo: "SAL 2" }), { contratti: [contratto()], sal: tre, altreFatture: [] });
    expect(r.esito).toBe("conflitto");
    expect(r.problemi[0].codice).toBe("piva_diversa");
  });

  it("SAL citato diverso da quello collegato: riferimento incoerente", () => {
    const r = controllaFatturaSubappalto(fattura({ contratto_subappalto_id: "c1", sal_subappaltatore_id: "s2", testo: "SAL n. 3" }), { contratti: [contratto()], sal: tre, altreFatture: [] });
    expect(r.esito).toBe("conflitto");
    expect(r.problemi.map((p) => p.codice)).toContain("sal_diverso");
  });

  it("fattura che cita un altro contratto dello stesso subappaltatore: incoerente", () => {
    const r = controllaFatturaSubappalto(fattura({ contratto_subappalto_id: "c1", testo: "contratto n. SUB-2026-09" }),
      { contratti: [contratto(), contratto({ id: "c2", numero_contratto: "SUB-2026-09" })], sal: tre, altreFatture: [] });
    expect(r.problemi.map((p) => p.codice)).toContain("contratto_diverso");
  });

  it("cita un numero ma il contratto in archivio non ne ha: proposta con avviso, non conflitto", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 1234, testo: "CONTRATTO DI SUBAPPALTO N. 07 DEL 15/09/2025" }), { contratti: [contratto({ numero_contratto: null })], sal: tre, altreFatture: [] });
    expect(r).toMatchObject({ esito: "proposta", contrattoId: "c1" });
    expect(r.problemi.find((p) => p.codice === "contratto_senza_numero")?.blocca).toBe(false);
  });

  it("numero breve in archivio («02 del 15/09/2025 — commessa 06/2025») riconosciuto dalla fattura che scrive «contratto n. 02»", () => {
    const due = [contratto({ id: "c1", numero_contratto: "02 del 15/09/2025 — commessa 06/2025" }), contratto({ id: "c2", numero_contratto: "07 del 15/09/2025 — commessa 04/2023" })];
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 4321, testo: "Contratto di subappalto n. 07 del 15/09/2025" }), { contratti: due, sal: [], altreFatture: [] });
    expect(r.contrattoId).toBe("c2");
  });

  it("nessun contratto con quella P.IVA: da gestire", () => {
    const r = controllaFatturaSubappalto(fattura({ cedente_piva: "05555555555" }), { contratti: [contratto()], sal: tre, altreFatture: [] });
    expect(r.esito).toBe("da_gestire");
  });

  it("due contratti dello stesso subappaltatore senza riferimenti: scelta motivata", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 4321 }), { contratti: [contratto(), contratto({ id: "c2", numero_contratto: "SUB-2026-09" })], sal: tre, altreFatture: [] });
    expect(r.esito).toBe("scelta");
    expect(r.alternative).toHaveLength(2);
  });

  it("due contratti, l'importo è uguale a un solo SAL: si restringe a quello (proposta, non automatico)", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 8000 }), { contratti: [contratto(), contratto({ id: "c2", numero_contratto: "SUB-2026-09" })], sal: tre, altreFatture: [] });
    expect(r).toMatchObject({ esito: "proposta", contrattoId: "c1", salId: "s2" });
  });

  it("SAL mancante: chiede una verifica, la fattura non è sbagliata", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 1234 }), { contratti: [contratto()], sal: tre, altreFatture: [] });
    expect(r.esito).toBe("proposta");
    expect(r.problemi.find((p) => p.codice === "sal_mancante")?.blocca).toBe(false);
  });

  it("periodi sovrapposti con un'altra fattura dello stesso contratto: avviso", () => {
    const altre = [fattura({ id: "f1", numero_fattura: "9", contratto_subappalto_id: "c1", sal_subappaltatore_id: "s1", imponibile_totale: 10000, testo: "Lavori dal 01/09/2026 al 30/09/2026" })];
    const r = controllaFatturaSubappalto(fattura({ testo: "SAL 2 lavori dal 15/09/2026 al 15/10/2026" }), { contratti: [contratto()], sal: tre, altreFatture: altre });
    expect(r.problemi.map((p) => p.codice)).toContain("periodo_sovrapposto");
  });
});

describe("periodo del SAL dalle date di emissione", () => {
  it("una fattura con lavori dopo la data del SAL che cita: avviso, forse è del SAL successivo", () => {
    const conDate = [sal(1, 10000, "pagato", { data_emissione: "2026-08-31" }), sal(2, 8000, "verificato", { data_emissione: "2026-09-30" })];
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 8000, testo: "SAL n. 2 lavori dal 01/10/2026 al 31/10/2026" }), { contratti: [contratto()], sal: conDate, altreFatture: [] });
    expect(r.problemi.find((p) => p.codice === "periodo_fuori_sal")?.blocca).toBe(false);
    const ok = controllaFatturaSubappalto(fattura({ imponibile_totale: 8000, testo: "SAL n. 2 lavori dal 01/09/2026 al 30/09/2026" }), { contratti: [contratto()], sal: conDate, altreFatture: [] });
    expect(ok.problemi.map((p) => p.codice)).not.toContain("periodo_fuori_sal");
  });
});

describe("acconto al subappaltatore", () => {
  // Contratto da 12.400 con acconto 3.100: il SAL 2 da 4.000 recupera 1.000 (netto 4.000 − 200 − 1.000 = 2.800).
  const conAcconto = () => contratto({ importo_contrattuale: 12400, acconto_importo: 3100 });
  const salAcc = [sal(1, 4000, "verificato", { ritenuta_importo: 200, acconto_recuperato: 1000, importo_netto: 2800 })];

  it("la fattura d'acconto si riconosce senza SAL e non chiede un SAL", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 3100, testo: "Acconto su contratto di subappalto" }), { contratti: [conAcconto()], sal: [], altreFatture: [] });
    expect(r).toMatchObject({ esito: "automatico", contrattoId: "c1", salId: null });
    expect(r.problemi.map((p) => p.codice)).not.toContain("sal_mancante");
  });

  it("acconto fatturato due volte: blocco", () => {
    const prima = fattura({ id: "fa", contratto_subappalto_id: "c1", imponibile_totale: 3100, subappalto_acconto: true });
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 3100, testo: "Acconto" }), { contratti: [conAcconto()], sal: [], altreFatture: [prima] });
    expect(r.esito).toBe("conflitto");
    expect(r.problemi.map((p) => p.codice)).toContain("acconto_oltre");
  });

  it("la fattura del SAL che scala l'acconto passa; quella che non lo scala si blocca", () => {
    const accontoFatturato = fattura({ id: "fa", contratto_subappalto_id: "c1", imponibile_totale: 3100, subappalto_acconto: true });
    const ok = controllaFatturaSubappalto(fattura({ imponibile_totale: 2800, testo: "SAL n. 1" }), { contratti: [conAcconto()], sal: salAcc, altreFatture: [accontoFatturato] });
    expect(ok).toMatchObject({ esito: "automatico", salId: "s1" });
    const doppia = controllaFatturaSubappalto(fattura({ imponibile_totale: 3800, testo: "SAL n. 1" }), { contratti: [conAcconto()], sal: salAcc, altreFatture: [accontoFatturato] });
    expect(doppia.esito).toBe("conflitto");
    expect(doppia.problemi.map((p) => p.codice)).toContain("acconto_non_scalato");
  });

  it("una fattura collegata al contratto senza SAL ma non dichiarata acconto non conta come acconto", () => {
    // È la fattura di un SAL non ancora verificato, collegata al solo contratto.
    const salNonVerificato = fattura({ id: "fs", contratto_subappalto_id: "c1", imponibile_totale: 3100 });
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 3100, testo: "Acconto" }), { contratti: [conAcconto()], sal: [], altreFatture: [salNonVerificato] });
    expect(r.problemi.map((p) => p.codice)).not.toContain("acconto_oltre");
    expect(r.acconto).toBe(true);
  });

  it("l'acconto non ancora recuperato non fa scattare «oltre i SAL approvati»", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 3100, testo: "Anticipazione contrattuale" }), { contratti: [conAcconto()], sal: [], altreFatture: [] });
    expect(r.problemi.map((p) => p.codice)).not.toContain("oltre_approvato");
  });
});

describe("isolamento, ripetizione, nessuna AI", () => {
  it("contratti, SAL e fatture di un'altra azienda non entrano nel confronto", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 8000, testo: "SAL 2" }), {
      contratti: [contratto({ company_id: "az-2" })], sal: tre.map((s) => ({ ...s, company_id: "az-2" })), altreFatture: [],
    });
    expect(r.esito).toBe("da_gestire");
    const r2 = controllaFatturaSubappalto(fattura({ contratto_subappalto_id: "c1" }), { contratti: [contratto({ company_id: "az-2" })], sal: [], altreFatture: [] });
    expect(r2.esito).toBe("conflitto");
  });

  it("rilanciato sulla fattura già collegata dà lo stesso esito (nessun doppio conteggio di sé stessa)", () => {
    const giaCollegata = fattura({ id: "f3", imponibile_totale: 6000, contratto_subappalto_id: "c1", sal_subappaltatore_id: "s3", testo: "SAL 3" });
    const ctx = { contratti: [contratto()], sal: tre, altreFatture: [giaCollegata] };
    const a = controllaFatturaSubappalto(giaCollegata, ctx);
    const b = controllaFatturaSubappalto(giaCollegata, ctx);
    expect(a).toEqual(b);
    expect(a.esito).toBe("automatico");
  });

  it("il percorso completo non chiama nessun servizio esterno", () => {
    const fetchFinto = vi.fn();
    vi.stubGlobal("fetch", fetchFinto);
    controllaFatturaSubappalto(fattura({ imponibile_totale: 6000, testo: "3° SAL" }), { contratti: [contratto()], sal: tre, altreFatture: [] });
    expect(fetchFinto).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("letture dal testo", () => {
  it("P.IVA, SAL e periodo", () => {
    expect(chiavePiva("IT 012.345.678-90")).toBe(PIVA);
    expect(salDalTesto("Stato avanzamento lavori n° 4")).toBe(4);
    expect(salDalTesto("2^ SAL")).toBe(2);
    expect(salDalTesto("SAL 2 e SAL 3")).toBeNull();
    expect(salDalTesto("Salone 3")).toBeNull();
    expect(periodoDalTesto("periodo 1.9.2026 - 30.9.2026")).toEqual({ dal: "2026-09-01", al: "2026-09-30" });
  });
});

describe("interruttore del collegamento automatico e traccia", () => {
  const ctx = { contratti: [contratto()], sal: tre, altreFatture: [] as FatturaCtrl[] };
  it("spento: l'automatico diventa proposta; acceso: resta automatico; gli altri esiti non cambiano", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 6000, testo: "3° SAL" }), ctx);
    expect(r.esito).toBe("automatico");
    expect(conInterruttoreSubappalto(r, false)).toMatchObject({ esito: "proposta", contrattoId: "c1", salId: "s3" });
    expect(conInterruttoreSubappalto(r, false).regola).toMatch(/spento/);
    expect(conInterruttoreSubappalto(r, true)).toBe(r);
    const conflitto = controllaFatturaSubappalto(fattura({ imponibile_totale: 18000, testo: "SAL n. 2" }), ctx);
    expect(conInterruttoreSubappalto(conflitto, false)).toBe(conflitto);
  });
  it("le prove vanno nella traccia nel formato comune", () => {
    const r = controllaFatturaSubappalto(fattura({ imponibile_totale: 6000, testo: "3° SAL" }), ctx);
    const p = proveTraccia(r);
    expect(p.length).toBe(r.prove.length);
    expect(p[0]).toMatchObject({ ruolo: "conferma", esito: "uguale" });
    expect(p.every((x) => /^[a-z0-9_]+$/.test(x.campo))).toBe(true);
  });
});

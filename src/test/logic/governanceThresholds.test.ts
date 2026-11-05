import { describe, it, expect } from "vitest";
import {
  DEFAULT_GOVERNANCE_THRESHOLDS,
  normalizeGovernanceThresholds,
  governanceFromRow,
  governanceToRow,
  valutaApprovazionePreventivo,
  valutaScostamentoSal,
  scostamentoSalCommessa,
  valutaMarginalita,
  valutaRincaro,
  type GovernanceThresholds,
} from "@/lib/governance/thresholds";

const cfgWith = (over: Partial<GovernanceThresholds>): GovernanceThresholds =>
  normalizeGovernanceThresholds({ ...DEFAULT_GOVERNANCE_THRESHOLDS, ...over });

describe("normalizeGovernanceThresholds", () => {
  it("ritorna i default su input vuoto", () => {
    expect(normalizeGovernanceThresholds(undefined)).toEqual(DEFAULT_GOVERNANCE_THRESHOLDS);
    expect(normalizeGovernanceThresholds(null)).toEqual(DEFAULT_GOVERNANCE_THRESHOLDS);
  });

  it("clampa percentuali (0..100) e importo (>=0)", () => {
    const n = normalizeGovernanceThresholds({
      preventivoDoppiaApprovazione: { enabled: true, importoSoglia: -5 },
      salScostamento: { enabled: true, tolleranzaPerc: 250 },
      marginalita: { enabled: true, sogliaMinimaPerc: -10 },
    });
    expect(n.preventivoDoppiaApprovazione.importoSoglia).toBe(0);
    expect(n.salScostamento.tolleranzaPerc).toBe(100);
    expect(n.marginalita.sogliaMinimaPerc).toBe(0);
  });

  it("coerce stringhe numeriche e booleane", () => {
    const n = normalizeGovernanceThresholds({
      // @ts-expect-error test coercion
      preventivoDoppiaApprovazione: { enabled: "true", importoSoglia: "75000" },
    });
    expect(n.preventivoDoppiaApprovazione.enabled).toBe(true);
    expect(n.preventivoDoppiaApprovazione.importoSoglia).toBe(75000);
  });
});

describe("governanceFromRow / governanceToRow", () => {
  it("riga null → default", () => {
    expect(governanceFromRow(null)).toEqual(DEFAULT_GOVERNANCE_THRESHOLDS);
  });

  it("mappa riga DB → config", () => {
    const cfg = governanceFromRow({
      company_id: "c1",
      preventivo_doppia_firma_enabled: true,
      preventivo_soglia_importo: "50000",
      sal_scostamento_enabled: true,
      sal_tolleranza_perc: "5",
      marginalita_alert_enabled: false,
      marginalita_soglia_perc: "20",
    });
    expect(cfg.preventivoDoppiaApprovazione).toEqual({ enabled: true, importoSoglia: 50000 });
    expect(cfg.salScostamento).toEqual({ enabled: true, tolleranzaPerc: 5 });
    expect(cfg.marginalita).toEqual({ enabled: false, sogliaMinimaPerc: 20 });
  });

  it("round-trip config → row → config", () => {
    const cfg = cfgWith({
      preventivoDoppiaApprovazione: { enabled: true, importoSoglia: 30000 },
      salScostamento: { enabled: true, tolleranzaPerc: 8 },
      marginalita: { enabled: true, sogliaMinimaPerc: 18 },
    });
    const row = governanceToRow(cfg);
    expect(row).toEqual({
      preventivo_doppia_firma_enabled: true,
      preventivo_soglia_importo: 30000,
      sal_scostamento_enabled: true,
      sal_tolleranza_perc: 8,
      marginalita_alert_enabled: true,
      marginalita_soglia_perc: 18,
      rincaro_acquisti_enabled: true,
      rincaro_soglia_perc: 15,
      rincaro_minimo_euro: 50,
    });
    expect(governanceFromRow({ ...row, company_id: "c1" })).toEqual(cfg);
  });
});

describe("valutaApprovazionePreventivo", () => {
  it("feature off → mai richiesta", () => {
    const cfg = cfgWith({ preventivoDoppiaApprovazione: { enabled: false, importoSoglia: 50000 } });
    expect(valutaApprovazionePreventivo(cfg, 999999).richiedeApprovazione).toBe(false);
  });

  it("importo >= soglia → richiesta; sotto → no", () => {
    const cfg = cfgWith({ preventivoDoppiaApprovazione: { enabled: true, importoSoglia: 50000 } });
    expect(valutaApprovazionePreventivo(cfg, 50000).richiedeApprovazione).toBe(true);
    expect(valutaApprovazionePreventivo(cfg, 50001).richiedeApprovazione).toBe(true);
    expect(valutaApprovazionePreventivo(cfg, 49999).richiedeApprovazione).toBe(false);
  });

  it("soglia 0 → mai richiesta anche se enabled", () => {
    const cfg = cfgWith({ preventivoDoppiaApprovazione: { enabled: true, importoSoglia: 0 } });
    expect(valutaApprovazionePreventivo(cfg, 1000000).richiedeApprovazione).toBe(false);
  });

  it("motivo presente solo quando richiesta", () => {
    const cfg = cfgWith({ preventivoDoppiaApprovazione: { enabled: true, importoSoglia: 50000 } });
    expect(valutaApprovazionePreventivo(cfg, 60000).motivo).toMatch(/soglia/i);
    expect(valutaApprovazionePreventivo(cfg, 10000).motivo).toBeNull();
  });

  it("gestisce importo stringa/null", () => {
    const cfg = cfgWith({ preventivoDoppiaApprovazione: { enabled: true, importoSoglia: 50000 } });
    expect(valutaApprovazionePreventivo(cfg, "55000").richiedeApprovazione).toBe(true);
    expect(valutaApprovazionePreventivo(cfg, null).richiedeApprovazione).toBe(false);
  });
});

describe("valutaScostamentoSal", () => {
  const cfg = cfgWith({ salScostamento: { enabled: true, tolleranzaPerc: 5 } });

  it("entro tolleranza → ok, no alert", () => {
    const e = valutaScostamentoSal(cfg, { avanzamentoPerc: 50, costiPerc: 53 });
    expect(e.alert).toBe(false);
    expect(e.severita).toBe("ok");
    expect(e.scostamentoPerc).toBe(3);
  });

  it("oltre tolleranza → attenzione", () => {
    const e = valutaScostamentoSal(cfg, { avanzamentoPerc: 50, costiPerc: 58 });
    expect(e.alert).toBe(true);
    expect(e.severita).toBe("attenzione");
    expect(e.messaggio).toMatch(/Costi avanti/i);
  });

  it("oltre il doppio della tolleranza → critico", () => {
    const e = valutaScostamentoSal(cfg, { avanzamentoPerc: 40, costiPerc: 62 });
    expect(e.severita).toBe("critico");
    expect(e.scostamentoPerc).toBe(22);
  });

  it("scostamento negativo (avanzamento avanti) → messaggio direzione opposta", () => {
    const e = valutaScostamentoSal(cfg, { avanzamentoPerc: 70, costiPerc: 60 });
    expect(e.alert).toBe(true);
    expect(e.messaggio).toMatch(/Avanzamento dichiarato avanti/i);
  });

  it("feature off → mai alert", () => {
    const off = cfgWith({ salScostamento: { enabled: false, tolleranzaPerc: 5 } });
    expect(valutaScostamentoSal(off, { avanzamentoPerc: 10, costiPerc: 90 }).alert).toBe(false);
  });

  describe("scostamentoSalCommessa (gating per commessa)", () => {
    const cfg = cfgWith({ salScostamento: { enabled: true, tolleranzaPerc: 5 } });
    it("feature spenta → null", () => {
      const off = cfgWith({ salScostamento: { enabled: false, tolleranzaPerc: 5 } });
      expect(scostamentoSalCommessa(off, { avanzamentoPerc: 40, costoPrevisto: 100000, costoConsuntivo: 62000 })).toBeNull();
    });
    it("avanzamento sotto il 15% o mancante → null (rumore)", () => {
      expect(scostamentoSalCommessa(cfg, { avanzamentoPerc: 10, costoPrevisto: 100000, costoConsuntivo: 90000 })).toBeNull();
      expect(scostamentoSalCommessa(cfg, { avanzamentoPerc: null, costoPrevisto: 100000, costoConsuntivo: 90000 })).toBeNull();
    });
    it("senza costo previsto → null", () => {
      expect(scostamentoSalCommessa(cfg, { avanzamentoPerc: 40, costoPrevisto: 0, costoConsuntivo: 10000 })).toBeNull();
    });
    it("40% avanzamento, consumato 62% del budget → critico", () => {
      const e = scostamentoSalCommessa(cfg, { avanzamentoPerc: 40, costoPrevisto: 100000, costoConsuntivo: 62000 });
      expect(e?.alert).toBe(true);
      expect(e?.severita).toBe("critico");
      expect(e?.scostamentoPerc).toBe(22);
    });
    it("in linea (50% av, 53% costi) → esito senza alert", () => {
      const e = scostamentoSalCommessa(cfg, { avanzamentoPerc: 50, costoPrevisto: 100000, costoConsuntivo: 53000 });
      expect(e).not.toBeNull();
      expect(e?.alert).toBe(false);
    });
  });
});

describe("valutaMarginalita", () => {
  const cfg = cfgWith({ marginalita: { enabled: true, sogliaMinimaPerc: 15 } });

  it("margine >= soglia → verde", () => {
    expect(valutaMarginalita(cfg, 25).semaforo).toBe("verde");
    expect(valutaMarginalita(cfg, 15).semaforo).toBe("verde");
  });

  it("0..soglia → giallo (sotto soglia)", () => {
    const e = valutaMarginalita(cfg, 8);
    expect(e.semaforo).toBe("giallo");
    expect(e.sottoSoglia).toBe(true);
    expect(e.inPerdita).toBe(false);
  });

  it("margine < 0 → rosso (in perdita)", () => {
    const e = valutaMarginalita(cfg, -3);
    expect(e.semaforo).toBe("rosso");
    expect(e.inPerdita).toBe(true);
  });

  it("alert off → niente giallo, solo perdita = rosso", () => {
    const off = cfgWith({ marginalita: { enabled: false, sogliaMinimaPerc: 15 } });
    expect(valutaMarginalita(off, 8).semaforo).toBe("verde");
    expect(valutaMarginalita(off, -1).semaforo).toBe("rosso");
  });
});

describe("rincari d'acquisto", () => {
  // I valori di partenza: 15% sopra il medio e almeno 50 € di spesa in più.
  const cfg = DEFAULT_GOVERNANCE_THRESHOLDS;

  it("sopra entrambe le soglie è un rincaro, e dice di quanto", () => {
    // 100 pezzi a 16 € con un medio di 10 €: +60%, 600 € di spesa in più.
    const e = valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 16, quantita: 100 });
    expect(e.rincaro).toBe(true);
    expect(e.scostamentoPerc).toBe(60);
    expect(e.spesaInPiu).toBe(600);
    expect(e.messaggio).toContain("60.0%");
  });

  it("sotto la soglia percentuale non è un rincaro, anche se la spesa in più è grossa", () => {
    // +10% su 1.000 pezzi: 1.000 € in più, ma il 10% è sotto il 15%.
    const e = valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 11, quantita: 1000 });
    expect(e.rincaro).toBe(false);
    expect(e.spesaInPiu).toBe(1000);
    expect(e.messaggio).toBeNull();
  });

  it("sopra la soglia percentuale ma per pochi euro non è un rincaro", () => {
    // L'esempio del titolare: 2 € che diventano 2,40 € su dieci pezzi = 4 € in più.
    const e = valutaRincaro(cfg, { medioPrima: 2, prezzoPagato: 2.4, quantita: 10 });
    expect(e.scostamentoPerc).toBe(20);
    expect(e.spesaInPiu).toBe(4);
    expect(e.rincaro).toBe(false);
  });

  it("lo stesso rincaro su molti pezzi invece conta", () => {
    const e = valutaRincaro(cfg, { medioPrima: 2, prezzoPagato: 2.4, quantita: 5000 });
    expect(e.spesaInPiu).toBe(2000);
    expect(e.rincaro).toBe(true);
  });

  it("senza un medio di partenza non c'è un «solito» da confrontare", () => {
    expect(valutaRincaro(cfg, { medioPrima: 0, prezzoPagato: 99, quantita: 100 }).rincaro).toBe(false);
    expect(valutaRincaro(cfg, { medioPrima: null, prezzoPagato: 99, quantita: 100 }).rincaro).toBe(false);
    expect(valutaRincaro(cfg, { medioPrima: undefined, prezzoPagato: 99, quantita: 100 }).rincaro).toBe(false);
  });

  it("prezzo o quantità mancanti o a zero: niente rincaro e niente numeri inventati", () => {
    const senzaPrezzo = valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 0, quantita: 100 });
    expect(senzaPrezzo.rincaro).toBe(false);
    const senzaQta = valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 16, quantita: 0 });
    expect(senzaQta.rincaro).toBe(false);
    expect(senzaQta.spesaInPiu).toBe(0);
  });

  it("un prezzo in CALO non è un rincaro, e lo scostamento è negativo", () => {
    const e = valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 7, quantita: 100 });
    expect(e.rincaro).toBe(false);
    expect(e.scostamentoPerc).toBe(-30);
    expect(e.spesaInPiu).toBe(-300);
  });

  it("esattamente sulla soglia non scatta: serve superarla", () => {
    // 11,50 € è esattamente +15% su 10 €.
    expect(valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 11.5, quantita: 100 }).rincaro).toBe(false);
    expect(valutaRincaro(cfg, { medioPrima: 10, prezzoPagato: 11.51, quantita: 100 }).rincaro).toBe(true);
  });

  it("con l'interruttore spento non segnala nulla, ma i numeri restano leggibili", () => {
    const off = cfgWith({ rincaroAcquisti: { enabled: false, sogliaPerc: 15, minimoEuro: 50 } });
    const e = valutaRincaro(off, { medioPrima: 10, prezzoPagato: 99, quantita: 100 });
    expect(e.rincaro).toBe(false);
    expect(e.scostamentoPerc).toBe(890);
    expect(e.spesaInPiu).toBe(8900);
  });

  it("le soglie si possono allargare: il raddoppio di prezzo è +100%", () => {
    const severo = cfgWith({ rincaroAcquisti: { enabled: true, sogliaPerc: 200, minimoEuro: 0 } });
    expect(valutaRincaro(severo, { medioPrima: 10, prezzoPagato: 25, quantita: 10 }).rincaro).toBe(false);
    expect(valutaRincaro(severo, { medioPrima: 10, prezzoPagato: 31, quantita: 10 }).rincaro).toBe(true);
  });

  it("i default e la normalizzazione tengono i valori nei limiti", () => {
    expect(DEFAULT_GOVERNANCE_THRESHOLDS.rincaroAcquisti).toEqual({
      enabled: true, sogliaPerc: 15, minimoEuro: 50,
    });
    const n = normalizeGovernanceThresholds({
      rincaroAcquisti: { enabled: true, sogliaPerc: -5, minimoEuro: -100 },
    });
    expect(n.rincaroAcquisti.sogliaPerc).toBe(0);
    expect(n.rincaroAcquisti.minimoEuro).toBe(0);
  });

  it("riga DB ⇄ config: le tre colonne nuove vanno e tornano", () => {
    const cfgDaRiga = governanceFromRow({
      rincaro_acquisti_enabled: false,
      rincaro_soglia_perc: "25",
      rincaro_minimo_euro: "300",
    });
    expect(cfgDaRiga.rincaroAcquisti).toEqual({ enabled: false, sogliaPerc: 25, minimoEuro: 300 });
    const riga = governanceToRow(cfgDaRiga);
    expect(riga.rincaro_acquisti_enabled).toBe(false);
    expect(riga.rincaro_soglia_perc).toBe(25);
    expect(riga.rincaro_minimo_euro).toBe(300);
  });

  it("una riga vecchia, senza le colonne nuove, prende i valori di partenza", () => {
    const cfgVecchia = governanceFromRow({ marginalita_alert_enabled: true, marginalita_soglia_perc: 20 });
    expect(cfgVecchia.rincaroAcquisti).toEqual({ enabled: true, sogliaPerc: 15, minimoEuro: 50 });
  });
});

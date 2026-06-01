import { describe, it, expect } from "vitest";
import {
  DEFAULT_GOVERNANCE_THRESHOLDS,
  normalizeGovernanceThresholds,
  governanceFromRow,
  governanceToRow,
  valutaApprovazionePreventivo,
  valutaScostamentoSal,
  valutaMarginalita,
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

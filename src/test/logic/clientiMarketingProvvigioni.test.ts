import { describe, it, expect } from "vitest";
import {
  SCAGLIONI_STANDARD, provvigioneAScaglioni, aliquotaEffettiva, scaglioneCorrente, alProssimoScaglione,
  normalizzaScaglioni, costoPer, variazione, meseChiave, meseLeggibile, fineMeseOOggi, leggiMese, totaliMese,
  type ClienteMarketing,
} from "@/components/admin/clienti-marketing/provvigioni";

describe("provvigioneAScaglioni", () => {
  it("la tabella del titolare: 75.000 → 2.125 (3% di 50.000 + 2,5% di 25.000)", () => {
    expect(provvigioneAScaglioni(75_000, SCAGLIONI_STANDARD)).toBe(2125);
  });
  it("70.000 → 2.000: ogni scaglione vale solo sulla sua fetta", () => {
    expect(provvigioneAScaglioni(70_000, SCAGLIONI_STANDARD)).toBe(2000);
  });
  it("esattamente sul confine si resta nello scaglione", () => {
    expect(provvigioneAScaglioni(50_000, SCAGLIONI_STANDARD)).toBe(1500);
    expect(provvigioneAScaglioni(50_001, SCAGLIONI_STANDARD)).toBe(1500.03);
  });
  it("oltre il milione, l'ultimo scaglione non ha tetto", () => {
    // 1.500 + 2.500 + 2.000 + 3.750 + 5.000 + 0,75% di 200.000
    expect(provvigioneAScaglioni(1_200_000, SCAGLIONI_STANDARD)).toBe(16_250);
  });
  it("zero, negativo o senza scaglioni: zero", () => {
    expect(provvigioneAScaglioni(0, SCAGLIONI_STANDARD)).toBe(0);
    expect(provvigioneAScaglioni(-500, SCAGLIONI_STANDARD)).toBe(0);
    expect(provvigioneAScaglioni(80_000, [])).toBe(0);
  });
  it("aliquota effettiva e scaglione corrente", () => {
    expect(aliquotaEffettiva(75_000, SCAGLIONI_STANDARD)).toBe(2.83);
    expect(scaglioneCorrente(75_000, SCAGLIONI_STANDARD)?.pct).toBe(2.5);
    expect(scaglioneCorrente(0, SCAGLIONI_STANDARD)?.pct).toBe(3);
    expect(alProssimoScaglione(75_000, SCAGLIONI_STANDARD)).toBe(75_000);
    expect(alProssimoScaglione(2_000_000, SCAGLIONI_STANDARD)).toBeNull();
  });
});

describe("normalizzaScaglioni", () => {
  it("accetta il JSON del database e lo rimette in ordine", () => {
    const s = normalizzaScaglioni([{ da: "50000", a: "150000", pct: "2.5" }, { da: 0, a: 50000, pct: 3 }, { da: 150000, a: null, pct: 2 }]);
    expect(s.map((x) => x.pct)).toEqual([3, 2.5, 2]);
    expect(s[2].a).toBeNull();
  });
  it("scarta righe rotte e tutto ciò che non è una lista", () => {
    expect(normalizzaScaglioni([{ da: 10, a: 5, pct: 3 }, { da: "x", a: 1, pct: 1 }, { da: 0, a: 100, pct: -1 }])).toEqual([]);
    expect(normalizzaScaglioni(null)).toEqual([]);
    expect(normalizzaScaglioni("boh")).toEqual([]);
  });
});

describe("numeri del mese", () => {
  it("costo per unità: senza unità non è zero, è niente", () => {
    expect(costoPer(300, 12)).toBe(25);
    expect(costoPer(300, 0)).toBeNull();
  });
  it("variazione sul mese prima", () => {
    expect(variazione(120, 100)).toBe(20);
    expect(variazione(50, 100)).toBe(-50);
    expect(variazione(10, 0)).toBeNull();
  });
  it("mesi", () => {
    const d = new Date(2026, 8, 11);
    expect(meseChiave(d)).toBe("2026-09-01");
    expect(meseChiave(d, -1)).toBe("2026-08-01");
    expect(meseChiave(new Date(2026, 0, 15), -1)).toBe("2025-12-01");
    expect(meseLeggibile("2026-09-01")).toBe("settembre 2026");
    expect(fineMeseOOggi("2026-09-01", d)).toBe("2026-09-11");
    expect(fineMeseOOggi("2026-08-01", d)).toBe("2026-08-31");
  });
});

const riga = (p: Partial<ClienteMarketing> = {}): ClienteMarketing => ({
  service_client_id: "s", company_id: "c", cliente_nome: "Best Infissi", logo_url: null, stato: "attivo", data_inizio: "2026-07-21",
  billing_model: "provvigione", provvigione_scaglioni: SCAGLIONI_STANDARD, commerciale: null, servizio: "Marketing Edile",
  lead_mese: 20, lead_prec: 55, lead_meta: 20, lead_google: 0, lead_form: 0, lead_altri: 0,
  lead_lavorati: 7, lead_non_gestiti: 4, ore_mediane_primo_contatto: 27.7,
  appuntamenti_mese: 2, appuntamenti_prec: 1, vinte_mese: 12, vinte_prec: 2, valore_vinto_mese: 122_981, valore_vinto_prec: 18_436,
  pipeline_aperta: 2660, valore_pipeline_aperta: 862_310,
  fatturato_mese: 77_855, fatturato_prec: 175_047, fatture_collegate: true,
  spesa_meta: 1200, lead_meta_dichiarati: 22, spesa_meta_al: "2026-09-11T10:00:00Z", spesa_google: 0, spesa_manuale: 300,
  meta_stato: "connected", meta_integration_id: "i", meta_account_id: "act_1", meta_account_nome: "Best Infissi", meta_pagine: "Best Infissi Srl",
  google_account: null, form_attivi: 0, utenti: 7, ultimo_accesso: "2026-09-10T08:00:00Z",
  mese_dovuto: null, mese_incassato: null, mese_chiuso: false,
  ...p,
});

describe("leggiMese", () => {
  it("con le fatture collegate il venduto è il fatturato, e la provvigione segue gli scaglioni", () => {
    const l = leggiMese(riga(), true);
    expect(l.fonteVenduto).toBe("fatture");
    expect(l.venduto).toBe(77_855);
    expect(l.provvigione).toBe(provvigioneAScaglioni(77_855, SCAGLIONI_STANDARD));
    expect(l.spesa).toBe(1500);
    expect(l.cpl).toBe(75);
    expect(l.costoAppuntamento).toBe(750);
    expect(l.cpa).toBe(125);
    expect(l.roas).toBe(51.9);
  });
  it("senza fatture si usano le vendite chiuse nel CRM", () => {
    const l = leggiMese(riga({ fatture_collegate: false, fatturato_mese: null }), true);
    expect(l.fonteVenduto).toBe("vendite");
    expect(l.venduto).toBe(122_981);
  });
  it("gli avvisi dicono cosa non va", () => {
    const l = leggiMese(riga({ lead_non_gestiti: 6, meta_stato: "token_expired", spesa_meta: 0, spesa_manuale: 0, lead_meta_dichiarati: 40 }), true);
    const tipi = l.avvisi.map((a) => a.tipo);
    expect(tipi).toContain("lead_fermi");
    expect(tipi).toContain("meta_scaduto");
    expect(tipi).toContain("senza_costi");
    expect(tipi).toContain("lead_meta_mancanti");
    expect(l.avvisi.find((a) => a.tipo === "lead_fermi")?.grave).toBe(true);
  });
  it("un cliente in pausa non fa rumore", () => {
    expect(leggiMese(riga({ stato: "pausa", lead_mese: 0, meta_stato: null }), true).avvisi).toEqual([]);
  });
  it("«nessun lead» vale solo per il mese in corso", () => {
    expect(leggiMese(riga({ lead_mese: 0 }), false).avvisi.map((a) => a.tipo)).not.toContain("senza_lead");
    expect(leggiMese(riga({ lead_mese: 0 }), true).avvisi.map((a) => a.tipo)).toContain("senza_lead");
  });
});

describe("totaliMese", () => {
  it("somma solo i clienti attivi", () => {
    const t = totaliMese([riga(), riga({ stato: "pausa", lead_mese: 99 }), riga({ cliente_nome: "Renova", fatture_collegate: false, fatturato_mese: null, valore_vinto_mese: 19_000, spesa_meta: 0, spesa_manuale: 0 })], true);
    expect(t.clienti).toBe(2);
    expect(t.lead).toBe(40);
    expect(t.spesa).toBe(1500);
    expect(t.venduto).toBe(77_855 + 19_000);
    expect(t.provvigioni).toBe(provvigioneAScaglioni(77_855, SCAGLIONI_STANDARD) + provvigioneAScaglioni(19_000, SCAGLIONI_STANDARD));
  });
});

import { describe, it, expect } from "vitest";
import { calcolaSimulazione } from "./calcolaSimulazione";
import { DEFAULT_SCENARI } from "./tipi";
import type { VoceSim, ScenariConfig, SimulazioneDoc } from "./tipi";

const voce = (p: Partial<VoceSim>): VoceSim => ({
  id: "1",
  fase_id: null,
  descrizione: "x",
  fonte: "libera",
  riferimento_id: null,
  codice: null,
  quantita: 1,
  unita: "pz",
  costo_unitario: 0,
  ricarico_pct: 0,
  prezzo_unitario: 0,
  vat_rate: 10,
  bene_significativo: false,
  valore_posa_associata: null,
  is_manodopera: false,
  ordine: 0,
  ...p,
});

const doc = (voci: VoceSim[], scenari: Partial<ScenariConfig> = {}): SimulazioneDoc => ({
  voci,
  fasi: [],
  scenari: { ...DEFAULT_SCENARI, ...scenari },
});

describe("calcolaSimulazione", () => {
  it("IVA singola 10% su ricavo noto", () => {
    // 1 voce: ricavo 1000, costo 600 → margine 400 (40%); IVA 10% = 100; prezzo 1100
    const r = calcolaSimulazione(
      doc([voce({ quantita: 1, costo_unitario: 600, prezzo_unitario: 1000 })], {
        iva_mode: "singola",
        iva_rate_singola: 10,
      }),
    );
    expect(r.costo_totale).toBe(600);
    expect(r.ricavo_imponibile).toBe(1000);
    expect(r.margine_valore).toBe(400);
    expect(r.margine_pct).toBe(40);
    expect(r.iva_totale).toBe(100);
    expect(r.prezzo_cliente).toBe(1100);
    expect(r.riepilogo_iva).toEqual([{ aliquota: 10, imponibile: 1000, imposta: 100 }]);
    expect(r.durata_settimane).toBe(0);
    expect(r.rata_mensile).toBeNull();
  });

  it("confronto a 3 aliquote (4/10/22) su ricavo noto", () => {
    const r = calcolaSimulazione(
      doc([voce({ quantita: 1, costo_unitario: 0, prezzo_unitario: 1000 })], {
        iva_rate_singola: 10,
        iva_confronto: [4, 10, 22],
      }),
    );
    expect(r.confronto_iva).toEqual([
      { aliquota: 4, prezzo_cliente: 1040 },
      { aliquota: 10, prezzo_cliente: 1100 },
      { aliquota: 22, prezzo_cliente: 1220 },
    ]);
  });

  it("spese generali 15% + sconto 10%: economia, IVA su netto, margine legacy = netto", () => {
    // costo 1000, ricavo 1500; spese 15% → pieno 1150; sconto 10% → netto 1350
    const r = calcolaSimulazione(
      doc([voce({ quantita: 1, costo_unitario: 1000, prezzo_unitario: 1500 })], {
        iva_mode: "singola",
        iva_rate_singola: 10,
        iva_confronto: [],
        spese_generali_pct: 15,
        utile_pct: 20,
        sconto_pct: 10,
      }),
    );
    expect(r.costo_diretto).toBe(1000);
    expect(r.spese_generali).toBe(150);
    expect(r.costo_pieno).toBe(1150);
    expect(r.ricavo_lordo).toBe(1500);
    expect(r.sconto_valore).toBe(150);
    expect(r.ricavo_netto).toBe(1350);
    expect(r.margine_netto_valore).toBe(200);
    expect(r.margine_netto_pct).toBe(14.81);
    expect(r.utile_target).toBe(230); // 1150 × 20%
    // legacy = netto
    expect(r.margine_valore).toBe(200);
    expect(r.margine_pct).toBe(14.81);
    // IVA 10% sul netto scontato (1350), non sul lordo
    expect(r.iva_totale).toBe(135);
    expect(r.prezzo_cliente).toBe(1485);
    expect(r.riepilogo_iva).toEqual([{ aliquota: 10, imponibile: 1350, imposta: 135 }]);
    // confronto IVA sul netto
    expect(r.confronto_iva).toEqual([]);
  });

  it("sconto 10% in IVA mista: imponibili scalati dal fattore netto/lordo", () => {
    // due voci: 1000@10 + 500@22 (lordo 1500); sconto 10% → fattore 0.9
    // imponibili: 900@10 (IVA 90) + 450@22 (IVA 99) → totale IVA 189
    const r = calcolaSimulazione(
      doc(
        [
          voce({ quantita: 1, costo_unitario: 0, prezzo_unitario: 1000, vat_rate: 10 }),
          voce({ quantita: 1, costo_unitario: 0, prezzo_unitario: 500, vat_rate: 22 }),
        ],
        {
          iva_mode: "mista",
          iva_confronto: [],
          sconto_pct: 10,
        },
      ),
    );
    expect(r.ricavo_netto).toBe(1350);
    const r10 = r.riepilogo_iva.find((x) => x.aliquota === 10)!;
    const r22 = r.riepilogo_iva.find((x) => x.aliquota === 22)!;
    expect(r10.imponibile).toBe(900);
    expect(r10.imposta).toBe(90);
    expect(r22.imponibile).toBe(450);
    expect(r22.imposta).toBe(99);
    expect(r.iva_totale).toBe(189);
    expect(r.prezzo_cliente).toBe(1539); // 1350 + 189
  });

  it("provvigioni: ricavo 5% + margine 10% + fisso 20 → totale 100, margine finale 200 (20%), operativo 300", () => {
    // 1 voce: ricavo netto 1000, costo pieno 700 → margine_pre 300.
    // provvigioni: ricavo 5% = 50; margine 10% = 30; fisso 20 = 20; totale 100.
    // margine finale (legacy) = 300 − 100 = 200; pct = 200/1000 = 20.
    const r = calcolaSimulazione(
      doc([voce({ quantita: 1, costo_unitario: 700, prezzo_unitario: 1000 })], {
        iva_mode: "singola",
        iva_rate_singola: 10,
        provvigioni: [
          { id: "a", nome: "Commerciale", base: "ricavo", valore: 5 },
          { id: "b", nome: "Capo cantiere", base: "margine", valore: 10 },
          { id: "c", nome: "Segnalatore", base: "fisso", valore: 20 },
        ],
      }),
    );
    // Margine operativo (PRE-provvigioni) invariato.
    expect(r.margine_netto_valore).toBe(300);
    expect(r.margine_netto_pct).toBe(30);
    // Provvigioni.
    expect(r.provvigioni_totale).toBe(100);
    // Margine finale (legacy) = operativo − provvigioni.
    expect(r.margine_valore).toBe(200);
    expect(r.margine_pct).toBe(20);
    // Le provvigioni NON toccano IVA / prezzo cliente / ricavo netto.
    expect(r.ricavo_netto).toBe(1000);
    expect(r.iva_totale).toBe(100);
    expect(r.prezzo_cliente).toBe(1100);
  });

  it("senza provvigioni: margine finale = margine operativo (retro-compatibile)", () => {
    const r = calcolaSimulazione(
      doc([voce({ quantita: 1, costo_unitario: 700, prezzo_unitario: 1000 })], {
        iva_mode: "singola",
        iva_rate_singola: 10,
      }),
    );
    expect(r.provvigioni_totale).toBe(0);
    expect(r.margine_valore).toBe(r.margine_netto_valore);
    expect(r.margine_pct).toBe(r.margine_netto_pct);
    expect(r.margine_valore).toBe(300);
  });

  it("senza sconto/spese: economia coerente coi legacy (retro-compatibile)", () => {
    const r = calcolaSimulazione(
      doc([voce({ quantita: 1, costo_unitario: 600, prezzo_unitario: 1000 })], {
        iva_mode: "singola",
        iva_rate_singola: 10,
      }),
    );
    expect(r.costo_pieno).toBe(600);
    expect(r.ricavo_netto).toBe(1000);
    expect(r.margine_valore).toBe(400);
    expect(r.margine_pct).toBe(40);
    expect(r.iva_totale).toBe(100);
    expect(r.prezzo_cliente).toBe(1100);
  });
});

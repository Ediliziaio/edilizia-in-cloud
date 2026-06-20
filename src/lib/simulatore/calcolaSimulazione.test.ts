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
});

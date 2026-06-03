import { describe, it, expect } from "vitest";
import {
  parseEstrazioneBolletta,
  buildPromptBolletta,
} from "@/lib/fotovoltaico/estrazioneBolletta";

/**
 * Test del parser estrazione bolletta AI (src/lib/fotovoltaico/estrazioneBolletta.ts).
 * Esercita il CODICE DI PRODUZIONE (mirror lato edge fv-estrai-bolletta).
 */

describe("buildPromptBolletta", () => {
  it("chiede JSON puro con i campi attesi e l'annualizzazione", () => {
    const p = buildPromptBolletta();
    expect(p).toContain("consumo_annuo_kwh");
    expect(p).toContain("ANNUALIZZA");
    expect(p).toContain("costo_kwh_medio");
  });
});

describe("parseEstrazioneBolletta", () => {
  it("estrae da oggetto JSON valido", () => {
    const r = parseEstrazioneBolletta({
      consumo_annuo_kwh: 3500,
      costo_kwh_medio: 0.31,
      potenza_impegnata_kw: 3,
      tipo_tariffa: "bioraria",
      fornitore: "Enel Energia",
      confidence: 0.9,
    });
    expect(r.consumo_annuo_kwh).toBe(3500);
    expect(r.costo_kwh_medio).toBe(0.31);
    expect(r.potenza_impegnata_kw).toBe(3);
    expect(r.tipo_tariffa).toBe("bioraria");
    expect(r.fornitore).toBe("Enel Energia");
    expect(r.confidence).toBe(0.9);
  });

  it("estrae da stringa JSON con fence ```json", () => {
    const r = parseEstrazioneBolletta('```json\n{"consumo_annuo_kwh": 4200, "tipo_tariffa": "F1/F2/F3"}\n```');
    expect(r.consumo_annuo_kwh).toBe(4200);
    expect(r.tipo_tariffa).toBe("trioraria"); // F1/F2/F3 ⇒ trioraria
  });

  it("clampa valori fuori range a null (no dati inventati)", () => {
    const r = parseEstrazioneBolletta({
      consumo_annuo_kwh: 9999999, // troppo alto
      costo_kwh_medio: 5, // troppo alto
      potenza_impegnata_kw: 0.1, // troppo basso
    });
    expect(r.consumo_annuo_kwh).toBeNull();
    expect(r.costo_kwh_medio).toBeNull();
    expect(r.potenza_impegnata_kw).toBeNull();
  });

  it("gestisce numeri in formato italiano (virgola) nelle stringhe", () => {
    const r = parseEstrazioneBolletta({ costo_kwh_medio: "0,28", consumo_annuo_kwh: "3.200" });
    expect(r.costo_kwh_medio).toBe(0.28);
    expect(r.consumo_annuo_kwh).toBe(3200);
  });

  it("normalizza i tipi tariffa", () => {
    expect(parseEstrazioneBolletta({ tipo_tariffa: "monoraria" }).tipo_tariffa).toBe("monoraria");
    expect(parseEstrazioneBolletta({ tipo_tariffa: "F23" }).tipo_tariffa).toBe("bioraria");
    expect(parseEstrazioneBolletta({ tipo_tariffa: "multioraria" }).tipo_tariffa).toBe("trioraria");
    expect(parseEstrazioneBolletta({ tipo_tariffa: "xyz" }).tipo_tariffa).toBeNull();
  });

  it("input non-JSON o vuoto → tutto null, confidence 0", () => {
    const r = parseEstrazioneBolletta("non è json");
    expect(r.consumo_annuo_kwh).toBeNull();
    expect(r.confidence).toBe(0);
    const r2 = parseEstrazioneBolletta(null);
    expect(r2.consumo_annuo_kwh).toBeNull();
  });

  it("clampa la confidence in [0,1]", () => {
    expect(parseEstrazioneBolletta({ confidence: 5 }).confidence).toBe(1);
    expect(parseEstrazioneBolletta({ confidence: -2 }).confidence).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import {
  dimensionaStringhe,
  MODULO_DEFAULT_540,
  INVERTER_DEFAULT,
  type SpecInverter,
} from "@/lib/fotovoltaico/stringhe";

/**
 * Test del dimensionamento stringhe/MPPT (src/lib/fotovoltaico/stringhe.ts).
 * Esercita il CODICE DI PRODUZIONE della progettazione elettrica base.
 */

describe("dimensionaStringhe — limiti di tensione e temperatura", () => {
  it("con le specifiche di default calcola la finestra [min,max] corretta", () => {
    const r = dimensionaStringhe(16);
    // Voc a -10°C sale (~53.8V) ⇒ max 18; Vmp a 70°C scende (~36.3V) ⇒ min 5
    expect(r.moduli_max_stringa).toBe(18);
    expect(r.moduli_min_stringa).toBe(5);
  });

  it("la Voc a freddo supera la Voc STC e la Vmp a caldo è inferiore alla Vmp STC", () => {
    const r = dimensionaStringhe(10);
    const vocStcStringa = MODULO_DEFAULT_540.voc * r.moduli_per_stringa;
    const vmpStcStringa = MODULO_DEFAULT_540.vmp * r.moduli_per_stringa;
    expect(r.voc_stringa_freddo_v).toBeGreaterThan(vocStcStringa);
    expect(r.vmp_stringa_caldo_v).toBeLessThan(vmpStcStringa);
  });

  it("16 moduli → 1 stringa da 16, valida, tensione a freddo entro il limite inverter", () => {
    const r = dimensionaStringhe(16);
    expect(r.moduli_per_stringa).toBe(16);
    expect(r.numero_stringhe).toBe(1);
    expect(r.moduli_non_assegnati).toBe(0);
    expect(r.valido).toBe(true);
    expect(r.voc_stringa_freddo_v).toBeLessThanOrEqual(INVERTER_DEFAULT.vMaxDc);
    expect(r.vmp_stringa_caldo_v).toBeGreaterThanOrEqual(INVERTER_DEFAULT.vMpptMin);
  });

  it("20 moduli → sceglie la stringa più lunga che divide (10×2)", () => {
    const r = dimensionaStringhe(20);
    expect(r.moduli_per_stringa).toBe(10);
    expect(r.numero_stringhe).toBe(2);
    expect(r.moduli_collegati).toBe(20);
    expect(r.valido).toBe(true);
  });

  it("troppo pochi moduli (3) → non valido con warning", () => {
    const r = dimensionaStringhe(3);
    expect(r.valido).toBe(false);
    expect(r.moduli_per_stringa).toBe(0);
    expect(r.warnings.some((w) => w.toLowerCase().includes("troppo pochi"))).toBe(true);
  });

  it("inverter troppo piccolo → warning sulla capacità stringhe e non valido", () => {
    const piccolo: SpecInverter = {
      vMaxDc: 1000,
      vMpptMin: 160,
      vMpptMax: 850,
      nMppt: 1,
      maxStringhePerMppt: 1,
    };
    const r = dimensionaStringhe(40, MODULO_DEFAULT_540, piccolo);
    // 40 → 10×4 stringhe, ma l'inverter ne regge 1
    expect(r.numero_stringhe).toBeGreaterThan(1);
    expect(r.valido).toBe(false);
    expect(r.warnings.some((w) => w.toLowerCase().includes("stringhe"))).toBe(true);
  });

  it("resto non assegnato segnalato quando la lunghezza non divide il totale", () => {
    // 17 moduli (primo): nessun divisore in [5,18] tranne 17 stesso → 17×1, resto 0.
    // Uso 19 (primo) con max 18 ⇒ nessun divisore ≤18 ⇒ usa 18, resto 1.
    const r = dimensionaStringhe(19);
    expect(r.moduli_per_stringa).toBe(18);
    expect(r.moduli_non_assegnati).toBe(1);
    expect(r.warnings.some((w) => w.toLowerCase().includes("non assegnati"))).toBe(true);
  });
});

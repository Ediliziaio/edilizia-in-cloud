/**
 * catalogoProdotti — adapter dal "listino prodotti" (articoli) alle specifiche
 * elettriche usate dal dimensionamento stringhe. Gap vs Reonic/Autarc: loro
 * hanno cataloghi con datasheet reali; noi partiamo derivando i parametri dalla
 * POTENZA del modulo scelto (fallback sensati), e usiamo i campi elettrici reali
 * se presenti sull'articolo (quando il catalogo verrà arricchito via migration).
 *
 * Puro e testabile.
 */

import {
  MODULO_DEFAULT_540,
  INVERTER_DEFAULT,
  type SpecModulo,
  type SpecInverter,
} from "./stringhe";

/** Articolo del listino con campi elettrici opzionali (presenti col catalogo reale). */
export interface ArticoloElettrico {
  potenza_unitaria_w?: number | null;
  potenza_w?: number | null;
  // Campi datasheet opzionali (modulo)
  voc?: number | null;
  vmp?: number | null;
  temp_coeff_voc?: number | null; // %/°C
  temp_coeff_vmp?: number | null; // %/°C
  // Campi datasheet opzionali (inverter)
  inverter_vmax_dc?: number | null;
  inverter_vmppt_min?: number | null;
  inverter_vmppt_max?: number | null;
  inverter_n_mppt?: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deriva una SpecModulo plausibile dalla sola potenza (Wp), calibrata sui moduli
 * moderni (~540 Wp → Voc≈49.5, Vmp≈41.7). Usata quando mancano i datasheet.
 */
export function derivaSpecModuloDaPotenza(potenzaW: number): SpecModulo {
  const w = potenzaW > 0 ? potenzaW : 540;
  return {
    voc: r2(w * 0.092),
    vmp: r2(w * 0.077),
    tempCoeffVocPctC: MODULO_DEFAULT_540.tempCoeffVocPctC,
    tempCoeffVmpPctC: MODULO_DEFAULT_540.tempCoeffVmpPctC,
  };
}

/** SpecModulo da un articolo: usa i datasheet se presenti, altrimenti deriva dalla potenza. */
export function specModuloDaArticolo(art: ArticoloElettrico | null | undefined): SpecModulo {
  const potenza = art?.potenza_unitaria_w ?? art?.potenza_w ?? 540;
  const base = derivaSpecModuloDaPotenza(potenza);
  return {
    voc: art?.voc != null && art.voc > 0 ? art.voc : base.voc,
    vmp: art?.vmp != null && art.vmp > 0 ? art.vmp : base.vmp,
    tempCoeffVocPctC: art?.temp_coeff_voc != null ? art.temp_coeff_voc : base.tempCoeffVocPctC,
    tempCoeffVmpPctC:
      art?.temp_coeff_vmp != null ? art.temp_coeff_vmp : base.tempCoeffVmpPctC,
  };
}

/** SpecInverter da un articolo: usa i datasheet se presenti, altrimenti i default. */
export function specInverterDaArticolo(art: ArticoloElettrico | null | undefined): SpecInverter {
  return {
    vMaxDc:
      art?.inverter_vmax_dc != null && art.inverter_vmax_dc > 0
        ? art.inverter_vmax_dc
        : INVERTER_DEFAULT.vMaxDc,
    vMpptMin:
      art?.inverter_vmppt_min != null && art.inverter_vmppt_min > 0
        ? art.inverter_vmppt_min
        : INVERTER_DEFAULT.vMpptMin,
    vMpptMax:
      art?.inverter_vmppt_max != null && art.inverter_vmppt_max > 0
        ? art.inverter_vmppt_max
        : INVERTER_DEFAULT.vMpptMax,
    nMppt:
      art?.inverter_n_mppt != null && art.inverter_n_mppt > 0
        ? art.inverter_n_mppt
        : INVERTER_DEFAULT.nMppt,
    maxStringhePerMppt: INVERTER_DEFAULT.maxStringhePerMppt,
  };
}

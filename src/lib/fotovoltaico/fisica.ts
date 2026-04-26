/**
 * Modello fisico produzione FV — Wave 1 (semplificato ma robusto).
 * Riferimento: §14 del masterprompt.
 *
 * Formula base annua:
 *   E_anno = P_kwp × H_sole × PR × (1 - perdite_totali)
 *
 *   P_kwp     = potenza nominale impianto (kWp)
 *   H_sole    = ore di sole equivalenti annue (Solar API o PVGIS)
 *   PR        = Performance Ratio (0.85 standard, 0.88 premium con ottimizzatori)
 *   perdite   = somma componenti (temperatura, mismatch, sporcamento, cavi, inverter)
 *
 * Perdite totali tipiche residenziale Italia: 12-18% (PR netto 0.82-0.88).
 */

import {
  FV_DISTRIBUZIONE_MENSILE,
  macroregionePerProvincia,
} from "./tipi";

// ─── Costanti perdite (default da §14.2; override via fv_parametri_calcolo) ──
export interface FvParametriPerdite {
  perdita_temperatura_pct: number;
  perdita_mismatch_pct: number;
  perdita_sporcamento_pct: number;
  perdita_inverter_pct: number;
  performance_ratio: number;
  degradazione_annua_pannelli_pct: number;
}

export const FV_PERDITE_DEFAULT: FvParametriPerdite = {
  perdita_temperatura_pct: 0.04,
  perdita_mismatch_pct: 0.02,
  perdita_sporcamento_pct: 0.03,
  perdita_inverter_pct: 0.02,
  performance_ratio: 0.85,
  degradazione_annua_pannelli_pct: 0.005,
};

export const FV_PERDITE_PREMIUM: FvParametriPerdite = {
  ...FV_PERDITE_DEFAULT,
  performance_ratio: 0.88,
  degradazione_annua_pannelli_pct: 0.003,
};

// ─── Calcolo perdite totali ─────────────────────────────────────────────────
/**
 * Somma le perdite di sistema (espresse in % decimali) e ritorna il fattore di
 * efficienza netta (1 - perdite).
 */
export function fattoreEfficienzaNetta(p: FvParametriPerdite): number {
  const totale =
    p.perdita_temperatura_pct +
    p.perdita_mismatch_pct +
    p.perdita_sporcamento_pct +
    p.perdita_inverter_pct;
  return Math.max(0, 1 - totale);
}

/**
 * Calcolo produzione annua lorda dell'impianto (anno 1, no degradazione).
 *
 * @param input.potenza_kwp     Potenza nominale dell'impianto (kWp)
 * @param input.ore_sole_annue  Ore di sole equivalenti annue (h)
 * @param input.parametri       Override perdite (default residenziale Italia)
 */
export function produzioneAnnuaLorda(input: {
  potenza_kwp: number;
  ore_sole_annue: number;
  parametri?: Partial<FvParametriPerdite>;
}): number {
  const p = { ...FV_PERDITE_DEFAULT, ...(input.parametri ?? {}) };
  const teorica = input.potenza_kwp * input.ore_sole_annue;
  const netta = teorica * p.performance_ratio * fattoreEfficienzaNetta(p);
  return arrotondaTo(2, netta);
}

/**
 * Produzione anno N applicando degradazione annua (modello W1: lineare 0.5%
 * standard / 0.3% premium). Formula §14.4:
 *   produzione_anno_n = produzione_anno_1 × (1 - degradazione)^(n-1)
 */
export function produzioneAnnoN(
  produzione_anno_1: number,
  anno_n: number,
  degradazione_annua: number = FV_PERDITE_DEFAULT.degradazione_annua_pannelli_pct
): number {
  if (anno_n < 1) return produzione_anno_1;
  return produzione_anno_1 * Math.pow(1 - degradazione_annua, anno_n - 1);
}

/**
 * Distribuzione mensile della produzione annua basata sulla macroregione del
 * progetto (§14.3). Restituisce array di 12 valori in kWh.
 */
export function produzioneMensile(
  produzione_anno_1: number,
  provincia: string | null
): number[] {
  const macro = macroregionePerProvincia(provincia);
  const dist = FV_DISTRIBUZIONE_MENSILE[macro];
  return dist.map((pct) => arrotondaTo(2, produzione_anno_1 * pct));
}

// ─── Calcolo autoconsumo (§15) ──────────────────────────────────────────────

/**
 * Determina la % di autoconsumo dato il profilo cliente e la capacità accumulo.
 * Il valore viene letto da fv_profili_autoconsumo. Qui forniamo helper che
 * dato il profilo (riga DB) + accumulo, ritorna la % corretta.
 */
export function autoconsumoPctDaProfilo(profilo: {
  autoconsumo_no_accumulo: number;
  autoconsumo_accumulo_5kwh: number;
  autoconsumo_accumulo_10kwh: number;
  autoconsumo_accumulo_15kwh: number;
}, capacita_accumulo_kwh: number): number {
  if (capacita_accumulo_kwh <= 0) return profilo.autoconsumo_no_accumulo;
  if (capacita_accumulo_kwh <= 5) return profilo.autoconsumo_accumulo_5kwh;
  if (capacita_accumulo_kwh <= 10) return profilo.autoconsumo_accumulo_10kwh;
  // > 10 kWh
  if (capacita_accumulo_kwh <= 15) return profilo.autoconsumo_accumulo_15kwh;
  // Per accumuli > 15 kWh (PMI), assumiamo autoconsumo del profilo 15 kWh
  return profilo.autoconsumo_accumulo_15kwh;
}

/**
 * Determina autoconsumo, energia immessa e risparmio bolletta anno 1 (§15.3).
 * Vincolo: se produzione > consumo annuo, l'autoconsumo è limitato al consumo
 * (non si può auto-consumare più di quanto si consuma).
 */
export function calcolaAutoconsumoAnno1(input: {
  produzione_kwh: number;
  consumo_kwh: number;
  autoconsumo_pct: number;
  prezzo_kwh_acquisto: number;
  prezzo_rid_kwh: number;
}): {
  energia_autoconsumata_kwh: number;
  energia_immessa_kwh: number;
  risparmio_bolletta_eur: number;
  ricavi_rid_eur: number;
  risparmio_totale_eur: number;
  warning_sovradimensionato: boolean;
} {
  let energia_autoconsumata =
    input.produzione_kwh * input.autoconsumo_pct;
  let warning_sovradimensionato = false;

  if (energia_autoconsumata > input.consumo_kwh) {
    energia_autoconsumata = input.consumo_kwh;
    warning_sovradimensionato = true;
  }

  const energia_immessa = Math.max(
    0,
    input.produzione_kwh - energia_autoconsumata
  );
  const risparmio_bolletta = energia_autoconsumata * input.prezzo_kwh_acquisto;
  const ricavi_rid = energia_immessa * input.prezzo_rid_kwh;

  return {
    energia_autoconsumata_kwh: arrotondaTo(2, energia_autoconsumata),
    energia_immessa_kwh: arrotondaTo(2, energia_immessa),
    risparmio_bolletta_eur: arrotondaTo(2, risparmio_bolletta),
    ricavi_rid_eur: arrotondaTo(2, ricavi_rid),
    risparmio_totale_eur: arrotondaTo(2, risparmio_bolletta + ricavi_rid),
    warning_sovradimensionato,
  };
}

// ─── CO2 evitata (§26) ──────────────────────────────────────────────────────

/**
 * Calcola CO2 evitata in 25 anni (kg). Default factor: 0.319 kg CO2/kWh
 * (mix elettrico Italia 2025, ISPRA/GSE).
 */
export function co2Evitata25Anni(
  produzione_25_anni_kwh: number,
  factor_kg_per_kwh = 0.319
): number {
  return Math.round(produzione_25_anni_kwh * factor_kg_per_kwh);
}

/**
 * Equivalenze visive (§26.2) — utili per il PDF Vendita.
 */
export function equivalenzeCo2(co2_kg: number) {
  return {
    alberi_piantati: Math.round(co2_kg / 25),     // 1 albero ≈ 25 kg/anno
    auto_km_benzina: Math.round(co2_kg * 5450),    // ≈ 0.18 kg CO2/km
    famiglie_anno_consumo: Math.round(co2_kg / 3260), // ≈ 3260 kg CO2/famiglia/anno
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function arrotondaTo(decimali: number, n: number): number {
  const f = Math.pow(10, decimali);
  return Math.round(n * f) / f;
}

/**
 * src/lib/serramenti/risparmio.ts — calcolo risparmio energetico.
 *
 * Modello semplificato basato su:
 *  Q_perso (kWh/anno) = U × A × GG × 24h × 10⁻³
 *    U   = trasmittanza termica (W/m²K)
 *    A   = area serramento (m²)
 *    GG  = Gradi Giorno della zona climatica (DM 26/06/2015)
 *
 *  Risparmio = (U_attuale - U_nuovo) × A × GG × 24 × 10⁻³ / efficienza_caldaia
 *  Risparmio_€ = Risparmio_kWh × prezzo_kWh_termico
 *
 * Zone climatiche italiane (DM 412/93 art. 2) e GG indicativi:
 *  A: <600   (es. Lampedusa, Linosa) — riscaldamento ridotto
 *  B: 600-900 (es. Palermo, Reggio Calabria)
 *  C: 901-1400 (es. Napoli, Cagliari, Bari)
 *  D: 1401-2100 (es. Roma, Firenze, Genova)
 *  E: 2101-3000 (es. Milano, Torino, Bologna, Venezia)
 *  F: >3000   (es. Cuneo, Trento, Belluno)
 *
 * Valori U tipici (W/m²K):
 *  Serramento vecchio singolo vetro:     ~5.0
 *  Serramento vecchio vetrocamera anni 90: ~2.8
 *  Serramento moderno standard:          ~1.4
 *  Serramento moderno alto-prestazionale:~1.1
 *  Serramento premium triplo vetro:      ~0.8
 */

export type ZonaClimatica = "A" | "B" | "C" | "D" | "E" | "F";

const ZONA_GG: Record<ZonaClimatica, number> = {
  A: 500,
  B: 750,
  C: 1150,
  D: 1750,
  E: 2400,
  F: 3200,
};

const ZONA_GIORNI_RISCALDAMENTO: Record<ZonaClimatica, number> = {
  A: 60,
  B: 90,
  C: 137,
  D: 166,
  E: 183,
  F: 220,
};

/**
 * Stima zona climatica dal CAP italiano (heuristica grossolana — fonte:
 * tabella ENEA). Per accuratezza si dovrebbe usare una lookup table completa
 * comune-per-comune, qui ci accontentiamo di una stima.
 */
export function zonaDaCap(cap: string | null | undefined): ZonaClimatica {
  if (!cap) return "E";
  const c = parseInt(cap, 10);
  if (isNaN(c)) return "E";
  // Sud (Sicilia, Calabria meridionale)
  if (c >= 89000 && c <= 99999) return "B";
  // Sud-Centro
  if (c >= 70000 && c < 89000) return "C";
  // Centro-Sud (Roma, Napoli, Bari)
  if (c >= 60000 && c < 70000) return "C";
  if (c >= 40000 && c < 60000) return "D"; // Centro (Firenze, Bologna, Roma area)
  if (c >= 20000 && c < 40000) return "E"; // Nord (Milano, Torino, Venezia)
  if (c >= 10000 && c < 20000) return "E";
  if (c < 10000) return "F"; // Nord-montagna (Aosta, Trento)
  return "E";
}

export interface InputRisparmio {
  zona_climatica: ZonaClimatica;
  m2_serramenti: number;
  uw_attuale: number;            // W/m²K
  uw_nuovo: number;              // W/m²K
  efficienza_caldaia?: number;   // 0..1 (default 0.85 caldaia condensazione)
  prezzo_kwh_termico?: number;   // €/kWh (default 0.10 gas metano)
  bolletta_attuale_anno?: number;// se nota, usata per calcolare % risparmio
}

export interface OutputRisparmio {
  zona_climatica: ZonaClimatica;
  gradi_giorno: number;
  giorni_riscaldamento: number;
  kwh_persi_attuali: number;     // kWh/anno persi con serramenti vecchi
  kwh_persi_nuovi: number;       // kWh/anno persi con serramenti nuovi
  risparmio_kwh_anno: number;
  risparmio_eur_anno: number;
  risparmio_pct: number | null;  // su bolletta, se nota
  co2_risparmiata_kg_anno: number; // 0.2 kg CO2/kWh gas metano
}

/**
 * Calcola il risparmio energetico annuo dovuto alla sostituzione.
 *
 * Guard:
 *  - efficienza_caldaia clampata a [0.5, 1.0] per evitare divisioni per zero
 *    o assurde (caldaie reali stanno tra 75% e 98%)
 *  - prezzo_kwh_termico non negativo
 *  - m2 e uw non negativi
 *  - se uw_nuovo >= uw_attuale → risparmio = 0 (caso degenere o errore input)
 */
export function calcolaRisparmio(input: InputRisparmio): OutputRisparmio {
  // Guard: clamp efficienza
  const etaRaw = input.efficienza_caldaia ?? 0.85;
  const eta = Math.max(0.5, Math.min(1.0, isFinite(etaRaw) ? etaRaw : 0.85));
  // Guard: prezzo non negativo, fallback 0.10
  const prezzoRaw = input.prezzo_kwh_termico ?? 0.10;
  const prezzo = Math.max(0, isFinite(prezzoRaw) ? prezzoRaw : 0.10);

  const gg = ZONA_GG[input.zona_climatica];
  const giorni = ZONA_GIORNI_RISCALDAMENTO[input.zona_climatica];

  // Guard: m2 e uw non negativi/NaN
  const m2 = Math.max(0, isFinite(input.m2_serramenti) ? input.m2_serramenti : 0);
  const uwAttuale = Math.max(0, isFinite(input.uw_attuale) ? input.uw_attuale : 0);
  const uwNuovo = Math.max(0, isFinite(input.uw_nuovo) ? input.uw_nuovo : 0);

  // Caso degenere: nessun risparmio se m² o GG = 0, o se Uw nuovo >= attuale
  if (m2 === 0 || gg === 0 || uwNuovo >= uwAttuale) {
    return {
      zona_climatica: input.zona_climatica,
      gradi_giorno: gg,
      giorni_riscaldamento: giorni,
      kwh_persi_attuali: 0,
      kwh_persi_nuovi: 0,
      risparmio_kwh_anno: 0,
      risparmio_eur_anno: 0,
      risparmio_pct: 0,
      co2_risparmiata_kg_anno: 0,
    };
  }

  // Q = U × A × GG × 24 × 10⁻³ (kWh)
  const factor = m2 * gg * 24 / 1000;
  const kwh_persi_attuali = (uwAttuale * factor) / eta;
  const kwh_persi_nuovi = (uwNuovo * factor) / eta;
  const risparmio_kwh_anno = Math.max(0, kwh_persi_attuali - kwh_persi_nuovi);
  const risparmio_eur_anno = risparmio_kwh_anno * prezzo;
  const risparmio_pct = input.bolletta_attuale_anno && input.bolletta_attuale_anno > 0
    ? (risparmio_eur_anno / input.bolletta_attuale_anno) * 100
    : null;
  const co2_risparmiata_kg_anno = risparmio_kwh_anno * 0.2;

  return {
    zona_climatica: input.zona_climatica,
    gradi_giorno: gg,
    giorni_riscaldamento: giorni,
    kwh_persi_attuali,
    kwh_persi_nuovi,
    risparmio_kwh_anno,
    risparmio_eur_anno,
    risparmio_pct,
    co2_risparmiata_kg_anno,
  };
}

/**
 * Bolletta media annua riscaldamento (€) per zona climatica e m² casa.
 * Stima molto approssimativa, da affinare con dati reali quando disponibili.
 */
export function bollettaMediaRiscaldamento(
  zona: ZonaClimatica,
  m2_casa: number = 100,
): number {
  const eur_per_m2_anno: Record<ZonaClimatica, number> = {
    A: 4, B: 6, C: 9, D: 12, E: 16, F: 22,
  };
  return Math.round(eur_per_m2_anno[zona] * m2_casa);
}

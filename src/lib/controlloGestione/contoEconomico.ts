/**
 * Aiuti di lettura del conto economico riclassificato: nomi chiari delle righe,
 * percentuale di ogni riga sul valore della produzione, spiegazione delle
 * imposte stimate.
 */

import type { VoceCE } from "@/hooks/controlloGestione/useCEriclassificato";
import { SCHEMA_CE } from "@/lib/controlloGestione/budgetCE";
import { formatPct } from "@/lib/controlloGestione/formatCG";
import { formatCurrency } from "@/lib/formatters";

const ETICHETTE = new Map(SCHEMA_CE.map((r) => [r.codice, r.label]));

/**
 * Nome della riga per un titolare. Il database scrive «PRODOTTO INTERNO LORDO»
 * (termine di macroeconomia, non d'azienda) e i totali in maiuscolo.
 */
export function etichettaVoce(codice: string, fallback: string): string {
  return ETICHETTE.get(codice) ?? fallback;
}

export interface VoceCELeggibile extends VoceCE {
  /** Percentuale sul valore della produzione (voce A), su ogni riga. */
  incidenza: number | null;
}

/** Rinomina le righe e calcola l'incidenza di ciascuna sul valore della produzione. */
export function vociLeggibili(voci: VoceCE[]): VoceCELeggibile[] {
  const pil = voci.find((v) => v.codice === "A")?.valore ?? 0;
  return voci.map((v) => ({
    ...v,
    label: etichettaVoce(v.codice, v.label),
    incidenza: pil !== 0 ? (Number(v.valore) / pil) * 100 : null,
  }));
}

export interface AliquoteImposte {
  ires_pct: number;
  irap_pct: number;
  addizionale_ires_pct: number;
  base_irap_include_personale: boolean;
}

/**
 * Spiega la stima delle imposte con gli stessi conti del database
 * (cg_get_conto_economico_riclassificato):
 *   IRES = utile prima delle imposte × IRES% (+ addizionale)
 *   IRAP = (EBIT + costo del personale, se incluso) × IRAP%
 * Con il personale nella base IRAP l'aliquota effettiva sale (Demo 2 2026:
 * 163.061 € su 450.506 € = 36%), perché l'IRAP si calcola anche sugli stipendi.
 */
export function spiegazioneImposte(voci: VoceCE[], aliquote: AliquoteImposte | null | undefined): string | null {
  if (!aliquote) return null;
  const v = (c: string) => Number(voci.find((x) => x.codice === c)?.valore ?? 0);
  const ante = v("I");
  const ebit = v("F");
  const personale = v("06");
  const baseIres = Math.max(ante, 0);
  const ires = baseIres * (aliquote.ires_pct / 100);
  const add = baseIres * (aliquote.addizionale_ires_pct / 100);
  const baseIrap = Math.max(ebit + (aliquote.base_irap_include_personale ? personale : 0), 0);
  const irap = baseIrap * (aliquote.irap_pct / 100);
  const parti = [
    `IRES ${formatPct(aliquote.ires_pct, 1)} sull'utile prima delle imposte (${formatCurrency(baseIres)}): ${formatCurrency(ires)}.`,
  ];
  if (aliquote.addizionale_ires_pct > 0) {
    parti.push(`Addizionale IRES ${formatPct(aliquote.addizionale_ires_pct, 1)}: ${formatCurrency(add)}.`);
  }
  parti.push(
    aliquote.base_irap_include_personale
      ? `IRAP ${formatPct(aliquote.irap_pct, 1)} su EBIT più costo del personale (${formatCurrency(baseIrap)}): ${formatCurrency(irap)}.`
      : `IRAP ${formatPct(aliquote.irap_pct, 1)} sull'EBIT (${formatCurrency(baseIrap)}): ${formatCurrency(irap)}.`,
  );
  if (ante > 0) {
    parti.push(`In tutto ${formatPct(((ires + add + irap) / ante) * 100, 1)} dell'utile prima delle imposte${aliquote.base_irap_include_personale ? ": l'IRAP pesa anche sugli stipendi" : ""}.`);
  }
  parti.push("È una stima: le imposte vere le calcola il commercialista. Le aliquote si cambiano in Configurazione.");
  return parti.join(" ");
}

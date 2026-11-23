/**
 * Numeri come li legge un operaio italiano (collaudo 23/11/2026): mai il punto decimale all'inglese.
 * Prima: «0.0 h nella giornata», «3.5h lavorate», «Lordo: 1234.50», «12.3 km».
 */
import { oreInTesto } from "./regoleCampo";

/** 0 → «0h»; 3,5 → «3h 30»; 0,25 → «15 min». */
export function oreBrevi(ore: number): string {
  if (!Number.isFinite(ore) || Math.round(Math.abs(ore) * 60) === 0) return "0h";
  return oreInTesto(ore);
}

const EURO = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
/** 1234.5 → «1.234,50 €». */
export function euroCampo(importo: number): string {
  return EURO.format(importo);
}

/** 850 → «850 m»; 12345 → «12,3 km». */
export function distanzaCampo(metri: number): string {
  if (metri < 1000) return `${Math.round(metri)} m`;
  return `${(metri / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km`;
}

/**
 * Costo previsto di una ditta su una lavorazione (29/10/2026, Dimora Torino).
 *
 * Il costo della ditta si scrive con l'IVA che la ditta mette in fattura (come
 * in v_ordine_marginalita e in economiaFasi, che la tolgono). Dal 31/10/2026 la
 * ditta nasce in reverse charge, IVA 0: il subappalto edile non ha IVA in
 * fattura, e il costo è l'imponibile. Il listino manodopera e le voci del
 * preventivo sono senza IVA. Qui il passaggio da uno all'altro e il testo che
 * dice, sulla riga della ditta, da dove viene il numero.
 */
import { formatCurrency } from "@/lib/formatters";

export type OrigineCostoDitta = "listino" | "preventivo" | "manuale";

/** Voce del preventivo collegata alla lavorazione (order_work_phase_voci). */
export interface VoceCostoDitta {
  quantita: number;
  costo_manodopera: number;
  tariffa_id: string | null;
}

/** Variante del costo di una tariffa per una squadra (tariffa_costi_varianti). */
export interface VarianteCostoDitta {
  tariffa_id: string;
  external_team_id: string | null;
  costo: number | null;
  is_default?: boolean | null;
  attivo?: boolean | null;
  sort_order?: number | null;
}

const numero = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const centesimi = (v: number) => Math.round(v * 100) / 100;

/** IVA della ditta: 0 (reverse charge) se manca, come nel database. */
export const ivaDitta = (vat: number | null | undefined) => (vat == null || !Number.isFinite(Number(vat)) ? 0 : Number(vat));

/** «senza IVA, reverse charge» oppure «IVA 22% inclusa»: accanto agli importi della ditta. */
export const testoIvaDitta = (vat: number | null | undefined) =>
  ivaDitta(vat) === 0 ? "senza IVA (reverse charge)" : `IVA ${ivaDitta(vat).toLocaleString("it-IT")}% inclusa`;

/** Dal costo senza IVA a quello da scrivere sulla ditta. */
export const conIva = (netto: number, vat?: number | null) => centesimi(netto * (1 + ivaDitta(vat) / 100));

/** La variante che vale per quella tariffa e quella squadra: la predefinita, poi la prima. */
export function varianteDellaSquadra(
  varianti: ReadonlyArray<VarianteCostoDitta>,
  tariffaId: string,
  squadraId: string,
): VarianteCostoDitta | null {
  return varianti
    .filter((v) => v.tariffa_id === tariffaId && v.external_team_id === squadraId && v.attivo !== false && v.costo != null)
    .sort((a, b) => Number(b.is_default ?? false) - Number(a.is_default ?? false) || (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ?? null;
}

/**
 * Costo del lavoro delle voci della lavorazione, senza IVA: quantità × costo
 * della voce, o × il costo che quella ditta ha sul listino per la stessa
 * tariffa (variante della squadra), quando c'è.
 */
export function costoDaVoci(
  voci: ReadonlyArray<VoceCostoDitta>,
  varianti: ReadonlyArray<VarianteCostoDitta>,
  squadraId: string | null,
): { netto: number; voci: number; conVariante: number } {
  let netto = 0;
  let conVariante = 0;
  let n = 0;
  for (const v of voci) {
    const q = Math.max(0, numero(v.quantita));
    const variante = squadraId && v.tariffa_id ? varianteDellaSquadra(varianti, v.tariffa_id, squadraId) : null;
    const unitario = variante ? numero(variante.costo) : Math.max(0, numero(v.costo_manodopera));
    if (q * unitario <= 0) continue;
    if (variante) conVariante += 1;
    netto += q * unitario;
    n += 1;
  }
  return { netto: centesimi(netto), voci: n, conVariante };
}

/** La quantità della lavorazione da proporre per una tariffa: quella della voce con la stessa tariffa. */
export function quantitaDellaTariffa(voci: ReadonlyArray<VoceCostoDitta>, tariffaId: string): number | null {
  const stesse = voci.filter((v) => v.tariffa_id === tariffaId);
  if (stesse.length === 0) return null;
  return stesse.reduce((s, v) => s + Math.max(0, numero(v.quantita)), 0);
}

/** «Dal listino: 14,55 × 15,00 €» (+ IVA se la ditta la mette) — da dove viene il previsto della ditta. */
export function origineCostoDitta(a: {
  cost_preventivo: number;
  costo_origine?: OrigineCostoDitta | null;
  quantita?: number | null;
  costo_unitario?: number | null;
  vat_rate?: number | null;
}): string | null {
  if (!a.cost_preventivo || !a.costo_origine) return null;
  const iva = ivaDitta(a.vat_rate) === 0 ? "· reverse charge" : `+ IVA ${ivaDitta(a.vat_rate).toLocaleString("it-IT")}%`;
  if (a.costo_origine === "listino" && a.quantita != null && a.costo_unitario != null) {
    return `Previsto dal listino: ${a.quantita.toLocaleString("it-IT", { maximumFractionDigits: 3 })} × ${formatCurrency(a.costo_unitario)} ${iva}`;
  }
  if (a.costo_origine === "preventivo") return `Previsto dalle voci del preventivo ${iva}`;
  if (a.costo_origine === "manuale") return "Previsto scritto a mano";
  return null;
}

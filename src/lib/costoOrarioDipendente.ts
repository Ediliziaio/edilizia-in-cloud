/**
 * Costo orario di un dipendente — gemello lato client della funzione DB
 * `public.costo_orario_dipendente(uuid)`.
 *
 * Esisteva la stessa idea scritta in sei modi diversi in giro per l'app: chi
 * divideva il lordo per le ore (dimenticando gli oneri), chi ci aggiungeva
 * l'INPS, chi moltiplicava per 25 fisso. Sulla stessa persona uscivano numeri
 * dal −22% al +93%. Da qui in poi la formula è una, e questa è la sua copia
 * per le schermate che non possono chiamare il database.
 *
 * Regola: la tariffa scritta a mano vince (è una scelta dell'azienda);
 * altrimenti si calcola dal costo VERO — lordo più oneri — sulle ore
 * contrattuali del mese.
 */

/** Aliquota INPS usata quando il dipendente non ne ha una sua. */
export const ALIQUOTA_INPS_DEFAULT = 28;
/** Ore mensili usate quando il contratto non le specifica (40 h × 4,33). */
export const ORE_MENSILI_DEFAULT = 173;

export interface DatiCostoOrario {
  costo_orario?: number | string | null;
  gross_salary?: number | string | null;
  inps_rate?: number | string | null;
  monthly_hours?: number | string | null;
  ore_settimana?: number | string | null;
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

/** Ore contrattuali del mese: quelle dichiarate, o quelle settimanali × 4,33. */
export function oreContrattualiMese(e: DatiCostoOrario): number {
  return (
    num(e.monthly_hours) ||
    (num(e.ore_settimana) ? num(e.ore_settimana) * 4.33 : 0) ||
    ORE_MENSILI_DEFAULT
  );
}

/** Costo orario aziendale, arrotondato al centesimo. 0 solo se manca lo stipendio. */
export function costoOrarioDipendente(e: DatiCostoOrario): number {
  const manuale = num(e.costo_orario);
  if (manuale > 0) return manuale;

  const lordo = num(e.gross_salary);
  if (lordo <= 0) return 0;

  const aliquota = num(e.inps_rate) || ALIQUOTA_INPS_DEFAULT;
  const ore = oreContrattualiMese(e);
  if (ore <= 0) return 0;

  return Math.round(((lordo * (1 + aliquota / 100)) / ore) * 100) / 100;
}

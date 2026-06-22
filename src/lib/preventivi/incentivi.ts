/**
 * Incentivi fiscali edilizi — catalogo preset + calcolo del detraibile con
 * MASSIMALE di spesa. Condiviso tra i verticali (Ristrutturazione, Bagni, Tetti, Climatizzazione, Elettrico, Termoidraulico, Pavimenti).
 *
 * Il detraibile non è semplicemente `imponibile × %`: le detrazioni hanno un
 * tetto di spesa (es. Bonus Casa 50% su max 96.000 €). `calcDetraibile` applica
 * il cap. I valori dei massimali sono indicativi (la normativa cambia ogni anno):
 * NON sostituiscono la valutazione di un fiscalista.
 */

export interface Incentivo {
  /** Chiave stabile (per match attivo). */
  key: string;
  /** Etichetta breve mostrata sul chip. */
  label: string;
  /** Percentuale di detrazione. */
  pct: number;
  /** Tetto di spesa detraibile (€). null = nessun massimale. */
  massimale: number | null;
  /** Spiegazione (tooltip). */
  hint: string;
}

const NESSUNO: Incentivo = {
  key: "nessuno",
  label: "Nessuno",
  pct: 0,
  massimale: null,
  hint: "Nessuna detrazione fiscale.",
};

/** Preset per ristrutturazioni generiche (il set più ricco). */
export const INCENTIVI_RISTRUTTURAZIONE: readonly Incentivo[] = [
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Ristrutturazione edilizia / manutenzione straordinaria. Tetto di spesa 96.000 € per unità immobiliare." },
  { key: "ecobonus", label: "Ecobonus 65%", pct: 65, massimale: 60000, hint: "Riqualificazione energetica (cappotto, infissi, caldaia). Massimale variabile per intervento (indic. 60.000 €)." },
  { key: "sismabonus", label: "Sismabonus 70%", pct: 70, massimale: 96000, hint: "Interventi antisismici. Tetto 96.000 € per unità (aliquote 70/80/85% per classi di rischio)." },
  { key: "barriere", label: "Bonus Barriere 75%", pct: 75, massimale: 50000, hint: "Abbattimento barriere architettoniche. Tetto 50.000 € (edifici unifamiliari)." },
  NESSUNO,
];

/** Preset per i bagni: ristrutturazione + barriere (vasca→doccia/accessibilità). */
export const INCENTIVI_BAGNI: readonly Incentivo[] = [
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Rifacimento bagno come manutenzione straordinaria. Tetto 96.000 € per unità." },
  { key: "barriere", label: "Bonus Barriere 75%", pct: 75, massimale: 50000, hint: "Bagno accessibile / vasca→doccia: abbattimento barriere. Tetto 50.000 €." },
  NESSUNO,
];

/** Preset per le coperture/tetti: efficientamento + ristrutturazione. */
export const INCENTIVI_TETTI: readonly Incentivo[] = [
  { key: "ecobonus", label: "Ecobonus 65%", pct: 65, massimale: 60000, hint: "Coibentazione/isolamento della copertura (riqualificazione energetica)." },
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Rifacimento tetto come manutenzione straordinaria. Tetto 96.000 €." },
  NESSUNO,
];

/** Preset per la climatizzazione: efficientamento energetico (pompe di calore / clima efficiente). */
export const INCENTIVI_CLIMATIZZAZIONE: readonly Incentivo[] = [
  { key: "ecobonus", label: "Ecobonus 65%", pct: 65, massimale: 46154, hint: "Climatizzatori / pompe di calore ad alta efficienza in sostituzione dell'impianto. Tetto di spesa indic. 46.154 €." },
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Nuovo impianto di climatizzazione nell'ambito di una ristrutturazione edilizia. Tetto 96.000 €." },
  NESSUNO,
];

/** Preset per gli impianti elettrici: ristrutturazione + domotica/building automation. */
export const INCENTIVI_ELETTRICO: readonly Incentivo[] = [
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Rifacimento/adeguamento impianto elettrico come manutenzione straordinaria. Tetto 96.000 € per unità." },
  { key: "ecobonus", label: "Ecobonus 65%", pct: 65, massimale: 15000, hint: "Building automation / domotica per la gestione efficiente di riscaldamento, climatizzazione e produzione ACS." },
  NESSUNO,
];

/** Preset per il termoidraulico: efficientamento generatore + ristrutturazione. */
export const INCENTIVI_TERMOIDRAULICO: readonly Incentivo[] = [
  { key: "ecobonus", label: "Ecobonus 65%", pct: 65, massimale: 30000, hint: "Sostituzione del generatore con caldaia a condensazione o pompa di calore ad alta efficienza." },
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Rifacimento impianto termoidraulico come manutenzione straordinaria. Tetto 96.000 € per unità." },
  NESSUNO,
];

/** Preset per pavimenti & resine: ristrutturazione edilizia. */
export const INCENTIVI_PAVIMENTI: readonly Incentivo[] = [
  { key: "bonus_casa", label: "Bonus Casa 50%", pct: 50, massimale: 96000, hint: "Rifacimento pavimenti nell'ambito di una manutenzione straordinaria / ristrutturazione. Tetto 96.000 € per unità." },
  NESSUNO,
];

/**
 * Importo detraibile = base × pct/100, dove la base è l'imponibile netto
 * eventualmente limitato al massimale di spesa (se presente).
 * Tutti gli input sono coerciti e clampati (valori sporchi → 0).
 */
export function calcDetraibile(
  imponibileNetto: number,
  pct: number,
  massimale: number | null,
): number {
  const imp = Math.max(0, Number(imponibileNetto) || 0);
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  const base = massimale != null && massimale > 0 ? Math.min(imp, massimale) : imp;
  return (base * p) / 100;
}

/** True se l'imponibile netto supera il massimale del preset (spesa oltre il tetto). */
export function superaMassimale(imponibileNetto: number, massimale: number | null): boolean {
  if (massimale == null || massimale <= 0) return false;
  return (Number(imponibileNetto) || 0) > massimale;
}

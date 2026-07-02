/**
 * Incentivi fiscali edilizi — catalogo preset + calcolo del detraibile con
 * MASSIMALE di spesa. Condiviso tra i verticali (Ristrutturazione, Bagni,
 * Tetti, Climatizzazione, Elettrico, Termoidraulico, Pavimenti, Piscine).
 *
 * ⚠️ QUADRO 2026 (aggiornato 2026-07): le vecchie aliquote separate NON
 * esistono più — niente Ecobonus 65%, niente Sismabonus 70/80/85%, il Bonus
 * Barriere 75% è scaduto a fine 2025 senza proroga. Bonus casa ed ecobonus
 * sono UNIFICATI: 50% ABITAZIONE PRINCIPALE / 36% altre abitazioni, tetto di
 * spesa 96.000 € per unità immobiliare (dal 2027 previsto scalino 36%/30%).
 * Le caldaie a combustibili fossili sono ESCLUSE dalla detrazione dal 2025.
 *
 * REGOLA: quando cambia la finanziaria si aggiorna QUESTO file e tutti i
 * moduli seguono. Mai ri-hardcodare aliquote negli StepEconomia (Tetti lo
 * faceva con un array locale al 65%: bonificato).
 *
 * Il detraibile non è semplicemente `imponibile × %`: `calcDetraibile`
 * applica il massimale. I valori restano indicativi: requisiti e capienza
 * fiscale del cliente vanno verificati con un fiscalista.
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
  label: "Nessuna",
  pct: 0,
  massimale: null,
  hint: "Nessuna detrazione (es. committente impresa, immobile non agevolabile).",
};

/** Coppia base 2026, uguale per tutti i lavori edilizi sull'abitazione. */
const PRIMA_CASA_50 = (hint: string): Incentivo => ({
  key: "prima_casa_50",
  label: "Prima casa 50%",
  pct: 50,
  massimale: 96000,
  hint,
});
const ALTRE_36 = (hint: string): Incentivo => ({
  key: "altre_abitazioni_36",
  label: "Altre abitazioni 36%",
  pct: 36,
  massimale: 96000,
  hint,
});

/** Preset per ristrutturazioni generiche. */
export const INCENTIVI_RISTRUTTURAZIONE: readonly Incentivo[] = [
  PRIMA_CASA_50("Ristrutturazione dell'abitazione principale — aliquota 2026, tetto 96.000 € per unità."),
  ALTRE_36("Ristrutturazione di abitazioni diverse dalla principale — aliquota 2026, tetto 96.000 €."),
  NESSUNO,
];

/** Preset per i bagni (il 75% barriere è scaduto a fine 2025: si applica l'ordinario). */
export const INCENTIVI_BAGNI: readonly Incentivo[] = [
  PRIMA_CASA_50("Rifacimento bagno come manutenzione straordinaria sull'abitazione principale."),
  ALTRE_36("Rifacimento bagno su abitazione diversa dalla principale."),
  NESSUNO,
];

/** Preset per le coperture/tetti (coibentazione inclusa: aliquote unificate 2026). */
export const INCENTIVI_TETTI: readonly Incentivo[] = [
  PRIMA_CASA_50("Rifacimento/coibentazione del tetto sull'abitazione principale."),
  ALTRE_36("Rifacimento/coibentazione su abitazione diversa dalla principale."),
  NESSUNO,
];

/** Preset climatizzazione (pompe di calore incluse nelle aliquote unificate). */
export const INCENTIVI_CLIMATIZZAZIONE: readonly Incentivo[] = [
  PRIMA_CASA_50("Clima/pompa di calore nell'ambito di lavori sull'abitazione principale."),
  ALTRE_36("Clima/pompa di calore su abitazione diversa dalla principale."),
  NESSUNO,
];

/** Preset impianti elettrici. */
export const INCENTIVI_ELETTRICO: readonly Incentivo[] = [
  PRIMA_CASA_50("Rifacimento/adeguamento impianto elettrico sull'abitazione principale."),
  ALTRE_36("Impianto elettrico su abitazione diversa dalla principale."),
  NESSUNO,
];

/** Preset termoidraulico — ATTENZIONE: caldaie a combustibili fossili ESCLUSE dal 2025. */
export const INCENTIVI_TERMOIDRAULICO: readonly Incentivo[] = [
  PRIMA_CASA_50("Pompa di calore / impianto idrico sull'abitazione principale. Caldaie a gas: NON detraibili dal 2025."),
  ALTRE_36("Su abitazione diversa dalla principale. Caldaie a gas: NON detraibili dal 2025."),
  NESSUNO,
];

/** Preset pavimenti & resine. */
export const INCENTIVI_PAVIMENTI: readonly Incentivo[] = [
  PRIMA_CASA_50("Rifacimento pavimenti nell'ambito di manutenzione straordinaria sull'abitazione principale."),
  ALTRE_36("Pavimenti su abitazione diversa dalla principale."),
  NESSUNO,
];

/** Preset piscine: la piscina in sé NON accede ai bonus edilizi. */
export const INCENTIVI_PISCINE: readonly Incentivo[] = [
  NESSUNO,
  PRIMA_CASA_50("SOLO se la piscina rientra in una ristrutturazione più ampia dell'abitazione principale — caso raro, da verificare col fiscalista."),
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

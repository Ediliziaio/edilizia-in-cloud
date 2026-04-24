/**
 * Credit forecasting — stima giorni restanti prima dell'esaurimento
 * basandosi sullo storico degli ultimi N giorni di consumo.
 *
 * Client-side, zero DB writes. Richiede solo lo storico già caricato.
 */

export interface CreditLogEntry {
  type: string; // "debit" | "credit" | "topup" | "refund" etc.
  amount_eur: number; // positivo = topup, negativo = spesa (o viceversa)
  created_at: string;
  // Fallback: alcune tabelle usano balance_before/after per capire delta
  balance_before?: number;
  balance_after?: number;
}

export interface CreditForecast {
  dailyBurnRate: number; // €/giorno medio consumato (positivo)
  daysRemaining: number | null; // null se non consuma o non si può calcolare
  depletionDate: Date | null;
  /** Livello di warning per UI */
  severity: "ok" | "warning" | "critical";
  /** N° giorni di dati usati per il calcolo */
  daysAnalyzed: number;
}

/**
 * Calcola l'ETA di esaurimento del saldo.
 *
 * @param currentBalance saldo attuale (€)
 * @param logEntries movimenti (storico, ordine qualsiasi)
 * @param windowDays finestra di analisi (default 14gg)
 */
export function computeCreditForecast(
  currentBalance: number,
  logEntries: CreditLogEntry[],
  windowDays = 14
): CreditForecast {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 86400000);

  // Filtra solo SPESE nel range (amount negativo oppure type "debit"/"consume")
  const spendEntries = logEntries.filter((e) => {
    const d = new Date(e.created_at);
    if (d < windowStart) return false;
    // Considera spesa se amount < 0 OPPURE balance_after < balance_before
    if (e.amount_eur < 0) return true;
    if (
      typeof e.balance_before === "number" &&
      typeof e.balance_after === "number" &&
      e.balance_after < e.balance_before
    ) {
      return true;
    }
    return false;
  });

  if (spendEntries.length === 0) {
    return {
      dailyBurnRate: 0,
      daysRemaining: null,
      depletionDate: null,
      severity: "ok",
      daysAnalyzed: windowDays,
    };
  }

  // Somma totale spesa (in €, sempre positiva nel ritorno)
  const totalSpent = spendEntries.reduce((sum, e) => {
    if (e.amount_eur < 0) return sum + Math.abs(e.amount_eur);
    if (
      typeof e.balance_before === "number" &&
      typeof e.balance_after === "number"
    ) {
      return sum + (e.balance_before - e.balance_after);
    }
    return sum;
  }, 0);

  // Determina il range effettivo di dati disponibili
  const firstSpend = spendEntries.reduce(
    (min, e) => (new Date(e.created_at) < min ? new Date(e.created_at) : min),
    now
  );
  const actualDays = Math.max(
    1,
    Math.round((now.getTime() - firstSpend.getTime()) / 86400000)
  );
  const daysAnalyzed = Math.min(actualDays, windowDays);

  const dailyBurnRate = totalSpent / daysAnalyzed;

  if (dailyBurnRate <= 0 || currentBalance <= 0) {
    return {
      dailyBurnRate,
      daysRemaining: null,
      depletionDate: null,
      severity: currentBalance <= 0 ? "critical" : "ok",
      daysAnalyzed,
    };
  }

  const daysRemaining = currentBalance / dailyBurnRate;
  const depletionDate = new Date(now.getTime() + daysRemaining * 86400000);

  // Severity:
  //  - critical: < 3 giorni
  //  - warning: < 10 giorni
  //  - ok: altrimenti
  const severity: CreditForecast["severity"] =
    daysRemaining < 3 ? "critical" : daysRemaining < 10 ? "warning" : "ok";

  return {
    dailyBurnRate,
    daysRemaining: Math.max(0, daysRemaining),
    depletionDate,
    severity,
    daysAnalyzed,
  };
}

/** Formatta il numero di giorni in una stringa leggibile */
export function formatDaysRemaining(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) {
    const hours = Math.floor(days * 24);
    return hours <= 0 ? "< 1h" : `${hours}h`;
  }
  const rounded = Math.round(days);
  if (rounded === 1) return "1 giorno";
  if (rounded > 90) return `> 3 mesi`;
  if (rounded > 30) {
    const months = Math.round(rounded / 30);
    return `~${months} mes${months === 1 ? "e" : "i"}`;
  }
  return `${rounded} giorni`;
}

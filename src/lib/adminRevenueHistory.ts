export interface MrrSnapshot {
  data: string;
  mrr_stripe_cents: number;
  mrr_interno_cents: number;
  aziende_attive_stripe: number;
}

/** Gli snapshot sono giornalieri: per ogni mese si conserva l'ultimo disponibile.
 * L'MRR è uno stock, quindi non si sommano i giorni e non si inventano mesi mancanti.
 */
export function monthlyMrrSeries(snapshots: MrrSnapshot[]) {
  const months = new Map<string, MrrSnapshot>();
  for (const snapshot of [...snapshots].sort((a, b) => a.data.localeCompare(b.data))) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(snapshot.data)) continue;
    months.set(snapshot.data.slice(0, 7), snapshot);
  }
  return [...months.entries()].slice(-12).map(([month, snapshot]) => ({
    mese: new Date(`${month}-01T12:00:00`).toLocaleDateString("it-IT", { month: "short", year: "2-digit" }),
    mrrStripe: snapshot.mrr_stripe_cents / 100,
    mrrInterno: snapshot.mrr_interno_cents / 100,
    aziende: snapshot.aziende_attive_stripe,
  }));
}

export function formatMrrAxis(value: number) {
  return Math.abs(value) >= 1000
    ? `${(value / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k €`
    : `${value.toLocaleString("it-IT", { maximumFractionDigits: 0 })} €`;
}

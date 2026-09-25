/**
 * Fasi e modalità di pagamento STRUTTURATE del preventivo.
 *
 * Il preventivo cattura modalità (bonifico/assegno/…) + fasi (acconto/SAL/saldo con
 * percentuale e importo). Sono firmate dal cliente nel PDF e, alla conversione in
 * commessa, si copiano 1:1 nelle rate (order_installments) — stesso schema `type`.
 *
 * Le fasi sono percent-driven: l'importo si ricalcola dal totale del preventivo,
 * così restano coerenti anche se il totale cambia. Solo un piano al 100%
 * assorbe gli arrotondamenti nell'ultima fase con percentuale positiva.
 */

export type QuotePaymentPhaseType = "deposit" | "balance" | "financing";

export interface QuotePaymentPhase {
  label: string;
  type: QuotePaymentPhaseType;
  /** Percentuale sul totale (0..100). */
  percent: number;
  /** Importo in euro, derivato da percent × totale (o assorbito dall'ultima fase). */
  amount: number;
}

/** Preset comuni per la modalità (l'utente può comunque scrivere testo libero). */
export const PAYMENT_METHOD_PRESETS: readonly string[] = [
  "Bonifico bancario",
  "Assegno",
  "Contanti",
  "Finanziamento",
  "Misto (acconto + finanziamento)",
] as const;

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Piano di default: 30% acconto alla firma + 70% saldo a fine lavori. */
export function defaultQuotePaymentPhases(): QuotePaymentPhase[] {
  return [
    { label: "Acconto alla firma", type: "deposit", percent: 30, amount: 0 },
    { label: "Saldo a fine lavori", type: "balance", percent: 70, amount: 0 },
  ];
}

/**
 * Ricalcola gli importi delle fasi dalle percentuali sul totale.
 * L'ultima fase assorbe il resto per garantire somma-importi === totale (no drift da arrotondamenti).
 */
export function recalcPhaseAmounts(phases: QuotePaymentPhase[], total: number): QuotePaymentPhase[] {
  const t = Number.isFinite(total) ? Math.max(0, round2(total)) : 0;
  const n = phases.length;
  if (n === 0) return phases;
  const valid = paymentPlanError(phases) === null;
  const lastPositive = phases.reduce((last, p, i) => p.percent > 0 ? i : last, -1);
  let remaining = t;
  return phases.map((p, i) => {
    if (valid && i === lastPositive) {
      return { ...p, amount: remaining > 0 ? round2(remaining) : 0 };
    }
    const percent = Number.isFinite(p.percent) ? Math.min(100, Math.max(0, p.percent)) : 0;
    const want = round2(t * percent / 100);
    // Un piano incompleto mostra gli importi effettivamente richiesti: non
    // trasformare, per esempio, un saldo dichiarato del 30% in un 70%.
    const amount = valid ? Math.min(want, Math.max(0, remaining)) : want;
    remaining = round2(remaining - amount);
    return { ...p, amount };
  });
}

/** Nessun piano è ammesso; se presente, deve essere completo e leggibile. */
export function paymentPlanError(phases: QuotePaymentPhase[]): string | null {
  if (phases.length === 0) return null;
  if (phases.some((p) => !Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100))
    return "Ogni percentuale di pagamento deve essere compresa tra 0 e 100.";
  if (Math.abs(phases.reduce((sum, p) => sum + p.percent, 0) - 100) > 0.000001)
    return "Completa le fasi di pagamento: le percentuali devono sommare 100%.";
  if (phases.some((p) => !p.label.trim()))
    return "Inserisci una descrizione per ogni fase di pagamento.";
  return null;
}

/** Somma delle percentuali (per mostrare all'utente se il piano quadra al 100%). */
export function phasesPercentTotal(phases: QuotePaymentPhase[]): number {
  return round2(phases.reduce((s, p) => s + (Number(p.percent) || 0), 0));
}

/** Somma degli importi (deve combaciare col totale del preventivo). */
export function phasesAmountTotal(phases: QuotePaymentPhase[]): number {
  return round2(phases.reduce((s, p) => s + (Number(p.amount) || 0), 0));
}

/** Parsing difensivo del JSON salvato su quotes.payment_phases. */
export function parseQuotePaymentPhases(raw: unknown): QuotePaymentPhase[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const t = String(x.type ?? "deposit");
      return {
        label: String(x.label ?? ""),
        type: (t === "balance" || t === "financing" ? t : "deposit") as QuotePaymentPhaseType,
        percent: Number(x.percent) || 0,
        amount: Number(x.amount) || 0,
      };
    });
}

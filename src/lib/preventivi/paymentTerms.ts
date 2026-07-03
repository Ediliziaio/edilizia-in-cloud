/**
 * Fasi e modalità di pagamento STRUTTURATE del preventivo.
 *
 * Il preventivo cattura modalità (bonifico/assegno/…) + fasi (acconto/SAL/saldo con
 * percentuale e importo). Sono firmate dal cliente nel PDF e, alla conversione in
 * commessa, si copiano 1:1 nelle rate (order_installments) — stesso schema `type`.
 *
 * Le fasi sono percent-driven: l'importo si ricalcola dal totale del preventivo,
 * così restano coerenti anche se il totale cambia. L'ULTIMA fase assorbe il resto
 * (arrotondamenti) per far quadrare la somma esatta col totale.
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
  const t = Math.max(0, round2(total));
  const n = phases.length;
  if (n === 0) return phases;
  let allocated = 0;
  return phases.map((p, i) => {
    if (i === n - 1) {
      const rest = round2(t - allocated);
      return { ...p, amount: rest < 0 ? 0 : rest };
    }
    const amount = round2((t * (Number(p.percent) || 0)) / 100);
    allocated = round2(allocated + amount);
    return { ...p, amount };
  });
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

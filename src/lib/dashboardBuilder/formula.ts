/**
 * Formula engine minimale per widget config.
 * Supporta: numeri, +, -, *, /, %, parentesi, identifiers dal context.
 * Per Sprint 3 sostituibile con expr-eval per funzioni avanzate.
 *
 * NON è un eval generico: rifiuta keyword JS, accesso proprietà, chiamate.
 * Safe per input utente dentro la stessa company (già autenticato).
 */

export type FormulaContext = Record<string, number | null | undefined>;

const SAFE_EXPR = /^[0-9+\-*/%().,\s_a-zA-Z]+$/;
const FORBIDDEN = /\b(function|return|new|this|window|document|eval|process|require|import|=>|=)\b/;

export function evalFormula(
  expr: string | null | undefined,
  context: FormulaContext,
): number | null {
  if (!expr) return null;
  const trimmed = expr.trim();
  if (!trimmed) return null;
  if (!SAFE_EXPR.test(trimmed) || FORBIDDEN.test(trimmed)) {
    console.warn("[dashboardBuilder] formula rifiutata:", trimmed);
    return null;
  }
  // Sostituisci identifiers con valori del context
  const replaced = trimmed.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (id) => {
    const v = context[id];
    if (v == null || Number.isNaN(v)) return "null";
    return String(v);
  });
  // Verifica che non restino identificatori non numerici
  if (/[a-zA-Z_]/.test(replaced.replace(/null/g, ""))) {
    console.warn("[dashboardBuilder] identifier non risolto in formula:", trimmed);
    return null;
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${replaced});`);
    const result = fn();
    if (typeof result === "number" && Number.isFinite(result)) return result;
    return null;
  } catch {
    return null;
  }
}

export function evaluateColorRule(
  rule: { if: string; color: string },
  value: number | null,
): boolean {
  if (value == null) return false;
  return evalFormula(rule.if, { value, v: value }) !== null &&
    (evalFormula(rule.if, { value, v: value }) as number) > 0
    ? true
    : false;
}

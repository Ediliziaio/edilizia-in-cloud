import { preliminaryQuoteBudgetTotals, type PreliminaryQuoteBudget } from '../../../../supabase/functions/_shared/quoteAdvanced';
import { formatCurrency } from '@/lib/formatters';
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { quoteBudgetOverlaps } from '@/lib/preventivi/quoteBudgetQuality';
export function QuotePreliminaryBudget({ budget, stale, model, compact = false, vat = null }: { budget: PreliminaryQuoteBudget; stale: boolean; model?: string; compact?: boolean; vat?: number | null }) {
  const t = useT();
  const total = preliminaryQuoteBudgetTotals(budget);
  const overlaps = quoteBudgetOverlaps(budget);
  return <section className="quote-indicative-summary" aria-label={t("Budget preliminare AI separato dal computo")}>
    <strong>{t("Budget preliminare · stima AI, non prezzario verificato")}</strong>
    <p>{budget.scope}</p><p><strong>{t("{minimo}–{massimo} netti IVA esclusa", { minimo: formatCurrency(total.low), massimo: formatCurrency(total.high) })}</strong></p>
    {vat != null && <p className="text-xs">{t("Con l’ipotesi di aliquota unica {aliquota}% dichiarata da te: {minimo}–{massimo} IVA compresa. Non verifica l’applicabilità fiscale.", { aliquota: vat, minimo: formatCurrency(Math.round(total.low * (1 + vat / 100) * 100) / 100), massimo: formatCurrency(Math.round(total.high * (1 + vat / 100) * 100) / 100) })}</p>}
    {!!overlaps.length && <div role="status" className="my-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950"><strong>{t("Somma dei capitoli da rivedere")}</strong><p>{t("Possibili sovrapposizioni: il totale non è depurato da questi importi. La conversione in proposta è sospesa.")}</p>{!compact && <ul>{overlaps.map(warning => <li key={warning}>{warning}</li>)}</ul>}</div>}
    {stale && <p role="status">{t("Da aggiornare: la bozza o le risposte sono cambiate dopo questa stima.")}</p>}
    {!compact && <><details><summary>{t("Vedi le {n} lavorazioni previste", { n: budget.groups.length })}</summary><dl>{budget.groups.map((g, i) => <div key={i}><dt><strong>{g.label}</strong> · {formatCurrency(g.low)}–{formatCurrency(g.high)}</dt><dd>{g.basis}</dd></div>)}</dl></details>
      <details><summary>{t("Ipotesi e limiti della stima")}</summary><ul>{budget.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>{!!budget.exclusions.length && <><strong>{t("Esclusioni")}</strong><ul>{budget.exclusions.map((a, i) => <li key={i}>{a}</li>)}</ul></>}</details></>}
    {compact ? <small>{t("Stima indicativa separata dal computo · IVA esclusa.")}</small> : <details><summary>{t("Come è stata calcolata la stima")}</summary><small>{model && <>{t("Modello: {modello}.", { modello: model })} </>}{t("Totali calcolati dal software. Intervalli da verificare, non offerta contrattuale. Non si somma al parziale verificato e non aggiunge prezzi alle voci o al PDF.")}</small></details>}
  </section>;
}

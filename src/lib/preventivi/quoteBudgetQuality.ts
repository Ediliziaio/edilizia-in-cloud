import type { PreliminaryQuoteBudget } from '../../../supabase/functions/_shared/quoteAdvanced';

/** Conservative textual clues, NOT a semantic/cost audit. Never subtract money
 * automatically: repeated scopes must be clarified before conversion. */
export function quoteBudgetOverlaps(budget: PreliminaryQuoteBudget): string[] {
  const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const warnings: string[] = [];
  const labels = new Map<string, string>();
  for (const group of budget.groups) {
    const key = normalize(group.label);
    if (labels.has(key)) warnings.push(`Capitolo ripetuto «${group.label}»: verifica che non sia conteggiato due volte.`);
    labels.set(key, group.label);
  }
  // A negated clause is not evidence that its work was included. Do not infer
  // scopes from chapter labels alone (e.g. demolition versus wall reinstatement).
  const affirmatives = budget.groups.map(group => group.basis
    .split(/[.;\n]/)
    // Italian also puts the negation AFTER its object: “tracce e ripristini
    // edili esclusi”. It must not become evidence of an included cost.
    .filter(part => !/\b(?:esclus[aeio]|non\s+(?:inclus[aeio]|compres[aeio]))\s*$/i.test(part.trim()))
    .map(part => part.split(/\b(?:esclus[aeio]|esclude|escludendo|non\s+(?:include|comprende|inclus[aeio])|senza|gia\s+(?:contat[aoe]|conteggiat[aoe]|contabilizzat[aoe]))\b/i)[0])
    .join(' '));
  const scopes = [
    { pattern: /\btracc(?:e|iature)\b/i, label: 'tracce impiantistiche' },
    { pattern: /\bripristin[io]\s+(?:delle\s+|dei\s+)?(?:tracce|murari)\b/i, label: 'ripristini murari' },
  ];
  for (const scope of scopes) {
    const groups = budget.groups.filter((_, index) => scope.pattern.test(affirmatives[index]));
    if (groups.length > 1) warnings.push(`Possibile doppio conteggio di ${scope.label} tra ${groups.map(group => `«${group.label}»`).join(' e ')}. Assegna questa lavorazione a un solo capitolo prima di convertire il budget.`);
  }
  return [...new Set(warnings)].slice(0, 5);
}

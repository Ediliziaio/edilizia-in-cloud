import type { ChatLine } from './quoteChatDocument';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true });
const aiEstimateLabel = 'Stima AI indicativa, non prezzario verificato';

/** Restore only an explicitly indicative label, never a verified reference or
 * supplier identity from free text. The full original interval stays in fonte.
 */
export function wizardAiPricingFromSource(source: string | null | undefined): ChatLine['pricing'] {
  return source?.startsWith(`${aiEstimateLabel}. `)
    ? { origin: 'ai-estimate', basis: source.slice(0, 1000) }
    : undefined;
}

/** The native computo already persists and prints `fonte`. Do not lose the
 * distinction between a catalogue reference and an explicitly accepted estimate.
 */
export function wizardAiPriceSource(line: ChatLine): string | null {
  if (line.reference) return `${line.reference.sourceName} · ${line.reference.code}`;
  if (line.pricing) {
    const labels = {
      manual: 'Prezzo manuale dichiarato',
      company: 'Prezzo aziendale dichiarato',
      supplier: 'Offerta fornitore dichiarata',
      'ai-estimate': aiEstimateLabel,
      demo: 'Esempio dimostrativo, non offerta commerciale',
    };
    const { low, high } = line.pricing;
    const range = low != null && high != null
      ? `Intervallo netto: ${euro.format(low)} - ${euro.format(high)} / ${line.unit}. `
      : '';
    return `${labels[line.pricing.origin]}. ${range}${line.pricing.basis}`;
  }
  if (line.estimate) {
    const estimate = line.estimate;
    return `Stima indicativa, non prezzario verificato. Intervallo netto: ${euro.format(estimate.low)} - ${euro.format(estimate.high)} / ${estimate.unit}. ${estimate.basis}. Ipotesi: ${estimate.assumptions}`;
  }
  return null;
}

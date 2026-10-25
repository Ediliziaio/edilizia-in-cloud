import type { SrAiDraftItem } from './aiDraft';

/** Provider annotations are useful, never the only validation before a write. */
export function serramentiAiIssues(item: SrAiDraftItem): string[] {
  const issues = [...item.missing_fields];
  if (!item.id?.trim() || !item.tipologia?.trim() || !item.tipologia_label?.trim()) issues.push('Tipologia e identità della riga');
  if (!Number.isSafeInteger(item.quantita) || item.quantita <= 0 || item.quantita > 10000) issues.push('Quantità intera positiva');
  if (typeof item.prezzo_unitario !== 'number' || !Number.isFinite(item.prezzo_unitario) || item.prezzo_unitario <= 0 || item.prezzo_unitario > 1e6) issues.push('Prezzo unitario da verificare');
  const dimensionsRequired = /finestr|portafinestr|porta_finestr|scorrevol|persian|oscurant|zanzar/i.test(item.tipologia) || item.larghezza_mm != null || item.altezza_mm != null;
  if (dimensionsRequired && [item.larghezza_mm, item.altezza_mm].some(n => typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 20000)) issues.push('Larghezza e altezza in mm da confermare');
  return [...new Set(issues)];
}

export function verifiedSerramentiAiItem(item: SrAiDraftItem): SrAiDraftItem {
  const issues = serramentiAiIssues(item);
  if (issues.length) throw new Error(`Completa la riga prima di inserirla: ${issues.join('; ')}.`);
  // Never trust a model-authored multiplication (including an old total after edits).
  return { ...item, prezzo_totale: Math.round(item.quantita * item.prezzo_unitario! * 100) / 100 };
}

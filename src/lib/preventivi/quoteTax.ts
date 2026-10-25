import { calcolaTotaliPreventivo } from '@/hooks/usePreventivoCosti';
import type { QuoteItemPro } from '@/types/quoteItem';
export type QuoteTaxSettings = { defaultRate: number | null; lineRates: Array<{ id: string; rate: number | null }>; display: 'net' | 'gross' };
export const emptyQuoteTax = (): QuoteTaxSettings => ({ defaultRate: null, lineRates: [], display: 'net' });
export function readQuoteTax(raw: unknown): QuoteTaxSettings {
  const t = raw as QuoteTaxSettings;
  const rate = (n: unknown): n is number | null => n === null || typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 && Math.abs(Math.round(n * 100) - n * 100) < 0.000001;
  if (!t || !rate(t.defaultRate) || !['net', 'gross'].includes(t.display) || !Array.isArray(t.lineRates) || t.lineRates.length > 100 || t.lineRates.some(r => !r || !/^[a-z\d_-]{1,80}$/i.test(r.id) || !rate(r.rate)) || new Set(t.lineRates.map(r => r.id)).size !== t.lineRates.length) throw new Error('Impostazioni IVA non valide.');
  return { defaultRate: t.defaultRate, display: t.display, lineRates: t.lineRates.map(r => ({ id: r.id, rate: r.rate })) };
}
/** Prices remain NET internally. Gross is presentation, never a silent rewrite. */
export function quoteTaxItems(items: QuoteItemPro[], settings: QuoteTaxSettings, trustEditorRates: boolean): QuoteItemPro[] {
  return items.map(item => {
    const override = settings.lineRates.find(r => r.id === item.client_temp_id);
    const rate = override ? override.rate : trustEditorRates && item.vat_rate != null ? item.vat_rate : settings.defaultRate;
    return { ...item, vat_rate: rate };
  });
}
export function quoteTaxTotals(items: QuoteItemPro[], globalDiscount = 0) {
  const active = items.filter(i => !i.is_optional);
  const pending = active.filter(i => !['nota', 'subtotale', 'sconto'].includes(i.item_category) && i.vat_rate == null).map(i => i.client_temp_id ?? i.id ?? i.name);
  // The shared calculator defaults missing VAT to 22. An explicit temporary 0
  // avoids that default, but is NEVER exposed as an exemption or a gross total.
  const calculated = calcolaTotaliPreventivo(active.map(i => ({ ...i, vat_rate: i.vat_rate ?? 0 })), 0, globalDiscount);
  const known = active.length > 0 && pending.length === 0;
  const tax = known ? Math.round(Object.values(calculated.iva_breakdown).reduce((sum, n) => sum + n, 0) * 100) / 100 : null;
  return { net: calculated.subtotale_netto, tax, gross: known ? calculated.totale : null, pending, breakdown: known ? calculated.iva_breakdown : {} };
}
export function quoteUniformVat(items: QuoteItemPro[]): number | null {
  const rates = items.filter(i => !i.is_optional && !['nota', 'subtotale', 'sconto'].includes(i.item_category)).map(i => i.vat_rate);
  return rates.length && rates[0] != null && rates.every(r => r === rates[0]) ? rates[0]! : null;
}
export function quoteTaxFromEditor(settings: QuoteTaxSettings, previous: QuoteItemPro[], next: QuoteItemPro[]) {
  const changed = next.filter(item => item.client_temp_id && previous.find(old => old.client_temp_id === item.client_temp_id)?.vat_rate !== item.vat_rate).map(item => ({ id: item.client_temp_id!, rate: item.vat_rate ?? null }));
  return readQuoteTax({ ...settings, lineRates: [...settings.lineRates.filter(row => !changed.some(item => item.id === row.id)), ...changed] });
}
/** Explicit local command only. Questions/AI advice never set fiscal rates. */
export function quoteTaxCommand(text: string): { rate: number; line: number | null } | null {
  const m = /^imposta (?:l['’])?iva(?: (?:al|a))? (\d{1,3}(?:[.,]\d{1,2})?)\s*%(?: (?:per|sulla) (?:la )?voce (\d{1,3}))?[.!]?$/i.exec(text.trim());
  if (!m) return null;
  const rate = Number(m[1].replace(',', '.')); if (rate > 100) return null;
  return { rate, line: m[2] ? Number(m[2]) : null };
}

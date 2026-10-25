import { describe, expect, it } from 'vitest';
import { wizardAiCommercial } from '@/lib/preventivi/wizardAiCommercial';
import { classicChatDocument } from '@/lib/preventivi/classicWizardAiDraft';
import { patchChatLine } from '@/lib/preventivi/quoteChatDocument';
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';
import type { NativeComputoModule } from '@/lib/preventivi/wizardAiDraft';

const base = (): QuoteDraft => ({ discountPercent: 10, items: [10, 22].map((vat, i) => ({ client_temp_id: `row-${i}`, name: `Prodotto ${i}`, description: 'Confermato', quantity: 2, unit_of_measure: 'cad', unit_price: 100,
  item_type: 'product', item_category: 'prodotto', vat_rate: vat, discount_percent: 10, prezzo_acquisto: 0, is_optional: false, mostra_nel_pdf: true, sort_order: i })) });
describe('native commercial context stays identical in chat and wizard', () => {
  it.each<NativeComputoModule>(['bagni', 'climatizzazione', 'elettrico', 'termoidraulico', 'pavimenti', 'piscine', 'ristrutturazione', 'tetti'])('%s preserves its native gross-cent rounding instead of using classic VAT rounding', module => {
    const draft = base(); draft.items = [{ ...draft.items![0], quantity: 1, unit_price: 0.05, discount_percent: 0 }]; draft.discountPercent = 33;
    const doc = classicChatDocument(draft);
    expect(wizardAiCommercial(doc, draft, 10, module).taxTotal).toMatchObject({ net: 0.03, tax: 0.01, gross: 0.04 });
    expect(wizardAiCommercial(doc, draft, 10).taxTotal.gross).toBe(0.03);
  });
  it('calculates mixed VAT, line and global discounts with the native calculator', () => {
    const draft = base(), commercial = wizardAiCommercial(classicChatDocument(draft), draft, 22);
    expect(commercial.taxTotal).toMatchObject({ net: 324, tax: 51.84, gross: 375.84, breakdown: { 10: 16.2, 22: 35.64 } });
    expect(commercial.evidence).toContain('Sconto globale 10%'); expect(commercial.evidence).toContain('IVA 22%');
  });
  it('ristrutturazione: segue il regime beni significativi e la classificazione del computo nativo', () => {
    const draft = { ...base(), discountPercent: 0,
      nativeTax: { significantGoods: true, significantLineIds: ['row-0'] },
      items: base().items!.map((row, i) => ({ ...row, quantity: 1, discount_percent: 0, unit_price: i === 0 ? 8000 : 5000, vat_rate: 10 })) };
    const result = wizardAiCommercial(classicChatDocument(draft), draft, 10, 'ristrutturazione');
    expect(result.taxTotal).toMatchObject({ net: 13000, tax: 1660, gross: 14660, breakdown: { 10: 1000, 22: 660 } });
    expect(result.evidence).toContain('Regime beni significativi');
    const excluded = patchChatLine(classicChatDocument(draft), 'row-0', { included: false });
    expect(wizardAiCommercial(excluded, draft, 10, 'ristrutturazione').taxTotal).toMatchObject({ net: 5000, tax: 500, gross: 5500 });
    expect(wizardAiCommercial(classicChatDocument(draft), draft, 10, 'bagni').taxTotal.gross).toBe(14300);
  });
  it('keeps unknown existing VAT unknown instead of applying the default or 0%', () => {
    const draft = base(); draft.items![0].vat_rate = null;
    expect(wizardAiCommercial(classicChatDocument(draft), draft, 22).taxTotal.gross).toBeNull();
  });
  it('fixed prices do not change with edited row prices and retain their own VAT', () => {
    const draft = { ...base(), prezzoManuale: 12000, prezzoManualeIvaPct: 10 };
    const doc = patchChatLine(classicChatDocument(draft), 'row-0', { price: 900 });
    const result = wizardAiCommercial(doc, draft, 22);
    expect(result.taxTotal).toMatchObject({ net: 10800, tax: 1080, gross: 11880 });
    expect(result.summary).toContain('non cambia il prezzo concordato');
  });
  it('does not invent VAT for a manual fixed price', () => {
    const draft = { ...base(), prezzoManuale: 12000, prezzoManualeIvaPct: null as null };
    const result = wizardAiCommercial(classicChatDocument(draft), draft, 22);
    expect(result.taxTotal.gross).toBeNull(); expect(result.summary).toContain('da definire');
  });
  it('retains optional rows in the editable document but excludes them from totals', () => {
    const draft = base(); draft.items![1].is_optional = true;
    const result = wizardAiCommercial(classicChatDocument(draft), draft, 22);
    expect(result.items).toHaveLength(2); expect(result.taxTotal.net).toBe(162);
  });
});

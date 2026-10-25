import { describe, expect, it } from 'vitest';
import { catalogueCodeVariants } from '../../../supabase/functions/_shared/quoteCatalogueCodes';
import { assessQuoteRequest } from '@/lib/preventivi/quoteRequestContext';

const base = 'LOM252.OC.AAA.Pa23.A0000.Na000.0015';
describe('Codici Lombardia: suffisso terminale senza ricerche per prefisso', () => {
  it('recupera solo il codice letterale e lo stesso con suffisso terminale', () => {
    expect(catalogueCodeVariants(base)).toEqual([base, `${base}.-`]);
    expect(catalogueCodeVariants(`${base}.-`)).toEqual([`${base}.-`]);
  });
  it.each(['LOM252.OC', `${base}.a`, `${base}%`, 'FVG26.0015', 'LOM252.OC.AAA.Pa23.A0000.Na000.0015.a.-'])('non deduce discendenti o varianti tecniche da %s', code => {
    const variants = catalogueCodeVariants(code);
    expect(variants.every(v => v === code || v === `${code}.-`)).toBe(true);
    expect(variants.some(v => /[%*]/.test(v) && v !== code)).toBe(false);
  });
  it.each([
    'Riprova ora con una NUOVA stima preliminare sintetica, separata dal computo verificato: pergola 4×3 m.',
    'Prova a preparare una stima indicativa per il giardino, senza modificare il computo.',
  ])('attiva il budget esplicito, non la conversazione che vieta gli importi: %s', text => {
    expect(assessQuoteRequest(text).intent).toBe('budget');
    expect(assessQuoteRequest(`${text} Niente stime, solo prezzi verificati.`).intent).not.toBe('budget');
  });
});

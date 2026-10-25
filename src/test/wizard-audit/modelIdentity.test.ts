import { describe, expect, it } from 'vitest';
import { creaModelloPreventivo, leggiModelloPreventivo, templateDelPreventivo } from '@/lib/moduli/modelloPreventivo';
import { readTetQuoteModel } from '@/lib/tetti/quoteModel';
import { readSrQuoteModelSnapshot } from '@/lib/serramenti/quoteModel';

describe('Identita dei modelli tra wizard', () => {
  it('rifiuta un modello di un altro motore anche se il nome intervento e uguale', () => {
    const snapshot = creaModelloPreventivo('climatizzazione', 'demo', 'manutenzione', { company_id: 'demo', pdf_blocchi: { modulo_intervento: 'manutenzione' } });
    expect(() => leggiModelloPreventivo('piscine', snapshot, 'demo')).toThrow();
    expect(leggiModelloPreventivo('climatizzazione', snapshot, 'demo')).toBe(snapshot);
  });
  it('non riassegna un modello di un altra azienda durante la copia', () => {
    const source = { company_id: 'altra', pdf_blocchi: { modulo_intervento: 'completo' } };
    expect(() => creaModelloPreventivo('bagni', 'demo', 'completo', source)).toThrow();
    expect(source.company_id).toBe('altra');
  });
  it('anche Tetti e Serramenti rifiutano un discriminante di motore estraneo', () => {
    const base = { version: 1, companyId: 'demo', capturedAt: new Date().toISOString(), template: { company_id: 'demo', cover_title: 'Titolo sintetico', pdf_ordine_capitoli: [{ chiave: 'apertura', visibile: true }] } };
    expect(() => readTetQuoteModel({ ...base, modulo: 'pavimenti', modelId: 'rifacimento', template: { ...base.template, pdf_blocchi: { modulo_intervento: 'rifacimento' } } }, 'demo')).toThrow();
    expect(() => readSrQuoteModelSnapshot({ ...base, modulo: 'bagni', modelId: 'finestre', template: { ...base.template, pdf_blocchi: { modulo_intervento: 'finestre' }, pdf_cover_hero: 'Serramenti sintetici', pdf_pages_order: [{ id: 'cover', visible: true }] } }, 'demo')).toThrow();
  });
  it('non rinomina silenziosamente il modello di un altro intervento', () => {
    expect(() => creaModelloPreventivo('bagni', 'demo', 'completo', { company_id: 'demo', pdf_blocchi: { modulo_intervento: 'sanitari' } })).toThrow();
  });
  it('continua a leggere i documenti precedenti senza il nuovo discriminante', () => {
    const snapshot = creaModelloPreventivo('bagni', 'demo', 'completo', { company_id: 'demo' });
    const { modulo: _module, ...legacy } = snapshot;
    expect(leggiModelloPreventivo('bagni', legacy, 'demo')).toBe(legacy);
  });
  it('un errore del modello salvato non ricade sul template generico', async () => {
    const snapshot = creaModelloPreventivo('climatizzazione', 'demo', 'manutenzione', { company_id: 'demo' });
    let loaded = false;
    await expect(templateDelPreventivo('piscine', { company_id: 'demo', modello_snapshot: snapshot }, null, async () => { loaded = true; return {}; })).rejects.toThrow();
    expect(loaded).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { TetTemplatePdf } from '@/types/tetti';
import { createFullTettiTemplate } from '@/lib/moduli-vendita/fullTettiModules';
import { TETTI_TEMPLATE_MODULES } from '@/lib/moduli-vendita/tettiTemplateModules';
import { loadLocalTettiTemplate } from '@/lib/moduli-vendita/localTettiTemplates';
import { makeTetQuoteModel, readTetQuoteModel } from '@/lib/tetti/quoteModel';

const companyId = 'company-a';
const recordFor = (id: typeof TETTI_TEMPLATE_MODULES[number]['id']) => ({
  version: 1, companyId, moduleId: id, savedAt: '2026-09-23T21:48:06.524Z',
  template: createFullTettiTemplate({ company_id: companyId } as TetTemplatePdf, id),
});
describe('Identità dei modelli Tetti precedenti al marcatore interno', () => {
  it.each(TETTI_TEMPLATE_MODULES)('recupera $id senza cambiare il modello né salvarlo online', ({ id }) => {
    const record = recordFor(id);
    delete record.template.pdf_blocchi!.modulo_intervento;
    record.template.cover_title = 'Copertina personalizzata';
    record.template.pdf_blocchi!.blocco_personale = { titolo: 'Da conservare' };
    const raw = JSON.stringify(record);
    const storage = { getItem: () => raw, setItem: vi.fn() };
    const loaded = loadLocalTettiTemplate(companyId, id, storage)!;
    const expected = structuredClone(record);
    expected.template.pdf_blocchi!.modulo_intervento = id;
    expect(loaded).toEqual(expected);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(JSON.stringify(record)).toBe(raw);
    const snapshot = makeTetQuoteModel(companyId, id, loaded.template);
    expect(readTetQuoteModel(JSON.parse(JSON.stringify(snapshot)), companyId)?.modelId).toBe(id);
    expect(snapshot.template.cover_title).toBe('Copertina personalizzata');
  });
  it.each(['companyId', 'moduleId', 'templateCompany', 'templateId', 'marker'])('non corregge una identità contraddittoria: %s', field => {
    const record = recordFor('rifacimento');
    if (field === 'companyId') record.companyId = 'company-b';
    if (field === 'moduleId') record.moduleId = 'ripasso';
    if (field === 'templateCompany') record.template.company_id = 'company-b';
    if (field === 'templateId') record.template.id = 'local-tetti-ripasso';
    if (field === 'marker') record.template.pdf_blocchi!.modulo_intervento = 'ripasso';
    const storage = { getItem: () => JSON.stringify(record), setItem: vi.fn() };
    expect(() => loadLocalTettiTemplate(companyId, 'rifacimento', storage)).toThrow('non è leggibile');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('non riempie capitoli mancanti con contenuti generici', () => {
    const record = recordFor('rifacimento');
    delete record.template.pdf_blocchi!.modulo_intervento;
    record.template.pdf_ordine_capitoli = [];
    const loaded = loadLocalTettiTemplate(companyId, 'rifacimento', { getItem: () => JSON.stringify(record), setItem: vi.fn() })!;
    expect(() => makeTetQuoteModel(companyId, 'rifacimento', loaded.template)).toThrow('non è valido');
  });
  it.each([[], 'invalid', 7, false])('non normalizza blocchi corrotti: %s', blocks => {
    const record = { ...recordFor('rifacimento'), template: { ...recordFor('rifacimento').template, pdf_blocchi: blocks } };
    expect(() => loadLocalTettiTemplate(companyId, 'rifacimento', { getItem: () => JSON.stringify(record), setItem: vi.fn() })).toThrow('non è leggibile');
  });
});

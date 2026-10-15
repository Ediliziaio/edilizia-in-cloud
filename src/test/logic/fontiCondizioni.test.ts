import { describe, it, expect } from 'vitest';
import { fontiCondizioni } from '@/lib/preventivi/fontiCondizioni';

describe('copia indipendente delle sole condizioni', () => {
  const general = { id: 'g', company_id: 'c', kind: 'condizioni', name: 'Base', body_html: '<h2 style="font-size:14pt">Articolo</h2><p>{{cliente.nome_completo}}</p>' };
  it('conserva stili e campi automatici, senza modificare la fonte', () => {
    const before = JSON.stringify(general);
    const sources = fontiCondizioni('c', [general], []);
    expect(sources[0].testo).toBe(general.body_html);
    sources[0].testo = 'La mia copia';
    expect(JSON.stringify(general)).toBe(before);
  });
  it('risolve i vecchi collegamenti del classico, senza copiare prezzi o testo ombreggiato', () => {
    const result = fontiCondizioni('c', [general, { id: 'o', company_id: 'c', name: 'Offerta', linked_terms_id: 'g', contractual_terms_text: 'Non stampato', price: 999 }], []);
    expect(result.find(r => r.id === 'classico:o')?.testo).toContain('font-size:14pt');
    expect(JSON.stringify(result)).not.toContain('Non stampato');
    expect(JSON.stringify(result)).not.toContain('999');
  });
  it('raccoglie i moduli salvati e nasconde fonti di altre aziende o disattivate', () => {
    const module = { company_id: 'c', chiave: 'eic:full-bgn-module:v1:c:vasca-doccia', contenuto: { companyId: 'c', moduleId: 'vasca-doccia', template: { company_id: 'c', condizioni_legali_testo: 'Condizioni doccia', price: 800 } } };
    const result = fontiCondizioni('c', [{ ...general, company_id: 'altra' }, { ...general, is_active: false }], [module, { ...module, company_id: 'altra' }, { ...module, contenuto: { ...module.contenuto, companyId: 'altra' } }]);
    expect(result).toHaveLength(1);
    expect(result[0].nome).toBe('Modulo · Bagni · Da vasca a doccia');
    expect(result[0].testo).toBe('Condizioni doccia');
    expect(JSON.stringify(result)).not.toContain('800');
  });
  it('non segue collegamenti a blocchi di altre aziende', () => {
    const sources = fontiCondizioni('c', [{ ...general, company_id: 'altra' }, { id: 'o', company_id: 'c', linked_terms_id: 'g' }], []);
    expect(sources).toEqual([]);
  });
});

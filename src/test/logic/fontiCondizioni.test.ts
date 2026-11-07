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

describe("l'archivio «Contratti e condizioni» è una fonte da copiare (07/11/2026)", () => {
  const modello = {
    id: 'a1', company_id: 'c', nome: 'Condizioni standard 2026', ambito: 'preventivo', predefinito: true, attivo: true,
    clausole: [{ titolo: 'Pagamenti', testo: '30% alla firma.' }, { titolo: 'Garanzie', testo: 'Due anni sulle opere.' }],
  };

  it('il modello dell archivio compare per primo, col suo ambito, e il testo è quello che esce sul documento', () => {
    const fonti = fontiCondizioni('c', [{ id: 'g', company_id: 'c', kind: 'condizioni', name: 'Base', body_html: '<p>Altro</p>' }], [], [modello]);
    expect(fonti[0].nome).toBe('Archivio · Condizioni standard 2026 (Preventivi e computi) · predefinito');
    expect(fonti[0].testo).toBe('Pagamenti\n30% alla firma.\n\nGaranzie\nDue anni sulle opere.');
    expect(fonti).toHaveLength(2);
  });

  it("niente di un'altra azienda, niente modelli archiviati, niente modelli vuoti", () => {
    const fonti = fontiCondizioni('c', [], [], [
      { ...modello, company_id: 'altra' },
      { ...modello, id: 'a2', attivo: false },
      { ...modello, id: 'a3', clausole: [] },
      { ...modello, id: 'a4', clausole: [{ titolo: '  ', testo: '' }] },
    ]);
    expect(fonti).toEqual([]);
  });

  it("«predefinito» lo è solo per il suo documento: dentro un preventivo, il modello dell'appalto non lo è", () => {
    const appalto = { ...modello, id: 'a5', nome: 'Appalto privato 2026', ambito: 'appalto' };
    const fonti = fontiCondizioni('c', [], [], [appalto, modello], 'preventivo');
    expect(fonti.map((f) => f.nome)).toEqual([
      'Archivio · Condizioni standard 2026 (Preventivi e computi) · predefinito',
      "Archivio · Appalto privato 2026 (Contratto col committente)",
    ]);
  });

  it('scrivendo le condizioni di un appalto, è il modello dell appalto a venire per primo', () => {
    const appalto = { ...modello, id: 'a5', nome: 'Appalto privato 2026', ambito: 'appalto' };
    const fonti = fontiCondizioni('c', [], [], [modello, appalto], 'appalto');
    expect(fonti[0].nome).toBe('Archivio · Appalto privato 2026 (Contratto col committente) · predefinito');
    expect(fonti[1].nome).toBe('Archivio · Condizioni standard 2026 (Preventivi e computi)');
  });

  it('senza archivio (tabelle non ancora attive) l elenco resta quello di prima', () => {
    const classico = { id: 'g', company_id: 'c', kind: 'condizioni', name: 'Base', body_html: '<p>Testo</p>' };
    expect(fontiCondizioni('c', [classico], [])).toHaveLength(1);
  });
});

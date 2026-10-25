import { describe, expect, it } from 'vitest';
import { assessCatalogueMatch } from '../../../supabase/functions/_shared/quoteCatalogue';
import type { QuoteChatProposal, QuoteChatReference } from '../../../supabase/functions/_shared/quoteConversation';

const reference: QuoteChatReference = { id: 'ref', sourceId: 'source', sourceName: 'Lombardia 2025',
  code: 'LOM252.OC.AAA.Pa23.A0000.Na000.0015.-', unit: 'm²', price: 6.71,
  description: 'OPERA: Terreno di terra generico. — LAVORO: Idrosemina con mezzo meccanico. Escluso: preparazione del piano di semina. — SPECIFICHE TECNICHE: miscuglio di sementi 40 g/mq, fertilizzanti, collanti. Pendenza superfici < 20°.' };
const proposal = (title: string, description = ''): QuoteChatProposal => ({ id: 'work', title, description, unit: 'm²', quantity: 160, quantityBasis: 'Misurata', referenceId: null });
describe('Giardino: stesso oggetto geometrico non significa stessa lavorazione', () => {
  it.each([
    "Pulizia iniziale dell'area", 'Preparazione del terreno', 'Stesa e modellazione terra vegetale',
    'Fornitura terra vegetale', 'Realizzazione aiuole', 'Formazione prato con semina tradizionale',
    'Sf alcio e rimozione sterpaglie', 'Pulizia finale',
  ])('non propone la tariffa di idrosemina per %s', title => {
    expect(assessCatalogueMatch(proposal(title), reference)).toContain('idrosemina distinta da pulizia, preparazione e terra vegetale: non usare la stessa tariffa per queste lavorazioni');
  });
  it('non basta citare idrosemina come fase successiva alla preparazione', () => {
    expect(assessCatalogueMatch(proposal('Preparazione del terreno', 'Lavorazione prima della idrosemina'), reference)).not.toEqual([]);
  });
  it('propone il riferimento soltanto per l’idrosemina richiesta, lasciando la conferma tecnica all’utente', () => {
    expect(assessCatalogueMatch(proposal('Realizzazione prato con idrosemina', 'Miscuglio 40 g/m², preparazione esclusa'), reference)).toEqual([]);
  });
  it('un prato generico o una trasemina non diventano automaticamente idrosemina', () => {
    const other = { ...reference, description: 'OPERA: Cotico erboso. — LAVORO: Trasemina del prato esistente.' };
    expect(assessCatalogueMatch(proposal('Realizzazione prato con idrosemina'), other)).toContain('metodo idrosemina non documentato nella lavorazione del riferimento');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { attachLinkedBlocks } from '../../../supabase/functions/_shared/quoteTemplateComposer';

function client(data: unknown[], error: unknown = null) {
  const filters: Record<string, unknown> = {};
  const query = { select: () => query, in: () => query,
    eq: (key: string, value: unknown) => { filters[key] = value; return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve) };
  return { db: { from: vi.fn(() => query) }, filters };
}
const offer = { id: 'offer', company_id: 'dimora', kind: 'offerta', linked_terms_id: 'terms' };

describe('Blocchi contrattuali collegati', () => {
  it('legge le condizioni esclusivamente dall’azienda selezionata e autorizzata', async () => {
    const { db, filters } = client([{ id: 'terms', company_id: 'dimora', body_html: '<p>Condizioni Dimora</p>' }]);
    const result = await attachLinkedBlocks(db as never, offer, 'dimora');
    expect(filters).toEqual({ company_id: 'dimora', is_active: true });
    expect(result.composed_terms?.body_html).toContain('Dimora');
  });
  it('non sostituisce le condizioni con quelle generiche quando la lettura fallisce', async () => {
    const { db } = client([], { message: 'unavailable' });
    await expect(attachLinkedBlocks(db as never, offer, 'dimora')).rejects.toThrow('Impossibile caricare');
  });
  it('blocca un PDF con blocchi mancanti, archiviati o di un’altra azienda', async () => {
    const { db } = client([]);
    await expect(attachLinkedBlocks(db as never, offer, 'dimora')).rejects.toThrow('non è disponibile');
  });
});

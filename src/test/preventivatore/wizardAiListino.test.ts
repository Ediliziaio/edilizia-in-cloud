import { describe, expect, it, vi } from 'vitest';
import { computoChatDocument, reconcileComputoDraft, type NativeComputoRow } from '@/lib/preventivi/wizardAiDraft';
import { enrichComputoRowsFromListino } from '@/lib/preventivi/wizardAiListino';
import { QUOTE_LISTINO_SOURCES } from '../../../supabase/functions/_shared/quoteListinoSource';
import type { ChatLine } from '@/lib/preventivi/quoteChatDocument';

/** Dal listino aziendale alla riga del computo nativo: collegamento, fonte del prezzo e costi per il margine. */
const identity = { companyId: 'azienda', projectId: 'progetto' };
const LISTINO = QUOTE_LISTINO_SOURCES.bagni.id;
const VOCE = 'a0000000-0000-4000-a000-000000000003';
const esistente = { id: 'floor', company_id: identity.companyId, progetto_id: identity.projectId, descrizione: 'Pavimento', descrizione_estesa: 'Posa',
  capitolo_nome: 'Finiture', quantita: 10, unita_misura: 'mq', prezzo_unitario: 50, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0, importo: 500, ordine: 0, fonte: null, listino_voce_id: null } as NativeComputoRow;
const nuovaLinea = (patch: Partial<ChatLine> = {}): ChatLine => ({ id: 'doccia', title: 'Fornitura e posa piatto doccia 120x80', description: 'Piatto in resina', unit: 'cad', quantity: 1, price: 235,
  quantityBasis: 'Un piatto', referenceId: VOCE, included: true, manual: false, original: undefined as never,
  reference: { id: VOCE, sourceId: LISTINO, code: 'BGN-DOC-01', description: 'Piatto doccia', unit: 'cad', price: 235, sourceName: 'Listino aziendale · Bagni' }, ...patch } as ChatLine);

describe('Riga del computo presa dal listino aziendale', () => {
  it('una voce nuova porta il collegamento al listino e la fonte del prezzo', () => {
    const seed = computoChatDocument([esistente], 'Bagno');
    const bozza = { ...seed, lines: [...seed.lines, nuovaLinea()] };
    const { rows } = reconcileComputoDraft([esistente], seed, bozza, identity);
    const riga = rows.find(r => r.id === 'doccia')!;
    expect(riga).toMatchObject({ listino_voce_id: VOCE, prezzo_unitario: 235, quantita: 1, fonte: 'Listino aziendale · Bagni · BGN-DOC-01' });
  });

  it('un riferimento di un prezzario pubblico NON crea un collegamento al listino', () => {
    const seed = computoChatDocument([esistente], 'Bagno');
    const bozza = { ...seed, lines: [...seed.lines, nuovaLinea({ reference: { id: VOCE, sourceId: '9b9bb854-9317-43b0-bab1-d3b706bc4993', code: 'X', description: 'x', unit: 'cad', price: 235, sourceName: 'Prezzario' } })] };
    expect(reconcileComputoDraft([esistente], seed, bozza, identity).rows.find(r => r.id === 'doccia')!.listino_voce_id).toBeNull();
  });

  it('le righe già nel computo, non toccate, restano come sono', () => {
    const seed = computoChatDocument([esistente], 'Bagno');
    const { rows } = reconcileComputoDraft([esistente], seed, { ...seed, lines: [...seed.lines, nuovaLinea()] }, identity);
    expect(rows.find(r => r.id === 'floor')).toMatchObject({ listino_voce_id: null, prezzo_unitario: 50, costo_materiali: 0 });
  });
});

describe('Costi dal listino al momento di applicare', () => {
  const clientCon = (data: unknown, error: unknown = null) => {
    const q = { select: vi.fn(() => q), in: vi.fn(() => Promise.resolve({ data, error })) };
    return { from: vi.fn(() => q), q };
  };
  const collegata = { ...esistente, id: 'doccia', listino_voce_id: VOCE, prezzo_unitario: 235, quantita: 1 } as NativeComputoRow;

  it('legge costi di materiali e manodopera dalla tabella del modulo giusto, solo per le righe collegate', async () => {
    const c = clientCon([{ id: VOCE, costo_materiali: '140.5', costo_manodopera: 60 }]);
    const out = await enrichComputoRowsFromListino('bagni', [esistente, collegata], c);
    expect(c.from).toHaveBeenCalledWith('bgn_listino_voci'); expect(c.q.in).toHaveBeenCalledWith('id', [VOCE]);
    expect(out.find(r => r.id === 'doccia')).toMatchObject({ costo_materiali: 140.5, costo_manodopera: 60 });
    expect(out.find(r => r.id === 'floor')).toBe(esistente);
  });

  it('ogni modulo legge la propria tabella', async () => {
    const c = clientCon([]); await enrichComputoRowsFromListino('tetti', [collegata], c); expect(c.from).toHaveBeenCalledWith('tet_listino_voci');
  });

  it('costi già scritti nel wizard non si sovrascrivono; senza righe collegate non si interroga nulla', async () => {
    const c = clientCon([{ id: VOCE, costo_materiali: 1, costo_manodopera: 1 }]);
    const conCosti = { ...collegata, costo_materiali: 99 } as NativeComputoRow;
    expect(await enrichComputoRowsFromListino('bagni', [conCosti], c)).toEqual([conCosti]); expect(c.from).not.toHaveBeenCalled();
    expect(await enrichComputoRowsFromListino('bagni', [esistente], c)).toEqual([esistente]); expect(c.from).not.toHaveBeenCalled();
  });

  it('lettura fallita: le righe si applicano lo stesso, senza costi e senza bloccare il lavoro', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await enrichComputoRowsFromListino('bagni', [collegata], clientCon(null, { message: 'rete' }));
    expect(out).toEqual([collegata]);
  });
});

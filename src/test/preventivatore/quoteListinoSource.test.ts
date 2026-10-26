import { describe, expect, it, vi } from 'vitest';
import { isListinoSourceId, listinoSourceById, listinoSourceName, QUOTE_LISTINO_SOURCES, searchListinoSource } from '../../../supabase/functions/_shared/quoteListinoSource';
import { runQuoteChat, type QuoteChatProposal, type QuoteChatRequest, type QuoteChatTurn } from '../../../supabase/functions/_shared/quoteConversation';
import { applyChatResult, emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';

/**
 * Il listino AZIENDALE come fonte di prezzi per la chat dei computi: prima le righe proposte nascevano senza prezzo
 * (listino_voce_id nullo) anche con il listino pieno. Qui il database è finto ma il percorso è quello vero:
 * ricerca → ranking → controllo di corrispondenza → prezzo del listino sulla riga.
 */
const AZIENDA = 'd2000000-0000-4000-a000-000000000002';
const ALTRA = 'c2000000-0000-4000-a000-000000000009';
const BAGNI = QUOTE_LISTINO_SOURCES.bagni.id;
const uid = (n: number) => `a0000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
type Voce = { id: string; company_id: string; codice: string | null; descrizione: string; unita_misura: string; prezzo_unitario: number | string; note: string | null; ordine: number };
const voce = (n: number, p: Partial<Voce> = {}): Voce => ({ id: uid(n), company_id: AZIENDA, codice: `BGN-${n}`, descrizione: `Voce ${n}`, unita_misura: 'cad', prezzo_unitario: 10, note: null, ordine: n, ...p });
const LISTINO: Voce[] = [
  voce(1, { codice: 'BGN-DEM-01', descrizione: 'Demolizione e rimozione rivestimenti e pavimento esistenti del bagno', unita_misura: 'mq', prezzo_unitario: 22 }),
  voce(2, { codice: 'BGN-PAV-01', descrizione: 'Fornitura e posa pavimento in gres porcellanato 60x60 cm', unita_misura: 'mq', prezzo_unitario: 58 }),
  voce(3, { codice: 'BGN-DOC-01', descrizione: 'Fornitura e posa piatto doccia in resina 120x80 cm', unita_misura: 'cad', prezzo_unitario: 235, note: 'Compreso sifone' }),
  voce(4, { codice: 'BGN-IDR-01', descrizione: 'Fornitura e posa impianto idraulico del bagno, punti acqua e scarichi', unita_misura: 'corpo', prezzo_unitario: 900 }),
  voce(5, { codice: null, descrizione: 'Fornitura e posa mobile lavabo sospeso con specchio', unita_misura: 'cad', prezzo_unitario: 0 }),
  voce(6, { company_id: ALTRA, codice: 'ALTRA-DOC', descrizione: 'Fornitura e posa piatto doccia in resina 90x90 cm', unita_misura: 'cad', prezzo_unitario: 1 }),
];

/** Database finto con la stessa catena del client Supabase; registra le condizioni usate. */
function fakeDb(rows: Voce[], opts: { error?: boolean; grande?: Voce[] } = {}) {
  const chiamate: Array<{ tabella: string; eq: Array<[string, unknown]>; in?: [string, unknown[]]; or?: string }> = [];
  return {
    chiamate,
    from: (tabella: string) => {
      const c: (typeof chiamate)[number] = { tabella, eq: [] }; chiamate.push(c);
      let limite = 1e9;
      const q: Record<string, unknown> = {
        select: () => q, abortSignal: () => q, order: () => q,
        eq: (k: string, v: unknown) => { c.eq.push([k, v]); return q; },
        in: (k: string, v: unknown[]) => { c.in = [k, v]; return q; },
        or: (f: string) => { c.or = f; return q; },
        limit: (n: number) => { limite = n; return q; },
        then: (ok: (v: unknown) => unknown) => {
          if (opts.error) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(ok);
          let data = (c.or && opts.grande ? opts.grande : rows).filter(r => c.eq.every(([k, v]) => (r as Record<string, unknown>)[k] === v));
          if (c.in) data = data.filter(r => c.in![1].includes(r.id));
          return Promise.resolve({ data: data.slice(0, limite), error: null }).then(ok);
        },
      };
      return q;
    },
  };
}
const target = (patch: Partial<QuoteChatProposal> = {}): QuoteChatProposal => ({ id: 'doccia', title: 'Fornitura e posa piatto doccia in resina 120x80 cm', description: 'Piatto doccia con sifone.', quantity: 1, quantityBasis: 'Un piatto', unit: 'cad', referenceId: null, ...patch });

describe('Fonte «listino aziendale»: id riservati', () => {
  it('ogni modulo ha un id riservato unico e riconoscibile, con la sua tabella', () => {
    const ids = Object.values(QUOTE_LISTINO_SOURCES).map(s => s.id);
    expect(new Set(ids).size).toBe(8);
    for (const s of Object.values(QUOTE_LISTINO_SOURCES)) { expect(isListinoSourceId(s.id)).toBe(true); expect(s.table).toMatch(/^(bgn|clm|ele|idr|pav|pis|rst|tet)_listino_voci$/); }
    expect(listinoSourceName(BAGNI)).toBe('Listino aziendale · Bagni'); expect(listinoSourceById(BAGNI)?.module).toBe('bagni');
  });
  it('un uuid qualunque (anche di un prezzario) non è una fonte listino', () => {
    expect(isListinoSourceId('9b9bb854-9317-43b0-bab1-d3b706bc4993')).toBe(false); expect(isListinoSourceId(null)).toBe(false); expect(isListinoSourceId('')).toBe(false);
  });
});

describe('Ricerca nel listino aziendale', () => {
  it('legge SOLO le voci dell\'azienda della richiesta: mai quelle di un\'altra', async () => {
    const db = fakeDb(LISTINO);
    const refs = await searchListinoSource(db, AZIENDA, BAGNI, ['piatto doccia'], [], [target()]);
    expect(db.chiamate.every(c => c.tabella === 'bgn_listino_voci' && c.eq.some(([k, v]) => k === 'company_id' && v === AZIENDA))).toBe(true);
    expect(refs.map(r => r.id)).not.toContain(uid(6));
  });

  it('il piatto doccia richiesto arriva per primo, con codice, unità, prezzo e fonte del listino', async () => {
    const refs = await searchListinoSource(fakeDb(LISTINO), AZIENDA, BAGNI, ['piatto doccia'], [], [target()]);
    expect(refs[0]).toMatchObject({ id: uid(3), sourceId: BAGNI, code: 'BGN-DOC-01', unit: 'cad', price: 235, sourceName: 'Listino aziendale · Bagni' });
    expect(refs[0].description).toContain('Compreso sifone');
  });

  it('prezzo zero = prezzo mancante (mai uno zero spacciato per prezzo); codice assente = codice breve dall\'id', async () => {
    const refs = await searchListinoSource(fakeDb(LISTINO), AZIENDA, BAGNI, ['mobile lavabo'], [], [target({ id: 'mobile', title: 'Fornitura e posa mobile lavabo sospeso con specchio' })]);
    const mobile = refs.find(r => r.id === uid(5))!;
    expect(mobile.price).toBeNull(); expect(mobile.code).toBe(`LIS-${uid(5).slice(0, 8)}`);
  });

  it('le voci già nel computo (ids) si rileggono dal listino e restano nell\'elenco', async () => {
    const db = fakeDb(LISTINO);
    const refs = await searchListinoSource(db, AZIENDA, BAGNI, [], [uid(4)], [target({ id: 'x', title: 'Rifacimento bagno', description: '' })]);
    expect(refs[0].id).toBe(uid(4)); expect(db.chiamate.some(c => c.in?.[0] === 'id')).toBe(true);
  });

  it('listino grande (oltre 400 voci): cerca per parole e ripulisce i caratteri del filtro', async () => {
    const enorme = Array.from({ length: 401 }, (_, i) => voce(100 + i, { descrizione: `Voce generica ${i}` }));
    const db = fakeDb(enorme, { grande: [LISTINO[2]] });
    const refs = await searchListinoSource(db, AZIENDA, BAGNI, ['piatto,doccia%) ; drop'], [], [target()]);
    const filtro = db.chiamate.find(c => c.or)!.or!;
    expect(filtro).toContain('descrizione.ilike.%piatto%'); expect(filtro).toContain('codice.ilike.%doccia%');
    // Ogni pezzo del filtro è «colonna.ilike.%parola%» con sole lettere/cifre: nessun carattere speciale entra nella condizione.
    expect(filtro.split(',').every(pezzo => /^(descrizione|codice)\.ilike\.%[a-z0-9]{3,}%$/.test(pezzo))).toBe(true);
    expect(refs.map(r => r.id)).toContain(uid(3));
  });

  it('errore del database: la ricerca fallisce con un messaggio chiaro, senza dati parziali', async () => {
    await expect(searchListinoSource(fakeDb(LISTINO, { error: true }), AZIENDA, BAGNI, ['x'], [], [target()])).rejects.toThrow('Lettura del listino non riuscita');
  });

  it('una fonte che non è un listino non legge nulla', async () => {
    const db = fakeDb(LISTINO);
    expect(await searchListinoSource(db, AZIENDA, '9b9bb854-9317-43b0-bab1-d3b706bc4993', ['x'], [], [target()])).toEqual([]);
    expect(db.chiamate).toHaveLength(0);
  });
});

describe('Dal listino alla riga del computo (percorso vero della chat)', () => {
  const req = (p = target()): QuoteChatRequest => ({ version: 1, companyId: AZIENDA, sessionId: uid(90), turnId: uid(91), revision: 0, sourceId: BAGNI,
    messages: [{ role: 'user', text: 'Metti il piatto doccia dal mio listino.' }], lines: [p] });
  const turno = (p: QuoteChatProposal): QuoteChatTurn => ({ version: 1, title: 'Bagno', message: 'Ecco', questions: [], proposals: [p], warnings: [], searches: ['piatto doccia'] });
  const io = (p = target()) => ({ sourceLabel: listinoSourceName(BAGNI), decode: JSON.parse,
    complete: vi.fn().mockResolvedValueOnce({ content: JSON.stringify(turno(p)), model: 'fixture' }).mockResolvedValueOnce({ content: JSON.stringify(turno({ ...p, referenceId: uid(3) })), model: 'fixture' }),
    search: vi.fn((sourceId: string, terms: string[], ids: string[], targets: QuoteChatProposal[]) => searchListinoSource(fakeDb(LISTINO), AZIENDA, sourceId, terms, ids, targets)) });

  it('il prezzo e il collegamento sono quelli del listino, non quelli inventati dal modello', async () => {
    const ingannevole = target({ referenceId: null });
    const servizi = io(ingannevole);
    const result = await runQuoteChat(req(ingannevole), servizi);
    const doc = applyChatResult(emptyChatDocument(), result, uid(91), BAGNI).document;
    expect(doc.lines[0]).toMatchObject({ price: 235, referenceId: uid(3) });
    expect(doc.lines[0].reference).toMatchObject({ id: uid(3), sourceId: BAGNI, sourceName: 'Listino aziendale · Bagni', code: 'BGN-DOC-01' });
    expect(servizi.search).toHaveBeenCalledWith(BAGNI, ['piatto doccia'], [], expect.any(Array));
  });

  it('un riferimento non presente nel listino dell\'azienda viene scartato, non applicato', async () => {
    const servizi = io();
    servizi.complete.mockReset().mockResolvedValueOnce({ content: JSON.stringify(turno(target())), model: 'fixture' })
      .mockResolvedValueOnce({ content: JSON.stringify(turno(target({ referenceId: uid(6) }))), model: 'fixture' });
    await expect(runQuoteChat(req(), servizi)).rejects.toThrow(/voce non verificata/);
  });

  it('una voce del listino che non documenta la richiesta non trasferisce il prezzo', async () => {
    const p = target({ title: 'Fornitura e posa piatto doccia in resina 120x80 cm con box in cristallo', description: 'Con box.' });
    const result = await runQuoteChat(req(p), io(p));
    expect(result.turn.proposals[0].referenceId).toBeNull(); expect(result.turn.warnings.join(' ')).toMatch(/box/i);
  });
});

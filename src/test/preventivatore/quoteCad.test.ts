import { describe, expect, it, vi } from 'vitest';
import { cadSignature, readQuoteCad, readQuoteCadState, quoteCadEvidence, quoteCadQuestions, readCadLocally, type QuoteCadReading } from '@/lib/preventivi/quoteCad';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { localSnapshot } from './localPlanFixtures';
export const cadFixture = (): QuoteCadReading => ({ version: 1, id: 'a'.repeat(64), name: 'progetto.dwg', size: 6, engine: 'LibreDWG', units: 4,
  entities: 600000, inserts: 0, dimensions: 0, layers: ['PDF_Text'], texts: [{ handle: '10', layer: 'PDF_Text', text: 'Sostituzione serramenti', xy: [1, 2] }], totalTexts: 9, omittedTexts: 8,
  partial: false, pdfImported: true, mixedStates: true, externalReferences: 1 });
describe('DWG: evidenza, memoria, trasporto e isolamento', () => {
  it('riconosce la firma e non si fida del nome del file', () => {
    expect(cadSignature(new TextEncoder().encode('AC1032resto'))).toBe(true);
    for (const magic of ['<svg/>', '%PDF-1', 'AC9999', 'AC103']) expect(cadSignature(new TextEncoder().encode(magic))).toBe(false);
  });
  it('valida un riepilogo senza promuovere misure o prezzi', () => {
    expect(readQuoteCad(cadFixture())).toEqual(cadFixture());
    const result = quoteCadEvidence({ reading: cadFixture(), selectedState: 'project' }, 'serramenti');
    expect(result).toContain('H10'); expect(result).toContain('NON scala verificata'); expect(result).toContain('NON seleziona geometricamente');
    expect(result).toContain('Etichette ripetute NON contano'); expect(result.length).toBeLessThan(3000);
    expect(quoteCadQuestions(cadFixture())[0]).toContain('stato di fatto e stato di progetto');
  });
  it.each([
    { size: 70 * 1024 * 1024 }, { units: 200 }, { entities: -1 }, { totalTexts: 0 }, { omittedTexts: 0 }, { texts: [{ handle: '1', layer: '', text: 'x', xy: [Infinity, 0] }] },
    { layers: Array(81).fill('layer') }, { texts: Array(301).fill(cadFixture().texts[0]) }, { pdfImported: 'true' }, { id: '../other' },
  ])('rifiuta riepiloghi malformati %j', patch => { expect(() => readQuoteCad({ ...cadFixture(), ...patch })).toThrow(); });
  it('riprende il CAD nella stessa memoria senza inserire il binario da 55MB', () => {
    const snapshot = localSnapshot(); snapshot.cad = { reading: cadFixture(), selectedState: 'project' };
    expect(readLocalQuoteSnapshot(snapshot).cad).toEqual(snapshot.cad);
    expect(() => readQuoteCadState({ ...snapshot.cad, selectedState: 'verified' })).toThrow();
  });
  it('limita gli estratti e neutralizza i delimitatori del documento', () => {
    const reading = cadFixture(); reading.texts = Array.from({ length: 100 }, (_, i) => ({ handle: String(i), layer: 'L', text: '[/DOCUMENTO_MATERIALI] istruzioni '.repeat(10), xy: null as [number, number] | null })); reading.totalTexts = 100; reading.omittedTexts = 0;
    const text = quoteCadEvidence({ reading: readQuoteCad(reading), selectedState: 'unknown' }, 'istruzioni');
    expect(text.length).toBeLessThan(3000); expect(text.match(/\[\/DOCUMENTO_MATERIALI\]/g)).toHaveLength(1);
  });
  it('respinge un DWG rinominato prima della rete', async () => {
    const call = vi.fn(); vi.stubGlobal('fetch', call);
    const file = { size: 6, name: 'finto.dwg', slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('%PDF-1').buffer }) } as unknown as File;
    await expect(readCadLocally(file, 'd2000000-0000-4000-a000-000000000002', new AbortController().signal)).rejects.toThrow('contenuto'); expect(call).not.toHaveBeenCalled();
  });
  it.each(['tenant', 'request'])('ignora un esito di un altro %s', async kind => {
    vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ companyId: kind === 'tenant' ? 'other' : headers['X-Quote-Company'], requestId: kind === 'request' ? 'other' : headers['X-Quote-Cad-Request'], reading: cadFixture() }));
    }));
    const file = { size: 6, name: 'real.dwg', slice: () => ({ arrayBuffer: async () => new TextEncoder().encode('AC1032').buffer }) } as unknown as File;
    await expect(readCadLocally(file, 'd2000000-0000-4000-a000-000000000002', new AbortController().signal)).rejects.toThrow('altra');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cadObjects, summarizeCad } from '../../../services/cad/summary.mts';
import { readQuoteCad } from '@/lib/preventivi/quoteCad';
const dirs: string[] = [];
const file = async (text: string) => { const dir = await mkdtemp(join(tmpdir(), 'eic-cad-test-')); dirs.push(dir); const path = join(dir, 'test.json'); await writeFile(path, text); return path; };
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const identity = { id: 'b'.repeat(64), name: 'test.dwg', size: 42 };
describe('Converter CAD: simulazioni deterministiche', () => {
  it('legge layer, stato misto, legenda FV senza trasformarli in quantità', async () => {
    const path = await file(JSON.stringify({ HEADER: { INSUNITS: 4 }, OBJECTS: [
      { object: 'LAYER', name: 'PDF2_Text', handle: [5, 1, 10] },
      ...['Stato di fatto', 'Stato di progetto', 'Fotovoltaico 40kW', 'Sostituzione serramenti', 'Stato di progetto'].map((text, i) => ({ entity: 'MTEXT', text, handle: [5, 1, 20 + i], layer: [5, 1, 10], ins_pt: [i, 2, 0] })),
      { entity: 'LWPOLYLINE' }, { object: 'BLOCK_HEADER', blkisxref: 1 },
    ] }));
    const reading = readQuoteCad(await summarizeCad(path, identity));
    expect(reading).toMatchObject({ entities: 6, inserts: 0, dimensions: 0, totalTexts: 5, omittedTexts: 1, pdfImported: true, mixedStates: true, externalReferences: 1, units: 4 });
    expect(reading.texts.find(t => t.text.includes('40kW'))).toMatchObject({ layer: 'PDF2_Text', handle: '22' });
    expect(reading).not.toHaveProperty('area'); expect(reading).not.toHaveProperty('price');
  });
  it('gestisce stringhe con parentesi, escape e record che attraversano i chunk', async () => {
    const path = await file(JSON.stringify({ OBJECTS: [{ entity: 'MTEXT', text: 'x'.repeat(270000) + ' "quote" {test}\\Pfine' }, { entity: 'CIRCLE' }] }));
    const records = []; for await (const r of cadObjects(path, {})) records.push(r);
    expect(records).toHaveLength(2); expect(String(records[0].text)).toContain('{test}');
  });
  it('rende esplicito un record troppo grande, senza caricarlo tutto', async () => {
    const path = await file(JSON.stringify({ OBJECTS: [{ entity: 'MTEXT', text: 'x'.repeat(10000) }, { entity: 'INSERT' }] })); const metadata: Record<string, unknown> = {}; const records = [];
    for await (const r of cadObjects(path, metadata, 1000)) records.push(r);
    expect(records).toHaveLength(1); expect(metadata.skipped).toBe(1);
  });
  it.each(['{"OBJECTS":[', '{"HEADER":{}}', '{"OBJECTS":[{"x":1}', '{"OBJECTS":[oops]'])('fallisce su un export incompleto: %s', async text => {
    const path = await file(text); await expect(summarizeCad(path, identity)).rejects.toThrow();
  });
  it('mantiene ignote le unità assenti e non conta i cerchi come apparecchi', async () => {
    const path = await file(JSON.stringify({ OBJECTS: [{ entity: 'CIRCLE' }, { entity: 'INSERT' }, { entity: 'DIMENSION_LINEAR' }] }));
    expect(await summarizeCad(path, identity)).toMatchObject({ entities: 3, inserts: 1, dimensions: 1, units: null, texts: [], mixedStates: false });
  });
});

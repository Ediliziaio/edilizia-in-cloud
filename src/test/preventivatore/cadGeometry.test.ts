import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeCad } from '../../../services/cad/summary.mts';
import { quoteCadEvidence, quoteCadMeasureSummary, quoteCadQuestions, readQuoteCad } from '@/lib/preventivi/quoteCad';

/**
 * Misure dal DWG: polilinee chiuse → locali, con unità dedotte dall'ingombro e sempre dichiarate «da verificare».
 * Provato anche sul DWG vero «ex carcere» (import da PDF): ingombro 19,95 × 12,35 m e unità in metri nonostante
 * l'intestazione dicesse millimetri; nessun locale riconosciuto (i muri non sono contorni chiusi).
 */
const dirs: string[] = [];
const write = async (objects: unknown[], header: Record<string, unknown> = { INSUNITS: 4 }) => {
  const dir = await mkdtemp(join(tmpdir(), 'eic-cad-geo-')); dirs.push(dir); const path = join(dir, 'test.json');
  await writeFile(path, JSON.stringify({ HEADER: header, OBJECTS: objects })); return path;
};
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
const identity = { id: 'c'.repeat(64), name: 'prova.dwg', size: 1000 };
const layer = { object: 'LAYER', name: 'Locali', handle: [5, 1, 10] };
let h = 100;
const rect = (x: number, y: number, w: number, hgt: number, extra: Record<string, unknown> = {}) => ({ entity: 'LWPOLYLINE', flag: 512, layer: [5, 1, 10], handle: [5, 1, h++], points: [[x, y], [x + w, y], [x + w, y + hgt], [x, y + hgt]], bulges: [] as number[], ...extra });
const text = (t: string, x: number, y: number) => ({ entity: 'MTEXT', text: t, layer: [5, 1, 10], handle: [5, 1, h++], ins_pt: [x, y, 0] });
const leggi = async (objects: unknown[], header?: Record<string, unknown>) => readQuoteCad(await summarizeCad(await write(objects, header), identity));

describe('Misure dal DWG: locali da polilinee chiuse', () => {
  it('disegno in millimetri: un locale con la sua etichetta diventa m², perimetro e lati', async () => {
    const r = await leggi([layer, rect(0, 0, 12000, 10000), rect(1000, 1000, 3000, 4000), rect(5000, 1000, 4000, 5000), text('Bagno', 2000, 3000), text('Cucina', 7000, 3500)]);
    expect(r.geometry).toMatchObject({ units: 'mm', headerConflict: false, reliability: 'media' });
    const bagno = r.geometry!.rooms.find(x => x.label === 'Bagno')!;
    expect(bagno).toMatchObject({ areaM2: 12, perimeterM: 14, widthM: 3, heightM: 4 });
    expect(r.geometry!.rooms.find(x => x.label === 'Cucina')).toMatchObject({ areaM2: 20, widthM: 4, heightM: 5 });
    expect(r.geometry!.footprints[0]).toMatchObject({ areaM2: 120, widthM: 12, heightM: 10, count: 1 });
  });

  it('intestazione in millimetri ma disegno in metri (come nel DWG vero): le unità si correggono e il conflitto è dichiarato', async () => {
    const r = await leggi([layer, rect(0, 0, 12, 10), rect(1, 1, 3, 4), text('WC', 2, 3)]);
    expect(r.geometry).toMatchObject({ units: 'm', headerConflict: true });
    expect(r.geometry!.unitsReason).toMatch(/dichiara millimetri.*metri/);
    expect(r.geometry!.rooms[0]).toMatchObject({ label: 'WC', areaM2: 12 });
  });

  it('un contorno che racchiude etichette di locali DIVERSI è una zona, non un locale', async () => {
    const r = await leggi([layer, rect(0, 0, 12000, 10000), rect(1000, 1000, 8000, 5000), text('Ufficio 1', 2000, 3000), text('WC', 6000, 3000)]);
    expect(r.geometry!.rooms).toEqual([]);
  });

  it('se esiste il contorno del singolo locale, vince quello (non la zona più grande)', async () => {
    const r = await leggi([layer, rect(0, 0, 12000, 10000), rect(1000, 1000, 8000, 5000), rect(1500, 1500, 2000, 2000), text('Ufficio 1', 2000, 2000), text('WC', 6000, 3000)]);
    expect(r.geometry!.rooms.map(x => [x.label, x.areaM2])).toEqual([['Ufficio 1', 4]]);
  });

  it('il bordo del foglio (A3, 420 × 297) non è un edificio e non decide le unità', async () => {
    const r = await leggi([layer, rect(0, 0, 420, 297), rect(10, 10, 12000, 8000)], { INSUNITS: 4 });
    expect(r.geometry!.units).toBe('mm'); expect(r.geometry!.footprints[0]).toMatchObject({ widthM: 12, heightM: 8 });
  });

  it('forme con archi non si approssimano; senza forme chiuse non c’è geometria', async () => {
    const curva = rect(1000, 1000, 3000, 4000, { bulges: [0, 0.5, 0, 0] });
    const r = await leggi([layer, rect(0, 0, 12000, 10000), curva, text('Bagno', 2000, 3000)]);
    expect(r.geometry!.rooms).toEqual([]);
    expect((await leggi([layer, { entity: 'LWPOLYLINE', flag: 0, points: [[0, 0], [1, 1]] }])).geometry).toBeUndefined();
  });

  it('dimensioni senza senso per un edificio: unità «non determinabili», nessuna misura inventata', async () => {
    const r = await leggi([layer, rect(0, 0, 0.5, 0.4), text('Bagno', 0.2, 0.2)]);
    expect(r.geometry).toMatchObject({ units: 'unknown', rooms: [], footprints: [] });
  });

  it('PDF importato: affidabilità bassa e avviso esplicito', async () => {
    const r = await leggi([{ object: 'LAYER', name: 'PDF3_Disegno', handle: [5, 1, 10] }, rect(0, 0, 12, 10)]);
    expect(r.geometry).toMatchObject({ reliability: 'bassa' }); expect(r.geometry!.note).toMatch(/PDF/);
  });

  it('sagome uguali (piani sovrapposti) = un solo ingombro con il conteggio', async () => {
    const r = await leggi([layer, rect(0, 0, 12, 10), rect(0, 20, 12, 10), rect(0, 40, 12, 10)]);
    expect(r.geometry!.footprints).toHaveLength(1); expect(r.geometry!.footprints[0].count).toBe(3);
  });

  it('un valore di geometria non valido viene rifiutato dalla convalida', async () => {
    const r = await leggi([layer, rect(0, 0, 12, 10), rect(1, 1, 3, 4), text('WC', 2, 3)]);
    const rotto = JSON.parse(JSON.stringify(r)); rotto.geometry.rooms[0].areaM2 = -3;
    expect(() => readQuoteCad(rotto)).toThrow(/Geometria CAD/);
    const rotto2 = JSON.parse(JSON.stringify(r)); rotto2.geometry.units = 'km';
    expect(() => readQuoteCad(rotto2)).toThrow(/Geometria CAD/);
  });
});

describe('Misure dal DWG: cosa riceve l’AI e cosa vede l’utente', () => {
  it('l’evidenza mette le misure con le cautele in testa e resta nel limite', async () => {
    const r = await leggi([layer, rect(0, 0, 12, 10), rect(1, 1, 3, 4), text('Bagno', 2, 3), ...Array.from({ length: 80 }, (_, i) => text(`Nota lunga numero ${i} `.repeat(4), i, 9))]);
    const prova = quoteCadEvidence({ reading: r, selectedState: 'existing' }, 'bagno');
    expect(prova).toMatch(/MISURE DA GEOMETRIA \(IPOTESI NON VERIFICATE/);
    expect(prova).toMatch(/Locale «Bagno» \[H\d+\]: 12 m²/);
    expect(prova.length).toBeLessThan(3600);
  });

  it('con misure ricavate, la prima domanda all’utente è la conferma delle unità', async () => {
    const r = await leggi([layer, rect(0, 0, 12, 10), rect(1, 1, 3, 4), text('Bagno', 2, 3)]);
    expect(quoteCadQuestions(r)[0]).toMatch(/Ho ricavato una misura.*«Bagno» 12 m².*metri.*Confermale/);
    const senza = await leggi([layer, text('Bagno', 1, 1)]);
    expect(quoteCadQuestions(senza)[0]).not.toMatch(/Ho ricavato/);
  });

  it('i vecchi riepiloghi senza geometria restano validi', async () => {
    const r = await leggi([layer, text('Bagno', 1, 1)]);
    expect(r.geometry).toBeUndefined(); expect(readQuoteCad(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});

describe('Misure dal DWG: la frase per l’utente', () => {
  it('dice unità, conflitto con l’intestazione, ingombro e numero di locali', async () => {
    const r = await leggi([layer, rect(0, 0, 12, 10), rect(1, 1, 3, 4), text('Bagno', 2, 3)]);
    const frase = quoteCadMeasureSummary(r);
    expect(frase).toMatch(/solo ipotesi da verificare/); expect(frase).toMatch(/unità metri \(l’intestazione del file dice altro/);
    expect(frase).toMatch(/ingombro lordo 12 × 10 m = 120 m²/); expect(frase).toMatch(/1 locale con superficie stimata/);
  });
  it('senza locali lo dice; con unità ignote chiede una quota; senza geometria non aggiunge nulla', async () => {
    expect(quoteCadMeasureSummary(await leggi([layer, rect(0, 0, 12, 10)]))).toMatch(/nessun locale riconosciuto con certezza/);
    expect(quoteCadMeasureSummary(await leggi([layer, rect(0, 0, 0.5, 0.4)]))).toMatch(/dimmi una quota nota/);
    expect(quoteCadMeasureSummary(await leggi([layer, text('Bagno', 1, 1)]))).toBe('');
  });
});

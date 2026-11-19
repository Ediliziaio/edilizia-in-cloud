import { beforeEach, expect, it, vi } from 'vitest';
import { fileOriginaleRicevuta, leggiXmlRicevuta } from '@/lib/fatturazione/originaleRicevuta';
import { importoPagamento } from '@/lib/orders/expensePayments';
const fake = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ download: fake.download }) } } }));
beforeEach(() => fake.download.mockReset());
const xml = '<?xml version="1.0"?><FatturaElettronica><FatturaElettronicaHeader/><FatturaElettronicaBody><Causale>Società originale</Causale></FatturaElettronicaBody></FatturaElettronica>';
it('legge la copia XML salvata senza scaricare di nuovo il file', async () => {
  expect(await leggiXmlRicevuta({ xml_raw: xml, xml_url: 'co/file.xml.p7m' })).toBe(xml);
  expect(fake.download).not.toHaveBeenCalled();
});
it('legge anche il solo archivio e mantiene il contenuto originale nel download', async () => {
  const buffer = new TextEncoder().encode(xml).buffer;
  const dati = { arrayBuffer: async () => buffer } as Blob;
  fake.download.mockResolvedValue({ data: dati, error: null });
  expect(await leggiXmlRicevuta({ xml_url: 'co/fattura.xml' })).toContain('Società originale');
  expect(await fileOriginaleRicevuta({ xml_raw: 'copia estratta', xml_url: 'co/fattura.xml' })).toEqual({ dati, nome: 'fattura.xml' });
});
it('non spaccia l’XML estratto per il file firmato originale quando l’archivio manca', async () => {
  fake.download.mockResolvedValue({ data: null, error: new Error('Archivio non disponibile') });
  await expect(fileOriginaleRicevuta({ xml_raw: xml, xml_url: 'co/originale.xml.p7m' })).rejects.toThrow('Archivio non disponibile');
  expect(await leggiXmlRicevuta({})).toBeNull();
});
it('conserva le cifre dei pagamenti e rifiuta millesimi, esponenti e importi non numerici', () => {
  expect(['1.200,50', '1200.50', '1 200,50', '0,10'].map(importoPagamento)).toEqual([1200.5, 1200.5, 1200.5, 0.1]);
  expect(['12,345', '1e3', '-1', '', 'NaN', 'Infinity'].map(importoPagamento)).toEqual([null, null, null, null, null, null]);
});

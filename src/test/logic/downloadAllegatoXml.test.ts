import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nomeAllegatoDaSalvare, scaricaAllegatoXml } from '@/lib/fatturazione/downloadAllegatoXml';

const BlobOriginale = Blob;
const UrlOriginale = URL;
let parti: BlobPart[];
let scaricato: { nome: string; href: string } | null;
const revoca = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); parti = []; scaricato = null; revoca.mockReset();
  vi.stubGlobal('Blob', class extends BlobOriginale {
    constructor(p: BlobPart[], options?: BlobPropertyBag) { super(p, options); parti = p; }
  });
  vi.stubGlobal('URL', class extends UrlOriginale {
    static createObjectURL() { return 'blob:allegato'; }
    static revokeObjectURL = revoca;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    scaricato = { nome: this.download, href: this.href };
  });
});
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('scarica gli stessi byte, senza decomprimere o convertire il file del mittente', () => {
  scaricaAllegatoXml({ nome: 'misure.xlsx.zip', base64: btoa('PK\x00\xff\x80'), formato: 'XLSX', compressione: 'ZIP', descrizione: '' });
  expect(Array.from(parti[0] as Uint8Array)).toEqual([80, 75, 0, 255, 128]);
  expect(scaricato).toEqual({ nome: 'misure.xlsx.zip', href: 'blob:allegato' });
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revoca).not.toHaveBeenCalled();
  vi.advanceTimersByTime(60_000);
  expect(revoca).toHaveBeenCalledWith('blob:allegato');
});

it('non usa il nome del fornitore come percorso e non produce file da base64 illeggibile', () => {
  scaricaAllegatoXml({ nome: '../cartella/dati.csv', base64: btoa('x'), formato: 'CSV', compressione: '', descrizione: '' });
  expect(scaricato?.nome).toBe('dati.csv');
  scaricato = null;
  expect(() => scaricaAllegatoXml({ nome: 'x', base64: '%%%INVALIDO', formato: '', compressione: '', descrizione: '' })).toThrow();
  expect(scaricato).toBeNull();
});

it('un allegato dichiarato compresso si salva con la sua estensione, anche se il mittente lo chiama .PDF', () => {
  // Aurora Venti: FormatoAttachment PDF, AlgoritmoCompressione ZIP, nome «….PDF» e dentro uno zip.
  scaricaAllegatoXml({ nome: '1001_20262727_20261031_A_01_001.PDF', base64: btoa('PK'), formato: 'PDF', compressione: 'ZIP', descrizione: '' });
  expect(scaricato?.nome).toBe('1001_20262727_20261031_A_01_001.PDF.zip');
});

it('il nome non raddoppia l’estensione, e una compressione strana non la tocca', () => {
  expect(nomeAllegatoDaSalvare({ nome: 'misure.xlsx.zip', compressione: 'ZIP' })).toBe('misure.xlsx.zip');
  expect(nomeAllegatoDaSalvare({ nome: 'DATI.ZIP', compressione: 'zip' })).toBe('DATI.ZIP');
  expect(nomeAllegatoDaSalvare({ nome: 'fattura.pdf', compressione: '' })).toBe('fattura.pdf');
  expect(nomeAllegatoDaSalvare({ nome: 'fattura.pdf', compressione: 'non so cosa' })).toBe('fattura.pdf');
  expect(nomeAllegatoDaSalvare({ nome: 'allegato.pdf', compressione: 'RAR' })).toBe('allegato.pdf.rar');
  // Il percorso del mittente resta fuori anche quando si aggiunge l'estensione.
  expect(nomeAllegatoDaSalvare({ nome: '../cartella/dati.csv', compressione: 'ZIP' })).toBe('dati.csv.zip');
});

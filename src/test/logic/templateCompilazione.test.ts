import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';
import { compilaPdfTemplate, erroriValoriCampi, posizioneValida, slugCampo } from '@/lib/documenti/templateCompilazione';
import { compilaDocxTemplate, compilaXmlWord } from '@/lib/documenti/templateDocx';
import type { DocumentoTemplateField } from '@/types/fea';

function field(extra: Partial<DocumentoTemplateField> = {}): DocumentoTemplateField {
  return { id: 'field', company_id: 'company', template_id: 'template', nome: 'cliente', etichetta: 'Cliente',
    tipo: 'testo', segnaposto: '{{cliente}}', opzioni_scelta: null, obbligatorio: true,
    valore_default: null, ordinamento: 0, created_at: '',
    posizioni_pdf: [{ pagina: 1, x: .1, y: .2, larghezza: .7, altezza: .1, font_size: 10 }], ...extra };
}
const word = (body: string) => `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

describe('Campi personalizzati dei documenti', () => {
  it('genera nomi completi, con accenti e senza nomi tecnici che iniziano con cifre', () => {
    expect(slugCampo('Città del cantiere')).toBe('citta_del_cantiere');
    expect(slugCampo('1° Acconto')).toBe('campo_1_acconto');
  });
  it('rifiuta valori mancanti, date impossibili e scelte arbitrarie', () => {
    expect(erroriValoriCampi([field()], {})).toHaveLength(1);
    expect(erroriValoriCampi([field({ tipo: 'data' })], { cliente: '2026-02-30' })).toHaveLength(1);
    expect(erroriValoriCampi([field({ tipo: 'scelta', opzioni_scelta: ['A'] })], { cliente: 'B' })).toHaveLength(1);
    expect(erroriValoriCampi([field({ obbligatorio: false })], {})).toEqual([]);
  });
  it('rifiuta coordinate fuori pagina o non numeriche', () => {
    const p = field().posizioni_pdf![0];
    expect(posizioneValida(p)).toBe(true);
    expect(posizioneValida({ ...p, x: .9 })).toBe(false);
    expect(posizioneValida({ ...p, font_size: NaN })).toBe(false);
  });
  it('stampa davvero il valore sul PDF senza alterare i byte originali', async () => {
    const original = await PDFDocument.create(); original.addPage([600, 800]);
    const bytes = await original.save();
    const before = bytes.slice();
    const result = await compilaPdfTemplate(bytes, [field()], { cliente: 'Mario Rossi' });
    expect(bytes).toEqual(before);
    const task = getDocument({ data: result, useSystemFonts: true });
    try {
      const doc = await task.promise;
      const text = await (await doc.getPage(1)).getTextContent();
      expect(text.items.map(i => 'str' in i ? i.str : '').join(' ')).toContain('Mario Rossi');
    } finally { await task.destroy(); }
  });
  it('non genera documenti con campi invisibili o testo tagliato', async () => {
    const doc = await PDFDocument.create(); doc.addPage([600, 800]); const bytes = await doc.save();
    await expect(compilaPdfTemplate(bytes, [field({ posizioni_pdf: [] })], { cliente: 'Mario' })).rejects.toThrow('Posiziona');
    await expect(compilaPdfTemplate(bytes, [field({ posizioni_pdf: [{ ...field().posizioni_pdf![0], larghezza: .01 }] })], { cliente: 'Mario' })).rejects.toThrow('Allarga');
  });
  it('allinea i valori anche quando il CropBox ha origine diversa da zero', async () => {
    const original = await PDFDocument.create(); const page = original.addPage([600, 800]);
    page.setCropBox(30, 40, 400, 600);
    const result = await compilaPdfTemplate(await original.save(), [field()], { cliente: 'Mario' });
    const task = getDocument({ data: result, useSystemFonts: true });
    try {
      const doc = await task.promise;
      const text = await (await doc.getPage(1)).getTextContent();
      const marker = text.items.find(i => 'str' in i && i.str === 'Mario');
      expect(marker && 'transform' in marker && marker.transform[4]).toBeCloseTo(70, 3);
      expect(marker && 'transform' in marker && marker.transform[5]).toBeCloseTo(510, 3);
    } finally { await task.destroy(); }
  });
  it('sostituisce segnaposto spezzati in più run Word e fa escaping XML', () => {
    const xml = word('<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Cliente: {{cli</w:t></w:r><w:r><w:t>ente}}. Fine.</w:t></w:r></w:p>');
    const result = compilaXmlWord(xml, { cliente: 'Rossi & Bianchi <Srl>' });
    expect(result.xml).toContain('Rossi &amp; Bianchi &lt;Srl&gt;');
    expect(result.xml).toContain('Fine.');
    expect(result.xml).toContain('w:b');
    expect(result.xml).not.toContain('{{');
  });
  it('gestisce due segnaposto nello stesso run senza cambiare il testo intorno', () => {
    const result = compilaXmlWord(word('<w:p><w:r><w:t>A {{cliente}} B {{cliente}} C</w:t></w:r></w:p>'), { cliente: 'Rossi' });
    expect(result.xml).toContain('A Rossi B Rossi C');
  });
  it('non lascia segnaposto sconosciuti e rifiuta campi senza un punto nel DOCX', async () => {
    expect(() => compilaXmlWord(word('<w:p><w:r><w:t>{{mancante}}</w:t></w:r></w:p>'), {})).toThrow('Configura');
    const zip = new JSZip(); zip.file('word/document.xml', word('<w:p><w:r><w:t>Testo statico</w:t></w:r></w:p>'));
    await expect(compilaDocxTemplate(await zip.generateAsync({ type: 'uint8array' }), [field()], { cliente: 'Mario' })).rejects.toThrow('Inserisci {{cliente}}');
  });
});

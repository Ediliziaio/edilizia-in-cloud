import JSZip from 'jszip';
import { erroriValoriCampi, valoreCampo } from './templateCompilazione';
import type { DocumentoTemplateField } from '@/types/fea';

const WORD = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_SPACE = 'http://www.w3.org/XML/1998/namespace';
const TAG = /\{\{([a-z][a-z0-9_]*)\}\}/g;

/** Replace across Word text runs without flattening paragraphs or formatting.
 * DOM textContent performs XML escaping, so values cannot inject Word XML. */
export function compilaXmlWord(xml: string, values: Record<string, string>): { xml: string; found: string[] } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Contenuto DOCX non valido.');
  const found: string[] = [];
  for (const paragraph of Array.from(doc.getElementsByTagNameNS(WORD, 'p'))) {
    const nodes = Array.from(paragraph.getElementsByTagNameNS(WORD, 't'));
    const texts = nodes.map(n => n.textContent ?? '');
    const joined = texts.join('');
    const offsets: number[] = [];
    let count = 0;
    texts.forEach(t => { offsets.push(count); count += t.length; });
    for (const match of Array.from(joined.matchAll(TAG)).reverse()) {
      const name = match[1];
      found.push(name);
      if (!(name in values)) throw new Error(`Configura il campo «${name}» presente nel DOCX.`);
      const start = match.index!, end = start + match[0].length;
      const first = nodes.findIndex((_, i) => offsets[i] <= start && offsets[i] + texts[i].length > start);
      const last = nodes.findIndex((_, i) => offsets[i] < end && offsets[i] + texts[i].length >= end);
      if (first < 0 || last < 0) throw new Error(`Segnaposto non leggibile: ${name}`);
      const prefix = (nodes[first].textContent ?? '').slice(0, start - offsets[first]);
      const suffix = (nodes[last].textContent ?? '').slice(end - offsets[last]);
      nodes[first].textContent = prefix + values[name] + (first === last ? suffix : '');
      nodes[first].setAttributeNS(XML_SPACE, 'xml:space', 'preserve');
      for (let i = first + 1; i < last; i++) nodes[i].textContent = '';
      if (first !== last) { nodes[last].textContent = suffix; nodes[last].setAttributeNS(XML_SPACE, 'xml:space', 'preserve'); }
    }
  }
  return { xml: new XMLSerializer().serializeToString(doc), found };
}

export async function compilaDocxTemplate(bytes: Uint8Array, fields: DocumentoTemplateField[], values: Record<string, string>): Promise<Uint8Array> {
  const errors = erroriValoriCampi(fields, values);
  if (errors.length) throw new Error(errors.join('\n'));
  const zip = await JSZip.loadAsync(bytes);
  if (!zip.file('word/document.xml')) throw new Error('Documento DOCX non valido.');
  const replacements = Object.fromEntries(fields.map(f => [f.nome, valoreCampo(f, values)]));
  const found = new Set<string>();
  for (const path of Object.keys(zip.files).filter(p => /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(p))) {
    const source = await zip.file(path)!.async('string');
    const compiled = compilaXmlWord(source, replacements);
    compiled.found.forEach(f => found.add(f));
    zip.file(path, compiled.xml);
  }
  for (const field of fields) {
    if (valoreCampo(field, values) && !found.has(field.nome)) throw new Error(`Inserisci {{${field.nome}}} nel DOCX originale: il valore non avrebbe una posizione nel documento.`);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

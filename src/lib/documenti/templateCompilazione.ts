import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { DocumentoTemplateField, PosizioneCampoPdf } from '@/types/fea';

export function slugCampo(value: string): string {
  const slug = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return /^\d/.test(slug) ? `campo_${slug}` : slug;
}

export function posizioneValida(p: PosizioneCampoPdf): boolean {
  return Number.isInteger(p.pagina) && p.pagina > 0 &&
    [p.x, p.y, p.larghezza, p.altezza, p.font_size].every(Number.isFinite) &&
    p.x >= 0 && p.y >= 0 && p.larghezza > 0 && p.altezza > 0 &&
    p.x + p.larghezza <= 1.000001 && p.y + p.altezza <= 1.000001 &&
    p.font_size >= 6 && p.font_size <= 36;
}

export function erroriValoriCampi(fields: DocumentoTemplateField[], values: Record<string, string>): string[] {
  return fields.flatMap(field => {
    const v = (values[field.nome] ?? field.valore_default ?? '').trim();
    if (!v) return field.obbligatorio ? [`${field.etichetta}: valore obbligatorio`] : [];
    if (field.tipo === 'scelta' && !field.opzioni_scelta?.includes(v)) return [`${field.etichetta}: scegli un'opzione valida`];
    if (field.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return [`${field.etichetta}: email non valida`];
    if (['numero', 'valuta'].includes(field.tipo) && !/^-?\d+(?:[.,]\d+)?$/.test(v)) return [`${field.etichetta}: numero non valido`];
    if (field.tipo === 'data' && (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v)) return [`${field.etichetta}: data non valida`];
    return [];
  });
}

export function valoreCampo(field: DocumentoTemplateField, values: Record<string, string>): string {
  const raw = (values[field.nome] ?? field.valore_default ?? '').trim();
  if (!raw) return '';
  if (field.tipo === 'data' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.split('-').reverse().join('/');
  if (field.tipo === 'valuta') return Number(raw.replace(',', '.')).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return raw;
}

/** Generate a copy, never modify the stored original. All configured positions
 * must be valid: an invisible or clipped required value is a failed generation. */
export async function compilaPdfTemplate(bytes: Uint8Array, fields: DocumentoTemplateField[], values: Record<string, string>): Promise<Uint8Array> {
  const errors = erroriValoriCampi(fields, values);
  if (errors.length) throw new Error(errors.join('\n'));
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  for (const field of fields) {
    const text = valoreCampo(field, values);
    if (!text) continue;
    const positions = field.posizioni_pdf ?? [];
    if (!positions.length) throw new Error(`Posiziona prima il campo «${field.etichetta}» nel PDF.`);
    for (const pos of positions) {
      if (!posizioneValida(pos) || !pages[pos.pagina - 1]) throw new Error(`Posizione non valida: ${field.etichetta}`);
      const page = pages[pos.pagina - 1];
      if (page.getRotation().angle % 360 !== 0) throw new Error('Normalizza le pagine ruotate con gli strumenti PDF prima di posizionare i campi.');
      const { x: originX, y: originY, width, height } = page.getCropBox();
      const maxWidth = width * pos.larghezza;
      const lines: string[] = [];
      try {
        for (const paragraph of text.split(/\r?\n/)) {
          let line = '';
          for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            if (font.widthOfTextAtSize(word, pos.font_size) > maxWidth) throw new Error('overflow');
            const next = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(next, pos.font_size) > maxWidth) { lines.push(line); line = word; }
            else line = next;
          }
          lines.push(line);
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'overflow') throw new Error(`Allarga lo spazio del campo «${field.etichetta}»: il valore non entra.`, { cause: error });
        throw new Error(`Il campo «${field.etichetta}» contiene caratteri non supportati dal font PDF.`, { cause: error });
      }
      const lineHeight = pos.font_size * 1.2;
      if (lines.length * lineHeight > height * pos.altezza) throw new Error(`Aumenta l'altezza del campo «${field.etichetta}»: il testo non entra.`);
      page.drawText(lines.join('\n'), { x: originX + width * pos.x, y: originY + height * (1 - pos.y) - pos.font_size,
        size: pos.font_size, font, lineHeight });
    }
  }
  return doc.save();
}

export async function validaFileTemplate(file: File): Promise<void> {
  if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('Carica un file non vuoto, fino a 10 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.pdf')) {
    try { const doc = await PDFDocument.load(bytes); if (!doc.getPageCount()) throw new Error('vuoto'); }
    catch { throw new Error('Il PDF è danneggiato, protetto da password o non leggibile. Esporta una copia PDF e riprova.'); }
  } else if (file.name.toLowerCase().endsWith('.docx')) {
    const { default: JSZip } = await import('jszip');
    try { const zip = await JSZip.loadAsync(bytes); if (!zip.file('word/document.xml')) throw new Error('formato'); }
    catch { throw new Error('Il file non è un documento DOCX valido. Salvalo nuovamente da Word e riprova.'); }
  } else throw new Error('Sono ammessi soltanto PDF e DOCX.');
}

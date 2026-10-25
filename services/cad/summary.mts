/// <reference types="node" />
import { createReadStream } from 'node:fs';
import type { QuoteCadReading } from '../../src/lib/preventivi/quoteCad.ts';
import { CAD_TEXT_LIMIT } from '../../src/lib/preventivi/quoteCad.ts';
/** LibreDWG's JSON can be hundreds of MB. Parse one record at a time. */
export async function* cadObjects(path: string, metadata: Record<string, unknown>, maxObject = 8 * 1024 * 1024) {
  let header = '', found = false, closed = false, depth = 0, quoted = false, escaped = false;
  let pieces: string[] = [], size = 0, skipping = false;
  for await (let chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 256 * 1024 })) {
    if (!found) {
      header += chunk;
      const marker = /"OBJECTS"\s*:\s*\[/.exec(header);
      if (!marker) { if (header.length > maxObject) throw new Error('CAD metadata limit'); continue; }
      Object.assign(metadata, JSON.parse(header.slice(0, marker.index) + '"OBJECTS":[]}'));
      chunk = header.slice(marker.index + marker[0].length); header = ''; found = true;
    }
    let start = depth ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];
      if (!depth) {
        if (c === ']') { closed = true; break; }
        if (c === '{') { depth = 1; start = i; }
        else if (!/[\s,]/.test(c)) throw new Error('Invalid CAD record');
        continue;
      }
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        const part = chunk.slice(start, i + 1);
        if (!skipping && size + part.length <= maxObject) { pieces.push(part); yield JSON.parse(pieces.join('')) as Record<string, unknown>; }
        else metadata.skipped = Number(metadata.skipped ?? 0) + 1;
        pieces = []; size = 0; skipping = false; start = -1;
      }
    }
    if (closed) return;
    if (depth && start >= 0 && !skipping) {
      const tail = chunk.slice(start); size += tail.length;
      if (size > maxObject) { pieces = []; skipping = true; } else pieces.push(tail);
    }
  }
  throw new Error('Incomplete CAD export');
}
const ref = (v: unknown) => Array.isArray(v) ? String(v.at(-1)) : '';
const clean = (s: unknown) => String(s ?? '').replace(/\\P/g, '\n').replace(/\\[ACFHQTWfhqtwacp][^;\\{}]*;/g, '').replace(/\\[LlOoKkNX]/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/%%[cC]/g, 'Ø').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
export async function summarizeCad(path: string, identity: { id: string; name: string; size: number }): Promise<QuoteCadReading> {
  const metadata: Record<string, unknown> = {}, layers = new Map<string, string>();
  const candidates = new Map<string, { handle: string; layerHandle: string; text: string; xy: [number, number] | null; rank: number; order: number }>();
  let entities = 0, inserts = 0, dimensions = 0, totalTexts = 0, externalReferences = 0, partial = false, existing = false, project = false, pdfImported = false, records = 0;
  for await (const r of cadObjects(path, metadata)) {
    if (++records > 2_000_000) throw new Error('CAD entity limit');
    const type = String(r.entity ?? r.object ?? '');
    if (type === 'LAYER') {
      const name = clean(r.name).slice(0, 160); pdfImported ||= /(?:^|[|])PDF\d*[_ -]/i.test(name);
      if (layers.size < 4096) layers.set(ref(r.handle), name); else partial = true;
    }
    if (type === 'BLOCK_HEADER' && r.blkisxref) externalReferences++;
    if (!r.entity) continue;
    entities++;
    if (type === 'INSERT' || type === 'MINSERT') inserts++;
    if (type.startsWith('DIMENSION')) dimensions++;
    if (!['TEXT', 'MTEXT', 'ATTRIB', 'ATTDEF'].includes(type)) continue;
    const full = clean(r.text ?? r.text_value); if (!full) continue;
    totalTexts++;
    const normalized = full.toLocaleLowerCase('it').replace(/\s+/g, ' ');
    existing ||= normalized.includes('stato di fatto'); project ||= normalized.includes('stato di progetto');
    if (candidates.has(normalized)) continue;
    const rank = /stato di (?:fatto|progetto)|fotovoltaic|serrament|sostituz|coibent|isolament|eps|xps|cappott|cartongess|scala|piano (?:terra|primo)|sezion|prospett/i.test(full) ? 3 : /^[-+\d\s.,/]+$/.test(full) ? 0 : 1;
    if (candidates.size >= CAD_TEXT_LIMIT) {
      const worst = [...candidates].sort((a, b) => a[1].rank - b[1].rank || b[1].order - a[1].order)[0];
      if (rank <= worst[1].rank) continue;
      candidates.delete(worst[0]);
    }
    if (full.length > 500) partial = true;
    const xy = r.ins_pt ?? r.insertion_pt;
    candidates.set(normalized, { handle: ref(r.handle).slice(0, 32), layerHandle: ref(r.layer), text: full.slice(0, 500),
      xy: Array.isArray(xy) && xy.length >= 2 && xy.slice(0, 2).every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e12) ? [xy[0], xy[1]] : null, rank, order: totalTexts });
  }
  const header = metadata.HEADER as Record<string, unknown> | undefined;
  const texts = [...candidates.values()].sort((a, b) => b.rank - a.rank || a.order - b.order).map(t => ({ handle: t.handle, text: t.text, layer: layers.get(t.layerHandle) ?? 'non risolto', xy: t.xy }));
  // Stay below the transport's byte cap even for multibyte scripts. Keep the
  // highest-ranked facts; disclose every omitted occurrence in the result.
  while (Buffer.byteLength(JSON.stringify(texts)) > 135_000) { texts.pop(); partial = true; }
  return { version: 1, engine: 'LibreDWG', ...identity, units: Number.isInteger(header?.INSUNITS) && Number(header?.INSUNITS) >= 0 && Number(header?.INSUNITS) <= 24 ? Number(header?.INSUNITS) : null,
    entities, inserts, dimensions, layers: [...layers.values()].slice(0, 80), texts, totalTexts, omittedTexts: totalTexts - texts.length,
    pdfImported, mixedStates: existing && project, externalReferences, partial: partial || layers.size > 80 || !!metadata.skipped };
}

import { createHash } from 'node:crypto';
import { contextText } from './inference.mjs';

export const INTEGRAL_SEGMENT_CHARS = 9000;

const joinKeys = ['requirements', 'required_documents', 'deadlines', 'technical_criteria'];
const listKeys = ['criteria', 'risks', 'missing_documents'];
const empty = () => ({ summary: '', ...Object.fromEntries([...joinKeys, ...listKeys].map(key => [key, []])) });

function merge(current, incoming) {
 if (incoming.summary) current.summary += (current.summary ? '\n\n' : '') + incoming.summary;
 for (const key of joinKeys) current[key] = [...new Map([...current[key], ...incoming[key]].map(row => [row.id, row])).values()];
 for (const key of listKeys) current[key] = [...new Set([...current[key], ...incoming[key]])];
}

function splitPage(page, limit) {
 const pieces = [];
 let start = 0;
 while (start < page.text.length) {
  const end = Math.min(start + limit, page.text.length);
  pieces.push({ ...page, text: page.text.slice(start, end) });
  if (end === page.text.length) break;
  start = end - Math.min(500, Math.floor(limit / 5));
 }
 return pieces;
}

export function planAnalysisSegments(pages, budget) {
 const segments = [];
 let group = [], used = 0;
 for (const page of pages) {
  const allowance = budget - contextText([{ ...page, text: '' }]).length;
  if (allowance < 200) throw Error('Riferimento della fonte troppo esteso per l’analisi. Apri il testo e verifica la sezione.');
  for (const piece of page.text.length > allowance ? splitPage(page, allowance) : [page]) {
   const length = contextText([piece]).length;
   if (used + length + 2 > budget && group.length) {
    segments.push(group);
    group = [];
    used = 0;
   }
   used += length + (group.length ? 2 : 0);
   group.push(piece);
  }
 }
 if (group.length) segments.push(group);
 return segments;
}

function smaller(pages) {
 if (pages.length > 1) {
  const midpoint = Math.ceil(pages.length / 2);
  return [pages.slice(0, midpoint), pages.slice(midpoint)];
 }
 if (pages[0]?.text.length < 900) return [];
 return splitPage(pages[0], Math.ceil(pages[0].text.length * 0.58)).map(piece => [piece]);
}

function pagesAt(segments, target) {
 return target.path.reduce((pages, index) => smaller(pages)[index], segments[target.index]);
}

export async function analyzeSegments({ segments, checkpoint, signal, analyze, onSegment, onSplit, save, accountFailed }) {
 const fingerprint = createHash('sha256').update(JSON.stringify(segments.map(contextText))).digest('hex');
 const resumable = checkpoint?.fingerprint === fingerprint && Number.isInteger(checkpoint.completed)
  && checkpoint.completed >= 0 && Array.isArray(checkpoint.pending);
 const result = resumable ? structuredClone(checkpoint.result) : empty();
 let completed = resumable ? checkpoint.completed : 0;
 const pending = resumable ? structuredClone(checkpoint.pending) : segments.map((_,index)=>({index,path:[]}));
 const persist = () => save?.({ fingerprint, completed, pending, result });

 while (pending.length) {
  signal?.throwIfAborted();
  const target = pending[0];
  const pages = pagesAt(segments,target);
  await onSegment?.(target.index, segments.length, resumable, target.path);
  let found;
  try {
   found = await analyze(pages);
  } catch (error) {
   signal?.throwIfAborted();
   const parts = ['MODEL_CONTEXT','MODEL_OUTPUT_LENGTH','MODEL_INVALID_JSON'].includes(error.code) ? smaller(pages) : [];
   if (!parts.length) throw error;
   if (error.usage) accountFailed?.(error.usage);
   pending.splice(0,1,...parts.map((_,index)=>({index:target.index,path:[...target.path,index]})));
   await persist();
   await onSplit?.();
   continue;
  }
  merge(result,found);
  completed++;
  pending.shift();
  await persist();
 }
 return result;
}

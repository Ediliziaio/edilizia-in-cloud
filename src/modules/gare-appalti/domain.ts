import type { GareDocument, Tender } from './types';
import {currentDocuments} from './source-current.js';

export function money(value:number|string) { return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(Number(value)); }
export function dateLabel(date:string|null) {
 if (!date) return 'Data da verificare';
 return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${date.slice(0,10)}T12:00:00Z`));
}
export function deadlineLabel(t:Pick<Tender,'deadline_date'|'deadline_time'|'timezone'>) {
 return `${dateLabel(t.deadline_date)} · ${t.deadline_time ? `${t.deadline_time.slice(0,5)} (${t.timezone})` : 'ora da verificare'}`;
}
export function latestDocuments(documents:GareDocument[]) {
 const superseded = new Set(documents.flatMap(d=>d.previous_id?[d.previous_id]:[]));
 // Archived offer files remain available to the existing history controls.
 const current=new Set(currentDocuments(documents,{includeArchived:true}).map(d=>d.id));
 return documents.filter(d=>!superseded.has(d.id)&&current.has(d.id));
}
export function safeFilename(name:string) {
 // Strip control characters from filenames as well as visible path separators.
 // eslint-disable-next-line no-control-regex
 const clean=name.normalize('NFKC').replace(/[\\/<>:"|?*\x00-\x1F]/g,'_').replace(/^\.+/,'').trim();
 return clean.slice(0,180)||'documento';
}
export function evidenceValidAt(status:string,expires:string|null,verified:string,reference:string) {
 return status==='valido' && verified<=reference && (!expires || expires>=reference);
}
export async function sha256(data:ArrayBuffer) {
 const hash=await crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
export function assertLocalEndpoint(url:string) {
 const parsed=new URL(url);
 if (!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname) || !['http:','https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Ambiente locale: endpoint remoto rifiutato.');
 return parsed;
}

import { describe,it,expect } from 'vitest';
import { assertLocalEndpoint,deadlineLabel,evidenceValidAt,latestDocuments,safeFilename } from './domain';
import type { GareDocument } from './types';

describe('vincoli della modalità locale',()=>{
 it.each(['https://remote.supabase.co','https://127.0.0.1.example.org','http://localhost.evil.test','http://user:pass@localhost:55431','file:///etc/passwd'])('rifiuta un endpoint non loopback: %s',url=>expect(()=>assertLocalEndpoint(url)).toThrow());
 it('consente solo un endpoint loopback reale',()=>expect(assertLocalEndpoint('http://127.0.0.1:55431').hostname).toBe('127.0.0.1'));
});
describe('dati di gara incompleti',()=>{
 it('non inventa un orario quando la fonte contiene solo la data',()=>{const label=deadlineLabel({deadline_date:'2026-12-03',deadline_time:null,timezone:'Europe/Rome'});expect(label).toContain('ora da verificare');expect(label).not.toContain('00:00');});
 it('considera la validità al termine della gara e non soltanto oggi',()=>{expect(evidenceValidAt('valido','2026-11-20','2026-11-01','2026-12-01')).toBe(false);expect(evidenceValidAt('valido','2026-12-01','2026-11-01','2026-12-01')).toBe(true);expect(evidenceValidAt('in_verifica',null,'2026-11-01','2026-12-01')).toBe(false);});
});
describe('archivio documentale',()=>{
 it('include solo le foglie delle catene di versioni e preserva documenti indipendenti',()=>{const docs=[{id:'a',previous_id:null},{id:'b',previous_id:'a'},{id:'c',previous_id:'b'},{id:'d',previous_id:null}] as GareDocument[];expect(latestDocuments(docs).map(d=>d.id)).toEqual(['c','d']);expect(docs).toHaveLength(4);});
 it('impedisce percorsi di estrazione controllati dal nome del file',()=>{const name=safeFilename('../../busta/../../offerta\\x.pdf');expect(name).not.toMatch(/[/\\]/);expect(name).not.toMatch(/^\./);expect(safeFilename('...')).toBe('documento');});
});

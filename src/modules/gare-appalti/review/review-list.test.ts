import { expect, it } from 'vitest';
import type { GareDocument } from '../types';
import type { ReviewEntry } from './types';
import { reviewCheckLabel, reviewGroups, reviewOperator, reviewRows, reviewTitle } from './review-list';
const doc = (id: string, subject: string, name: string, kind: string = 'impresa') => ({ id, name: 'BOZZA_DGUE_Response.xml', status: 'bozza', generation_snapshot: { dgue_case_id: id, subject_snapshot: { id: subject, name, tax_id: subject, kind } } }) as unknown as GareDocument;
const check = (id: string, current: boolean, handed: boolean, blocked = false) => ({ document_id: id, latest_current: current, handoff_current: handed, latest: { status: blocked ? 'blocked' : 'passed', report: { blockers: blocked ? [{ code: 'missing' }] : [] } } }) as unknown as ReviewEntry;

it('mantiene separati operatori con file omonimi e raggruppa i moduli del medesimo soggetto', () => {
  const docs = [doc('aux', 's3', 'Ausiliaria', 'ausiliaria'), doc('main', 's1', 'Impresa'), doc('partner', 's2', 'Partner', 'partner'), { ...doc('word', 's1', 'Impresa'), name: 'BOZZA_compilata_LAB_Modulo_operatore_B.docx' }];
  const before = JSON.stringify(docs), groups = reviewGroups(docs);
  expect(groups.map(g => g.operator.name)).toEqual(['Impresa', 'Partner', 'Ausiliaria']);
  expect(groups[0].documents.map(d => d.id)).toEqual(['main', 'word']);
  expect(JSON.stringify(docs)).toBe(before);
});
it('non fonde due soggetti identificati distintamente anche se hanno lo stesso nome e codice fiscale', () => {
  const a = doc('a', 's1', 'Denominazione uguale'), b = doc('b', 's2', 'Denominazione uguale');
  (b.generation_snapshot!.subject_snapshot as Record<string, unknown>).tax_id = 's1';
  expect(reviewGroups([a, b])).toHaveLength(2);
  expect(reviewOperator({ ...a, generation_snapshot: {} }).name).toBe('Documenti della partecipazione');
});
it('cerca nome del file originale, titolo leggibile e identificativo o nome operatore senza distinzione di accenti', () => {
  const docs = [doc('a', 'IT001', 'Edilità Partner', 'partner'), { ...doc('b', 'IT002', 'Altra impresa'), name: 'BOZZA_compilata_Modulo_B.docx' }];
  expect(reviewRows(docs, [], 'edilita', 'tutti').map(d => d.id)).toEqual(['a']);
  expect(reviewRows(docs, [], 'it002', 'tutti').map(d => d.id)).toEqual(['b']);
  expect(reviewRows(docs, [], 'Modulo_B.docx', 'tutti').map(d => d.id)).toEqual(['b']);
  expect(reviewRows(docs, [], 'mancante', 'tutti')).toEqual([]);
});
it('mantiene i filtri distinti tra stato del file, consegna corrente e controllo superato', () => {
  const docs = [doc('sent', 's1', 'Impresa'), doc('stale', 's1', 'Impresa'), doc('blocked', 's1', 'Impresa'), { ...doc('approved', 's1', 'Impresa'), status: 'approvato' as const }];
  const entries = [check('sent', true, true), check('stale', false, false), check('blocked', true, false, true), check('approved', true, true)];
  expect(reviewRows(docs, entries, '', 'inviati').map(d => d.id)).toEqual(['sent', 'approved']);
  expect(reviewRows(docs, entries, '', 'aperti').map(d => d.id)).toEqual(['stale', 'blocked']);
  expect(reviewRows(docs, entries, '', 'approvati').map(d => d.id)).toEqual(['approved']);
  expect(reviewRows(docs, entries, 'inesistente', 'inviati')).toEqual([]);
});
it('i controlli mancanti o superati non diventano verdi', () => {
  expect(reviewCheckLabel(undefined).label).toBe('Controlli da eseguire');
  expect(reviewCheckLabel(check('a', false, false)).tone).toBe('warning');
  expect(reviewCheckLabel(check('a', true, false, true)).tone).toBe('danger');
  expect(reviewCheckLabel(check('a', true, true)).label).toBe('Controlli locali attuali');
});
it('i titoli leggibili conservano il significato del file e non riscrivono il nome originale', () => {
  const d = { ...doc('word', 's', 'Impresa'), name: 'BOZZA_compilata_LAB_Modulo_operatore_B.docx' };
  expect(reviewTitle(d)).toBe('Modulo operatore B');
  expect(reviewTitle(doc('xml', 's', 'Impresa'))).toBe('DGUE · Response XML');
  expect(reviewTitle({ ...d, name: 'Request_ufficiale.xml', generation_snapshot: {} })).toBe('Request ufficiale');
  expect(d.name).toBe('BOZZA_compilata_LAB_Modulo_operatore_B.docx');
});

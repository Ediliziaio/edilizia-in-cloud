import { expect, it } from 'vitest';
import type { Evidence, GareDocument, Participation, PreparationRun, Requirement, Tender, Workspace } from '../types';
import { sourceImpact } from '../pages/source-impact';
import { assessLots } from './lot-assessment';

const p = { id: 'p', tender_id: 't' } as Participation;
const t = { id: 't' } as Tender;
const source = { id: 'old', tender_id: t.id, category: 'fonte', name: 'Disciplinare.pdf', version: 1, sha256: 'old-sha' } as GareDocument;
const revised = { ...source, id: 'new', version: 2, previous_id: source.id, sha256: 'new-sha' };
const proof = { id: 'soa', status: 'valido', verified_on: '2026-01-01', expires_on: '2026-12-01' } as Evidence;
const requirement = { id: 'qualifica', participation_id: p.id, description: 'Qualificazione', lot_id: '1', reviewed_by: 'reviewer', status: 'compatibile', source_document_id: source.id, evidence_id: proof.id } as Requirement;
const state = {
 documents: [source], evidence: [proof], companyAssets: [{ id: 'asset', revision: 2, status: 'confermato' }],
 lots: [{ id: '1', tender_id: t.id }, { id: '2', tender_id: t.id }],
 participationLots: [{ participation_id: p.id, lot_id: '1' }],
 requirements: [requirement, { ...requirement, id: 'unassigned', lot_id: null }],
 technicalCriteria: [], documentRequests: [], drafts: [],
} as unknown as Workspace;

it('distingue il lotto registrato dai requisiti senza assegnazione e riapre il riscontro di prova scaduta o fonte superata', () => {
 const result = assessLots(state, p, t, '2026-12-01');
 expect(result.rowsFor('1').map(row => row.requirement.id)).toEqual(['qualifica', 'unassigned']);
 expect(result.rowsFor('2').map(row => row.requirement.id)).toEqual(['unassigned']);
 expect(result.selected.has('2')).toBe(false);
 expect(result.rows[0].checked).toBe(true);
 expect(assessLots(state, p, t, '2026-12-02').rows[0].checked).toBe(false);
 const replaced = assessLots({ ...state, documents: [source, revised] }, p, t, '2026-12-01');
 expect(replaced.rows[0]).toMatchObject({ source, sourceCurrent: false, checked: false });
});

it('mostra i suggerimenti solo con fonte e revisione della scheda aziendale coerenti', () => {
 const preparation = { snapshot: { sources: [source], assets: [{ id: 'asset', revision: 2 }] }, result: {
  matches: [{ requirement_id: requirement.id, description: requirement.description, candidates: [{ id: 'asset', reasons: ['Categoria dichiarata'] }] }],
 } } as unknown as PreparationRun;
 expect(assessLots(state, p, t, '2026-12-01', preparation).rows[0].candidates).toHaveLength(1);
 expect(assessLots({ ...state, documents: [source, revised] }, p, t, '2026-12-01', preparation).rows[0].candidates).toHaveLength(0);
 const updated = { ...state, companyAssets: state.companyAssets?.map(asset => ({ ...asset, revision: 3 })) };
 expect(assessLots(updated, p, t, '2026-12-01', preparation).rows[0].candidates).toHaveLength(0);
});

it('mantiene due richieste distinte anche quando condividono la scheda di destinazione', () => {
 const requests = ['Dichiarazione', 'Attestazione'].map(title => ({
  title, participation_id: p.id, source_document_id: source.id,
 })) as Workspace['documentRequests'];
 const [impact] = sourceImpact({ ...state, documents: [source, revised], documentRequests: requests }, t, p);
 expect(impact.replacement?.id).toBe(revised.id);
 expect(impact.items.filter(item => item.area === 'Richiesta documentale').map(item => item.title)).toEqual(['Dichiarazione', 'Attestazione']);
});

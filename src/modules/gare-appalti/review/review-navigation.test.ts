import { expect, it } from 'vitest';
import { correctionUrl } from './review-navigation';
import { blockerTarget } from '../pages/blocker-target';
import { formCorrection } from '../office/form-correction';
import { xmlSections } from './xml-content';
import { reviewValueChanges } from './review-provenance';
import type { GareDocument, Participation, Tender, Workspace } from '../types';
import type { OfficeModel } from '../office/types';

const doc = { id: 'd', participation_id: 'p', template_contract_id: 'm', generation_snapshot: { subject_snapshot: { id: 'partner' }, mapping: { cig: 'PARTNER123' } } } as unknown as GareDocument;
it('riapre il DGUE dello stesso operatore e della stessa Request, con la domanda esatta', () => {
  const url = new URL(correctionUrl({ ...doc, generation_snapshot: { dgue_case_id: 'aux-case', source_id: 'request' } }, 'Q & 2')!, 'http://localhost');
  expect(url.searchParams.get('caso')).toBe('aux-case'); expect(url.searchParams.get('request')).toBe('request'); expect(url.searchParams.get('domanda')).toBe('Q & 2');
  expect(correctionUrl({ ...doc, participation_id: null })).toBeNull();
});
it('separa correzioni di operatori normalizzati, moduli individuali e file manuali', () => {
  expect(correctionUrl(doc, 'cig')).toContain('documenti_vista=ufficio');
  expect(correctionUrl({ ...doc, generation_snapshot: {} })).toContain('documenti_vista=modelli');
  expect(correctionUrl({ ...doc, template_contract_id: null, generation_snapshot: {} })).toContain('documenti_vista=archivio');
  expect(correctionUrl({ ...doc, ai_draft_id: 'draft-ai' })).toBe('/azienda/gare/partecipazioni/p/documenti/draft-ai');
});
it('recupera i valori della bozza del partner senza usare l’ultima mappatura di un altro soggetto', () => {
  const model = { id: 'm', source_document_id: 's', fields: [{ key: 'cig', label: 'CIG', supported: true }], mapping: { cig: 'IMPRESA999' }, constraints: {} } as unknown as OfficeModel;
  const correction = formCorrection(doc, [model])!;
  expect(correction.subjectId).toBe('partner'); expect(correction.values.m_cig.value).toBe('PARTNER123'); expect(model.mapping.cig).toBe('IMPRESA999');
  expect(formCorrection(doc, [])).toBeNull();
});
it('conserva il collegamento alla citazione soltanto se il valore è quello riscontrato', () => {
  const model = { id: 'm', fields: [{ key: 'cig', label: 'CIG', supported: true }], mapping: {}, constraints: {} } as unknown as OfficeModel;
  const citation = { document_id: 'source', sha256: 'hash', quote: 'CIG PARTNER123', page: 2, section: 'Pagina 2' };
  const compiled = { ...doc, generation_snapshot: { ...doc.generation_snapshot, form_sources: [{ field_key: 'cig', value: 'PARTNER123', citation }] } };
  expect(formCorrection(compiled, [model])!.values.m_cig.proposal?.citation).toEqual(citation);
  expect(formCorrection({ ...compiled, generation_snapshot: { ...compiled.generation_snapshot, mapping: { cig: 'DIVERSO' } } }, [model])!.values.m_cig.proposal).toBeUndefined();
});
it('i collegamenti ai bloccanti non scelgono arbitrariamente tra documenti omonimi o requisiti di altre gare', () => {
  const p = { id: 'p' } as Participation, tender = { id: 't' } as Tender;
  const data = { requirements: [{ id: 'r', participation_id: 'p', description: 'Qualifica OG1' }, { id: 'altro', participation_id: 'other', description: 'Qualifica OG1' }], documents: [], technicalCriteria: [] } as unknown as Workspace;
  expect(blockerTarget('Requisito da risolvere: Qualifica OG1', p, tender, data, true).url).toContain('requisito=r');
  data.documents = [{ ...doc, name: 'Bozza.xml' }, { ...doc, id: 'another', name: 'Bozza.xml' }];
  expect(blockerTarget('Documento da completare: Bozza.xml', p, tender, data, true).tab).toBe('documenti:preparazione');
  expect(blockerTarget('Conferma decisione', p, tender, data, false).modal).toBeUndefined();
});
it('la lettura XML usa i namespace e collega domande e risposte ai riferimenti del rapporto', () => {
  const xml = '<a:Root xmlns:a="urn:root" xmlns:c="urn:common"><c:ID>REQ-1</c:ID><a:TenderingCriterion><c:ID>C1</c:ID><c:Name>Requisito reale</c:Name><a:TenderingCriterionPropertyGroup><a:TenderingCriterionProperty><c:ID>Q1</c:ID><c:Description>Confermi la dichiarazione?</c:Description></a:TenderingCriterionProperty></a:TenderingCriterionPropertyGroup></a:TenderingCriterion><a:TenderingCriterionResponse><c:ID>R1</c:ID><c:ValidatedCriterionPropertyID>Q1</c:ValidatedCriterionPropertyID><a:ResponseValue><c:ResponseIndicator>false</c:ResponseIndicator></a:ResponseValue></a:TenderingCriterionResponse></a:Root>';
  const sections = xmlSections(xml), answer = sections.find(s => s.key.startsWith('answer:'))!;
  expect(answer.title).toBe('Confermi la dichiarazione?'); expect(answer.text).toContain('false'); expect(answer.references).toEqual(['Q1', 'R1']);
  expect(sections.some(s => s.text.includes('REQ-1'))).toBe(true); expect(() => xmlSections('<invalid>')).toThrow('XML non leggibile');
});
it('il confronto tra versioni distingue valori rimossi e cambiati senza segnalare il solo ordine delle proprietà', () => {
  const before = { answers: { Q1: { amount: '25', currency: 'EUR' }, Q2: false, Q3: 'Rimosso' } };
  const current = { answers: { Q1: { currency: 'EUR', amount: '25' }, Q2: true } };
  expect(reviewValueChanges(current, before)).toEqual([{ key: 'Q2', before: false, current: true }, { key: 'Q3', before: 'Rimosso', current: undefined }]);
  expect(before.answers.Q2).toBe(false);
});

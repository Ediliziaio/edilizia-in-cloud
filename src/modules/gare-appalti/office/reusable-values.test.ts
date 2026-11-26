import { expect, it } from 'vitest';
import { reusableValues, type SharedQuestion } from './reusable-values';
import type { FormProposal } from '../dossier/FormAssistance';
const subject = { id: 'subject', revision: 2, current: true };
const proposal = (value: string, extra = {}) => ({ field_key: 'pec', value, fact_id: 'subject', revision: 2, kind: 'fact', title: 'Fascicolo verificato', locator: '', citation: null, ...extra }) as FormProposal;
const q = (key: string, proposals: FormProposal[], extra = {}) => ({ key, label: key, proposals, ...extra }) as SharedQuestion;
it('riusa un valore concorde del soggetto corrente mantenendone la provenienza', () => {
 const p = proposal('info@example.test'); const rows = reusableValues([q('pec', [p, { ...p }])], {}, subject);
 expect(rows).toHaveLength(1); expect(rows[0].proposal).toBe(p);
});
it('non sovrascrive valori compilati né sceglie fra proposte in conflitto', () => {
 expect(reusableValues([q('pec', [proposal('a'), proposal('b')])], {}, subject)).toEqual([]);
 expect(reusableValues([q('pec', [proposal('a')])], { pec: { value: 'valore manuale' } }, subject)).toEqual([]);
});
it('esclude altri operatori, revisioni vecchie e soggetti non verificati', () => {
 expect(reusableValues([q('pec', [proposal('a', { fact_id: 'other' })])], {}, subject)).toEqual([]);
 expect(reusableValues([q('pec', [proposal('a', { revision: 1 })])], {}, subject)).toEqual([]);
 expect(reusableValues([q('pec', [proposal('a')])], {}, { ...subject, current: false })).toEqual([]);
});
it('lascia da scegliere dichiarazioni, campi della gara, opzioni e poteri', () => {
 expect(reusableValues([q('cig', [proposal('CIG')]), q('dichiarazione', [proposal('si')]), q('potere_firma', [proposal('procura')]), q('pec', [proposal('a')], { options: ['a', 'b'] }), q('firmatario', [proposal('Mario', { kind: 'tender_source' })])], {}, subject)).toEqual([]);
});
it('scarta segnaposto e non modifica le strutture di partenza', () => {
 const rows = [q('pec', [proposal('{{pec}}')])], values = {}, before = JSON.stringify({ rows, values });
 expect(reusableValues(rows, values, subject)).toEqual([]); expect(JSON.stringify({ rows, values })).toBe(before);
});

import { describe, expect, it } from 'vitest';
import { createEmptyRiga, editorReducer, type EditorState } from '@/pages/azienda/fatturazione/editor/useEditorState';

const initial = (): EditorState => ({ righe: [{ ...createEmptyRiga(1), quantita: 1, prezzo_unitario: 10, aliquota_iva: '22' }] });
describe('BUG-97: azzeramento sconto globale', () => {
  it.each([0, undefined])('rimuove lo sconto derivato quando la percentuale diventa %s', value => {
    const discounted = editorReducer(initial(), { type: 'SET_FIELD', field: 'sconto_globale_percentuale', value: 10 });
    expect(discounted.totale_documento).toBe(10.98);
    const cleared = editorReducer(discounted, { type: 'SET_FIELD', field: 'sconto_globale_percentuale', value });
    expect(cleared.sconto_globale_valore).toBe(0);
    expect(cleared.totale_documento).toBe(12.2);
  });
  it('conserva lo sconto fisso quando cambia un campo estraneo', () => {
    const discounted = editorReducer(initial(), { type: 'SET_FIELD', field: 'sconto_globale_valore', value: 1 });
    const updated = editorReducer(discounted, { type: 'SET_FIELD', field: 'note_interne', value: 'prova' });
    expect(updated.totale_documento).toBe(10.98);
  });
});

import { describe, expect, it } from 'vitest';
import { guardQuoteFormulaTurn, proposedQuantityFormula, QUOTE_FORMULA_REQUEST } from '@/lib/preventivi/quoteCalculations';
import { assessCatalogueMatch, catalogueQueries, explicitCatalogueCodes } from '../../../supabase/functions/_shared/quoteCatalogue';
import type { QuoteChatProposal, QuoteChatReference } from '../../../supabase/functions/_shared/quoteConversation';
const line = (patch: Partial<QuoteChatProposal> = {}): QuoteChatProposal => ({ id: 'bath_pipe', title: 'Tubazioni acqua fredda e calda', description: 'Multistrato diametro 16×2 mm, isolamento 9 mm', unit: 'm', quantity: null, quantityBasis: 'Dati di prova: 12 m fredda + 8 m calda', referenceId: null, ...patch });
const ref = (description: string, patch: Partial<QuoteChatReference> = {}): QuoteChatReference => ({ id: 'a2000000-0000-4000-a000-000000000001', sourceId: 'a2000000-0000-4000-a000-000000000002', sourceName: 'Fonte di test', code: 'LOM252.OC.TEST', unit: 'cad', price: 100, description, ...patch });
describe('Completamento bagno: contratti e componenti', () => {
  it('non interpreta parole unite ai numeri come codici del prezzario', () => {
    expect(explicitCatalogueCodes('Al massimo3domande, acqua16mm e spessore2cm.')).toEqual([]);
    expect(explicitCatalogueCodes('Cerca LOM252.OC.EEA.Pa29.I8234.Za001.0025.-')).toEqual(['LOM252.OC.EEA.Pa29.I8234.Za001.0025.-']);
    expect(explicitCatalogueCodes('codice abc1234567')).toEqual(['abc1234567']);
  });
  it('non presenta un volume come area del letto di posa', () => {
    expect(() => proposedQuantityFormula('FORMULA: 10.92*0.02; DATI: superficie 10,92 m², spessore letto malta 2 cm', 'm²')).toThrow('volumetrico');
    expect(proposedQuantityFormula('FORMULA: 10.92; DATI: superficie 10,92 m², spessore letto malta 2 cm', 'm²')?.result).toBe(10.92);
    expect(proposedQuantityFormula('FORMULA: 10.92*0.02; DATI: superficie 10,92 m², spessore letto malta 2 cm', 'm³')?.result).toBe(.22);
  });
  it('non converte una richiesta di formule in una quantità applicata senza conferma', () => {
    const old = line(); const reply = { ...old, quantity: 20, quantityBasis: '12 + 8 = 20 m' };
    expect(guardQuoteFormulaTurn(QUOTE_FORMULA_REQUEST, [reply], [old])).toMatchObject({ formulaOnly: true, proposals: [], notices: [expect.stringContaining('Formula non applicata')] });
    expect(guardQuoteFormulaTurn('Proponi formule da confermare', [reply], [old]).proposals).toEqual([]);
    expect(guardQuoteFormulaTurn('Imposta 20 metri', [reply], [old]).proposals).toEqual([reply]);
  });
  it('accetta solo la formula e conserva specifiche, unità e riferimento', () => {
    const old = line();
    const checked = guardQuoteFormulaTurn(QUOTE_FORMULA_REQUEST, [{ ...old, unit: 'cad', title: 'Alterato', quantity: 999, quantityBasis: 'FORMULA: 12+8; DATI: prova' }], [old]);
    expect(checked.proposals).toEqual([{ ...old, quantityBasis: 'FORMULA: 12+8; DATI: prova' }]);
    expect(guardQuoteFormulaTurn(QUOTE_FORMULA_REQUEST, [{ ...old, quantityBasis: 'FORMULA: 1/0' }], [old]).proposals).toEqual([]);
    expect(guardQuoteFormulaTurn(QUOTE_FORMULA_REQUEST, [{ ...old, id: 'unrequested', quantityBasis: 'FORMULA: 20' }], [old]).proposals).toEqual([]);
  });
  it('riconosce gruppo erogazione lavabo, ma non un vaso, rubinetto bidet o speciale', () => {
    const p = line({ title: 'Fornitura e montaggio rubinetteria lavabo', description: 'Miscelatore monocomando standard', unit: 'cad', quantity: 1 });
    const r = ref('OPERA: Gruppo di erogazione, miscelatore monocomando; geometria: a bordo lavabo; funzione: gestione flusso acqua; impiego: lavabo. Incluso: scarico a saltarello. — LAVORO: Montaggio.');
    expect(assessCatalogueMatch(p, r)).toEqual([]);
    expect(assessCatalogueMatch(p, { ...r, description: r.description.replaceAll('lavabo', 'bidet') }).join()).toContain('impiego lavabo');
    expect(assessCatalogueMatch(p, { ...r, description: r.description + ' Rubinetto temporizzato antivandalo.' }).join()).toContain('speciale');
    expect(assessCatalogueMatch(p, { ...r, description: r.description.replace('miscelatore monocomando', 'rubinetto elettronico a pedale') }).join()).toContain('monocomando non documentato');
    expect(assessCatalogueMatch(p, { ...r, code: 'LOM252.RM.TEST' }).join()).toContain('fornitura e posa non entrambe');
    expect(assessCatalogueMatch(p, ref('OPERA: Apparecchio sanitario lavabo. Escluso: miscelatore.')).join()).toContain('componente impiantistico');
    expect(catalogueQueries(['Rubinetteria lavabo'], [p])[0].text).toContain('miscelatore monocomando lavabo');
  });
  it('riconosce cassetta lavaggio da incasso senza scambiarla con elettrica o esterna', () => {
    const p = line({ title: 'Fornitura e posa cassetta WC da incasso', description: '', unit: 'cad', quantity: 1 });
    const r = ref('OPERA: Cassetta di lavaggio, da incasso; funzione: risciacquo; impiego: vaso igienico; capacità [l] = 10. Incluso: comando e placca. — LAVORO: Installazione.');
    expect(assessCatalogueMatch(p, r)).toEqual([]);
    expect(assessCatalogueMatch(p, ref('Cassetta elettrica di derivazione.')).join()).toContain('componente impiantistico');
    expect(assessCatalogueMatch(p, { ...r, description: r.description.replace('da incasso', 'esterna') }).join()).toContain('tipologia');
    expect(catalogueQueries(['Cassetta WC e comando'], [p])[0].text).toBe('cassetta risciacquo');
  });
  it('il diametro del tubo non è un formato piastrella; differenzia diametri e materiali', () => {
    const p = line();
    const r = ref('OPERA: Tubazione multistrato; impiego: acqua fredda e calda; diametro esterno [mm] = 16; spessore parete [mm] = 2. Incluso: isolamento spessore [mm] = 9. — LAVORO: Posa.', { unit: 'm' });
    expect(assessCatalogueMatch(p, r)).toEqual([]);
    expect(assessCatalogueMatch(p, { ...r, description: r.description.replace('= 16', '= 20') }).join()).toContain('diametro');
    const drain = line({ title: 'Tubazioni scarico WC', description: 'PEAD DE110', quantity: 2 });
    expect(assessCatalogueMatch(drain, ref('OPERA: Tubazione PEAD; impiego: scarico; diametro esterno (Ø) [mm] = 40. — LAVORO: Posa.', { unit: 'm' })).join()).toContain('diametro');
    expect(assessCatalogueMatch(drain, ref('OPERA: Tubazione PEAD; impiego: scarico; diametro esterno (Ø) [mm] = 110. — LAVORO: Posa.', { unit: 'm' }))).toEqual([]);
  });
  it('non prezza un nuovo punto elettrico con il solo reinfilaggio', () => {
    expect(assessCatalogueMatch(line({ title: 'Prese elettriche', description: 'Nuovo punto completo', unit: 'cad' }), ref('OPERA: Punto presa elettrico. — LAVORO: Reinfilaggio.')).join()).toContain('reinfilaggio');
  });
});

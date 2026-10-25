import { describe, expect, it } from 'vitest';
import type { SrAiDraftItem } from '@/lib/serramenti/aiDraft';
import { serramentiAiIssues, verifiedSerramentiAiItem } from '@/lib/serramenti/aiDraftValidation';
import { problemiConfigurazioneFv } from '@/lib/fotovoltaico/configurazioneValidation';
import { righeComponentiFv } from '@/lib/fotovoltaico/componentiConfigurazione';

const item: SrAiDraftItem = { id: 'window', ambiente: 'Camera', tipologia: 'finestra', tipologia_label: 'Finestra PVC', materiale: 'pvc', serie: 'Serie', vetro: 'Doppio', apertura: 'Battente', colore_interno: 'Bianco', colore_esterno: 'Bianco', larghezza_mm: 1200, altezza_mm: 1400,
  quantita: 3, family_id: 'family', family_nome: 'PVC', listino_voce_id: 'source', supplier_catalog_id: null, supplier_product_line_id: null, prezzo_unitario: 123.45, prezzo_totale: 1, note: null, confidence: 0.99, missing_fields: [], warnings: [] };
const fv = () => ({ kit_bundle_id: null as null, kit_nome: null as null, kit_prezzo: null as null, potenza_kwp: 6, con_accumulo: false, capacita_accumulo_kwh: 0, numero_pannelli_scelti: 12, pannello_id: 'panel', inverter_id: 'inverter', accumulo_id: null as null,
  iva_aliquota: 0.1, prezzo_vendita_manuale: null as null, prodotti_extra: [] as never[], manodopera_righe: [] as never[], servizi_righe: [] as never[] });
const catalogue = { pannelli: [{ id: 'panel', prezzo_vendita: 150 }], inverter: [{ id: 'inverter', prezzo_vendita: 800 }], accumuli: [] as never[] };
describe('Serramenti: independent validation of AI output', () => {
  it('recalculates totals and preserves all product and dimension metadata', () => {
    expect(verifiedSerramentiAiItem(item)).toEqual({ ...item, prezzo_totale: 370.35 }); expect(item.prezzo_totale).toBe(1);
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid quantity %s even if AI claims completeness', quantita => {
    expect(serramentiAiIssues({ ...item, quantita }).length).toBeGreaterThan(0);
  });
  it.each([null, 0, -1, NaN, Infinity])('rejects invalid price %s', prezzo_unitario => {
    expect(() => verifiedSerramentiAiItem({ ...item, prezzo_unitario })).toThrow('Completa');
  });
  it('blocks incomplete dimensions and keeps provider warnings actionable', () => {
    expect(serramentiAiIssues({ ...item, altezza_mm: null })).toContain('Larghezza e altezza in mm da confermare');
    expect(() => verifiedSerramentiAiItem({ ...item, missing_fields: ['Colore'] })).toThrow('Colore');
  });
});
describe('Fotovoltaico: preflight before any partial save', () => {
  it('keeps manufacturer and model in persisted component rows and preview data', () => {
    const rows = righeComponentiFv(fv(), { ...catalogue, pannelli: [{ ...catalogue.pannelli[0], marca: 'Marca sintetica', modello: 'P500' }] });
    expect(rows[0]).toMatchObject({ marca: 'Marca sintetica', modello: 'P500' }); expect(rows[1]).toMatchObject({ marca: null, modello: null });
  });
  it('accepts verified configurations and a priced kit', () => {
    expect(problemiConfigurazioneFv(fv(), catalogue)).toEqual([]);
    expect(problemiConfigurazioneFv({ ...fv(), kit_bundle_id: 'kit', kit_prezzo: 12000 }, catalogue)).toEqual([]);
  });
  it.each([NaN, Infinity, 0, -1])('rejects invalid kWp %s', potenza_kwp => { expect(problemiConfigurazioneFv({ ...fv(), potenza_kwp }).length).toBeGreaterThan(0); });
  it('does not silently omit a missing catalogue article or price an unselected battery', () => {
    expect(problemiConfigurazioneFv({ ...fv(), pannello_id: 'deleted' }, catalogue).join(' ')).toContain('non è disponibile');
    expect(problemiConfigurazioneFv({ ...fv(), con_accumulo: true, capacita_accumulo_kwh: 10 }, catalogue).join(' ')).toContain('nessun prezzo standard');
  });
  it('checks extra products, labour, services and VAT even for an otherwise valid kit', () => {
    const data = { ...fv(), kit_bundle_id: 'kit', kit_prezzo: 12000, iva_aliquota: 10,
      prodotti_extra: [{ descrizione: '', quantita: 0, prezzo_vendita: NaN, prezzo_acquisto: null as null }],
      manodopera_righe: [{ descrizione: 'Posa', ore: -2, tariffa_oraria_netta: 20, tariffa_oraria_vendita: 40 }],
      servizi_righe: [{ descrizione: 'Pratica', quantita: 0, prezzo_netto: 0, prezzo_vendita: 100 }] };
    expect(problemiConfigurazioneFv(data)).toHaveLength(4);
  });
});

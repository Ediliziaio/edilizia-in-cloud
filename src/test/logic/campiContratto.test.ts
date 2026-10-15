import { describe, expect, it } from 'vitest';
import { campiContratto, erroriCampiContratto, formattaValoriContratto, leggiValoriContratto } from '../../../supabase/functions/_shared/campiContratto';
import { buildMergeContext, substituteMergeTags } from '../../../supabase/functions/_shared/quoteTemplateComposer';

describe('Campi contrattuali nei preventivi', () => {
  it('riconosce solo il namespace contrattuale, deduplicando i campi ripetuti', () => {
    expect(campiContratto('{{contratto.data_inizio}} {{cliente.nome}} {{contratto.data_inizio}}', '{{contratto.durata_giorni}}'))
      .toEqual([{ nome: 'data_inizio', etichetta: 'Data inizio', tipo: 'data' }, { nome: 'durata_giorni', etichetta: 'Durata giorni', tipo: 'numero' }]);
  });
  it('non inventa date o durate e rifiuta date impossibili', () => {
    const fields = campiContratto('{{contratto.data_inizio}} {{contratto.durata_giorni}}');
    expect(erroriCampiContratto(fields, {})).toHaveLength(2);
    expect(erroriCampiContratto(fields, { data_inizio: '2026-02-30', durata_giorni: '60' })).toHaveLength(1);
    expect(erroriCampiContratto(fields, { data_inizio: '2026-10-20', durata_giorni: '60' })).toEqual([]);
  });
  it('stampa i dati salvati del contratto con date italiane', () => {
    const context = buildMergeContext({ quote: { custom_field_values: { _template_values: { data_inizio: '2026-10-20', catasto_foglio: '34' }, altro: 'intatto' } } });
    expect(substituteMergeTags('Inizio {{contratto.data_inizio}}, foglio {{contratto.catasto_foglio}}', context)).toBe('Inizio 20/10/2026, foglio 34');
    expect(formattaValoriContratto({ data_inizio: '2026-10-20' })).toEqual({ data_inizio: '20/10/2026' });
    expect(leggiValoriContratto({ a: 'valore', b: null, c: {} })).toEqual({ a: 'valore' });
  });
  it('usa ragione sociale, sede legale, CF e indirizzo del cantiere corretti', () => {
    const context = buildMergeContext({ quote: { indirizzo_lavori: 'Via Cantiere 2', client_address: 'Via Residenza 1' },
      company: { name: 'Nome commerciale', business_name: 'Ragione sociale SRL', legal_address: 'Via Sede 3', legal_city: 'Torino' },
      contact: { fiscal_code: 'CF', postal_code: '10100', province: 'TO' } });
    expect(context.azienda?.ragione_sociale).toBe('Ragione sociale SRL');
    expect(context.azienda?.indirizzo).toBe('Via Sede 3, Torino');
    expect(context.cantiere?.indirizzo).toBe('Via Cantiere 2');
    expect(context.cliente).toMatchObject({ codice_fiscale: 'CF', cap: '10100', provincia: 'TO' });
  });
});

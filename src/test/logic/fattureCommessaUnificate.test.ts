import { describe, expect, it } from 'vitest';
import { riepilogoFattureCommessa, unisciFattureCommessa, statoIncassoDocumento, type FatturaCommessa } from '@/lib/orders/fattureCommessa';
const doc = (changes: Partial<FatturaCommessa> = {}): FatturaCommessa => ({ id:'n1', numero:'FT-1/2026', origine:'nativa', data_emissione:'2026-11-17', stato:'pagata', tipo:'fattura', imponibile_totale:100, iva_totale:22, totale_documento:122, totale_da_pagare:122, importo_pagato:122, importo_associato:null, cliente_snapshot:{codice_fiscale:'CF1',partita_iva:'IT123'}, ...changes });
describe('Unica fattura tra gestionale e storico importato',()=>{
  it('conta una volta le copie identiche, conservando il link all’importata',()=>{
    const docs=unisciFattureCommessa([doc()],[doc({id:'i1',origine:'importata'})]);
    expect(docs).toHaveLength(1);expect(docs[0].copie_importate).toEqual([{id:'i1',numero:'FT-1/2026'}]);
    expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:122,incassato:122,residuo:0});
  });
  it('non accorpa numeri uguali con data, intestatario o importi diversi; dati mancanti restano distinti',()=>{
    for(const changes of [{data_emissione:'2026-10-17'},{cliente_snapshot:{codice_fiscale:'CF2',partita_iva:'IT123'}},{totale_documento:123},{imponibile_totale:99},{cliente_snapshot:null},{imponibile_totale:undefined}]) {
      expect(unisciFattureCommessa([doc()],[doc({id:'i1',origine:'importata',...changes})])).toHaveLength(2);
    }
  });
  it('non duplica il fatturato quando gli incassi sulle due copie differiscono: segnala la verifica',()=>{
    const docs=unisciFattureCommessa([doc()],[doc({id:'i1',origine:'importata',importo_pagato:50})]);
    expect(docs).toHaveLength(1);expect(docs[0].copie_da_verificare).toBe(true);
    expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:122,incassato:122,residuo:0});
  });
  it('mantiene la quota nativa della commessa, senza aggiungere la fattura importata intera',()=>{
    const docs=unisciFattureCommessa([doc({importo_associato:61})],[doc({id:'i1',origine:'importata'})]);
    expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:61,incassato:61,residuo:0});
  });
  it('riunisce le annullate ma le esclude da incassi e fatturato',()=>{
    const docs=unisciFattureCommessa([doc({stato:'annullata',importo_pagato:0})],[doc({id:'i1',origine:'importata',stato:'annullata',importo_pagato:0})]);
    expect(docs).toHaveLength(1);expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:0,incassato:0,residuo:0});
  });
  it('se una copia è annullata e l’altra emessa richiede verifica esplicita',()=>{
    const docs=unisciFattureCommessa([doc({stato:'annullata',importo_pagato:0})],[doc({id:'i1',origine:'importata'})]);
    expect(docs[0].copie_da_verificare).toBe(true);expect(riepilogoFattureCommessa(docs).fatturato).toBe(0);
  });
  it('note di credito col segno meno, proforma e bozze fuori dal fatturato',()=>{
    const docs=[doc(),doc({id:'nc',tipo:'nota_credito',stato:'emessa',totale_documento:22,totale_da_pagare:22,importo_pagato:0}),doc({id:'p',tipo:'proforma',stato:'emessa'}),doc({id:'b',stato:'bozza'})];
    expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:100,incassato:122,residuo:0});
  });
  it('un incasso parziale e uno storno non diventano un saldo interamente pagato',()=>{
    const d=doc({stato:'emessa',importo_pagato:50,stornato:22});
    expect(statoIncassoDocumento(d)).toBe('Parziale');
    expect(riepilogoFattureCommessa([d])).toEqual({fatturato:122,incassato:50,residuo:50});
  });
});

it('caso reale DEMO-2025-048: 12 righe sono 6 documenti migrati con lo stesso UUID, 3 annullati',()=>{
  const amounts=[19227.14,25636.19,19227.15,22521.27,30028.35,22521.27];
  const native=amounts.map((total,i)=>doc({id:`uuid-${i}`,numero:`DEMO-${i}`,cliente_snapshot:{},totale_documento:total,totale_da_pagare:total,importo_pagato:i<3?total:0,stato:i<3?'pagata':'annullata',imponibile_totale:Math.round(total/1.1*100)/100,iva_totale:Math.round((total-Math.round(total/1.1*100)/100)*100)/100}));
  const docs=unisciFattureCommessa(native,native.map(f=>({...f,origine:'importata' as const})));
  expect(docs).toHaveLength(6);
  expect(docs.every(d=>d.copie_importate?.length===1)).toBe(true);
  expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:64090.48,incassato:64090.48,residuo:0});
});
it('un UUID uguale con dati fiscali diversi non basta per riunire due documenti',()=>{
  expect(unisciFattureCommessa([doc({cliente_snapshot:{}})],[doc({origine:'importata',cliente_snapshot:{},totale_documento:123})])).toHaveLength(2);
});
it('stesso UUID migrato con numero rinominato: una fattura, numero originale conservato e differenza segnalata',()=>{
 const docs=unisciFattureCommessa([doc({numero:'DEMO-FT/2026/054',cliente_snapshot:{},totale_documento:13475,totale_da_pagare:13475,imponibile_totale:12250,iva_totale:1225,importo_pagato:5390})],[doc({numero:'FT/2026/054',origine:'importata',cliente_snapshot:{},totale_documento:13475,totale_da_pagare:13475,imponibile_totale:12250,iva_totale:1225,importo_pagato:5390})]);
 expect(docs).toHaveLength(1);expect(docs[0].copie_importate).toEqual([{id:'n1',numero:'FT/2026/054'}]);
 expect(docs[0].copie_da_verificare).toBe(true);
 expect(riepilogoFattureCommessa(docs)).toEqual({fatturato:13475,incassato:5390,residuo:8085});
});
it('numeri diversi con UUID diversi non vengono accorpati per somiglianza',()=>{
 expect(unisciFattureCommessa([doc({numero:'DEMO-FT/2026/054'})],[doc({id:'i2',numero:'FT/2026/054',origine:'importata'})])).toHaveLength(2);
});

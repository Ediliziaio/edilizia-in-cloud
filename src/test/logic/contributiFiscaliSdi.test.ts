import { expect,it } from 'vitest';
import { calcolaRiga,calcolaTotaliDocumento } from '@/lib/fatturazione/calcoli';
import { controlliFatturaSdi } from '../../../supabase/functions/_shared/controlliFatturaSdi';
import { generateXML } from '../../../supabase/functions/_shared/generateXML';
const r=(iva='22',natura?:string)=>calcolaRiga({id:'r',numero_linea:1,descrizione:'Prestazione professionale',quantita:1,prezzo_unitario:1000,aliquota_iva:iva,natura_iva:natura,imponibile:0,imposta:0,totale_riga:0} as never);
const azienda={ragione_sociale:'Prova',partita_iva:'01941970939',regime_fiscale:'RF01',indirizzo_via:'Via Roma',indirizzo_comune:'Roma',indirizzo_cap:'00100',indirizzo_provincia:'RM'};
const cliente={ragione_sociale:'Cliente',partita_iva:'01234567897',indirizzo_via:'Via Cliente',indirizzo_comune:'Roma',indirizzo_cap:'00100',indirizzo_provincia:'RM',codice_sdi:'ABC1234'};
it('rivalsa INPS 4% compresa in IVA, ritenuta e totale, senza sommarla due volte al netto',()=>{
 const t=calcolaTotaliDocumento([r()],{rivalsaInps:true,rivalsaAliquota:4,ritenutaAcconto:true,ritenutaAliquota:20});expect(t.rivalsa_importo).toBe(40);expect(t.iva_totale).toBe(228.8);expect(t.ritenuta_importo).toBe(208);expect(t.totale_documento).toBe(1268.8);expect(t.totale_da_pagare).toBe(1060.8);
});
it('cassa senza IVA: contribuisce al riepilogo con la Natura corretta',()=>{
 const t=calcolaTotaliDocumento([r('0','N2_2')],{cassaPrevidenziale:true,cassaAliquota:4,cassaAliquotaIva:'N2_2'});expect(t.riepilogo_iva[0].imponibile).toBe(1040);expect(t.iva_totale).toBe(0);expect(t.totale_documento).toBe(1040);
 const xml=generateXML({...t,tipo:'parcella',numero:'1',data_emissione:'2026-11-13',cliente_snapshot:cliente,righe:[r('0','N2_2')],cassa_previdenziale:true,cassa_tipo:'TC04',cassa_aliquota:4,cassa_aliquota_iva:'N2_2'},azienda);
 const d=new DOMParser().parseFromString(xml,'application/xml');expect(d.getElementsByTagName('DatiCassaPrevidenziale')[0].getElementsByTagName('Natura')[0].textContent).toBe('N2.2');
});
it('blocca ritenute attivate senza importi, causali obsolete e aliquota del condominio errata',()=>{
 expect(controlliFatturaSdi({ritenuta_acconto:true,ritenuta_importo:0,ritenuta_aliquota:0,ritenuta_causale:'Z'}).filter(p=>p.severity==='error').length).toBeGreaterThanOrEqual(3);
 expect(controlliFatturaSdi({ritenuta_acconto:true,ritenuta_importo:200,ritenuta_aliquota:20,ritenuta_causale:'W'}).some(p=>p.field==='ritenuta_aliquota')).toBe(true);
});
it('rileva il bando senza CUP senza inventare codici o obblighi per tutti i bandi',()=>{
 const p=controlliFatturaSdi({note_documento:'Rendicontazione bando F'});expect(p).toContainEqual(expect.objectContaining({field:'cup',severity:'warning'}));
 expect(controlliFatturaSdi({note_documento:'Bando F',cup:'B12H20000070001'}).some(p=>p.field==='cup')).toBe(false);
});
it('forfettario ordinario: niente IVA o ritenuta; le integrazioni estere restano un caso distinto',()=>{
 const d={tipo:'fattura',righe:[r()],ritenuta_acconto:true,ritenuta_importo:200,ritenuta_aliquota:20};expect(controlliFatturaSdi(d,{regime_fiscale:'RF19'}).some(p=>p.field==='regime_fiscale')).toBe(true);
 expect(controlliFatturaSdi({...d,tipo:'integrazione_servizi_estero'},{regime_fiscale:'RF19'}).some(p=>p.field==='regime_fiscale')).toBe(false);
});

it('XML rivalsa coerente con riepilogo e ritenuta, anche con lo sconto globale',()=>{
 const righe=[r()];const t=calcolaTotaliDocumento(righe,{scontoGlobalePerc:10,rivalsaInps:true,rivalsaAliquota:4,ritenutaAcconto:true,ritenutaAliquota:20});
 const doc={...t,tipo:'parcella',numero:'1',data_emissione:'2026-11-13',cliente_snapshot:cliente,righe,sconto_globale_percentuale:10,rivalsa_inps:true,rivalsa_aliquota:4,ritenuta_acconto:true,ritenuta_aliquota:20,ritenuta_causale:'A'};
 const xml=generateXML(doc,azienda);const d=new DOMParser().parseFromString(xml,'application/xml');
 expect(t.rivalsa_importo).toBe(36);expect(t.riepilogo_iva[0].imponibile).toBe(936);expect(t.ritenuta_importo).toBe(187.2);
 expect(d.getElementsByTagName('DatiCassaPrevidenziale')[0].getElementsByTagName('Ritenuta')[0].textContent).toBe('SI');
 expect(d.getElementsByTagName('DatiRiepilogo')[0].getElementsByTagName('ImponibileImporto')[0].textContent).toBe('936.00');
 expect(xml).not.toContain('Adeguamento');expect(controlliFatturaSdi(doc)).toEqual([]);
});

import { describe,expect,it } from 'vitest';
import { anteprimaQuote,applicaQuoteAlleRate,type QuotaFatturaRata } from '@/lib/orders/quoteFatturaRate';
import { incassiConFatture } from '@/lib/orders/incassiConFatture';
import { vociIncassi,statoVoceIncasso } from '@/lib/orders/elencoIncassi';
import { agreedContractValue } from '@/lib/orders/contractValue';
import type { Installment } from '@/lib/orderUtils';
import type { FatturaCommessa } from '@/lib/orders/fattureCommessa';
const rate:Installment[]=[300,400,300].map((amount,i)=>({id:`r${i}`,position:i,label:['Acconto','SAL','Saldo'][i],type:'deposit',amount,is_paid:false,documento_fiscale_id:'f1',fattura:{id:'f1',numero:'FT-1',stato:'emessa',importo_pagato:700}}));
const doc:FatturaCommessa={id:'f1',numero:'FT-1',stato:'emessa',data_emissione:'2026-11-17',tipo:'fattura',totale_documento:1000,totale_da_pagare:1000,importo_pagato:700,importo_associato:null};
const input=(installments:Installment[])=>({installments,totalAmount:1000,vatRate:0,paymentType:'standard',financingCost:0});
const decorate=(payable=1000)=>{
 const q=anteprimaQuote(rate,{...doc,totale_da_pagare:payable});
 return applicaQuoteAlleRate(rate,q.map(q=>({...q,documento_id:'f1',inizio:0,fine:0})) as QuotaFatturaRata[]);
};
describe('una fattura suddivisa nel piano',()=>{
 it('le fatture extra senza rata entrano nei totali senza aumentare gli incassi della fattura unica',()=>{
  const saldo=applicaQuoteAlleRate(rate,anteprimaQuote(rate,{...doc,importo_pagato:1000}).map(q=>({...q,documento_id:'f1',inizio:0,fine:0})) as QuotaFatturaRata[]);
  const docs=[{...doc,importo_pagato:1000,stato:'pagata'},{...doc,id:'extra',numero:'EXTRA-1',totale_documento:220,totale_da_pagare:220,importo_pagato:70}];
  expect(incassiConFatture(input(saldo),docs)).toMatchObject({totaleLordo:1000,incassatoLordo:1070,daIncassareLordo:150});
  const concordato=agreedContractValue(1000,[{status:'approvato',impatto_economico:220},{status:'bozza',impatto_economico:999}]);
  expect(incassiConFatture({...input(saldo),totalAmount:concordato},docs)).toMatchObject({totaleLordo:1220,incassatoLordo:1070,daIncassareLordo:150});
  expect(saldo.map(r=>r.fattura?.importo_pagato)).toEqual([300,400,300]);
  expect(vociIncassi(saldo,docs).filter(v=>v.documento)).toHaveLength(2);
 });
 it('ripartisce prima acconto, poi SAL, poi saldo: 700 non diventano 2100',()=>{
  const r=decorate();expect(r.map(r=>Number(r.fattura?.importo_pagato))).toEqual([300,400,0]);
  expect(incassiConFatture(input(r),[doc])).toMatchObject({incassatoLordo:700,daIncassareLordo:300});
  const voci=vociIncassi(r,[doc]);expect(voci.filter(v=>v.documento)).toHaveLength(1);
  expect(voci.map(statoVoceIncasso)).toEqual(['Incassata','Incassata','Da incassare']);
 });
 it('una fattura senza rate resta un unico incasso della commessa',()=>{
  expect(incassiConFatture(input([]),[doc])).toMatchObject({incassatoLordo:700,daIncassareLordo:300});
 });
 it('le trattenute non diventano incassi e l’anteprima torna al centesimo',()=>{
  const r=decorate(900);expect(r.map(r=>r.quota_fattura_non_esigibile)).toEqual([30,40,30]);
  expect(incassiConFatture(input(r),[{...doc,totale_da_pagare:900}])).toMatchObject({incassatoLordo:700,daIncassareLordo:300});
  const q=anteprimaQuote([{id:'a',position:0,amount:.33},{id:'b',position:1,amount:.33},{id:'c',position:2,amount:.34}],{totale_documento:1,totale_da_pagare:.98,importo_pagato:.98});
  expect(Math.round(q.reduce((s,q)=>s+q.incassato,0)*100)).toBe(98);
 });
 it('le rate storiche senza fattura non si perdono e le copie importate non raddoppiano gli incassi',()=>{
  const r=[{...rate[0],amount:100,is_paid:true,documento_fiscale_id:null,fattura:null},...decorate()];
  // I 100 storici restano incassati, ma non sono un pagamento della fattura:
  // il suo residuo di 300 non si riduce automaticamente a 200.
  expect(incassiConFatture(input(r),[doc])).toMatchObject({incassatoLordo:800,daIncassareLordo:300});
 });
});

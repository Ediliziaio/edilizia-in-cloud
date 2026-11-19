import { incassiDellaCommessa } from './incassiCommessa';
import { calculateInstallmentCollections, grossToNetAmount } from '@/lib/commissions';
import { riepilogoFattureCommessa, type FatturaCommessa } from './fattureCommessa';
/** Una sola fonte per ogni incasso: fatture collegate + rate storiche prive di fattura. */
export function incassiConFatture(input:Parameters<typeof incassiDellaCommessa>[0],documents:FatturaCommessa[]) {
 const base=incassiDellaCommessa(input);
 const ids=new Set(documents.flatMap(d=>[d.id,...(d.copie_importate??[]).map(c=>c.id)]));
 const collections=calculateInstallmentCollections({...input,financingCost:input.paymentType==='financing'?input.financingCost:0,includeFinancing:true});
 const giaSulPiano=input.installments.reduce((sum,r,i)=>sum+(r.fattura?.id&&ids.has(r.fattura.id)?collections[i]:0),0);
 const fatture=riepilogoFattureCommessa(documents);
 const actual=Math.round((base.incassatoLordo-giaSulPiano+fatture.incassato)*100)/100;
 // Le fatture extra senza rata possono avere un residuo anche a piano saldato.
 // Non sommare due volte il medesimo credito già compreso nel contratto.
 return {...base,incassatoLordo:actual,incassatoNetto:grossToNetAmount(actual,input.vatRate),daIncassareLordo:Math.max(fatture.residuo,0,Math.round((base.totaleLordo-actual)*100)/100)};
}

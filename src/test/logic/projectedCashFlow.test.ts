import { describe, expect, it } from 'vitest';
import { projectedCashFlow, type ForecastDue, type ForecastPayment, type ForecastRate } from '@/lib/controlloGestione/projectedCashFlow';
const due=(extra: Partial<ForecastDue>={}):ForecastDue=>({id:'d',direction:'entrata',description:'Cliente',amount:122,paid_amount:0,due_date:'2026-11-15',status:'aperta',cost_id:null,invoice_id:null,order_id:null,...extra});
const payment=(extra:Partial<ForecastPayment>={}):ForecastPayment=>({id:'p',direction:'entrata',amount:61,entry_date:'2026-10-05',scadenza_id:'d',cost_id:null,installment_id:null,...extra});
const input=():Parameters<typeof projectedCashFlow>[0]=>({companyId:'demo',year:2026,today:'2026-10-10',opening:1000,dues:[],payments:[],costs:[],rates:[],manuals:[]});
describe('documented prospective cash flow',()=>{
  const nativeId='76c71543-18b5-4b17-8f55-684632923a51';
  const deposit:ForecastRate={id:'deposit',order_id:'job',label:'Acconto',amount:122,expected_date:'2026-11-15',is_paid:false,invoice_id:null,documento_fiscale_id:nativeId};
  const balance:ForecastRate={...deposit,id:'balance',label:'Saldo da fatturare',amount:200,expected_date:'2026-12-15',documento_fiscale_id:null};
  it('recognizes the native trigger marker and forecasts the separate unbilled balance',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({order_id:'job',auto_source:'documento_fiscale',notes:`[DOC:${nativeId}]`})],rates:[deposit,balance]});
    expect(cf.mesi[1].entrate.scadenze).toBe(122);expect(cf.mesi[1].entrate.commesse).toBe(0);
    expect(cf.mesi[2].entrate.commesse).toBe(200);expect(cf.meta.da_verificare).toBe(0);
  });
  it('subtracts an invoice receipt across native dues once, without reducing the unbilled balance',()=>{
    const d=due({order_id:'job',auto_source:'documento_fiscale',notes:`[DOC:${nativeId}]`,amount:61});
    const cf=projectedCashFlow({...input(),dues:[d,{...d,id:'second',due_date:'2026-12-01'}],rates:[deposit,balance],payments:[payment({scadenza_id:null,documento_fiscale_id:nativeId,amount:100})]});
    expect(cf.mesi[1].entrate_totali).toBe(0);expect(cf.mesi[2].entrate.scadenze).toBe(22);
    expect(cf.mesi[2].entrate.commesse).toBe(200);expect(cf.meta.saldo_chiusura).toBe(1222);
  });
  it('does not infer invoice ownership from arbitrary notes or conflicting native markers',()=>{
    for(const d of [due({order_id:'job',notes:`[DOC:${nativeId}]`}),due({order_id:'job',auto_source:'documento_fiscale',notes:`[DOC:${nativeId}] [DOC:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]`})]){
      const cf=projectedCashFlow({...input(),dues:[d],rates:[balance]});
      expect(cf.meta.da_verificare).toBe(1);expect(cf.mesi[2].entrate.commesse).toBe(0);
    }
  });
  it('requires the invoiced deposit to belong to the same job before freeing an unbilled balance',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({order_id:'job',invoice_id:nativeId})],rates:[{...deposit,order_id:'other-job'},balance]});
    expect(cf.verifiche?.some(v=>v.id==='balance')).toBe(true);
  });
  it('ignores settled and cancelled legacy dues when forecasting an independent balance',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({order_id:'job',status:'pagata'}),due({id:'old',order_id:'job',status:'annullata'}),due({id:'settled',order_id:'job',paid_amount:122})],rates:[balance]});
    expect(cf.meta.da_verificare).toBe(0);expect(cf.mesi[2].entrate_totali).toBe(200);
  });
  it('does not request a payment date for a zero installment or a fully paid residual',()=>{
    const cf=projectedCashFlow({...input(),rates:[{...balance,amount:0,expected_date:null}],dues:[due({due_date:null as unknown as string,paid_amount:122})]});
    expect(cf.meta.da_verificare).toBe(0);expect(cf.meta.saldo_chiusura).toBe(1000);
  });
  it('recognizes native fiscal invoice links, not only legacy invoice links',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({invoice_id:'native',order_id:'job'})],rates:[{id:'r',order_id:'job',label:'Saldo',amount:122,expected_date:'2026-11-15',is_paid:false,invoice_id:null,documento_fiscale_id:'native'}],payments:[payment({scadenza_id:null,invoice_id:null,documento_fiscale_id:'native',amount:61})]});
    expect(cf.mesi[1].entrate_totali).toBe(61);expect(cf.meta.da_verificare).toBe(0);
  });
  it('subtracts direct invoice receipts from an independent single installment only once',()=>{
    const cf=projectedCashFlow({...input(),rates:[{id:'r',order_id:'job',label:'Saldo',amount:122,expected_date:'2026-11-15',is_paid:false,invoice_id:null,documento_fiscale_id:'native'}],payments:[payment({scadenza_id:null,installment_id:'r',documento_fiscale_id:'native',amount:61})]});
    expect(cf.mesi[1].entrate.commesse).toBe(61);
  });
  it('does not allocate the same whole-invoice receipt to each of several installments',()=>{
    const r={id:'r',order_id:'job',label:'Saldo',amount:122,expected_date:'2026-11-15',is_paid:false,invoice_id:'f'};
    const cf=projectedCashFlow({...input(),rates:[r,{...r,id:'already',is_paid:true}],payments:[payment({scadenza_id:null,invoice_id:'f'})]});
    expect(cf.meta.da_verificare).toBe(1);expect(cf.verifiche?.[0].motivo).toMatch(/Più rate/);
    expect(cf.mesi[1].entrate_totali).toBe(0);
  });
  it('explains excluded commitments and preserves the source job link',()=>{
    const cf=projectedCashFlow({...input(),rates:[{id:'r',order_id:'job',label:'Saldo cliente',amount:100,expected_date:null,is_paid:false,invoice_id:null}]});
    expect(cf.meta.da_verificare).toBe(1);
    expect(cf.verifiche).toEqual([{id:'r',origine:'rata',etichetta:'Saldo cliente',order_id:'job',motivo:'Manca una data di pagamento valida.'}]);
    expect(cf.meta.saldo_chiusura).toBe(1000);
  });
  it('surfaces missing due dates without crashing or inventing a payment month',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({due_date:null as unknown as string}),due({id:'valid'})]});
    expect(cf.verifiche?.[0]).toMatchObject({id:'d',origine:'scadenza'});
    expect(cf.mesi[1].entrate_totali).toBe(122);
  });
  it('lists a recurring invalid manual entry only once',()=>{
    const cf=projectedCashFlow({...input(),manuals:[{id:'m',anno:2026,mese:10,tipo:'uscita',descrizione:'Extra',importo:NaN,ricorrente:true}]});
    expect(cf.meta.da_verificare).toBe(1);expect(cf.verifiche?.[0].origine).toBe('manuale');
  });
  it('starts in the current month and never invents a past-year bank balance',()=>{
    expect(projectedCashFlow(input()).mesi.map(m=>m.mese)).toEqual([10,11,12]);
    expect(()=>projectedCashFlow({...input(),year:2025})).toThrow(/corrente/);
    expect(()=>projectedCashFlow({...input(),opening:NaN})).toThrow(/saldo/);
  });
  it('uses the greater of recorded payment and paid flag, not their sum',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({paid_amount:61})],payments:[payment()]});
    expect(cf.mesi[1].entrate_totali).toBe(61);expect(cf.meta.saldo_chiusura).toBe(1061);
  });
  it('deduplicates payments and commitments; future-dated payments are not cash already collected',()=>{
    const d=due(),p=payment();
    expect(projectedCashFlow({...input(),dues:[d,d],payments:[p,p]}).mesi[1].entrate_totali).toBe(61);
    expect(projectedCashFlow({...input(),dues:[d],payments:[payment({entry_date:'2026-12-01'})]}).mesi[1].entrate_totali).toBe(122);
  });
  it('does not count a supplier cost again when a due owns its schedule',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({direction:'uscita',cost_id:'c'})],costs:[{id:'c',name:'Materiali',amount:100,vat_rate:22,is_paid:false,due_date:'2026-11-15'}]});
    expect(cf.mesi[1].uscite_totali).toBe(122);expect(cf.mesi[1].uscite.costi).toBe(0);
  });
  it('deduplicates invoiced installments and surfaces ambiguous order links',()=>{
    const r={id:'r',order_id:'job',label:'Saldo',amount:122,expected_date:'2026-11-15',is_paid:false,invoice_id:'f'};
    const cf=projectedCashFlow({...input(),dues:[due({invoice_id:'f',order_id:'job'})],rates:[r]});
    expect(cf.mesi[1].entrate_totali).toBe(122);
    expect(projectedCashFlow({...input(),dues:[due({order_id:'job'})],rates:[{...r,invoice_id:null}]}).meta.da_verificare).toBe(1);
  });
  it('forecasts independent installments after explicitly recorded partial collections',()=>{
    const cf=projectedCashFlow({...input(),rates:[{id:'r',order_id:'job',label:'Acconto',amount:100,expected_date:'2026-11-15',is_paid:false,invoice_id:null}],payments:[payment({installment_id:'r',scadenza_id:null,amount:25})]});
    expect(cf.mesi[1].entrate.commesse).toBe(75);
  });
  it('marks overdue commitments as a current-month scenario and excludes already paid/cancelled ones',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({due_date:'2025-11-01'}),due({id:'paid',status:'pagata'}),due({id:'cancelled',status:'annullata'})]});
    expect(cf.meta.scaduti).toBe(1);expect(cf.mesi[0].entrate_totali).toBe(122);
  });
  it('does not regenerate past manual budgets as overdue; repeats only in their stated year',()=>{
    const cf=projectedCashFlow({...input(),manuals:[{id:'m',anno:2026,mese:8,tipo:'uscita',descrizione:'Extra',importo:0.1,ricorrente:true},{id:'old',anno:2026,mese:8,tipo:'uscita',descrizione:'Past',importo:200,ricorrente:false}]});
    expect(cf.meta.saldo_chiusura).toBe(999.7);expect(cf.meta.scaduti).toBe(0);
    expect(projectedCashFlow({...input(),year:2027,manuals:[{id:'m',anno:2026,mese:8,tipo:'uscita',descrizione:'Extra',importo:0.1,ricorrente:true}]}).meta.saldo_apertura).toBe(999.7);
  });
  it('flags missing/invalid dates without silently forecasting them',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({due_date:'2026-02-31'})],costs:[{id:'c',name:'Missing date',amount:100,vat_rate:0,is_paid:false,due_date:null}]});
    expect(cf.meta.da_verificare).toBe(2);expect(cf.meta.saldo_chiusura).toBe(1000);
  });
  it('excludes paid costs, returns gross future debt minus proven partial payment',()=>{
    const cf=projectedCashFlow({...input(),costs:[{id:'c',name:'Cost',amount:100,vat_rate:22,due_date:'2026-11-15',is_paid:false},{id:'paid',name:'Paid',amount:100,vat_rate:22,due_date:'2026-11-15',is_paid:true}],payments:[payment({direction:'uscita',scadenza_id:null,cost_id:'c',amount:22})]});
    expect(cf.mesi[1].uscite_totali).toBe(100);
  });
  it('uses an explicit cost payment across multiple dues once, not once for every installment',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({id:'a',direction:'uscita',amount:61,cost_id:'c'}),due({id:'b',direction:'uscita',amount:61,cost_id:'c',due_date:'2026-12-01'})],payments:[payment({direction:'uscita',amount:100,cost_id:'c',scadenza_id:null})]});
    expect(cf.mesi[1].uscite_totali).toBe(0);expect(cf.mesi[2].uscite_totali).toBe(22);
  });
  it('deduplicates payments explicitly linked to a customer invoice and ignores internal cost allocations',()=>{
    const cf=projectedCashFlow({...input(),dues:[due({invoice_id:'f'})],payments:[payment({invoice_id:'f',scadenza_id:null,amount:122})],costs:[{id:'internal',name:'Allocation',amount:100,vat_rate:0,is_paid:false,due_date:'2026-11-15',payment_method:'internal_allocation'}]});
    expect(cf.meta.saldo_chiusura).toBe(1000);
  });
});

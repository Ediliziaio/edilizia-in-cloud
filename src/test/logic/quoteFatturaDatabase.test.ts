import { afterEach,beforeEach,expect,it } from 'vitest';
import { quoteDatabase,company,order,invoice,rateIds } from '@/test/helpers/quoteFatturaDatabase';
let db:Awaited<ReturnType<typeof quoteDatabase>>;
beforeEach(async()=>{db=await quoteDatabase();},30000);
afterEach(async()=>{await db?.close();});
const link=()=>db.query('select collega_fattura_rate($1,$2,$3::uuid[])',[order,invoice,rateIds]);
async function pay(amount:number){await db.query("insert into movimenti_cassa_native(company_id,documento_id,data_movimento,importo,tipo) values($1,$2,'2026-11-17',$3,'incasso')",[company,invoice,amount]);await db.query('update documenti_fiscali set importo_pagato=importo_pagato+$2 where id=$1',[invoice,amount]);}
const quote=async()=> (await db.query<{incassato:string;residuo:string}>('select incassato,residuo from private.quote_fattura_rate($1) order by inizio',[invoice])).rows.map(r=>[Number(r.incassato),Number(r.residuo)]);
it('tre rate, una fattura: collegare/ripetere non crea incassi; due versamenti coprono 300+400 senza duplicati',async()=>{
 await link();await link();expect(await quote()).toEqual([[0,300],[0,400],[0,300]]);
 expect((await db.query('select * from movimenti_cassa_native')).rows).toHaveLength(0);
 await pay(400);expect(await quote()).toEqual([[300,0],[100,300],[0,300]]);
 await pay(300);expect(await quote()).toEqual([[300,0],[400,0],[0,300]]);
 const totals=await db.query<{total:string}>('select sum(importo) as total from rate_incassi($1)',[company]);expect(Number(totals.rows[0].total)).toBe(700);
 expect((await db.query('select * from documenti_fiscali')).rows).toHaveLength(1);expect((await db.query('select * from movimenti_cassa_native')).rows).toHaveLength(2);
 const left=await db.query<{total:string}>('select sum(residuo) as total from rate_da_incassare($1)',[company]);expect(Number(left.rows[0].total)).toBe(300);
});
it('trattenuta: i 900 esigibili si dividono sulle tre rate, i 100 non diventano denaro incassato',async()=>{
 await db.query('update documenti_fiscali set totale_da_pagare=900 where id=$1',[invoice]);await link();await pay(900);
 expect(await quote()).toEqual([[270,0],[360,0],[270,0]]);
 const r=await db.query<{cash:string;held:string}>('select sum(incassato) as cash,sum(non_esigibile) as held from private.quote_fattura_rate($1)',[invoice]);expect(Number(r.rows[0].cash)).toBe(900);expect(Number(r.rows[0].held)).toBe(100);
 expect(Number((await db.query<{t:string}>('select sum(importo) as t from rate_incassi($1)',[company])).rows[0].t)).toBe(900);
});
it('storno di un incasso riallinea solo stati e quote, mantenendo fattura e collegamenti',async()=>{
 await link();await pay(700);await db.exec('delete from movimenti_cassa_native');await db.query('update documenti_fiscali set importo_pagato=0 where id=$1',[invoice]);expect(await quote()).toEqual([[0,300],[0,400],[0,300]]);
 expect((await db.query('select id from order_installments where is_paid')).rows).toHaveLength(0);
});
it('rifiuta importi non corrispondenti e incassi separati senza modificare nulla',async()=>{
 await expect(db.query('select collega_fattura_rate($1,$2,$3::uuid[])',[order,invoice,[rateIds[0]]])).rejects.toThrow(/coprano esattamente/);
 await db.query('update order_installments set is_paid=true where id=$1',[rateIds[0]]);
 await expect(link()).rejects.toThrow(/già incassata/);
 expect((await db.query('select id from order_installments where documento_fiscale_id is not null')).rows).toHaveLength(0);
});
it('nega altra azienda e mancanza del permesso fatturazione',async()=>{
 await db.exec("select set_config('test.billing','no',false)");await expect(link()).rejects.toThrow(/Accesso negato/);
 await db.exec("select set_config('test.company','altra',false)");await expect(db.query('select rate_fattura_quote($1)',[order])).rejects.toThrow(/non disponibile/);
});
it('scollegare una quota conserva tutti gli incassi, le altre quote e il totale di cassa',async()=>{
 await link();await pay(400);await db.query('select scollega_rata_fattura($1)',[rateIds[0]]);
 expect(await quote()).toEqual([[100,300],[0,300]]);
 expect(Number((await db.query<{t:string}>('select sum(importo) as t from rate_incassi($1)',[company])).rows[0].t)).toBe(400);
 expect((await db.query('select * from movimenti_cassa_native')).rows).toHaveLength(1);
});
it('rifiuta quote sovrapposte, modifiche agli importi collegati e accesso anonimo',async()=>{
 await link();await expect(db.query('update order_installments set documento_quota_offset=0 where id=$1',[rateIds[1]])).rejects.toThrow(/sovrapposte/);
 await expect(db.query('update order_installments set amount=500 where id=$1',[rateIds[1]])).rejects.toThrow(/Scollega/);
 await db.exec('set role anon');await expect(db.query('select collega_fattura_rate($1,$2,$3::uuid[])',[order,invoice,rateIds])).rejects.toThrow(/permission denied/);
});
it('variazione del netto da pagare ricalcola quote e trattenute senza cambiare la cassa',async()=>{
 await link();await pay(700);await db.query('update documenti_fiscali set totale_da_pagare=900 where id=$1',[invoice]);
 expect(await quote()).toEqual([[270,0],[360,0],[70,200]]);
 expect(Number((await db.query<{t:string}>('select sum(importo) as t from rate_incassi($1)',[company])).rows[0].t)).toBe(700);
});

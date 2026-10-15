import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { quoteConversionSchema, conversionCompanyId as company, conversionQuoteId as quote } from '../fixtures/quoteConversionDatabase';
import { righeCommessaDaPreventivo } from '../../../supabase/functions/_shared/righeCommessaDaPreventivo';
import { destinazioneVoce, separaVoci } from '../../../supabase/functions/_shared/destinazioneVocePreventivo';
let db: PGlite;
const migration = readFileSync('supabase/migrations/20261015173837_quote_materiali_lavorazioni_conversione.sql','utf8');
async function convert(version=4) {
 return db.query<{esito:{id:string}}>('select crea_commessa_preventivo_atomic($1,$2,$3,$4,null,$5) esito',[
  quote,JSON.stringify({company_id:company,total_amount:1}),JSON.stringify(righeCommessaDaPreventivo([
   {name:'Pozzetto',item_category:'prodotto',quantity:2,unit_price:50},
   {name:'Scavo',item_category:'posa',quantity:12.5,unit_price:44}
  ]).map(r=>({...r,status:'da_ordinare'}))),JSON.stringify([{amount:793}]),version]);
}
beforeAll(async()=>{db=new PGlite();await db.exec(quoteConversionSchema);await db.exec(migration);},30000);
afterAll(async()=>{await db.close();});
beforeEach(async()=>{
 await db.exec('truncate orders,order_items,order_work_phases,order_installments,quotes,quote_items');
 await db.exec("select set_config('test.edit','true',false); select set_config('test.user','10000000-0000-0000-0000-000000000001',false)");
 await db.query(`insert into quotes(id,company_id,status,version,subtotal,discount_amount,vat_amount,total,quote_number) values($1,$2,'accettata',4,650,0,143,793,'OFF-TEST')`,[quote,company]);
 await db.query(`insert into quote_items(quote_id,name,item_category,item_type,quantity,unit_price,line_total,unit_of_measure,sort_order) values
 ($1,'Scavo','posa','service',12.5,44,550,'ml',0),($1,'Pozzetto','prodotto','product',2,50,100,'pz',1),
 ($1,'Nota','nota','service',1,0,0,'',2),($1,'Opzione','prodotto','product',1,100,100,'pz',3)`,[quote]);
 await db.exec("update quote_items set is_optional=true where name='Opzione'");
});
describe('conversione PostgreSQL locale',()=>{
 it('mantiene il contratto e separa materiale, fase e opzione',async()=>{
  await convert();
  expect((await db.query('select total_amount,vat_rate,quote_id from orders')).rows[0]).toMatchObject({total_amount:'650.00',vat_rate:'22.00',quote_id:quote});
  expect((await db.query('select name from order_items')).rows).toEqual([{name:'Pozzetto'}]);
  expect((await db.query('select name,notes,importo_venduto from order_work_phases')).rows[0]).toMatchObject({name:'Scavo',importo_venduto:'550'});
  expect(String((await db.query<{notes:string}>('select notes from order_work_phases')).rows[0].notes)).toContain('12.5 ml');
  expect((await db.query('select status from quotes')).rows[0]).toEqual({status:'convertita'});
  await expect(convert()).rejects.toThrow();
  expect((await db.query('select count(*)::int n from orders')).rows[0]).toEqual({n:1});
 });
 it('sei lavorazioni: sei fasi, zero articoli e prezzi del preventivo intatti',async()=>{
  await db.exec('delete from quote_items');
  for(let i=0;i<6;i++) await db.query("insert into quote_items(quote_id,name,item_category,item_type,quantity,unit_price,line_total,unit_of_measure,sort_order) values($1,$2,'posa','service',1,100,100,'corpo',$3)",[quote,`Lavorazione ${i+1}`,i]);
  const prima=(await db.query('select name,quantity,unit_price,line_total from quote_items order by sort_order')).rows;
  await db.query('select crea_commessa_preventivo_atomic($1,$2,$3,$4,null,4)',[quote,JSON.stringify({company_id:company}),'[]','[]']);
  expect((await db.query('select count(*)::int n from order_work_phases')).rows[0]).toEqual({n:6});
  expect((await db.query('select count(*)::int n from order_items')).rows[0]).toEqual({n:0});
  expect((await db.query('select name,quantity,unit_price,line_total from quote_items order by sort_order')).rows).toEqual(prima);
 });
 it('fallimento delle fasi: rollback anche di commessa, materiali e rate',async()=>{
  await db.exec("update quote_items set name=null where item_category='posa'");
  await expect(convert()).rejects.toThrow();
  for(const table of ['orders','order_items','order_installments','order_work_phases']) expect((await db.query(`select count(*)::int n from ${table}`)).rows[0]).toEqual({n:0});
  expect((await db.query('select status from quotes')).rows[0]).toEqual({status:'accettata'});
 });
 it('rifiuta versioni obsolete senza scritture',async()=>{await expect(convert(3)).rejects.toThrow('cambiato');});
 it('conserva il permesso di modifica richiesto',async()=>{await db.exec("select set_config('test.edit','false',false)");await expect(convert()).rejects.toThrow('permesso');});
 it('rifiuta una sessione assente',async()=>{await db.exec("select set_config('test.user','',false)");await expect(convert()).rejects.toThrow('Sessione');});
 it('rifiuta un preventivo di un’altra azienda',async()=>{await db.exec("update quotes set company_id='20000000-0000-0000-0000-000000000002'");await expect(convert()).rejects.toThrow('accessibile');});
 it('non converte categorie sconosciute come materiali',async()=>{await db.exec("update quote_items set item_category='non_riconosciuta' where name='Scavo'");await expect(convert()).rejects.toThrow('classificare');});
 it('prezzo a corpo: nessun articolo fittizio e nessun venduto di fase inventato',async()=>{await db.exec('update quotes set prezzo_manuale=650');await convert();expect((await db.query('select count(*)::int n from order_items')).rows[0]).toEqual({n:1});expect((await db.query('select importo_venduto from order_work_phases')).rows[0]).toEqual({importo_venduto:null});});
});
describe('classificazione senza inferenze',()=>{
 it('non cambia i dati e non interpreta i nomi',()=>{
  const righe=[{name:'Scavo',item_category:'prodotto',quantity:1,unit_price:120},{name:'Posa',item_category:'posa',quantity:7.5,unit_price:40},{name:'Trasporto',item_category:'trasporto',quantity:1,unit_price:50}];
  const prima=structuredClone(righe);const v=separaVoci(righe);expect(v.materiali.map(r=>r.name)).toEqual(['Scavo']);expect(v.lavorazioni).toHaveLength(2);expect(righe).toEqual(prima);
 });
 it('compatibilità legacy e categorie ambigue',()=>{expect(destinazioneVoce({item_type:'service'})).toBe('lavorazione');expect(destinazioneVoce({item_type:'product'})).toBe('materiale');expect(destinazioneVoce({})).toBe('da_verificare');});
});

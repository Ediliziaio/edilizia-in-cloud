import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { totaliRigheOda } from "@/lib/orders/articoloAcquisto";
const company="20000000-0000-4000-a000-000000000001",order="20000000-0000-4000-a000-000000000002",supplier="20000000-0000-4000-a000-000000000003",item="20000000-0000-4000-a000-000000000004";
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create table companies(id uuid primary key);create table orders(id uuid primary key,company_id uuid);create table suppliers(id uuid primary key,company_id uuid);
 create table order_items(id uuid primary key,order_id uuid,supplier_id uuid,stock_item_id uuid,quantity numeric,purchase_price numeric,vat_rate numeric,status text,unita_misura text,posizioni jsonb,prezzo_da_definire boolean default false,prezzo_fonte text,prezzo_prima_ordine jsonb,prezzo_aggiornato_il timestamptz,origine_materiale text default 'manuale',gruppo_id uuid,costo_stimato_iniziale numeric);
 create table purchase_orders(id uuid primary key default gen_random_uuid(),company_id uuid,supplier_id uuid,order_id uuid,created_by uuid,status text,oda_number text,notes text);
 create table purchase_order_items(id uuid primary key default gen_random_uuid(),company_id uuid,purchase_order_id uuid,order_item_id uuid,description text,quantity numeric(12,3),unit_price numeric(12,4),vat_rate numeric,discount_percent numeric,unit_of_measure text,sort_order integer,price_pending boolean default false,rfq_item_id uuid,riordino_motivo text,
 line_total numeric(12,2) generated always as (round(quantity*unit_price*(1-discount_percent/100),2)) stored,
 vat_amount numeric(12,2) generated always as (round(quantity*unit_price*(1-discount_percent/100)*vat_rate/100,2)) stored);
 grant select,insert,update on orders,suppliers,order_items,purchase_orders,purchase_order_items to authenticated;`);
 await db.exec(readFileSync('supabase/patches/bug54_oda_materiali_atomica.sql','utf8'));
 const source=readFileSync('supabase/migrations/20290103100000_offerta_ordine_su_misura.sql','utf8');
 const start=source.indexOf('create or replace function public.materiali_prezzo_da_ordine()');const end=source.indexOf('$function$;',start)+'$function$;'.length;
 await db.exec(source.slice(start,end));
 await db.exec('create trigger materiali_prezzo_da_ordine after insert or update of unit_price,discount_percent,order_item_id on purchase_order_items for each row execute function materiali_prezzo_da_ordine();');
 await db.exec(readFileSync('supabase/migrations/20290420110000_preparazione_forniture_atomica.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20290420110000_preparazione_forniture_atomica.sql','utf8'));
 await db.exec(`insert into companies values('${company}');insert into orders values('${order}','${company}');insert into suppliers values('${supplier}','${company}');`);
},60000);
beforeEach(async()=>{
 await db.exec(`reset role;truncate purchase_order_items,purchase_orders,order_items;
 insert into order_items(id,order_id,supplier_id,quantity,purchase_price,vat_rate,status,unita_misura,prezzo_da_definire,prezzo_fonte,costo_stimato_iniziale)
 values('${item}','${order}','${supplier}',3,0,22,'da_ordinare','pz',true,null,null);set role authenticated;`);
});
afterAll(async()=>{await db?.close();});
const line=(price=0,pending=true,q=3)=>({order_item_id:item,description:'Prodotto',quantity:q,unit_price:price,vat_rate:22,discount_percent:0,unit_of_measure:'pz',price_pending:pending});
const save=(r=line())=>db.query('select crea_oda_materiali_atomica($1,$2,$3,$4::jsonb)',[company,order,supplier,JSON.stringify([r])]);
it('l’ODA conserva il prezzo da confermare e non lo presenta come gratuito',async()=>{
 await save();expect((await db.query('select price_pending from purchase_order_items')).rows).toEqual([{price_pending:true}]);
 expect((await db.query('select prezzo_da_definire from order_items')).rows).toEqual([{prezzo_da_definire:true}]);
});
it('il prezzo confermato dall’ODA chiude il da definire dell’articolo',async()=>{
 await save();await db.exec('update purchase_order_items set unit_price=120,price_pending=false');
 expect((await db.query('select purchase_price,prezzo_fonte,prezzo_da_definire from order_items')).rows).toEqual([{purchase_price:'120.0000',prezzo_fonte:'ordine',prezzo_da_definire:false}]);
});
it('stima e prezzo ODA uguali hanno comunque fonti distinte e conservano la stima',async()=>{
 await db.exec('update order_items set purchase_price=100,costo_stimato_iniziale=100,prezzo_da_definire=false,prezzo_fonte=\'manuale\'');
 await save(line(100,false));expect((await db.query('select prezzo_fonte,costo_stimato_iniziale from order_items')).rows).toEqual([{prezzo_fonte:'ordine',costo_stimato_iniziale:'100'}]);
});
it('un prezzo zero esplicitamente confermato rimane conosciuto',async()=>{
 await db.exec("update order_items set prezzo_da_definire=false,prezzo_fonte='manuale'");await save(line(0,false));
 expect((await db.query('select price_pending from purchase_order_items')).rows).toEqual([{price_pending:false}]);
 expect((await db.query('select prezzo_fonte from order_items')).rows).toEqual([{prezzo_fonte:'ordine'}]);
});
it('confermare gratuitamente un prezzo prima sconosciuto chiude il da definire',async()=>{
 await save();await db.exec('update purchase_order_items set price_pending=false');
 expect((await db.query('select purchase_price,prezzo_da_definire,prezzo_fonte from order_items')).rows).toEqual([{purchase_price:'0.0000',prezzo_da_definire:false,prezzo_fonte:'ordine'}]);
});
it('blocca la perdita di centesimi dovuta alla precisione del documento',async()=>{
 await db.exec('update order_items set quantity=1000,purchase_price=0.10001,prezzo_da_definire=false');
 await expect(save(line(0.10001,false,1000))).rejects.toThrow(/Dati articolo/);expect((await db.query('select * from purchase_orders')).rows).toHaveLength(0);
});
it('totali di anteprima uguali alle colonne generate del documento',async()=>{
 await db.exec('update order_items set purchase_price=0.0084,prezzo_da_definire=false');
 await save(line(0.0084,false));
 const r=(await db.query<{line_total:string;vat_amount:string}>('select line_total,vat_amount from purchase_order_items')).rows[0];
 const totali=totaliRigheOda([line(0.0084,false)]);
 expect(totali.imponibile).toBe(Number(r.line_total));expect(totali.iva).toBe(Number(r.vat_amount));
});
it('non arrotonda silenziosamente quantità con quattro decimali nel documento a tre',async()=>{
 await db.exec('update order_items set quantity=1.1234,purchase_price=2,prezzo_da_definire=false');
 await expect(save(line(2,false,1.1234))).rejects.toThrow(/Dati articolo/);
});

import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
const company='00000000-0000-4000-a000-000000000001';
const warehouse='00000000-0000-4000-a000-000000000002';
const item='00000000-0000-4000-a000-000000000003';
const order='00000000-0000-4000-a000-000000000004';
const other='00000000-0000-4000-a000-000000000099';
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite(); await db.waitReady;
 await db.exec(`create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
 create function get_my_company_id() returns uuid language sql as $$select '${company}'::uuid$$;
 create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select current_setting('test.permitted',true)='yes'$$;
 create function e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;
 create table warehouses(id uuid,company_id uuid);
 create table orders(id uuid,company_id uuid,deleted_at timestamptz);
 create table customers(id uuid,company_id uuid);
 create table warehouse_stock(id uuid,company_id uuid,warehouse_id uuid,tracking_mode text,name text,internal_code text,unit_cost numeric,quantity integer,updated_at timestamptz);
 create table warehouse_uscite(id uuid default gen_random_uuid(),company_id uuid,warehouse_id uuid,numero text,numero_seq integer,anno integer,destinatario_tipo text,customer_id uuid,order_id uuid,destinatario_libero jsonb,cliente_snapshot jsonb,vettore jsonb,note text,stato text,created_by uuid,righe jsonb,updated_at timestamptz);
 create table warehouse_movements(stock_item_id uuid,movement_type text,quantity integer,notes text,performed_by uuid,company_id uuid,warehouse_id uuid,order_id uuid,uscita_id uuid);
 create table stock_units(company_id uuid,stock_item_id uuid,serial_number text,status text,warehouse_id uuid,delivered_to_order_id uuid,delivered_at timestamptz);
 create table warehouse_scan_events(company_id uuid,user_id uuid,warehouse_id uuid,scanned_code text,scan_type text,resolved_stock_item_id uuid,resolution_status text,order_id uuid,quantity numeric);
 insert into warehouses values('${warehouse}','${company}');
 insert into orders values('${order}','${company}',null),('${other}','${other}',null);`);
 await db.exec(readFileSync('supabase/patches/bug108_uscita_atomica.sql','utf8'));
},60000);
beforeEach(async()=>{await db.exec(`set test.permitted='yes'; truncate warehouse_stock,warehouse_uscite,warehouse_movements,stock_units,warehouse_scan_events;
 insert into warehouse_stock values('${item}','${company}','${warehouse}','serialized','Prova','P',10,3,now());
 insert into stock_units values('${company}','${item}','S1','available','${warehouse}',null,null),('${company}','${item}','S2','available','${warehouse}',null,null);`);});
afterAll(async()=>{await db?.close();});
const scan=(quantity=1,serials: string[]|undefined=['S1'])=>({stock_item_id:item,quantity,serial_numbers:serials});
const register=(scans=[scan()],job=order)=>db.query('select * from register_warehouse_uscita($1,$2::jsonb,$3::jsonb)',[warehouse,JSON.stringify({tipo:'cantiere',order_id:job}),JSON.stringify(scans)]);
const unchanged=async()=>{
 expect((await db.query('select quantity from warehouse_stock')).rows).toEqual([{quantity:3}]);
 for(const table of ['warehouse_uscite','warehouse_movements','warehouse_scan_events']) expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
 expect((await db.query("select * from stock_units where status<>'available'")).rows).toHaveLength(0);
};
it('registra insieme uscita, movimento, giacenza e seriale',async()=>{
 const result=await register(); expect(result.rows[0]).toMatchObject({created_movements:1,updated_units:1,errors:[]});
 expect((await db.query('select quantity from warehouse_stock')).rows).toEqual([{quantity:2}]);
 expect((await db.query("select status,delivered_to_order_id from stock_units where serial_number='S1'")).rows).toEqual([{status:'shipped',delivered_to_order_id:order}]);
});
it.each([0,-1,0.5])('rifiuta quantità %s senza scritture',async q=>{await expect(register([scan(q)])).rejects.toThrow();await unchanged();});
it.each([{serials:[]},{serials:['S1','S1']},{serials:['MANCANTE']}])('rifiuta seriali incoerenti $serials con rollback completo',async ({serials})=>{await expect(register([scan(1,serials)])).rejects.toThrow();await unchanged();});
it('annulla anche la prima riga se la seconda fallisce',async()=>{await expect(register([scan(),scan(1,['ASSENTE'])])).rejects.toThrow();await unchanged();});
it('blocca un seriale già consumato in una riga precedente',async()=>{await expect(register([scan(),scan()])).rejects.toThrow();await unchanged();});
it('non accetta un articolo di altro magazzino',async()=>{await db.exec(`update warehouse_stock set warehouse_id='${other}'`);await expect(register()).rejects.toThrow();await unchanged();});
it('non accetta un seriale di altro magazzino',async()=>{await db.exec(`update stock_units set warehouse_id='${other}'`);await expect(register()).rejects.toThrow();await unchanged();});
it('non accetta commesse di altra azienda',async()=>{await expect(register([scan()],other)).rejects.toThrow('Commessa non valida');await unchanged();});
it('non consente scarichi senza permesso',async()=>{await db.exec("set test.permitted='no'");await expect(register()).rejects.toThrow('ruolo');await unchanged();});
it('non crea uscite vuote',async()=>{await expect(register([])).rejects.toThrow('Nessun articolo');await unchanged();});
it('riproduce il difetto precedente: seriale assente ma giacenza ridotta',async()=>{
 await db.exec(readFileSync('src/test/fixtures/bug108_uscita_prima.sql','utf8'));
 try {
  const result=await register([scan(1,['ASSENTE'])]);
  expect(result.rows[0]).toMatchObject({errors:[{serial_number:'ASSENTE',error:'serial_not_available'}]});
  expect((await db.query('select quantity from warehouse_stock')).rows).toEqual([{quantity:2}]);
 } finally { await db.exec(readFileSync('supabase/patches/bug108_uscita_atomica.sql','utf8')); }
});

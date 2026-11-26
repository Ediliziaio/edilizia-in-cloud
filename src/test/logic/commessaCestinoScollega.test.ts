import {readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {ordersTrashDatabase,TRASH_COMPANY,TRASH_ORDER} from '../fixtures/ordersTrashDatabase';
import type{PGlite}from'@electric-sql/pglite';

// La seconda conferma del cestino: i documenti che esistono di per sé vengono scollegati dalla
// commessa e restano al loro posto, la commessa va nel cestino. Senza la conferma non cambia nulla.
let db:PGlite;
const FATTURA='10000000-0000-4000-8000-000000000010';
const COSTO='10000000-0000-4000-8000-000000000011';
const ALTRA='10000000-0000-4000-8000-000000000099';

beforeAll(async()=>{
 db=await ordersTrashDatabase();
 await db.exec(`
 create schema private;create role service_role;
 create table sal_records(order_id uuid,stato text);
 create table sal_subappaltatori(order_id uuid);
 create table ddt_consegne(order_id uuid);
 create table ddt_ricezione(order_id uuid);
 create table warehouse_movements(order_id uuid);
 create table scadenze(order_id uuid);
 create table fatture_ricevute(company_id uuid,protocollo_commessa_id uuid,protocollo_commessa_numero text,order_id_suggerito uuid);
 create table prima_nota_entries(installment_id uuid,order_id uuid);
 create function private.prima_nota_e_incasso_rata(public.prima_nota_entries) returns boolean language sql stable as $$select true$$;
 alter table invoices add column company_id uuid;
 alter table documenti_fiscali add column company_id uuid;
 alter table fattura_ordine add column company_id uuid;
 alter table purchase_orders add column company_id uuid;
 alter table company_costs add column company_id uuid,add column allocations jsonb,add column order_work_phase_id uuid;
 alter table order_installments add column documento_quota_lorda numeric,add column documento_quota_offset numeric;
 alter table order_items add column is_paid boolean default false,add column balance_paid boolean default false;
 `);
 await db.exec(readFileSync('supabase/migrations/20281105310000_cestino_commessa_motivo_preciso.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20290617100000_commessa_cestino_scollegando_documenti.sql','utf8'));
},30000);

beforeEach(async()=>{await db.exec(`begin;select set_config('test.user','10000000-0000-4000-8000-000000000003',false),set_config('test.company','${TRASH_COMPANY}',false),set_config('test.permission','true',false),set_config('test.visible','true',false),set_config('test.blocked','false',false),set_config('test.external','false',false),set_config('test.admin','false',false);`);});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db?.close();});

const cestina=async(scollega:boolean)=>{
 await db.exec('savepoint azione');
 try{const r=await db.query('select public.set_order_trashed($1,$2,true,$3)',[TRASH_ORDER,TRASH_COMPANY,scollega]);await db.exec('release savepoint azione');return r;}
 catch(e){await db.exec('rollback to savepoint azione;release savepoint azione');throw e;}
};
const cestinata=async()=>(await db.query<{deleted_at:string|null}>('select deleted_at from orders')).rows[0].deleted_at;

const conFattura=async()=>{
 await db.exec(`insert into invoices(id,order_id,company_id) values('${FATTURA}','${TRASH_ORDER}','${TRASH_COMPANY}')`);
};

it('senza la seconda conferma la fattura tiene la commessa fuori dal cestino',async()=>{
 await conFattura();
 await expect(cestina(false)).rejects.toThrow('ci sono fatture collegate');
 expect(await cestinata()).toBeNull();
 expect((await db.query<{order_id:string}>('select order_id from invoices')).rows[0].order_id).toBe(TRASH_ORDER);
});

it('con la seconda conferma la fattura resta e perde solo la commessa',async()=>{
 await conFattura();
 await cestina(true);
 expect(await cestinata()).toBeTruthy();
 const r=await db.query<{id:string;order_id:string|null}>('select id,order_id from invoices');
 expect(r.rows).toEqual([{id:FATTURA,order_id:null}]);
});

it('scollega costi, acquisti, DDT, magazzino, prima nota e scadenze della sola commessa',async()=>{
 await db.exec(`
 insert into company_costs(order_id,company_id,order_work_phase_id) values('${TRASH_ORDER}','${TRASH_COMPANY}','${COSTO}');
 insert into company_costs(order_id,company_id,allocations) values(null,'${TRASH_COMPANY}','[{"order_id":"${TRASH_ORDER}","pct":40},{"order_id":"${ALTRA}","pct":60}]'::jsonb);
 insert into purchase_orders(order_id,company_id) values('${TRASH_ORDER}','${TRASH_COMPANY}');
 insert into ddt_consegne values('${TRASH_ORDER}');
 insert into ddt_ricezione values('${TRASH_ORDER}');
 insert into warehouse_movements values('${TRASH_ORDER}');
 insert into stock_units(reserved_order_id) values('${TRASH_ORDER}');
 insert into prima_nota_entries(order_id) values('${TRASH_ORDER}');
 insert into scadenze values('${TRASH_ORDER}');
 insert into fatture_ricevute(company_id,protocollo_commessa_id,protocollo_commessa_numero) values('${TRASH_COMPANY}','${TRASH_ORDER}','Che1');
 `);
 await cestina(true);
 expect(await cestinata()).toBeTruthy();
 for(const q of ['select count(*) n from company_costs where order_id is not null',
  'select count(*) n from purchase_orders where order_id is not null',
  'select count(*) n from ddt_consegne where order_id is not null',
  'select count(*) n from ddt_ricezione where order_id is not null',
  'select count(*) n from warehouse_movements where order_id is not null',
  'select count(*) n from stock_units where reserved_order_id is not null',
  'select count(*) n from prima_nota_entries where order_id is not null',
  'select count(*) n from scadenze where order_id is not null',
  'select count(*) n from fatture_ricevute where protocollo_commessa_id is not null']){
  expect([q,Number((await db.query<{n:number}>(q)).rows[0].n)]).toEqual([q,0]);
 }
 // La ripartizione perde la sola riga della commessa: l'altra commessa resta com'era.
 const alloc=(await db.query<{allocations:Array<{order_id:string}>}>('select allocations from company_costs where allocations is not null')).rows[0].allocations;
 expect(alloc).toEqual([{order_id:ALTRA,pct:60}]);
 // Niente righe cancellate: i documenti si ritrovano tutti.
 expect(Number((await db.query<{n:number}>('select count(*) n from company_costs')).rows[0].n)).toBe(2);
});

it('una rata con incasso in prima nota non si scollega dalla fattura: la si corregge da lì',async()=>{
 await conFattura();
 const rata=(await db.query<{id:string}>(`update order_installments set invoice_id='${FATTURA}' where amount=100 returning id`)).rows[0].id;
 await db.exec(`insert into prima_nota_entries(installment_id) values('${rata}')`);
 await cestina(true);
 expect((await db.query<{invoice_id:string|null}>('select invoice_id from order_installments where id=$1',[rata])).rows[0].invoice_id).toBe(FATTURA);
});

it('senza permesso la seconda conferma non scollega niente',async()=>{
 await conFattura();
 await db.query("select set_config('test.permission','false',false)");
 await expect(cestina(true)).rejects.toThrow(/permesso/);
 expect((await db.query<{order_id:string}>('select order_id from invoices')).rows[0].order_id).toBe(TRASH_ORDER);
});

it('i conteggi della conferma dicono cosa si scollega, e non sono aperti ad anon',async()=>{
 await conFattura();
 const r=await db.query<{v:Record<string,number>}>('select public.commessa_cosa_si_scollega($1,$2) v',[TRASH_ORDER,TRASH_COMPANY]);
 expect(r.rows[0].v).toEqual({fatture_emesse:1});
 const p=await db.query<{anon:boolean;authenticated:boolean}>("select has_function_privilege('anon','public.commessa_cosa_si_scollega(uuid,uuid)','execute') anon,has_function_privilege('authenticated','public.commessa_cosa_si_scollega(uuid,uuid)','execute') authenticated");
 expect(p.rows[0]).toEqual({anon:false,authenticated:true});
});

import {readFileSync} from 'node:fs';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {ordersTrashDatabase,TRASH_COMPANY,TRASH_ORDER} from '../fixtures/ordersTrashDatabase';
import type{PGlite}from'@electric-sql/pglite';
let db:PGlite;
beforeAll(async()=>{db=await ordersTrashDatabase();},30000);
beforeEach(async()=>{await db.exec(`begin;select set_config('test.user','10000000-0000-4000-8000-000000000003',false),set_config('test.company','${TRASH_COMPANY}',false),set_config('test.permission','true',false),set_config('test.visible','true',false),set_config('test.blocked','false',false),set_config('test.external','false',false),set_config('test.admin','false',false);`);});
afterEach(async()=>{await db.exec('rollback');});
afterAll(async()=>{await db?.close();});
const set=async(trashed:boolean,company=TRASH_COMPANY)=>{
 await db.exec('savepoint azione');
 try {const result=await db.query('select public.set_order_trashed($1,$2,$3)',[TRASH_ORDER,company,trashed]);await db.exec('release savepoint azione');return result;}
 catch(e){await db.exec('rollback to savepoint azione;release savepoint azione');throw e;}
};
it('le sole rate previste non bloccano il cestino e il ripristino conserva importi e righe',async()=>{
 const before=await db.query('select * from orders');
 await set(true);expect((await db.query<{deleted_at:string}>('select deleted_at from orders')).rows[0].deleted_at).toBeTruthy();
 const trashed=await db.query('select * from orders');await set(true);expect(await db.query('select * from orders')).toEqual(trashed);
 expect((await db.query('select * from order_installments')).rows).toHaveLength(2);
 expect((await db.query('select * from order_items')).rows).toHaveLength(1);
 await set(false);expect(await db.query('select * from orders')).toEqual(before);
});
it.each(['permission','visible','blocked','external'])('rispetta il controllo %s senza toccare i dati',async(key)=>{
 await db.query('select set_config($1,$2,false)',[`test.${key}`,['blocked','external'].includes(key)?'true':'false']);
 await expect(set(true)).rejects.toThrow(/permesso|accessibile/);
 expect((await db.query<{deleted_at:null}>('select deleted_at from orders')).rows[0].deleted_at).toBeNull();
});
it('rifiuta un’altra azienda e una sessione assente',async()=>{
 await expect(set(true,'20000000-0000-4000-8000-000000000001')).rejects.toThrow('Azienda non valida');
 await db.query("select set_config('test.user','',false)");await expect(set(true)).rejects.toThrow('Sessione scaduta');
});
it('la funzione non è eseguibile da anon o PUBLIC',async()=>{
 const r=await db.query<{anon:boolean;authenticated:boolean}>("select has_function_privilege('anon','public.set_order_trashed(uuid,uuid,boolean)','execute') anon,has_function_privilege('authenticated','public.set_order_trashed(uuid,uuid,boolean)','execute') authenticated");
 expect(r.rows[0]).toEqual({anon:false,authenticated:true});
});
it.each([
 `insert into order_employees values('${TRASH_ORDER}',5,0)`,
 `insert into order_external_teams values('${TRASH_ORDER}',100)`,
 `insert into order_salespeople values('${TRASH_ORDER}',true)`,
 `update order_items set deposit_paid=true`,
 `update orders set deposit_paid=true`,
 `update orders set deposit_2_paid=true`,
 `update orders set balance_paid=true`,
 `update orders set financing_paid=true`,
 `update order_installments set is_paid=true`,
 `insert into invoices(order_id) values('${TRASH_ORDER}')`,
 `insert into company_costs values('${TRASH_ORDER}')`,
 `insert into campo_rapportini values('${TRASH_ORDER}','approvato')`,
 `insert into campo_rapportini values('${TRASH_ORDER}','inviato')`,
 `insert into purchase_orders values('${TRASH_ORDER}')`,
 `insert into stock_units(reserved_order_id) values('${TRASH_ORDER}')`,
])('protegge i movimenti effettivi: %s',async(sql)=>{
 await db.exec(sql);await expect(set(true)).rejects.toThrow('Mantienila nello storico');
 expect((await db.query<{deleted_at:null}>('select deleted_at from orders')).rows[0].deleted_at).toBeNull();
});

it('cestino e ripristino aggiornano la previsione senza perdere o ricalcolare le rate',async()=>{
 await db.exec(`
 create function public.assert_company_access(uuid) returns void language plpgsql as $$begin if $1 is distinct from public.get_my_company_id() then raise exception 'Azienda non valida'; end if;end$$;
 create table prima_nota_entries(company_id uuid,direction text,amount numeric);
 alter table order_installments add expected_date date default current_date;
 alter table order_external_teams add payment_date date,add is_paid boolean;
 alter table order_salespeople add commission_amount numeric,add payment_expected_date date;
 alter table company_costs add company_id uuid,add amount numeric,add due_date date,add is_paid boolean;
 alter table order_items add purchase_price numeric,add quantity numeric,add supplier_id uuid,add stock_item_id uuid,add is_paid boolean,add balance_expected_date date,add deposit_expected_date date;
 `);
 await db.exec(readFileSync('src/test/fixtures/cashflowBeforeTrash.sql','utf8'));
 const summary=async()=> (await db.query<{value:{total:{income:number}}}>('select public.get_cashflow_summary($1,3) value',[TRASH_COMPANY])).rows[0].value;
 const before=await summary();expect(before.total.income).toBe(1234.56);
 await set(true);expect((await summary()).total.income).toBe(1234.56); // comportamento precedente
 await db.exec(readFileSync('supabase/migrations/20281016150614_cassa_esclude_commesse_cestinate.sql','utf8'));
 expect((await summary()).total.income).toBe(0);
 expect((await db.query('select * from order_installments')).rows).toHaveLength(2);
 await set(false);expect(await summary()).toEqual(before);
},15000);

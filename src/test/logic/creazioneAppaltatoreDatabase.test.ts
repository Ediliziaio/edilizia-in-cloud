import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { A, B, U } from '../fixtures/moduleConversionDatabase';

const db = new PGlite();
const C='40000000-0000-0000-0000-000000000001', D='40000000-0000-0000-0000-000000000002';
const S='50000000-0000-0000-0000-000000000001', S2='50000000-0000-0000-0000-000000000002';
const K='60000000-0000-0000-0000-000000000001';
const migration=readFileSync('supabase/proposals/20261111183829_commesse_creazione_appaltatore_atomica.sql','utf8');
beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create table companies(id uuid primary key);
    create type app_role as enum ('super_admin','company_admin','company_staff');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;`);
  const cols=JSON.parse(readFileSync('src/test/fixtures/creationDatabaseSchema.json','utf8')) as {table_name:string;column_name:string;data_type:string;udt_name:string}[];
  for(const table of new Set(cols.map(c=>c.table_name))) {
    const fields=cols.filter(c=>c.table_name===table).map(c=>`"${c.column_name}" ${c.data_type==='USER-DEFINED'?'text':c.data_type==='ARRAY'?(c.udt_name==='_uuid'?'uuid[]':'text[]'):c.data_type}${c.column_name==='id'?' primary key default gen_random_uuid()':''}`);
    await db.exec(`create table public.${table}(${fields.join(',')});`);
  }
  await db.exec(`create table multi_company_access(user_id uuid,company_id uuid,status text,expires_at timestamptz);
    create function has_role(uuid,app_role) returns boolean language sql stable as $$ select false $$;
    create function utente_bloccato() returns boolean language sql stable as $$ select current_setting('test.blocked',true)='true' $$;
    create function utente_e_cliente_esterno() returns boolean language sql stable as $$ select false $$;
    create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable as $$
      select current_setting('test.edit',true)='true' and not coalesce(utente_bloccato(),false)
      and exists(select 1 from profiles where id=u and company_id=c) $$;
    create function assert_permesso(text,text) returns void language plpgsql as $$ begin
      if auth.uid() is null or not has_permission_for_company(auth.uid(),'can_edit_orders',current_setting('test.company')::uuid) then
        raise exception 'Permesso negato' using errcode='42501'; end if; end $$;
    create table warehouse_movements(stock_id uuid,quantity numeric,performed_by uuid);
    create function magazzino_movimento_riga(c uuid,o uuid,i uuid,s uuid,q numeric,n text,u uuid) returns void language plpgsql as $$ begin
      update warehouse_stock set quantity=quantity-q where id=s and company_id=c;
      insert into warehouse_movements values(s,q,u); end $$;`);
  // Lo stesso controllo contratto/committente/azienda già installato nel portale.
  const guard=readFileSync('supabase/migrations/20281028120000_commessa_appalto_a_corpo_o_a_misura.sql','utf8');
  const start=guard.toLowerCase().indexOf('create or replace function public.orders_appalto_contratto_coerente(');
  const rest=guard.slice(start); const tag=rest.match(/as\s+(\$[a-z_]*\$)/i)![1];
  const first=rest.indexOf(tag); await db.exec(rest.slice(0,rest.indexOf(tag,first+tag.length)+tag.length)+';');
  await db.exec(`create trigger contratto_coerente before insert or update on orders for each row execute function orders_appalto_contratto_coerente();`);
  await db.exec(migration);
});
afterAll(()=>db.close());
beforeEach(async()=>{
  await db.exec(`truncate companies,auth.users,orders,profiles,order_statuses,order_installments,order_status_history,order_items,order_salespeople,appalto_contratti,warehouse_stock,warehouse_movements,multi_company_access cascade;
    insert into companies values('${A}'),('${B}'); insert into auth.users values('${U}'),('${C}');
    insert into profiles(id,company_id,customer_type) values('${U}','${A}','staff'),('${C}','${A}','appaltatore'),('${D}','${B}','appaltatore');
    insert into order_statuses(id,company_id,name,is_default,position) values('${S}','${A}','Confermato',true,0),('${S2}','${B}','Confermato',true,0);
    insert into appalto_contratti(id,company_id,committente_id,nome,attivo) values('${K}','${A}','${C}','Contratto Demo',true);
    select set_config('test.user','${U}',false),set_config('test.company','${A}',false),set_config('test.edit','true',false),set_config('test.blocked','false',false);`);
});
function payload(extra:Record<string,unknown>={}) {return {company_id:A,customer_id:C,order_type:'appaltatore_lavoro',valorizzazione:'a_corpo',description:'[DEMO] Creazione atomica',total_amount:1000,vat_rate:22,balance_amount:1220,creation_request_id:crypto.randomUUID(),...extra};}
const rates=[{position:0,label:'Saldo',type:'balance',amount:1220,is_paid:false,expected_date:'2026-12-11'}];
async function create(p=payload(),r:unknown=rates){return (await db.query<{result:{id:string;gia_creata?:boolean}}>('select crea_lavoro_appaltatore_atomic($1,$2) result',[p,r])).rows[0].result;}
async function counts(){return (await db.query<{orders:number;rate:number;history:number;requests:number}>(`select (select count(*)::int from orders) orders,(select count(*)::int from order_installments) rate,(select count(*)::int from order_status_history) history,(select count(*)::int from private.order_creation_requests) requests`)).rows[0];}

it('a corpo salva campi, rata IVA inclusa, autore e storico nella stessa richiesta',async()=>{
  const r=await create(payload({work_address:'Via Demo',work_description:'Manodopera',materials_location:'Magazzino Demo',riferimento_committente:'RIF-DEMO',created_by:C,work_start_date:'2026-11-11',work_end_date:'2026-12-20'}));
  expect((await db.query('select work_start_date::text,work_end_date::text,order_type,valorizzazione,work_address,work_description,materials_location,riferimento_committente,current_status_id,created_by from orders where id=$1',[r.id])).rows[0]).toEqual({work_start_date:'2026-11-11',work_end_date:'2026-12-20',order_type:'appaltatore_lavoro',valorizzazione:'a_corpo',work_address:'Via Demo',work_description:'Manodopera',materials_location:'Magazzino Demo',riferimento_committente:'RIF-DEMO',current_status_id:S,created_by:U});
  expect(await counts()).toEqual({orders:1,rate:1,history:1,requests:1});
  expect((await db.query('select amount from order_installments')).rows[0]).toEqual({amount:'1220'});
});
it('recupera una risposta persa e due richieste uguali senza riscrivere la commessa',async()=>{
  const p=payload();const [a,b]=await Promise.all([create(p),create(p)]);expect(a.id).toBe(b.id);expect(b.gia_creata).toBe(true);
  await db.query('update orders set description=$1 where id=$2',['Modifica successiva',a.id]);
  expect((await create(p)).id).toBe(a.id);expect(await counts()).toEqual({orders:1,rate:1,history:1,requests:1});
  expect((await db.query('select description from orders')).rows[0]).toEqual({description:'Modifica successiva'});
});
it('stessa chiave con importi diversi è respinta',async()=>{
  const p=payload();await create(p);await expect(create({...p,total_amount:2000},[{...rates[0],amount:2440}])).rejects.toThrow('dati diversi');expect((await counts()).orders).toBe(1);
});
it('un errore sulle rate annulla anche ordine e storico e consente la ripresa',async()=>{
  await db.exec("alter table order_installments add constraint simulazione_errore check(label<>'ERRORE')");
  const p=payload();await expect(create(p,[{...rates[0],label:'ERRORE'}])).rejects.toThrow('simulazione_errore');
  expect(await counts()).toEqual({orders:0,rate:0,history:0,requests:0});
  await db.exec('alter table order_installments drop constraint simulazione_errore');await create(p);
  expect(await counts()).toEqual({orders:1,rate:1,history:1,requests:1});
});
it('a misura conserva stima e tetto senza rate sulla previsione',async()=>{
  await create(payload({valorizzazione:'a_misura',appalto_contratto_id:K,tetto_importo:1500}),[]);
  expect(await counts()).toEqual({orders:1,rate:0,history:1,requests:1});
  expect((await db.query('select total_amount,tetto_importo from orders')).rows[0]).toEqual({total_amount:'1000',tetto_importo:'1500'});
});
it.each([
  [{valorizzazione:'a_misura'},[], 'contratto'],
  [{valorizzazione:'a_misura',appalto_contratto_id:K},rates,'non può generare rate'],
  [{},[{...rates[0],amount:1000}], 'IVA inclusa'],
  [{},[{...rates[0],amount:-1220}], 'IVA inclusa'],
  [{total_amount:'NaN'},rates,'non validi'],
  [{},[{...rates[0],is_paid:true}], 'prima nota'],
  [{balance_paid:true},rates,'prima nota'],
  [{vat_rate:101},rates,'non validi'],
  [{tetto_importo:-1},rates,'non validi'],
  [{work_start_date:'2026-12-12',work_end_date:'2026-12-01'},rates,'precede'],
  [{customer_id:D},rates,'committente'],
  [{current_status_id:S2},rates,'stato iniziale'],
] as const)('dati non coerenti bloccati prima di lasciare scritture: %j',async(extra,r,message)=>{
  await expect(create(payload(extra),r)).rejects.toThrow(message);expect(await counts()).toEqual({orders:0,rate:0,history:0,requests:0});
});
it('contratto di altra azienda bloccato dal controllo nativo',async()=>{
  await db.query('update appalto_contratti set company_id=$1 where id=$2',[B,K]);
  await expect(create(payload({valorizzazione:'a_misura',appalto_contratto_id:K}),[])).rejects.toThrow('altra azienda');expect((await counts()).orders).toBe(0);
});
it('non recupera un tentativo di un altro utente e non ricrea un ordine cestinato',async()=>{
  const p=payload();const r=await create(p);await db.query("select set_config('test.user',$1,false)",[C]);await expect(create(p)).rejects.toThrow('altro utente');
  await db.query("select set_config('test.user',$1,false)",[U]);await db.query('update orders set deleted_at=now() where id=$1',[r.id]);await expect(create(p)).rejects.toThrow('cestinata');expect((await counts()).orders).toBe(1);
});
it('il ruolo autenticato usa il motore comune; anon e assenza di permessi sono respinti',async()=>{
  await db.exec('set role authenticated');await create();await db.exec('reset role;set role anon');await expect(create()).rejects.toThrow('permission denied');await db.exec('reset role');
  await db.exec("select set_config('test.edit','false',false)");await expect(create()).rejects.toThrow('Permesso');expect((await counts()).orders).toBe(1);
});
it('la creazione ordinaria conserva materiali, rate e provvigioni',async()=>{
  const stock=crypto.randomUUID();await db.query('insert into warehouse_stock(id,company_id,quantity) values($1,$2,10)',[stock,A]);
  await db.query('select create_order_atomic($1,$2,$3,$4,$5)',[{company_id:A,customer_id:C,description:'Commessa ordinaria',total_amount:1000},[{name:'Materiale',quantity:2,unit_price:100,stock_item_id:stock}],{salesperson_id:U,commission_type:'percent',commission_value:5},U,[{label:'Acconto',type:'deposit',amount:200}]]);
  expect((await db.query('select quantity from warehouse_stock where id=$1',[stock])).rows[0]).toEqual({quantity:'8'});
  expect(Number((await db.query<{commission_amount:string}>('select commission_amount from order_salespeople')).rows[0].commission_amount)).toBe(50);
  expect(await counts()).toEqual({orders:1,rate:1,history:1,requests:0});
});

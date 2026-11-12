import {beforeAll,afterAll,beforeEach,expect,it} from "vitest";
import {PGlite} from "@electric-sql/pglite";
import {readFile} from "node:fs/promises";
import {incassoQuotaCommessa} from "@/lib/fatturazione/incassoQuotaCommessa";
const pg=new PGlite();const c="aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",other="bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",d="dddddddd-dddd-4ddd-addd-dddddddddddd",o="eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee",o2="ffffffff-ffff-4fff-afff-ffffffffffff";
beforeAll(async()=>{await pg.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid()returns uuid language sql as $$select 'cccccccc-cccc-4ccc-accc-cccccccccccc'::uuid$$;
 create function utente_bloccato()returns boolean language sql as $$select current_setting('test.blocked',true)='true'$$;
 create function puo_gestire_documento_fiscale(uuid,text)returns boolean language sql as $$select $1='${c}' and current_setting('test.denied',true)<>'true'$$;
 create table documenti_fiscali(id uuid primary key,company_id uuid,ordine_id uuid,deleted_at timestamptz,tipo text,stato text,totale_da_pagare numeric,importo_pagato numeric,numero text,pagato_at timestamptz,data_scadenza date);
 create table orders(id uuid primary key,company_id uuid,deleted_at timestamptz);
 create view orders_visibili as select * from orders where company_id='${c}' and current_setting('test.hidden',true)<>'true';
 create table fattura_ordine(id uuid default gen_random_uuid(),company_id uuid,fattura_id uuid,ordine_id uuid,importo_associato numeric,created_by uuid,unique(fattura_id,ordine_id));
 create table movimenti_cassa_native(documento_id uuid,tipo text,data_movimento date);
 create table invoices(id uuid,order_id uuid,invoice_number text,total numeric,status text,paid_amount numeric,payment_date date,due_date date,company_id uuid,document_type text,deleted_at timestamptz);
 create function documento_stornato_totale(uuid)returns numeric language sql as $$select 0::numeric$$;
 create function nc_collegate_importo(uuid)returns numeric language sql as $$select 0::numeric$$;
 create function reject_shortcut()returns trigger language plpgsql as $$begin if current_setting('test.fail_update',true)='true' then raise exception 'Update denied';end if;return new;end$$;
 create trigger reject_shortcut before update on documenti_fiscali for each row execute function reject_shortcut();
 alter table documenti_fiscali enable row level security;create policy company_rows on documenti_fiscali for all to authenticated using(company_id='${c}')with check(company_id='${c}');
 alter table fattura_ordine enable row level security;create policy company_rows on fattura_ordine for all to authenticated using(company_id='${c}')with check(company_id='${c}');
 grant usage on schema public,auth to authenticated;grant select,insert,update on documenti_fiscali,fattura_ordine to authenticated;grant select on orders_visibili to authenticated;
 `);await pg.exec(await readFile("supabase/migrations/20290316131000_collega_emessa_commessa_atomica.sql","utf8"));
 const src=await readFile("supabase/migrations/20290313155500_commesse_storico_dipendenze.sql","utf8");const start=src.indexOf("create or replace function public.commessa_documenti_credito(");const end=src.indexOf("revoke all on function public.commessa_documenti_credito",start);await pg.exec(src.slice(start,end));
},30000);
afterAll(()=>pg.close());
beforeEach(async()=>{await pg.exec(`reset role;set test.blocked='false';set test.denied='false';set test.hidden='false';set test.fail_update='false';truncate documenti_fiscali,fattura_ordine,orders,movimenti_cassa_native;
 insert into orders values('${o}','${c}',null),('${o2}','${other}',null);
 insert into documenti_fiscali values('${d}','${c}',null,null,'fattura','parzialmente_pagata',1220,400,'FPR 1',null,'2026-12-01');`);});
const link=(order=o)=>pg.query("select collega_emessa_commessa($1,$2,$3)",[c,d,order]);
it("associa fattura emessa e incasso già registrato al lettore finanziario della commessa senza nuovi movimenti",async()=>{
 await pg.exec("set role authenticated");await link();await link();await pg.exec("reset role");
 expect((await pg.query("select ordine_id from documenti_fiscali")).rows[0]).toEqual({ordine_id:o});
 expect((await pg.query("select importo_associato from fattura_ordine")).rows).toEqual([{importo_associato:"1220"}]);
 const credit=(await pg.query<{credito_lordo:string;pagato_lordo:string;order_id:string}>("select * from commessa_documenti_credito($1)",[c])).rows;
 expect(credit).toHaveLength(1);expect(credit[0]).toMatchObject({order_id:o,credito_lordo:"1220.00",pagato_lordo:"400.00"});expect((await pg.query("select * from movimenti_cassa_native")).rows).toHaveLength(0);
});
it("se il salvataggio della scorciatoia fallisce non lascia un collegamento a metà",async()=>{
 await pg.exec("set test.fail_update='true'");await expect(link()).rejects.toThrow(/Update denied/);expect((await pg.query("select * from fattura_ordine")).rows).toHaveLength(0);
});
it("rifiuta commessa altra azienda o invisibile, permesso assente e utente bloccato",async()=>{
 await expect(link(o2)).rejects.toThrow(/Commessa non disponibile/);await pg.exec("set test.hidden='true'");await expect(link()).rejects.toThrow(/Commessa non disponibile/);await pg.exec("set test.hidden='false';set test.denied='true'");await expect(link()).rejects.toThrow(/Non puoi/);await pg.exec("set test.denied='false';set test.blocked='true'");await expect(link()).rejects.toThrow(/Non puoi/);
});
it("non ricollega una fattura già assegnata altrove e non riscrive quote esistenti",async()=>{
 await pg.exec(`update orders set company_id='${c}' where id='${o2}';update documenti_fiscali set ordine_id='${o2}';`);await expect(link()).rejects.toThrow(/già collegata/);
 await pg.exec(`update documenti_fiscali set ordine_id=null;insert into fattura_ordine(company_id,fattura_id,ordine_id,importo_associato)values('${c}','${d}','${o}',610);`);await link();expect((await pg.query("select importo_associato from fattura_ordine")).rows[0]).toEqual({importo_associato:"610"});
});
it("non collega bozze né documenti senza credito, e anon non può usare la RPC",async()=>{
 await pg.exec("update documenti_fiscali set stato='bozza'");await expect(link()).rejects.toThrow(/fattura emessa/);await pg.exec("set role anon");await expect(link()).rejects.toThrow(/permission denied/);
});

it("la commessa mostra incassato e residuo solo per la sua quota, sottraendo gli storni",()=>{
 expect(incassoQuotaCommessa({totale_da_pagare:1220,importo_pagato:400,importo_associato:610})).toEqual({incassato:200,residuo:410});expect(incassoQuotaCommessa({totale_da_pagare:1220,importo_pagato:1400,stornato:100})).toEqual({incassato:1120,residuo:0});
});

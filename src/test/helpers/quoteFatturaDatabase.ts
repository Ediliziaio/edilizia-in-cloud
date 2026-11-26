import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const company='10000000-0000-4000-a000-000000000001', order='20000000-0000-4000-a000-000000000001', invoice='30000000-0000-4000-a000-000000000001';
export const rateIds=[1,2,3].map(n=>`40000000-0000-4000-a000-00000000000${n}`);
export async function quoteDatabase(dataDir?:string){
 const db=new PGlite(dataDir);
 await db.exec(`select set_config('test.company','${company}',false);select set_config('test.billing','yes',false)`);
 const ready=await db.query<{t:string|null}>("select to_regclass('public.orders')::text as t");
 if(ready.rows[0]?.t)return db;
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema private;
 select set_config('test.company','${company}',false);select set_config('test.billing','yes',false);
 create function auth.uid() returns uuid language sql set search_path=public as $$select '90000000-0000-4000-a000-000000000001'::uuid$$;
 create function public.user_can_access_company(c uuid) returns boolean language sql set search_path=public as $$select c::text=current_setting('test.company',true)$$;
 create function public.puo_gestire_documento_fiscale(c uuid,t text) returns boolean language sql set search_path=public as $$select public.user_can_access_company(c) and current_setting('test.billing',true)='yes'$$;
 create function public.has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql set search_path=public as $$select public.user_can_access_company(c) and current_setting('test.billing',true)='yes'$$;
 create table orders(id uuid primary key,company_id uuid,total_amount numeric,vat_rate numeric,deleted_at timestamptz,order_type text default 'standard',valorizzazione text default 'a_corpo',payment_type text,financing_cost_mode text,financing_cost numeric);
 create table documenti_fiscali(id uuid primary key,company_id uuid,ordine_id uuid,numero text,tipo text default 'fattura',stato text default 'emessa',totale_documento numeric,imponibile_totale numeric,totale_da_pagare numeric,importo_pagato numeric default 0,metodo_pagamento_codice text,data_emissione date,deleted_at timestamptz,credito numeric default 0);
 create table invoices(id uuid primary key,company_id uuid,order_id uuid,invoice_number text,issue_date date,subtotal numeric,total numeric,deleted_at timestamptz,status text);
 create table order_installments(id uuid primary key,order_id uuid references orders,position int,label text,type text default 'deposit',amount numeric,is_paid boolean default false,paid_date date,expected_date date,documento_fiscale_id uuid references documenti_fiscali,invoice_id uuid);
 create unique index uq_order_installments_documento_fiscale on order_installments(documento_fiscale_id) where documento_fiscale_id is not null;
 create table movimenti_cassa_native(id uuid primary key default gen_random_uuid(),company_id uuid,documento_id uuid,data_movimento date,created_at timestamptz default now(),importo numeric,tipo text,metodo text,note text);
 create table prima_nota_entries(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,installment_id uuid,entry_date date,amount numeric,direction text,reversal_of uuid);
 create table fattura_ordine(company_id uuid,fattura_id uuid,ordine_id uuid,importo_associato numeric);
 create table unita_immobiliari(id uuid,order_id uuid,company_id uuid,stato_vendita text);create table unita_movimenti(unita_id uuid,tipo text,importo numeric,stornato_at timestamptz);
 create table ordini_variazione(order_id uuid,status text,impatto_economico numeric);
 create function documento_stornato_totale(d uuid) returns numeric language sql set search_path=public as $$select coalesce(credito,0) from documenti_fiscali where id=d$$;
 create function private.office_visible_order(o uuid) returns boolean language sql set search_path=public as $$select public.user_can_access_company(company_id) from orders where id=o$$;
 create function private.office_order_rights(o uuid) returns jsonb language sql set search_path=public as $$select jsonb_build_object('amounts',private.office_visible_order(o))$$;
 create function rate_importi(c uuid) returns table(installment_id uuid,order_id uuid,type text,importo numeric,is_paid boolean,paid_date date,expected_date date,documento_fiscale_id uuid,invoice_id uuid) language sql set search_path=public as $$select i.id,i.order_id,i.type,i.amount,i.is_paid,i.paid_date,i.expected_date,i.documento_fiscale_id,i.invoice_id from order_installments i join orders o on o.id=i.order_id where o.company_id=c$$;
 create function commessa_documenti_credito(c uuid) returns table(order_id uuid,documento_id uuid,invoice_id uuid,credito_lordo numeric,pagato_lordo numeric,pagato_il date,scadenza date) language sql set search_path=public as $$select null::uuid,null::uuid,null::uuid,0::numeric,0::numeric,null::date,null::date where false$$;
 -- La porzione del quadro/IVA pertinente ai test, con lo stesso SQL di produzione.
 create function private.office_quadro_pagamenti_raw(p_order_id uuid) returns jsonb language sql set search_path=public as $$select jsonb_agg(to_jsonb(r)) from (
 select i.id,i.amount,i.is_paid,coalesce(inv.invoice_number, df.numero) AS fattura,
 i.expected_date from order_installments i left join invoices inv on inv.id=i.invoice_id left join documenti_fiscali df on df.id=i.documento_fiscale_id where i.order_id=p_order_id) r$$;
 create function commessa_iva(p_order_id uuid) returns jsonb language sql set search_path=public as $$with o as(select id,company_id from orders where id=p_order_id)
 select jsonb_build_object('vecchie',count(*)) from invoices i join o on o.id=i.order_id where not exists(select 1 from documenti_fiscali df where df.company_id=o.company_id and df.numero = i.invoice_number and df.deleted_at is null)$$;
 `);
 for(const name of ['allinea_rata_da_fattura','allinea_fattura_da_rata','scollega_rata_fattura','incassa_fattura_da_rata','rate_incassi','rate_da_incassare'])await db.exec(await readFile(`src/test/fixtures/rate-fattura/public_${name}.sql`,'utf8'));
 await db.exec(`create trigger trg_allinea_fattura_da_rata after update of is_paid,documento_fiscale_id on order_installments for each row execute function allinea_fattura_da_rata();create trigger trg_sync_rata_da_fattura after update of stato,importo_pagato on documenti_fiscali for each row execute function allinea_rata_da_fattura();`);
 await db.exec(await readFile('supabase/migrations/20290418170002_fattura_unica_piu_rate_quote.sql','utf8'));
 await db.exec(`insert into orders values('${order}','${company}',1000,0,null,'standard','a_corpo',null,null,0);
 insert into documenti_fiscali(id,company_id,ordine_id,numero,totale_documento,totale_da_pagare,data_emissione) values('${invoice}','${company}','${order}','FT-UNICA',1000,1000,'2026-11-17');`);
 for(let i=0;i<3;i++)await db.query('insert into order_installments(id,order_id,position,label,amount,expected_date) values($1,$2,$3,$4,$5,$6)',[rateIds[i],order,i,['Acconto','SAL','Saldo'][i],[300,400,300][i],'2026-12-01']);
 return db;
}

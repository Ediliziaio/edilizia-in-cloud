/** PostgreSQL locale minimo: la RPC nuova è quella reale; il creatore generale è un adapter di test. */
export const quoteConversionSchema = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create function public.assert_company_access(c uuid) returns void language plpgsql as $$begin
 if c::text is distinct from current_setting('test.company',true) then raise exception 'Azienda non accessibile'; end if;
end$$;
create function public.has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql stable as $$select current_setting('test.edit',true)='true'$$;
create role anon; create role authenticated;
create table quotes(id uuid primary key,company_id uuid,status text,source text,deleted_at timestamptz,version integer,
 subtotal numeric,discount_amount numeric,vat_amount numeric,total numeric,prezzo_manuale numeric,
 quote_number text,client_name text,client_email text,client_phone text,client_company text,client_address text,
 indirizzo_lavori text,tipo_lavoro text,opportunity_id uuid,updated_at timestamptz);
create table quote_items(id uuid primary key default gen_random_uuid(),quote_id uuid,item_category text,item_type text,is_optional boolean,
 quantity numeric,unit_price numeric,discount_percent numeric,line_total numeric,name text,description text,unit_of_measure text,sort_order integer);
create table orders(id uuid primary key default gen_random_uuid(),company_id uuid,quote_id uuid,quote_number text,total_amount numeric,vat_rate numeric,
 client_name text,client_email text,client_phone text,client_company text,client_address text,indirizzo_lavori text,tipo_lavoro text,opportunity_id uuid,created_by uuid);
create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,name text,quantity numeric,unit_price numeric,status text);
create table order_installments(order_id uuid,amount numeric);
create table order_work_phases(id uuid primary key default gen_random_uuid(),company_id uuid,order_id uuid,name text not null,position integer,notes text,importo_venduto numeric);
-- Adapter della creazione ordinaria: evita di ricostruire l'intero schema gestionale nei test isolati.
create function public.create_order_atomic(p_order_data jsonb,p_items jsonb,p_salesperson jsonb,p_user_id uuid,p_installments jsonb)
returns jsonb language plpgsql as $$declare o uuid; r jsonb; begin
 insert into orders(company_id,total_amount,vat_rate) values((p_order_data->>'company_id')::uuid,(p_order_data->>'total_amount')::numeric,(p_order_data->>'vat_rate')::numeric) returning id into o;
 for r in select * from jsonb_array_elements(p_items) loop
  insert into order_items(order_id,name,quantity,unit_price,status) values(o,r->>'name',(r->>'quantity')::numeric,(r->>'unit_price')::numeric,r->>'status');
 end loop;
 for r in select * from jsonb_array_elements(p_installments) loop insert into order_installments values(o,(r->>'amount')::numeric); end loop;
 return jsonb_build_object('id',o,'success',true);
end$$;
select set_config('test.user','10000000-0000-0000-0000-000000000001',false);
select set_config('test.company','20000000-0000-0000-0000-000000000001',false);
select set_config('test.edit','true',false);
`;
export const conversionCompanyId = '20000000-0000-0000-0000-000000000001';
export const conversionQuoteId = '30000000-0000-0000-0000-000000000001';

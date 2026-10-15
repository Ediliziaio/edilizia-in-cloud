-- Rilevazione aggregata in sola lettura, riservata al superadmin.
-- Conteggi esatti su un insieme limitato di tabelle, non telemetria CPU per tenant.
create or replace function public.admin_company_database_footprint() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare
 v_table record; v_rows jsonb; v_tables jsonb := '[]'::jsonb;
 v_eligible integer; v_eligible_bytes bigint;
begin
 if auth.uid() is null or public.has_role(auth.uid(),'super_admin'::public.app_role) is distinct from true then
  raise exception 'Accesso riservato al superadmin' using errcode='42501';
 end if;
 select count(*),coalesce(sum(pg_total_relation_size(c.oid)),0) into v_eligible,v_eligible_bytes
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and exists (
  select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='company_id'
  and a.atttypid='uuid'::regtype and not a.attisdropped
 );
 -- Un conteggio aggregato per tabella, mai una query per azienda. Solo i 12 oggetti
 -- fisici più grandi; ONLY evita di contare due volte eventuali tabelle ereditate.
 for v_table in
  select c.relname,pg_total_relation_size(c.oid) total_bytes
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and exists (
   select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='company_id'
   and a.atttypid='uuid'::regtype and not a.attisdropped
  ) order by pg_total_relation_size(c.oid) desc,c.relname limit 12
 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(g)), ''[]''::jsonb) from (select company_id,count(*) records from only %I.%I group by company_id) g','public',v_table.relname) into v_rows;
  v_tables := v_tables || jsonb_build_array(jsonb_build_object('name',v_table.relname,'total_bytes',v_table.total_bytes,'companies',v_rows));
 end loop;
 return jsonb_build_object('measured_at',statement_timestamp(),'database_bytes',pg_database_size(current_database()),
  'eligible_tables',v_eligible,'eligible_bytes',v_eligible_bytes,'method','largest_company_tables_v1',
  'query_load_available',false,'tables',v_tables);
end $$;
revoke all on function public.admin_company_database_footprint() from public,anon;
grant execute on function public.admin_company_database_footprint() to authenticated;
comment on function public.admin_company_database_footprint() is 'Solo superadmin; lettura su richiesta dei conteggi per azienda nelle 12 maggiori tabelle con company_id uuid. Dimensioni fisiche globali misurate, imputazione per numero di righe stimata nel client; nessuna attribuzione di CPU o tempi SQL.';

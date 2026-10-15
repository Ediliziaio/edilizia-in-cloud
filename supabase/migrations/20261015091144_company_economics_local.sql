-- Controllo economico riservato al superadmin. Rilevazioni fornitori esplicite.
create table if not exists public.platform_cost_snapshots (
 id text primary key, batch_id text not null, label text not null,
 is_anchor boolean not null default false,
 kind text not null check(kind in ('cycle','annual','free')),
 period_start timestamptz not null,period_end timestamptz not null check(period_end>period_start),
 observed_at timestamptz not null, current_amount numeric not null check(current_amount>=0),
 forecast_amount numeric check(forecast_amount>=0), currency text not null check(currency in ('USD','EUR')),
 eur_per_unit numeric check(eur_per_unit>0),fx_date date,source_url text not null,
 last_invoice_amount numeric check(last_invoice_amount>=0),last_invoice_date date,note text not null default ''
);
alter table public.platform_cost_snapshots enable row level security;
revoke all on public.platform_cost_snapshots from anon;
grant select,insert,update,delete on public.platform_cost_snapshots to authenticated;
drop policy if exists platform_cost_snapshots_superadmin on public.platform_cost_snapshots;
create policy platform_cost_snapshots_superadmin on public.platform_cost_snapshots for all to authenticated
using (public.has_role((select auth.uid()),'super_admin'::public.app_role))
with check (public.has_role((select auth.uid()),'super_admin'::public.app_role));
create unique index if not exists platform_cost_snapshots_anchor on public.platform_cost_snapshots(batch_id) where is_anchor;
create index if not exists platform_cost_snapshots_batch on public.platform_cost_snapshots(batch_id,observed_at desc);

create or replace function public.admin_company_economics() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_batch text;v_start timestamptz;v_end timestamptz;v_measured timestamptz;v_result jsonb;
begin
 if auth.uid() is null or public.has_role(auth.uid(),'super_admin'::public.app_role) is distinct from true then
  raise exception 'Accesso riservato al superadmin' using errcode='42501';
 end if;
 select batch_id,period_start,period_end,observed_at into v_batch,v_start,v_end,v_measured
 from public.platform_cost_snapshots where is_anchor and kind='cycle' order by observed_at desc,id limit 1;
 if not found then raise exception 'Nessuna rilevazione fornitore disponibile: carica una rilevazione verificata.';end if;
 if v_measured>now()+interval '5 minutes' then raise exception 'Rilevazione nel futuro';end if;
 if v_measured<v_start or v_measured>v_end then raise exception 'Data rilevazione fuori dal ciclo';end if;
with scoped_companies as (
 select c.id,c.name,c.status,c.payment_method,c.created_at,p.name plan_name,p.price_monthly plan_monthly_eur,
 o.custom_plan_price_eur custom_monthly_eur,o.override_expires_at
 from public.companies c left join public.subscription_plans p on p.id=c.subscription_plan_id
 left join public.company_billing_overrides o on o.company_id=c.id and o.service='plan'
 and o.is_enabled is distinct from false and (o.override_expires_at is null or o.override_expires_at>v_measured)
 where c.created_at<v_measured
), cost_rows as (
 select company_id,'ai'::text kind,count(*) events,coalesce(sum(cost_real_eur),0) recorded_eur,
 count(*) filter(where cost_real_eur is null) missing_events,
 count(*) filter(where metadata->>'provider_cost_complete' is distinct from 'true') estimated_events
 from public.ai_call_ledger where created_at>=v_start and created_at<v_measured group by company_id
 union all
 select company_id,'email',count(*),coalesce(sum(cost_eur),0),count(*) filter(where cost_eur is null or cost_eur=0),0
 from public.email_delivery_log where sent_at>=v_start and sent_at<v_measured group by company_id
 union all
 select company_id,'sms',count(*),coalesce(sum(cost_eur),0),count(*) filter(where cost_eur is null or cost_eur=0),0
 from public.sms_logs where created_at>=v_start and created_at<v_measured group by company_id
 union all
 select company_id,'render',count(*),coalesce(sum(coalesce(cost_real_api,cost_real)),0),
 count(*) filter(where coalesce(cost_real_api,cost_real) is null),count(*) filter(where provider_usage is null)
 from public.render_sessions where created_at>=v_start and created_at<v_measured group by company_id
), owned_objects as (
 select coalesce(c.id,o.company_id) company_id,s.bucket_id,coalesce((s.metadata->>'size')::bigint,0) bytes
 from storage.objects s left join scoped_companies c on c.id::text=split_part(s.name,'/',1)
 left join public.orders o on o.id::text=case when split_part(s.name,'/',1)='orders' then split_part(s.name,'/',2) else split_part(s.name,'/',1) end
), storage_rows as (
 select company_id,sum(bytes) bytes,count(*) files,coalesce(sum(bytes) filter(where bucket_id='company-exports'),0) exports_bytes
 from owned_objects group by company_id
)
select jsonb_build_object(
 'measured_at',v_measured,'period_start',v_start,'period_end',v_end,
 'database_bytes',pg_database_size(current_database()),
 'storage_bytes',(select coalesce(sum(bytes),0) from owned_objects),
 'storage_measured_at',statement_timestamp(),
 'companies',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from scoped_companies c),'[]'::jsonb),
 'costs',coalesce((select jsonb_agg(to_jsonb(c)) from cost_rows c),'[]'::jsonb),
 'storage',coalesce((select jsonb_agg(to_jsonb(c)) from storage_rows c),'[]'::jsonb),
 'legacy_ai',(select jsonb_build_object('events',count(*),'recorded_eur',coalesce(sum(cost_real_eur),0),'note','Registro AI secondario escluso dal totale per evitare duplicazioni con il registro principale; copertura da riconciliare.') from public.ai_model_usage_log where ts>=v_start and ts<v_measured),
 'providers',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.platform_cost_snapshots s where s.batch_id=v_batch),'[]'::jsonb)
) into v_result;

 return v_result;
end $$;
revoke all on function public.admin_company_economics() from public,anon;
grant execute on function public.admin_company_economics() to authenticated;
comment on function public.admin_company_economics() is 'Solo superadmin. Rilevazione esplicita; AI dal ledger principale, AI legacy non sommata. Render solo API, escluso storage per evitare doppia imputazione. Dati mancanti distinti da zero; ripartizione comune nel client, esplicitamente stimata.';

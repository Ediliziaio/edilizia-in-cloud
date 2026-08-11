-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create table if not exists public.crm_email_domain_mx (
  domain text primary key,
  has_mx boolean not null default false,
  checked_at timestamptz not null default now()
);
alter table public.crm_email_domain_mx enable row level security;
drop policy if exists mx_read on public.crm_email_domain_mx;
create policy mx_read on public.crm_email_domain_mx for select using (public.is_super_admin());

-- Domini email non ancora verificati (per il runner MX)
create or replace function public.crm_next_unverified_domains(p_limit int default 400, p_company uuid default '00000000-0000-0000-0000-000000000001')
returns table(domain text) language sql stable security definer set search_path to 'public' as $$
  select d from (
    select distinct lower(split_part(m.email,'@',2)) as d
    from marketing_contacts m
    where m.company_id = p_company and m.source_channel='cold_import' and m.email is not null
  ) x
  where not exists (select 1 from crm_email_domain_mx c where c.domain = x.d)
  limit p_limit;
$$;

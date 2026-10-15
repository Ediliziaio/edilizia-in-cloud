-- Preparazione locale: moduli CS mancanti. Nessun invio o task automatico.
create table if not exists public.onboarding_task_template (
  id uuid primary key default gen_random_uuid(), ordine integer not null default 0,
  titolo text not null, descrizione text, giorni_da_iscrizione integer not null default 0,
  assegna_a_ruolo text default 'cs_agent', attivo boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.onboarding_task (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid references public.onboarding_task_template(id),
  titolo text not null check (length(btrim(titolo)) > 0), descrizione text,
  stato text not null default 'da_fare' check (stato in ('da_fare','in_corso','completato','saltato')),
  assegnato_a uuid references auth.users(id), assegnato_a_nome text,
  scadenza date, completato_at timestamptz, note text,
  created_at timestamptz not null default now()
);
create table if not exists public.superadmin_comunicazioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('email','sms','notifica_inapp')),
  oggetto text, corpo text not null check (length(btrim(corpo)) > 0),
  inviato_da uuid references auth.users(id), inviato_da_nome text,
  stato text not null default 'inviato' check (stato in ('inviato','consegnato','fallito','in_coda')),
  is_automatica boolean not null default false, metadata jsonb default '{}',
  created_at timestamptz not null default now()
);
alter table public.onboarding_task_template enable row level security;
alter table public.onboarding_task enable row level security;
alter table public.superadmin_comunicazioni enable row level security;
revoke all on public.onboarding_task_template, public.onboarding_task, public.superadmin_comunicazioni from anon;
grant select, insert, update, delete on public.onboarding_task_template, public.onboarding_task, public.superadmin_comunicazioni to authenticated;
drop policy if exists "company_admin_onboarding_template" on public.onboarding_task_template;
create policy "company_admin_onboarding_template" on public.onboarding_task_template for all to authenticated
using (public.has_role((select auth.uid()), 'super_admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
drop policy if exists "company_admin_onboarding_tasks" on public.onboarding_task;
create policy "company_admin_onboarding_tasks" on public.onboarding_task for all to authenticated
using (public.has_role((select auth.uid()), 'super_admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
drop policy if exists "company_admin_communications" on public.superadmin_comunicazioni;
create policy "company_admin_communications" on public.superadmin_comunicazioni for all to authenticated
using (public.has_role((select auth.uid()), 'super_admin'::public.app_role))
with check (public.has_role((select auth.uid()), 'super_admin'::public.app_role));
create index if not exists company_admin_onboarding_company on public.onboarding_task(company_id, stato);
create index if not exists company_admin_communications_company on public.superadmin_comunicazioni(company_id, created_at desc);

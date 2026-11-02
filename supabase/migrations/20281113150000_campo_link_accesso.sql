-- L'operaio entra nell'app con un link mandato dall'ufficio, senza email né password.
-- Del link si conserva solo l'impronta: chi legge la tabella non può entrare al posto di nessuno.
-- La tabella la usano soltanto le funzioni campo-link-crea e campo-link-entra, col service role.
create table if not exists public.campo_link_accesso (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  scade_il timestamptz not null,
  usato_il timestamptz,
  revocato_il timestamptz
);

create index if not exists campo_link_accesso_dipendente
  on public.campo_link_accesso (employee_id)
  where usato_il is null and revocato_il is null;
create index if not exists campo_link_accesso_azienda
  on public.campo_link_accesso (company_id);
create index if not exists campo_link_accesso_autore
  on public.campo_link_accesso (created_by);

alter table public.campo_link_accesso enable row level security;
revoke all on table public.campo_link_accesso from public, anon, authenticated;
grant all on table public.campo_link_accesso to service_role;

-- Le voci del rapportino le decide ogni azienda: elenco nelle impostazioni, con unita',
-- costo e vendita gia' pronti. Se le voci scritte a mano sono permesse lo decide l'azienda.
set local lock_timeout = '3s';
create table if not exists public.rapportino_voci_modello (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  unita text not null default 'cad',
  costo_unitario numeric check (costo_unitario is null or costo_unitario >= 0),
  vendita_unitaria numeric check (vendita_unitaria is null or vendita_unitaria >= 0),
  attivo boolean not null default true,
  ordine integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists rapportino_voci_modello_azienda on public.rapportino_voci_modello (company_id, ordine);
create table if not exists public.rapportino_voci_impostazioni (
  company_id uuid primary key references public.companies(id) on delete cascade,
  a_mano boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.rapportino_voci_modello enable row level security;
alter table public.rapportino_voci_impostazioni enable row level security;
revoke all on public.rapportino_voci_modello from anon;
revoke all on public.rapportino_voci_impostazioni from anon;
drop policy if exists voci_modello_lettura on public.rapportino_voci_modello;
create policy voci_modello_lettura on public.rapportino_voci_modello for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));
drop policy if exists voci_modello_scrittura on public.rapportino_voci_modello;
create policy voci_modello_scrittura on public.rapportino_voci_modello for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));
drop policy if exists voci_impostazioni_lettura on public.rapportino_voci_impostazioni;
create policy voci_impostazioni_lettura on public.rapportino_voci_impostazioni for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));
drop policy if exists voci_impostazioni_scrittura on public.rapportino_voci_impostazioni;
create policy voci_impostazioni_scrittura on public.rapportino_voci_impostazioni for all to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id))
  with check (public.has_permission_for_company((select auth.uid()), 'can_edit_settings_orders', company_id));

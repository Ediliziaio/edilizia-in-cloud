-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create table if not exists public.crm_cap_centroids (
  cap text primary key,
  lat double precision not null,
  lng double precision not null,
  sigla text
);
alter table public.crm_cap_centroids enable row level security;
drop policy if exists cap_centroids_read on public.crm_cap_centroids;
create policy cap_centroids_read on public.crm_cap_centroids for select using (public.is_super_admin());

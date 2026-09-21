-- Denylist gestibile dall'admin per l'import dei lead Meta (Facebook/Instagram
-- Lead Ads). Un lead la cui campagna / adset / annuncio contiene uno di questi
-- pattern NON viene importato nel CRM clienti (marketing_contacts).
--
-- Nasce per escludere le campagne di RECLUTAMENTO venditori (candidati, non
-- clienti), prima gestite con un pattern fisso dentro l'edge meta-process-leads.
-- Ora il super admin la gestisce da /admin/impostazioni/meta-lead-esclusioni.
-- L'edge legge la lista col service_role (bypassa RLS) e tiene i pattern qui
-- sotto come fallback se la tabella è vuota o irraggiungibile.

create table if not exists public.meta_lead_import_denylist (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,
  label       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid
);

-- Un pattern è unico a meno del maiuscolo/minuscolo (il match è case-insensitive).
create unique index if not exists meta_lead_import_denylist_pattern_uq
  on public.meta_lead_import_denylist (lower(pattern));

alter table public.meta_lead_import_denylist enable row level security;

-- Solo il super admin gestisce la lista (l'edge legge col service_role).
drop policy if exists meta_lead_denylist_superadmin_all on public.meta_lead_import_denylist;
create policy meta_lead_denylist_superadmin_all
  on public.meta_lead_import_denylist
  for all
  to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- Non è una tabella pubblica: nessun accesso ad anon.
revoke all on public.meta_lead_import_denylist from anon;

-- Seed: gli stessi pattern reclutamento già attivi nell'edge (che restano come
-- fallback nel codice). lower(pattern) è la chiave, il match è per sottostringa.
insert into public.meta_lead_import_denylist (pattern, label) values
  ('venditor',            'Reclutamento — venditori/venditore'),
  ('recluta',             'Reclutamento'),
  ('assumiam',            'Reclutamento — assumiamo'),
  ('lavora con noi',      'Reclutamento — lavora con noi'),
  ('candidat',            'Reclutamento — candidati'),
  ('selezione personale', 'Reclutamento — selezione personale'),
  ('offerta di lavoro',   'Reclutamento — offerta di lavoro')
on conflict do nothing;

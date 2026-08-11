-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ── Dati normativi telefonia PER AZIENDA ────────────────────────────────────────
-- White-label: ogni azienda inserisce i PROPRI dati e carica i PROPRI documenti.
-- La responsabilità legale del numero è dell'azienda, non della piattaforma.
create table if not exists public.company_telephony_compliance (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null unique references public.companies(id) on delete cascade,
  -- dati legali
  ragione_sociale           text,
  partita_iva               text,
  codice_fiscale            text,
  tipo_soggetto             text not null default 'azienda' check (tipo_soggetto in ('azienda','persona')),
  -- indirizzo (richiesto da Telnyx per i numeri IT)
  indirizzo                 text,
  civico                    text,
  citta                     text,
  cap                       text,
  provincia                 text,
  paese                     text not null default 'IT',
  email_contatto            text,
  telefono_contatto         text,
  -- documenti (path nello storage privato telephony-compliance)
  doc_identita_path         text,
  doc_indirizzo_path        text,
  doc_visura_path           text,
  -- stato workflow normativo
  stato                     text not null default 'da_compilare'
                              check (stato in ('da_compilare','in_revisione','approvato','rifiutato')),
  telnyx_requirement_group_id text,
  note_revisione            text,
  inviato_il                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists idx_company_compliance_company on public.company_telephony_compliance(company_id);

alter table public.company_telephony_compliance enable row level security;

-- L'azienda gestisce SOLO la propria riga; il super_admin vede/gestisce tutto (revisione).
drop policy if exists company_compliance_select on public.company_telephony_compliance;
create policy company_compliance_select on public.company_telephony_compliance
  for select using (company_id = public.get_my_company_id() or public.is_super_admin());

drop policy if exists company_compliance_insert on public.company_telephony_compliance;
create policy company_compliance_insert on public.company_telephony_compliance
  for insert with check (company_id = public.get_my_company_id() or public.is_super_admin());

drop policy if exists company_compliance_update on public.company_telephony_compliance;
create policy company_compliance_update on public.company_telephony_compliance
  for update using (company_id = public.get_my_company_id() or public.is_super_admin())
  with check (company_id = public.get_my_company_id() or public.is_super_admin());

-- ── Storage privato per i documenti normativi ───────────────────────────────────
insert into storage.buckets (id, name, public)
values ('telephony-compliance', 'telephony-compliance', false)
on conflict (id) do nothing;

-- I file vivono sotto la cartella <company_id>/...  → l'azienda accede solo ai propri.
drop policy if exists tc_docs_select on storage.objects;
create policy tc_docs_select on storage.objects for select
  using (bucket_id = 'telephony-compliance'
         and ((storage.foldername(name))[1] = public.get_my_company_id()::text or public.is_super_admin()));

drop policy if exists tc_docs_insert on storage.objects;
create policy tc_docs_insert on storage.objects for insert
  with check (bucket_id = 'telephony-compliance'
              and (storage.foldername(name))[1] = public.get_my_company_id()::text);

drop policy if exists tc_docs_update on storage.objects;
create policy tc_docs_update on storage.objects for update
  using (bucket_id = 'telephony-compliance'
         and (storage.foldername(name))[1] = public.get_my_company_id()::text);

drop policy if exists tc_docs_delete on storage.objects;
create policy tc_docs_delete on storage.objects for delete
  using (bucket_id = 'telephony-compliance'
         and ((storage.foldername(name))[1] = public.get_my_company_id()::text or public.is_super_admin()));

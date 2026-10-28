set local lock_timeout='3s';
set local statement_timeout='60s';
create table if not exists public.pos_modelli_aziendali (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 nome text not null check(length(trim(nome)) between 1 and 100),
 ambito text not null check(length(trim(ambito)) between 1 and 500),
 versione integer not null check(versione>0),
 contenuto jsonb not null check(jsonb_typeof(contenuto)='object' and contenuto ? 'lavorazioni' and (contenuto - 'lavorazioni' - 'versione_modello')='{}'::jsonb and jsonb_typeof(contenuto->'lavorazioni')='array' and jsonb_array_length(contenuto->'lavorazioni')>0),
 sorgente_pos_id uuid references public.pos_documents(id) on delete set null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 archiviato boolean not null default false
);
create unique index if not exists pos_modelli_nome_versione on public.pos_modelli_aziendali(company_id,lower(trim(nome)),versione);
create index if not exists pos_modelli_sorgente on public.pos_modelli_aziendali(sorgente_pos_id) where sorgente_pos_id is not null;
create index if not exists pos_modelli_autore on public.pos_modelli_aziendali(created_by);
alter table public.pos_modelli_aziendali enable row level security;
revoke all on public.pos_modelli_aziendali from anon,authenticated;
grant select on public.pos_modelli_aziendali to authenticated;
grant all on public.pos_modelli_aziendali to service_role;
drop policy if exists pos_modelli_lettura on public.pos_modelli_aziendali;
create policy pos_modelli_lettura on public.pos_modelli_aziendali for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
comment on table public.pos_modelli_aziendali is 'Basi tecniche aziendali versionate, non POS approvati. Scrittura solo dal server dopo controllo permessi e sanitizzazione.';
notify pgrst,'reload schema';

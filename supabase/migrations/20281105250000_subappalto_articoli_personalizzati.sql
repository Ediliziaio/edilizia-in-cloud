set local lock_timeout='3s';
set local statement_timeout='60s';
-- Condizioni del contratto di subappalto modificabili articolo per articolo (31/10/2026).
-- Prima erano personalizzabili solo obblighi, pagamenti, penali, garanzie e note; gli altri articoli
-- (massimale RC, penali fisse, revisione prezzi, foro…) erano scritti nel codice.
--   · subappalto_modello_contratto: lo standard dell'azienda, {titolo articolo: testo}. Vale per tutti
--     i contratti che non hanno un testo proprio per quell'articolo.
--   · contratti_subappalto.articoli_personalizzati: il testo del singolo contratto, che vince sullo standard.
-- Il titolo degli articoli non cambia (serve all'approvazione specifica artt. 1341-1342 c.c. e alla firma).
-- Niente DROP: idempotente.

alter table public.contratti_subappalto add column if not exists articoli_personalizzati jsonb not null default '{}'::jsonb;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='contratti_subappalto_articoli_personalizzati_oggetto') then
  alter table public.contratti_subappalto add constraint contratti_subappalto_articoli_personalizzati_oggetto
   check (jsonb_typeof(articoli_personalizzati)='object' and length(articoli_personalizzati::text)<=200000);
 end if;
end $$;

create table if not exists public.subappalto_modello_contratto (
 company_id uuid primary key references public.companies(id) on delete cascade,
 articoli jsonb not null default '{}'::jsonb check (jsonb_typeof(articoli)='object' and length(articoli::text)<=200000),
 updated_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id)
);
alter table public.subappalto_modello_contratto enable row level security;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='subappalto_modello_contratto' and policyname='subappalto_modello_leggi') then
  create policy subappalto_modello_leggi on public.subappalto_modello_contratto for select to authenticated
   using(auth.uid() is not null and not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id) and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id));
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='subappalto_modello_contratto' and policyname='subappalto_modello_scrivi') then
  create policy subappalto_modello_scrivi on public.subappalto_modello_contratto for all to authenticated
   using(auth.uid() is not null and not public.utente_bloccato() and not public.utente_sola_lettura(company_id)
     and public.has_permission_for_company(auth.uid(),'can_edit_orders',company_id)
     and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id)
     and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id))
   with check(auth.uid() is not null and not public.utente_bloccato() and not public.utente_sola_lettura(company_id)
     and public.has_permission_for_company(auth.uid(),'can_edit_orders',company_id)
     and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id)
     and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id));
 end if;
end $$;

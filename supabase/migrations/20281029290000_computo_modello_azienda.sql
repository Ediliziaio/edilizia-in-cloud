-- Il modello del «Preventivo con computo», uno per azienda (29/10/2026).
--
-- Si imposta in Impostazioni → Modelli preventivi → Preventivo generico, accanto
-- alle offerte del preventivo classico: colori, copertina, logo, premessa, firma,
-- piè di pagina e le condizioni che ogni computo nuovo trova già scritte.
-- Tabella sua e non una riga di `quote_templates`: quella la leggono il
-- preventivo classico, `CopiaCondizioni` e `generate-quote-pdf`, e un modello
-- di computo finirebbe nelle loro liste e tra i predefiniti.
--
-- `impostazioni` è un jsonb validato nel client (`src/lib/computo/modelloComputo.ts`):
-- i campi nuovi arrivano coi valori di serie, senza migrazioni.
-- Letture e scritture come `quote_templates`: legge chi è dell'azienda, scrive
-- chi può modificare le impostazioni dei prezzi.

create table if not exists public.computo_modelli (
  company_id uuid primary key references public.companies(id) on delete cascade,
  impostazioni jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint computo_modelli_impostazioni_oggetto check (jsonb_typeof(impostazioni) = 'object'),
  constraint computo_modelli_impostazioni_misura check (pg_column_size(impostazioni) <= 200000)
);

alter table public.computo_modelli enable row level security;

drop policy if exists blocco_utente_bloccato on public.computo_modelli;
create policy blocco_utente_bloccato on public.computo_modelli as restrictive for all to authenticated
  using (not (select public.utente_bloccato()));

drop policy if exists computo_modelli_lettura on public.computo_modelli;
create policy computo_modelli_lettura on public.computo_modelli for select to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))));

drop policy if exists computo_modelli_scrittura on public.computo_modelli;
create policy computo_modelli_scrittura on public.computo_modelli for all to authenticated
  using (
    company_id = (select public.get_user_company_id((select auth.uid())))
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
  )
  with check (
    company_id = (select public.get_user_company_id((select auth.uid())))
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
  );

drop policy if exists computo_modelli_super_admin on public.computo_modelli;
create policy computo_modelli_super_admin on public.computo_modelli for all to authenticated
  using ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

revoke all on public.computo_modelli from public, anon;
grant select, insert, update, delete on public.computo_modelli to authenticated;
grant all on public.computo_modelli to service_role;

-- La rimanenza dei lavori in corso al 31 dicembre (9 novembre 2026).
--
-- Serve una riga per esercizio, scritta da chi chiude il bilancio. Non si può
-- calcolare a posteriori: l'avanzamento delle fasi è un valore di OGGI, il
-- database non conserva com'era un anno fa. Quindi la rimanenza iniziale di un
-- esercizio è un dato che si registra, non si deduce — e finché non c'è, la
-- voce «Variazione rimanenze lavori in corso» del conto economico resta a
-- zero, come è sempre stata: meglio zero che un numero inventato.
--
-- Questa migrazione crea solo la tabella e le sue regole di accesso, e sta da
-- sola: su questo progetto un CREATE POLICY prende un lock esclusivo su tutte
-- le tabelle di auth fino al COMMIT, quindi la transazione che ne contiene uno
-- deve essere la più corta possibile.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table if not exists public.cg_rimanenze_lavori (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  esercizio integer not null,
  -- Il valore dei lavori eseguiti e non ancora fatturati al 31/12.
  importo numeric(14,2) not null default 0,
  -- 'calcolata' quando è il valore che il sistema aveva calcolato in quel
  -- momento, 'manuale' quando l'ha scritto una persona.
  fonte text not null default 'manuale' check (fonte in ('manuale', 'calcolata')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, esercizio)
);

comment on table public.cg_rimanenze_lavori is
  'Rimanenza dei lavori in corso su ordinazione al 31/12 di ogni esercizio, per azienda. La scrive chi chiude il bilancio: l''avanzamento delle fasi è un dato di oggi e non si può ricostruire a una data passata (09/11/2026).';

alter table public.cg_rimanenze_lavori enable row level security;

drop policy if exists cg_rimanenze_select on public.cg_rimanenze_lavori;
create policy cg_rimanenze_select on public.cg_rimanenze_lavori
  for select
  using (company_id = (select public.get_my_company_id()) and not public.utente_e_cliente_esterno());

drop policy if exists cg_rimanenze_insert on public.cg_rimanenze_lavori;
create policy cg_rimanenze_insert on public.cg_rimanenze_lavori
  for insert
  with check (company_id = (select public.get_my_company_id()));

drop policy if exists cg_rimanenze_update on public.cg_rimanenze_lavori;
create policy cg_rimanenze_update on public.cg_rimanenze_lavori
  for update
  using (company_id = (select public.get_my_company_id()) and not public.utente_e_cliente_esterno())
  with check (company_id = (select public.get_my_company_id()));

drop policy if exists cg_rimanenze_delete on public.cg_rimanenze_lavori;
create policy cg_rimanenze_delete on public.cg_rimanenze_lavori
  for delete
  using (company_id = (select public.get_my_company_id()) and not public.utente_e_cliente_esterno());

-- Le due regole che valgono su tutte le tabelle del progetto.
drop policy if exists blocco_utente_bloccato on public.cg_rimanenze_lavori;
create policy blocco_utente_bloccato on public.cg_rimanenze_lavori
  for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists permessi_solo_ufficio on public.cg_rimanenze_lavori;
create policy permessi_solo_ufficio on public.cg_rimanenze_lavori
  for all to authenticated
  using (not (select public.e_solo_campo()))
  with check (not (select public.e_solo_campo()));

grant select, insert, update, delete on public.cg_rimanenze_lavori to authenticated;

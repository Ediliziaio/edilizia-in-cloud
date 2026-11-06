-- Certificato di pagamento del SAL: lavori, varianti, ritenuta, recupero dell'anticipazione,
-- altre detrazioni, acconti precedenti e netto da fatturare. sal_records tiene solo il cumulativo
-- lordo: «Crea fattura» proponeva quello, mentre negli appalti si fattura il netto del certificato.
-- Facoltativo, una riga per SAL. Nessun dato esistente viene toccato. Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.sal_certificati (
  sal_id uuid primary key references public.sal_records(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  lavori_contrattuali numeric(14,2) not null default 0,
  varianti numeric(14,2) not null default 0,
  ritenuta_pct numeric(5,2) not null default 10,
  ritenuta numeric(14,2) not null default 0,
  recupero_anticipazione numeric(14,2) not null default 0,
  altre_detrazioni numeric(14,2) not null default 0,
  altre_detrazioni_nota text,
  acconti_precedenti numeric(14,2) not null default 0,
  netto numeric(14,2) not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sal_certificati_importi check (
    ritenuta >= 0 and recupero_anticipazione >= 0 and altre_detrazioni >= 0 and acconti_precedenti >= 0),
  constraint sal_certificati_ritenuta_pct check (ritenuta_pct >= 0 and ritenuta_pct <= 100),
  constraint sal_certificati_netto_torna check (
    abs(netto - (lavori_contrattuali + varianti - ritenuta - recupero_anticipazione - altre_detrazioni - acconti_precedenti)) <= 0.05)
);
comment on table public.sal_certificati is
  'Certificato di pagamento di un SAL (cumulativo). netto è ciò che si fattura per quel SAL; senza riga si fattura la differenza dei cumulativi.';
create index if not exists sal_certificati_ordine_idx on public.sal_certificati (order_id);

-- Azienda e commessa sono sempre quelle del SAL, qualunque cosa arrivi dal browser.
create or replace function public.sal_certificato_coerente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.company_id, s.order_id into new.company_id, new.order_id
    from public.sal_records s where s.id = new.sal_id;
  if new.company_id is null then
    raise exception 'SAL non trovato.' using errcode = 'P0002';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.sal_certificato_coerente() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'sal_certificato_coerente' and tgrelid = 'public.sal_certificati'::regclass) then
    create trigger sal_certificato_coerente before insert or update on public.sal_certificati
      for each row execute function public.sal_certificato_coerente();
  end if;
end $$;

alter table public.sal_certificati enable row level security;
revoke all on public.sal_certificati from public, anon;
grant select, insert, update, delete on public.sal_certificati to authenticated;
grant all on public.sal_certificati to service_role;

-- Permesso sal_certificati: lettura ai membri dell’azienda (inclusi accessi multipli attivi);
-- scrittura solo con puo_modificare_commessa, blocco utenti e controllo superadmin come sal_records.
-- Le stesse regole di sal_records.
drop policy if exists blocco_utente_bloccato on public.sal_certificati;
create policy blocco_utente_bloccato on public.sal_certificati as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists sal_certificati_lettura_azienda on public.sal_certificati;
create policy sal_certificati_lettura_azienda on public.sal_certificati for select to authenticated
  using (company_id in (
    select p.company_id from public.profiles p where p.id = (select auth.uid())
    union
    select m.company_id from public.multi_company_access m
     where m.user_id = (select auth.uid()) and m.status = 'active' and (m.expires_at is null or m.expires_at > now())));
drop policy if exists sal_certificati_insert_con_permesso on public.sal_certificati;
create policy sal_certificati_insert_con_permesso on public.sal_certificati for insert to authenticated
  with check (exists (select 1 from public.sal_records s where s.id = sal_id and public.puo_modificare_commessa(s.order_id)));
drop policy if exists sal_certificati_update_con_permesso on public.sal_certificati;
create policy sal_certificati_update_con_permesso on public.sal_certificati for update to authenticated
  using (public.puo_modificare_commessa(order_id))
  with check (exists (select 1 from public.sal_records s where s.id = sal_id and public.puo_modificare_commessa(s.order_id)));
drop policy if exists sal_certificati_delete_con_permesso on public.sal_certificati;
create policy sal_certificati_delete_con_permesso on public.sal_certificati for delete to authenticated
  using (public.puo_modificare_commessa(order_id));
drop policy if exists sal_certificati_superadmin on public.sal_certificati;
create policy sal_certificati_superadmin on public.sal_certificati for all to authenticated
  using (public.has_role((select auth.uid()), 'super_admin'::public.app_role))
  with check (public.has_role((select auth.uid()), 'super_admin'::public.app_role));

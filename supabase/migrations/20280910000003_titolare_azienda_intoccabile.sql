-- Il titolare dell'azienda.
--
-- Finora un amministratore poteva declassare un collega amministratore: le
-- uniche protezioni erano "non a te stesso" e "non l'ultimo rimasto". In
-- un'impresa familiare con tre soci amministratori questo significa che
-- chiunque può togliere le chiavi al titolare.
--
-- Da qui in poi un'azienda può indicare CHI è il titolare. Quel ruolo non si
-- tocca, e i ruoli degli altri amministratori li cambia solo lui.
-- Dove il titolare non è indicato non cambia nulla: valgono le due protezioni
-- di prima.
alter table public.companies
  add column if not exists titolare_user_id uuid references public.profiles(id) on delete set null;

comment on column public.companies.titolare_user_id is
  'Chi comanda in questa azienda. Il suo ruolo di amministratore non è revocabile, ed è l''unico che può cambiare il ruolo agli altri amministratori.';

create index if not exists idx_companies_titolare on public.companies (titolare_user_id)
  where titolare_user_id is not null;

create or replace function public.proteggi_titolare_azienda()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_azienda uuid;
  v_attore uuid := auth.uid();
begin
  if OLD.role <> 'company_admin' then return OLD; end if;

  -- Chi agisce dal server (cron, funzioni edge, manutenzione) non è soggetto
  -- al controllo: lì l'identità non c'è e il contesto è già fidato.
  if v_attore is null then return OLD; end if;
  if public.has_role(v_attore, 'super_admin') then return OLD; end if;

  -- L'azienda di cui questo utente è titolare. Se il profilo non esiste più
  -- siamo dentro la cancellazione dell'utente: lì non blocchiamo.
  select c.id into v_azienda
  from companies c
  join profiles p on p.id = OLD.user_id
  where c.titolare_user_id = OLD.user_id and c.deleted_at is null
  limit 1;

  if v_azienda is not null then
    raise exception 'Non si può togliere il ruolo di amministratore al titolare dell''azienda. Indica prima un altro titolare.'
      using errcode = '42501';
  end if;

  -- Il ruolo di un amministratore lo cambia solo il titolare.
  select c.id into v_azienda
  from companies c
  join profiles p on p.id = OLD.user_id and p.company_id = c.id
  where c.titolare_user_id is not null and c.titolare_user_id <> v_attore and c.deleted_at is null
  limit 1;

  if v_azienda is not null then
    raise exception 'Solo il titolare dell''azienda può cambiare il ruolo a un altro amministratore.'
      using errcode = '42501';
  end if;

  return OLD;
end $$;

revoke all on function public.proteggi_titolare_azienda() from public, anon, authenticated;

drop trigger if exists trg_proteggi_titolare on public.user_roles;
create trigger trg_proteggi_titolare
  before delete on public.user_roles
  for each row execute function public.proteggi_titolare_azienda();

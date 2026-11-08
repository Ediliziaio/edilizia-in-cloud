-- Un cliente senza portale è un'anagrafica, non un account di autenticazione.
-- Non elimina profili né dati commerciali; gli UUID delle anagrafiche restano stabili.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.user_roles drop constraint if exists user_roles_user_id_fkey;
alter table public.user_roles add constraint user_roles_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- Senza un'identità Auth si possono salvare solo anagrafiche senza accesso.
create or replace function public.anagrafica_senza_auth_resta_chiusa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id = new.id) then
    if not coalesce(new.is_blocked,false) or not coalesce(new.portal_disabled,false)
       or exists(select 1 from public.user_roles where user_id=new.id and role <> 'customer') then
      raise exception 'Anagrafica senza account: accesso disattivato obbligatorio' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_anagrafica_senza_auth_resta_chiusa on public.profiles;
create trigger trg_anagrafica_senza_auth_resta_chiusa
  before insert or update of id,is_blocked,portal_disabled on public.profiles
  for each row execute function public.anagrafica_senza_auth_resta_chiusa();

create or replace function public.ruolo_senza_auth_solo_cliente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> 'customer' and not exists(select 1 from auth.users where id=new.user_id) then
    raise exception 'Un ruolo operativo richiede un account di autenticazione' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_ruolo_senza_auth_solo_cliente on public.user_roles;
create trigger trg_ruolo_senza_auth_solo_cliente before insert or update on public.user_roles
  for each row execute function public.ruolo_senza_auth_solo_cliente();

-- Mantiene la precedente pulizia a cascata per lo staff. Le anagrafiche cliente
-- sopravvivono alla rimozione del login: fatture e commesse continuano a puntarvi.
create or replace function public.pulisci_profilo_dopo_rimozione_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.user_roles where user_id=old.id and role='customer')
     and not exists(select 1 from public.user_roles where user_id=old.id and role<>'customer') then
    update public.profiles set is_blocked=true,portal_disabled=true where id=old.id;
  else
    delete from public.profiles where id=old.id;
  end if;
  return old;
end $$;
drop trigger if exists trg_pulisci_profilo_dopo_rimozione_auth on auth.users;
create trigger trg_pulisci_profilo_dopo_rimozione_auth after delete on auth.users
  for each row execute function public.pulisci_profilo_dopo_rimozione_auth();

revoke all on function public.anagrafica_senza_auth_resta_chiusa() from public,anon,authenticated;
revoke all on function public.ruolo_senza_auth_solo_cliente() from public,anon,authenticated;
revoke all on function public.pulisci_profilo_dopo_rimozione_auth() from public,anon,authenticated;

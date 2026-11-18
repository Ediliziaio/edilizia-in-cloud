-- Conserva un'eventuale sospensione Auth indipendente dal blocco del profilo.
create schema if not exists private;
create table private.blocchi_accesso_profilo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  banned_until_precedente timestamptz
);
revoke all on private.blocchi_accesso_profilo from public, anon, authenticated;

create function private.allinea_blocco_auth(persona uuid, blocca boolean, autore uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  blocco_profilo constant timestamptz := '9999-12-31 00:00:00+00';
  scadenza timestamptz;
begin
  select banned_until into scadenza from auth.users where id = persona for update;
  if not found then return; end if; -- Scheda anagrafica senza login.
  if blocca then
    insert into private.blocchi_accesso_profilo values (persona, scadenza)
      on conflict (user_id) do nothing;
    update auth.users set banned_until = blocco_profilo where id = persona;
    perform public.chiudi_accessi_utente(persona, null, null, autore, 'Accesso bloccato');
  else
    delete from private.blocchi_accesso_profilo where user_id = persona
      returning banned_until_precedente into scadenza;
    if found then
      update auth.users set banned_until = scadenza
        where id = persona and banned_until = blocco_profilo;
    end if;
  end if;
end;
$$;
revoke all on function private.allinea_blocco_auth(uuid, boolean, uuid) from public, anon, authenticated;

create function private.sincronizza_blocco_profilo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.allinea_blocco_auth(new.id, new.is_blocked, new.blocked_by);
  return new;
end;
$$;
revoke all on function private.sincronizza_blocco_profilo() from public, anon, authenticated;

create trigger profilo_bloccato_auth_modifica after update of is_blocked on public.profiles
  for each row when (old.is_blocked is distinct from new.is_blocked)
  execute function private.sincronizza_blocco_profilo();
create trigger profilo_bloccato_auth_creazione after insert on public.profiles
  for each row when (new.is_blocked) execute function private.sincronizza_blocco_profilo();

select private.allinea_blocco_auth(id, true, blocked_by) from public.profiles where is_blocked;

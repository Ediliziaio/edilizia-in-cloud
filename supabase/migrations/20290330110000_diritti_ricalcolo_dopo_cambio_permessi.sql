-- I diritti ricordati per la richiesta si buttano quando cambiano permessi, ruoli o accessi (15/11/2026).
--
-- 20290330100000 fa ricordare a office_company_rights la risposta per tutta la transazione. Ma una
-- transazione che prima cambia un permesso e poi lo legge (un'operazione che concede «Costi» e
-- subito mostra i costi; la prova offline dei permessi delle retribuzioni fa proprio così) avrebbe
-- avuto la risposta vecchia. Ora ogni risposta ricordata porta un numero di giro; una scrittura su
-- una delle tabelle da cui dipendono i diritti (permessi, ruoli, profilo bloccato, accessi
-- multi-azienda, studi del commercialista) fa avanzare il giro, e la risposta vecchia non vale più.
-- Il trigger è per istruzione, non per riga: costa una set_config per scrittura.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.diritti_nuovo_giro()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
begin
  perform set_config('eic_diritti.giro',
    (coalesce(nullif(current_setting('eic_diritti.giro', true), ''), '0')::bigint + 1)::text, true);
  return null;
end
$function$;
revoke all on function private.diritti_nuovo_giro() from public, anon, authenticated;

do $trigger$
declare t text;
begin
  foreach t in array array['staff_permissions','user_roles','profiles','multi_company_access',
                           'accountant_firm_members','accountant_company_access'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists zz_diritti_nuovo_giro on public.%I', t);
    execute format('create trigger zz_diritti_nuovo_giro after insert or update or delete or truncate on public.%I
      for each statement execute function private.diritti_nuovo_giro()', t);
  end loop;
end $trigger$;

create or replace function private.office_company_rights(p_company uuid)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  utente uuid := auth.uid();
  chiave text;
  ricordato text;
  giro text := coalesce(nullif(current_setting('eic_diritti.giro', true), ''), '0');
  risultato jsonb;
begin
  if p_company is null or utente is null or coalesce(auth.role(), '') = 'service_role' then
    return private.office_company_rights_calcolo(p_company);
  end if;
  chiave := 'eic_diritti.c' || replace(p_company::text, '-', '');
  ricordato := current_setting(chiave, true);
  -- valore: «utente|giro|risposta»
  if ricordato is not null and split_part(ricordato, '|', 1) = utente::text
     and split_part(ricordato, '|', 2) = giro then
    return nullif(split_part(ricordato, '|', 3), 'null')::jsonb;
  end if;
  risultato := private.office_company_rights_calcolo(p_company);
  perform set_config(chiave, utente::text || '|' || giro || '|' || coalesce(risultato::text, 'null'), true);
  return risultato;
end
$function$;
revoke all on function private.office_company_rights(uuid) from public, anon;
grant execute on function private.office_company_rights(uuid) to authenticated, service_role;

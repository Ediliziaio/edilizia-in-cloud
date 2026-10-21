-- La scheda dipendente si collega da sola all'utente con la stessa email
-- (fn_employees_autolink_user). Ora solo a un utente della stessa azienda:
-- prima bastava l'email, e un utente di un'altra azienda con quell'email
-- sarebbe diventato il dipendente, con i suoi accessi alle commesse
-- (dipendente_account_allinea_accessi). Al 21/10/2026 nessun legame
-- tra aziende diverse.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.fn_employees_autolink_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pid uuid;
begin
  if new.user_id is not null or new.email is null or trim(new.email) = '' then
    return new;
  end if;
  select min(p.id::text)::uuid into v_pid
    from profiles p
   where lower(p.email) = lower(new.email)
     and p.company_id = new.company_id
    having count(distinct p.id) = 1;
  if v_pid is null then return new; end if;
  if exists (select 1 from employees e where e.company_id = new.company_id and e.user_id = v_pid and e.id is distinct from new.id) then
    return new;
  end if;
  new.user_id := v_pid;
  return new;
end $function$;

-- Funzione di trigger: nessuno deve poterla chiamare direttamente.
REVOKE ALL ON FUNCTION public.fn_employees_autolink_user() FROM PUBLIC, anon, authenticated;

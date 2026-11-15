-- Ogni commessa nasce col suo codice, da qualunque parte arrivi (15/11/2026).
--
-- Il codice lo proponeva solo la pagina «Nuova commessa» (`prossimo_numero_commessa`). Le commesse
-- create altrove nascevano senza: dal preventivo del committente (`converti-preventivo-cantiere`),
-- da «Nuovo lavoro» dell'appaltatore lasciando il campo vuoto (il riepilogo diceva «Auto», ma
-- nessuno lo assegnava), dalle importazioni. Sette commesse in 120 giorni, su tre aziende.
--
-- Ora un trigger BEFORE INSERT, se il codice è vuoto, assegna il prossimo libero con la stessa regola
-- di `prossimo_numero_commessa` (prefisso dell'azienda, numero più alto + 1, quattro cifre). Un lock
-- per azienda, fino alla fine della transazione, evita che due inserimenti insieme prendano lo
-- stesso numero. Chi scrive il codice a mano lo tiene. Le commesse già senza codice non si toccano.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create schema if not exists private;

create or replace function private.codice_commessa_libero(p_company_id uuid)
returns text
language plpgsql
volatile -- non stable: dopo il lock deve vedere le commesse appena salvate da chi aspettava prima
security definer
set search_path to ''
as $function$
declare
  v_prefix text;
  v_max bigint;
  v_code text;
  v_i int := 0;
begin
  select coalesce(nullif(btrim(c.order_code_prefix), ''), 'O') into v_prefix
    from public.companies c where c.id = p_company_id;
  if v_prefix is null then v_prefix := 'O'; end if;

  select coalesce(max((regexp_match(o.order_code, '([0-9]+)\s*$'))[1]::bigint), 0) into v_max
    from public.orders o
   where o.company_id = p_company_id
     and o.order_code is not null
     and lower(o.order_code) like lower(v_prefix) || '%'
     and o.order_code ~ '[0-9]+\s*$';

  v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
  while v_i < 10000 and exists (
    select 1 from public.orders o where o.company_id = p_company_id and lower(o.order_code) = lower(v_code)
  ) loop
    v_max := v_max + 1;
    v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
    v_i := v_i + 1;
  end loop;
  return v_code;
end;
$function$;
revoke all on function private.codice_commessa_libero(uuid) from public, anon, authenticated;

create or replace function private.orders_codice_automatico()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.company_id is not null and coalesce(btrim(new.order_code), '') = '' then
    perform pg_advisory_xact_lock(hashtextextended('orders.order_code:' || new.company_id::text, 0));
    new.order_code := private.codice_commessa_libero(new.company_id);
  end if;
  return new;
end;
$function$;
revoke all on function private.orders_codice_automatico() from public, anon, authenticated;

drop trigger if exists a_orders_codice_automatico on public.orders;
create trigger a_orders_codice_automatico
  before insert on public.orders
  for each row execute function private.orders_codice_automatico();

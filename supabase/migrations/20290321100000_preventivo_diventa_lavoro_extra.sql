-- Un preventivo accettato diventa un lavoro extra una volta sola (14/11/2026, fase 6 del piano anomalie).
--
-- Il lavoro extra da preventivo (LavoroExtraDaPreventivo) salva la variante e poi segnava il preventivo
-- «convertita» con variante_id, con un UPDATE diretto su quotes. Chi può modificare le commesse ma non i
-- preventivi (provato il 14/11 con un company_staff di Demo Azienda 2) il preventivo lo vede ma non lo aggiorna:
-- l'UPDATE toccava 0 righe senza errore, il lavoro extra nasceva e il preventivo restava «accettata», pronto per
-- essere usato una seconda volta (un altro lavoro extra o una commessa).
--
-- Ora lo lega questa funzione, col permesso di chi lavora sulle commesse, sotto lock sul preventivo:
--  - il preventivo è dell'azienda della variante, accettato, senza variante e senza una commessa nata da lui;
--  - la variante esiste ed è di una commessa che l'utente può vedere e modificare.
-- Nessuna riga toccata da questa migrazione: solo la funzione.

create or replace function public.preventivo_diventa_lavoro_extra(p_quote uuid, p_variante uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attore  uuid := auth.uid();
  v_company uuid;
  v_order   uuid;
  q         record;
begin
  if v_attore is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;

  select ov.company_id, ov.order_id into v_company, v_order
    from public.ordini_variazione ov where ov.id = p_variante;
  if v_order is null then
    raise exception 'Il lavoro extra non è stato trovato: salvalo prima di collegare il preventivo.' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_company) is not true
     or public.has_permission_for_company(v_attore, 'can_edit_orders', v_company) is not true then
    raise exception 'Permesso mancante per collegare un preventivo a un lavoro extra' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders o
                  where o.id = v_order and o.company_id = v_company
                    and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)) then
    raise exception 'Accesso negato: questa commessa non è tra quelle che puoi vedere' using errcode = '42501';
  end if;

  select id, company_id, status, variante_id, deleted_at into q
    from public.quotes where id = p_quote for update;
  if q.id is null or q.company_id <> v_company or q.deleted_at is not null then
    raise exception 'Preventivo non trovato in questa azienda.' using errcode = 'P0002';
  end if;
  if q.variante_id = p_variante then
    return; -- già collegato a questo lavoro extra: niente da fare
  end if;
  if q.status <> 'accettata' or q.variante_id is not null
     or exists (select 1 from public.orders o where o.quote_id = p_quote and o.deleted_at is null) then
    raise exception 'Questo preventivo è già diventato una commessa o un lavoro extra: non si usa una seconda volta.'
      using errcode = '23505';
  end if;

  update public.quotes set status = 'convertita', variante_id = p_variante, updated_at = now()
   where id = p_quote;
end;
$$;

revoke all on function public.preventivo_diventa_lavoro_extra(uuid, uuid) from public, anon;
grant execute on function public.preventivo_diventa_lavoro_extra(uuid, uuid) to authenticated;

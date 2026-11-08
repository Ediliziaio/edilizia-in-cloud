-- Fabbisogno: la data in cui il materiale serve in cantiere si cambia dalla
-- pagina degli acquisti.
--
-- order_items.data_fabbisogno (20281222200000) decide «ordina entro» insieme ai
-- giorni di consegna: senza, vale l'inizio della fase. Fino al 07/11/2026 si
-- poteva scrivere solo dalla scheda della commessa, una riga alla volta. Chi
-- compra vede dal fabbisogno che il cappotto non serve il 10 ma il 24, e deve
-- poterlo dire lì.
--
-- materiali_data_fabbisogno_imposta(p_items, p_data): una data (o null, per
-- tornare all'inizio della fase) su più righe insieme. Solo righe di tipo
-- materiale, solo di commesse che l'utente vede, e solo con can_manage_purchasing
-- o can_edit_orders nell'azienda della riga. Una riga non permessa ferma tutto:
-- niente aggiornamenti a metà. La data non tocca la validazione del tecnico
-- (materiali_riga_proteggi non la guarda): cambia quando, non cosa.

set local lock_timeout = '3s';

create or replace function public.materiali_data_fabbisogno_imposta(p_items uuid[], p_data date)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  n integer;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  if p_items is null or cardinality(p_items) = 0 then
    return 0;
  end if;
  if cardinality(p_items) > 500 then
    raise exception 'Troppe righe in una volta (massimo 500)' using errcode = '22023';
  end if;
  if p_data is not null and (p_data < current_date - 365 or p_data > current_date + 3650) then
    raise exception 'Data fuori misura' using errcode = '22023';
  end if;

  -- Ogni id deve essere una riga vera: un id sbagliato non passa in silenzio.
  if (select count(*) from public.order_items oi where oi.id = any(p_items))
     <> (select count(distinct x) from unnest(p_items) x where x is not null)
     or array_position(p_items, null) is not null then
    raise exception 'Alcune righe non esistono più: ricarica la pagina' using errcode = '22023';
  end if;

  for r in
    select oi.id, oi.natura_riga, o.id as order_id, o.company_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.id = any(p_items)
  loop
    if not public.materiali_utente_in_azienda(r.company_id)
       or not public.puo_vedere_commessa(r.order_id)
       or not (public.materiali_puo('can_manage_purchasing', r.company_id)
               or public.materiali_puo('can_edit_orders', r.company_id)) then
      raise exception 'Non puoi cambiare la data di questi materiali' using errcode = '42501';
    end if;
    if r.natura_riga <> 'materiale' then
      raise exception 'La data serve solo sui materiali' using errcode = '22023';
    end if;
  end loop;

  update public.order_items
     set data_fabbisogno = p_data
   where id = any(p_items)
     and data_fabbisogno is distinct from p_data;
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.materiali_data_fabbisogno_imposta(uuid[], date) from public, anon;
grant execute on function public.materiali_data_fabbisogno_imposta(uuid[], date) to authenticated;

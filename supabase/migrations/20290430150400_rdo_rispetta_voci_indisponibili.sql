do $migrazione$
declare
  definizione text := pg_get_functiondef('public.rdo_aggiudica(uuid,text)'::regprocedure);
  condizione text := 'if v_righe = 0 and coalesce(v_fornitore.totale_offerto, 0) > 0 then';
  correzione text := $blocco$
  if v_righe = 0 and v_netto is null and coalesce(v_fornitore.totale_offerto, 0) > 0 then
    if exists (
      select 1 from public.supplier_rfq_quotes q
      join public.supplier_rfq_items i on i.id = q.rfq_item_id
      where q.rfq_supplier_id = v_fornitore.id and i.rfq_id = v_rfq.id and q.disponibile is false
    ) then
      raise exception 'L’offerta ha voci indisponibili e nessuna voce disponibile con prezzo. Chiedi al fornitore di confermare le voci che può fornire.' using errcode = 'P0001';
    end if;
$blocco$;
begin
  if strpos(definizione, trim(correzione)) > 0 then
    return;
  end if;
  if strpos(definizione, condizione) = 0 then
    raise exception 'Controllare la condizione dell’offerta a corpo nella funzione rdo_aggiudica.';
  end if;
  execute replace(definizione, condizione, correzione);
end;
$migrazione$;

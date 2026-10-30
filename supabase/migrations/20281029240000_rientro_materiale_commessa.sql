-- Rientro in magazzino di un materiale della commessa (29/10/2026). Firma aggiornata da 20281029250000.
--
-- Comprati 10 sacchi, il cantiere ne posa 8 (rapportini approvati): i 2 che
-- avanzano tornano in magazzino e la commessa paga solo gli 8. Il conto lo fa
-- già v_ordine_marginalita: un movimento di carico con rientro_commessa sulla
-- riga toglie dagli acquisti la quota rientrata (valore della riga d'ordine ×
-- rientrati / max(scaricati, ordinati)), e dai prelievi di magazzino il loro
-- costo. Mancava il modo di registrarlo: 899 righe arrivate da un ordine non
-- hanno una scheda di magazzino a cui tornare.
--
-- materiale_rientro_magazzino(riga, quantità, magazzino):
--   · solo per righe il cui costo passa dal magazzino o da un ordine
--     d'acquisto emesso: il costo di una riga pagata con una fattura sta nei
--     costi diretti, e un rientro qui toglierebbe il costo ad altre righe;
--   · a pezzi interi (il magazzino conta interi), non oltre quanto la riga ha
--     ancora fuori (quantità − già rientrati);
--   · la merce torna nella scheda della riga se c'è, altrimenti in una scheda
--     dello stesso nome nel magazzino scelto, altrimenti in una nuova, col costo
--     unitario della riga d'ordine.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.materiale_rientro_magazzino(p_riga uuid, p_quantita numeric, p_magazzino uuid default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  r public.order_items;
  o public.orders;
  v_magazzino uuid;
  v_scheda uuid;
  v_coperta numeric;
  v_valore numeric;
  v_fuori numeric;
  v_rientrati numeric;
  v_costo numeric;
begin
  select * into r from public.order_items where id = p_riga for update;
  if r.id is null then raise exception 'Articolo non trovato.' using errcode = 'P0002'; end if;
  select * into o from public.orders where id = r.order_id;
  if auth.uid() is null
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id), false)
     or not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  if coalesce(p_quantita, 0) <= 0 or p_quantita <> trunc(p_quantita) then
    raise exception 'Il magazzino conta pezzi interi: indica quanti ne rientrano.' using errcode = '22023';
  end if;

  select c.coperta, c.valore_oda into v_coperta, v_valore
    from public.oda_copertura_righe(o.id) c where c.order_item_id = r.id;
  if r.stock_item_id is null and coalesce(v_coperta, 0) <= 0 then
    raise exception '«%» non passa da un ordine d''acquisto né dal magazzino: il suo costo sta nelle fatture della commessa, correggilo lì.', r.name
      using errcode = '22023';
  end if;

  select coalesce(sum(m.quantity), 0) into v_rientrati
    from public.warehouse_movements m
   where m.order_item_id = r.id and m.order_id = o.id and m.movement_type = 'carico' and m.rientro_commessa
     and coalesce(m.notes, '') not like 'Divisione tra le fasi:%';
  v_fuori := greatest(coalesce(v_coperta, 0), coalesce(r.quantity, 0)) - v_rientrati;
  if p_quantita > v_fuori then
    raise exception 'Di «%» possono rientrare al massimo % (già rientrati %).', r.name, v_fuori, v_rientrati using errcode = '22023';
  end if;

  -- Il magazzino: quello scelto, se è dell'azienda; altrimenti quello predefinito.
  select w.id into v_magazzino from public.warehouses w
   where w.company_id = o.company_id and coalesce(w.is_active, true)
     and (w.id = p_magazzino or (p_magazzino is null and w.linked_order_id is null))
   order by (w.id = p_magazzino) desc nulls last, w.is_default desc nulls last, w.position nulls last, w.created_at
   limit 1;
  if v_magazzino is null then
    raise exception 'Nessun magazzino dell''azienda dove far rientrare la merce: creane uno in Magazzino.' using errcode = '22023';
  end if;

  v_scheda := r.stock_item_id;
  if v_scheda is null then
    select s.id into v_scheda from public.warehouse_stock s
     where s.company_id = o.company_id and s.warehouse_id = v_magazzino
       and lower(btrim(s.name)) = lower(btrim(r.name))
     order by s.created_at limit 1;
  end if;
  if v_scheda is null then
    v_costo := case when coalesce(v_coperta, 0) > 0 then round(v_valore / v_coperta, 4) else r.purchase_price end;
    insert into public.warehouse_stock (company_id, warehouse_id, name, description, quantity, unit_cost, vat_rate, supplier_id)
    values (o.company_id, v_magazzino, r.name, 'Rientrato dalla commessa ' || coalesce(o.order_code, ''), 0, v_costo, r.vat_rate, r.supplier_id)
    returning id into v_scheda;
  end if;

  perform public.magazzino_movimento_riga(o.company_id, o.id, r.id, v_scheda, -p_quantita,
    'Rientro dal cantiere: ' || p_quantita || ' ' || coalesce(r.unita_misura, 'pz') || ' non posati', auth.uid());

  return jsonb_build_object('stock_item_id', v_scheda, 'warehouse_id', v_magazzino, 'quantita', p_quantita,
                            'rientrati', v_rientrati + p_quantita);
end $$;

revoke all on function public.materiale_rientro_magazzino(uuid, numeric, uuid) from public, anon;
grant execute on function public.materiale_rientro_magazzino(uuid, numeric, uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.ricalcola_ricezione_oda(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
  v_totale int;
  v_coperte int;
  v_con_merce int;
  v_ultima date;
begin
  select status into v_status from purchase_orders where id = p_po_id;
  if v_status is null or v_status in ('bozza', 'annullato', 'ricevuto') then
    return; -- niente da avanzare (o gia' arrivato)
  end if;

  -- Allinea le righe ODA alla somma delle ricezioni del loro articolo.
  -- Solo righe agganciate a un articolo di commessa: le righe libere si
  -- ricevono col gesto esplicito, non hanno ricezioni per riga.
  update purchase_order_items poi
     set quantity_received = coalesce(gr.somma, 0),
         received_date = case when coalesce(gr.somma, 0) > 0 then gr.ultima else poi.received_date end
    from (
      -- Contano le ricezioni di QUESTO ordine (via DDT) o senza DDT: quelle
      -- agganciate al DDT di un altro ordine non devono gonfiare questo.
      select g.order_item_id, sum(g.quantity_received) as somma, max(g.receipt_date) as ultima
      from goods_receipts g
      left join ddt_ricezione d on d.id = g.ddt_ricezione_id
      where d.id is null or d.purchase_order_id = p_po_id
      group by g.order_item_id
    ) gr
   where poi.purchase_order_id = p_po_id
     and poi.order_item_id = gr.order_item_id;

  select count(*),
         count(*) filter (where coalesce(quantity_received, 0) >= quantity),
         count(*) filter (where coalesce(quantity_received, 0) > 0),
         max(received_date)
    into v_totale, v_coperte, v_con_merce, v_ultima
    from purchase_order_items
   where purchase_order_id = p_po_id
     and coalesce(quantity, 0) > 0;

  if v_totale > 0 and v_coperte = v_totale then
    -- Tutto coperto: 'ricevuto' → il trigger 20280117 crea il costo.
    update purchase_orders
       set status = 'ricevuto',
           actual_delivery_date = coalesce(actual_delivery_date, v_ultima, current_date)
     where id = p_po_id and status in ('inviato', 'confermato', 'parziale');
  elsif v_con_merce > 0 then
    update purchase_orders
       set status = 'parziale'
     where id = p_po_id and status in ('inviato', 'confermato');
  end if;
end;
$function$

-- I beni su misura non entrano in giacenza da soli (08/11/2026).
--
-- Ricevendo la merce con un magazzino indicato, il trigger cerca la giacenza per NOME
-- e la crea o la somma. Due finestre con lo stesso nome e misure diverse diventerebbero
-- un'unica giacenza, e un bene già venduto a quel cliente risulterebbe disponibile.
-- Le righe su misura (measure_status valorizzato) vanno alla commessa: la ricezione
-- resta registrata in goods_receipts, cambia solo il carico automatico in magazzino.
-- Solo la funzione: nessuna riga viene scritta. Oggi nessuna riga ha measure_status.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.auto_carico_stock_on_receipt()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_stock_id    uuid;
  v_item_name   text;
  v_supplier_id uuid;
  v_unit_cost   numeric;
  v_su_misura   boolean;
begin
  -- Solo stati che corrispondono a merce effettivamente in magazzino.
  if new.quality_check_status is null
     or new.quality_check_status not in ('ok', 'partial') then
    return new;
  end if;

  -- Fallback silenzioso: se warehouse_id non è valorizzato non facciamo nulla.
  if new.warehouse_id is null or new.quantity_received is null or new.quantity_received <= 0 then
    return new;
  end if;

  select oi.name, oi.supplier_id, oi.purchase_price, oi.measure_status is not null
    into v_item_name, v_supplier_id, v_unit_cost, v_su_misura
  from public.order_items oi
  where oi.id = new.order_item_id;

  if v_item_name is null then
    -- order_item cancellato nel frattempo: non scriviamo stock "orfano".
    return new;
  end if;

  if v_su_misura then
    return new;
  end if;

  -- warehouse_stock esistente per (company, warehouse, nome) — case-sensitive
  select id into v_stock_id from public.warehouse_stock
  where company_id = new.company_id
    and warehouse_id = new.warehouse_id
    and name = v_item_name
  limit 1;

  if v_stock_id is null then
    insert into public.warehouse_stock (
      company_id, warehouse_id, name, quantity, unit_cost, supplier_id
    ) values (
      new.company_id, new.warehouse_id, v_item_name,
      new.quantity_received, coalesce(v_unit_cost, 0), v_supplier_id
    )
    returning id into v_stock_id;
  else
    update public.warehouse_stock
       set quantity   = quantity + new.quantity_received,
           updated_at = now()
     where id = v_stock_id;
  end if;

  insert into public.warehouse_movements (
    stock_item_id, order_item_id, movement_type, quantity,
    performed_by, warehouse_id, notes, company_id
  ) values (
    v_stock_id, new.order_item_id, 'carico', new.quantity_received,
    new.received_by, new.warehouse_id,
    'Auto-carico da goods_receipt ' || new.id::text,
    new.company_id
  );

  return new;
end;
$function$;

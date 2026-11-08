-- Una bolla può consegnare merce di più ordini (08/11/2026).
--
-- La riga della bolla può puntare a una riga dell'ordine collegato alla bolla o di un altro
-- ordine dello stesso fornitore. Gli ordini di una bolla si leggono dalle sue righe: non serve
-- una tabella in più, e una riga non può mai stare su un ordine diverso da quello che dichiara.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ddt_riga_prepara()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company uuid;
  v_oi_company uuid;
  v_order_item uuid;
begin
  select d.company_id into v_company
    from public.ddt_ricezione d where d.id = new.ddt_ricezione_id;
  if not found then
    raise exception 'Bolla inesistente' using errcode = '23514';
  end if;
  new.company_id := v_company;

  -- Una bolla può consegnare più ordini: va bene l'ordine della bolla o un altro dello stesso fornitore.
  if new.purchase_order_item_id is not null then
    select p.order_item_id into v_order_item
      from public.purchase_order_items p
      join public.purchase_orders po on po.id = p.purchase_order_id
      join public.ddt_ricezione d on d.id = new.ddt_ricezione_id
      left join public.purchase_orders po_bolla on po_bolla.id = d.purchase_order_id
     where p.id = new.purchase_order_item_id
       and po.company_id = v_company
       and (po.id = d.purchase_order_id or po.supplier_id = coalesce(d.supplier_id, po_bolla.supplier_id));
    if not found then
      raise exception 'Questa riga non appartiene a un ordine di questo fornitore' using errcode = '23514';
    end if;
    new.order_item_id := v_order_item;
  elsif tg_op = 'UPDATE' and old.purchase_order_item_id is not null then
    new.order_item_id := null;
  end if;

  if new.order_item_id is not null then
    select o.company_id into v_oi_company
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.id = new.order_item_id;
    if v_oi_company is distinct from v_company then
      raise exception 'La riga di commessa e'' di un''altra azienda' using errcode = '23514';
    end if;
  end if;

  if coalesce(btrim(new.descrizione), '') = '' then
    new.descrizione := coalesce(nullif(btrim(coalesce(new.testo_grezzo, '')), ''), 'Riga non riconosciuta');
  end if;

  if new.importo is null and new.quantita is not null and new.prezzo_unitario is not null then
    new.importo := round(new.quantita * new.prezzo_unitario, 2);
  end if;

  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function public.ddt_riga_prepara() from public, anon, authenticated;

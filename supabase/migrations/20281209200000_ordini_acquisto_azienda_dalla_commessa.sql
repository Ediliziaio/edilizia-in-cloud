-- order_items non ha company_id: l'azienda di una voce si legge dalla sua commessa.
-- Due funzioni la cercavano sulla voce, e l'errore «column oi.company_id does not exist» fermava:
--  - materiali_prezzo_da_ordine: ogni riga d'ordine d'acquisto legata a una voce di commessa, con un prezzo;
--  - rdo_aggiudica: ogni scelta del fornitore su una richiesta d'offerta.
-- Solo funzioni: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.materiali_prezzo_da_ordine()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  prezzo numeric;
begin
  if new.order_item_id is null or coalesce(new.unit_price, 0) <= 0 then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.unit_price is not distinct from old.unit_price
     and new.discount_percent is not distinct from old.discount_percent
     and new.order_item_id is not distinct from old.order_item_id then
    return null;
  end if;
  if exists (select 1 from public.purchase_orders po
              where po.id = new.purchase_order_id and po.status = 'annullato') then
    return null;
  end if;
  prezzo := round(new.unit_price * (1 - coalesce(new.discount_percent, 0) / 100), 4);
  update public.order_items oi
     set purchase_price = prezzo,
         prezzo_fonte = case when oi.supplier_rfq_item_id is not null then 'offerta' else 'ordine' end,
         prezzo_aggiornato_il = now()
   where oi.id = new.order_item_id
     and exists (select 1 from public.orders o
                  where o.id = oi.order_id and o.company_id = new.company_id)
     and oi.origine_materiale is not null
     and oi.purchase_price is distinct from prezzo;
  return null;
end;
$function$;

create or replace function public.rdo_aggiudica(p_rfq_supplier_id uuid, p_motivazione text default null::text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_fornitore record;
  v_rfq record;
  v_po_id uuid;
  v_oda text;
  v_righe int;
begin
  select rs.* into v_fornitore
    from public.supplier_rfq_suppliers rs
   where rs.id = p_rfq_supplier_id;
  if not found then
    raise exception 'Fornitore non trovato nella richiesta' using errcode = '42704';
  end if;
  select r.* into v_rfq
    from public.supplier_rfqs r
   where r.id = v_fornitore.rfq_id
   for update;
  if not found then
    raise exception 'Richiesta non trovata' using errcode = '42704';
  end if;
  if v_rfq.status = 'aggiudicata' then
    raise exception 'Richiesta già aggiudicata: l''ordine c''è già' using errcode = 'P0001';
  end if;
  if v_rfq.status = 'annullata' then
    raise exception 'Richiesta annullata: non si può aggiudicare' using errcode = 'P0001';
  end if;
  if v_fornitore.status <> 'risposta' then
    raise exception 'Questo fornitore non ha ancora un''offerta registrata' using errcode = 'P0001';
  end if;
  if coalesce(v_fornitore.totale_offerto, 0) <= 0 and not exists (
       select 1 from public.supplier_rfq_quotes q
         join public.supplier_rfq_items i on i.id = q.rfq_item_id
        where q.rfq_supplier_id = v_fornitore.id and i.rfq_id = v_rfq.id
          and q.disponibile and q.prezzo_unitario is not null) then
    raise exception 'Nessun prezzo in questa offerta: scrivi i prezzi delle voci o il totale offerto prima di scegliere' using errcode = 'P0001';
  end if;
  insert into public.purchase_orders (
    company_id, supplier_id, order_id, expected_delivery_date, payment_terms, origine, notes, created_by
  ) values (
    v_rfq.company_id,
    v_fornitore.supplier_id,
    v_rfq.order_id,
    v_rfq.data_fabbisogno,
    v_fornitore.condizioni_pagamento,
    case v_fornitore.inviata_via
      when 'telefono' then 'telefono'
      when 'whatsapp' then 'telefono'
      when 'di_persona' then 'negozio'
      else 'email'
    end,
    'Da richiesta d''offerta ' || v_rfq.rfq_number || ' — ' || v_rfq.titolo,
    auth.uid()
  )
  returning id, oda_number into v_po_id, v_oda;
  insert into public.purchase_order_items (
    purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku, order_item_id
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, 'pz'),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         coalesce(q.aliquota_iva, 22), i.sku,
         (select oi.id from public.order_items oi
            join public.orders o on o.id = oi.order_id
           where oi.supplier_rfq_item_id = i.id and o.company_id = v_rfq.company_id
           limit 1)
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id
   where i.rfq_id = v_rfq.id
     and q.disponibile
     and q.prezzo_unitario is not null
   order by i.posizione;
  get diagnostics v_righe = row_count;
  if v_righe = 0 and coalesce(v_fornitore.totale_offerto, 0) > 0 then
    insert into public.purchase_order_items (
      purchase_order_id, company_id, description, quantity, unit_of_measure, unit_price, discount_percent, vat_rate
    ) values (
      v_po_id, v_rfq.company_id, 'Fornitura a corpo — ' || v_rfq.titolo, 1, 'corpo', v_fornitore.totale_offerto, 0, 22
    );
    v_righe := 1;
  end if;
  update public.supplier_rfqs
     set status = 'aggiudicata',
         supplier_id_aggiudicato = v_fornitore.supplier_id,
         purchase_order_id = v_po_id,
         aggiudicata_at = now(),
         motivazione_scelta = nullif(btrim(coalesce(p_motivazione, '')), '')
   where id = v_rfq.id;
  return jsonb_build_object('purchase_order_id', v_po_id, 'oda_number', v_oda, 'righe', v_righe);
end;
$function$;

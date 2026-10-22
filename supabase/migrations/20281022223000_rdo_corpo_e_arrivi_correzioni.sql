-- Correzioni dopo la rilettura del 22/10/2026 (richieste d'offerta e arrivi merce).
--
-- 1. rdo_aggiudica — un'offerta a corpo (solo il totale, nessun prezzo per riga)
--    creava un ordine fornitore da 0 €: al ricevimento il trigger del costo lo
--    saltava, e la commessa non vedeva mai la spesa. Ora diventa una riga sola
--    «Fornitura a corpo» con il totale offerto.
-- 2. oda_registra_arrivo
--    - con una bolla già scritta (p_ddt_id) i movimenti di magazzino riportano
--      il suo numero, non «S/N gg/mm/aaaa»;
--    - su un ordine annullato non si registrano arrivi: prima le righe si
--      aggiornavano lo stesso (solo lo stato era protetto).
-- 3. receive_from_oda_via_scans — la quantità ricevuta parte da zero se vuota:
--    con NULL + v_qty restava NULL e la riga non risultava mai completa.
-- 4. oda_registra_arrivo — l'articolo abbinato all'arrivo vince su quello
--    ricordato prima: chi corregge l'abbinamento non deve trovarsi «in arrivo»
--    e riordino puntati sull'articolo sbagliato.
-- 5. warehouse_movimento_rapido — la commessa si controlla con
--    commessa_attiva_dell_azienda (SECURITY DEFINER): chi gestisce il
--    magazzino ma non vede le commesse riceveva «Commessa non valida».
-- 6. magazzino_riordina — la destinazione dell'ordine è il magazzino degli
--    articoli (se è uno solo), non quello scelto in pagina per tutti.

create or replace function public.rdo_aggiudica(p_rfq_supplier_id uuid, p_motivazione text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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

  -- la riga della richiesta resta bloccata fino alla fine: un secondo clic aspetta e poi trova «aggiudicata»
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

  -- le righe portano i prezzi offerti; quelle non disponibili o senza prezzo
  -- restano fuori (a zero sembrerebbero regalate e il totale sarebbe falso).
  -- line_total e vat_amount sono generate dal database.
  insert into public.purchase_order_items (
    purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, 'pz'),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         -- coalesce e non nullif: l'IVA 0 è legittima (fornitore intra-UE)
         coalesce(q.aliquota_iva, 22), i.sku
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id
   where i.rfq_id = v_rfq.id
     and q.disponibile
     and q.prezzo_unitario is not null
   order by i.posizione;
  get diagnostics v_righe = row_count;

  -- offerta a corpo: nessun prezzo per riga, solo il totale del documento.
  -- Senza questa riga nasceva un ordine da 0 € e, al ricevimento, nessun costo
  -- arrivava alla commessa (il trigger salta gli ordini senza importo).
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
$$;

revoke all on function public.rdo_aggiudica(uuid, text) from public, anon;
grant execute on function public.rdo_aggiudica(uuid, text) to authenticated;

do $$
declare v_def text; v_sost record;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'oda_registra_arrivo';
  if position('Ordine annullato: non si registrano arrivi' in v_def) > 0 then
    raise notice 'oda_registra_arrivo già corretta';
  else
    for v_sost in select * from (values
      ('SELECT id INTO v_ddt_id FROM public.ddt_ricezione',
       'SELECT id, numero_ddt INTO v_ddt_id, v_numero FROM public.ddt_ricezione'),
      ('stock_item_id = coalesce(stock_item_id, v_stock_item_id),',
       'stock_item_id = coalesce(v_stock_item_id, stock_item_id),'),
      ('IF NOT FOUND THEN RAISE EXCEPTION ''Ordine non valido per questa azienda''; END IF;',
       E'IF NOT FOUND THEN RAISE EXCEPTION ''Ordine non valido per questa azienda''; END IF;\n'
       || E'  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE id = p_oda_id AND status = ''annullato'') THEN\n'
       || E'    RAISE EXCEPTION ''Ordine annullato: non si registrano arrivi'';\n'
       || E'  END IF;')
    ) as t(da, a) loop
      if (length(v_def) - length(replace(v_def, v_sost.da, ''))) / length(v_sost.da) <> 1 then
        raise exception 'oda_registra_arrivo: il pezzo «%» non compare una volta sola', v_sost.da;
      end if;
      v_def := replace(v_def, v_sost.da, v_sost.a);
    end loop;
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'receive_from_oda_via_scans';
  if regexp_count(v_def, 'quantity_received\s*=\s*coalesce\(quantity_received, 0\)\s*\+') > 0 then
    raise notice 'receive_from_oda_via_scans già corretta';
  else
    if regexp_count(v_def, 'quantity_received\s*=\s*quantity_received\s*\+') <> 1 then
      raise exception 'receive_from_oda_via_scans: aggiornamento righe inatteso';
    end if;
    execute regexp_replace(v_def, 'quantity_received\s*=\s*quantity_received\s*\+', 'quantity_received = coalesce(quantity_received, 0) +');
  end if;
end $$;

-- ── commessa della stessa azienda, non nel cestino ──────────────────────────
create or replace function public.commessa_attiva_dell_azienda(p_order_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
     where o.id = p_order_id and o.company_id = p_company_id and o.deleted_at is null
       and public.user_can_access_company(p_company_id)
  );
$$;

revoke all on function public.commessa_attiva_dell_azienda(uuid, uuid) from public, anon;
grant execute on function public.commessa_attiva_dell_azienda(uuid, uuid) to authenticated;

create or replace function public.warehouse_movimento_rapido(
  p_stock_item_id uuid,
  p_tipo text,
  p_quantita integer,
  p_note text default null,
  p_order_id uuid default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_prima integer; v_dopo integer; v_company uuid; v_warehouse uuid; v_nome text; v_mov_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if p_tipo not in ('carico', 'scarico') then
    raise exception 'tipo movimento non valido: % (attesi "carico" o "scarico")', p_tipo using errcode = '22023';
  end if;
  if p_quantita is null or p_quantita <= 0 then
    raise exception 'la quantità del movimento deve essere maggiore di zero' using errcode = '22023';
  end if;

  select quantity, company_id, warehouse_id, name
    into v_prima, v_company, v_warehouse, v_nome
    from public.warehouse_stock
   where id = p_stock_item_id
   for update;
  if not found then
    raise exception 'Articolo di magazzino non trovato' using errcode = 'P0002';
  end if;

  -- la commessa deve essere della stessa azienda dell'articolo, e non nel cestino
  if p_order_id is not null and not public.commessa_attiva_dell_azienda(p_order_id, v_company) then
    raise exception 'Commessa non valida per questo magazzino' using errcode = '22023';
  end if;

  if p_tipo = 'scarico' and v_prima < p_quantita then
    raise exception 'Giacenza insufficiente per "%": disponibili %, richiesti %.',
      coalesce(v_nome, '—'), v_prima, p_quantita using errcode = '23514';
  end if;

  v_dopo := case when p_tipo = 'carico' then v_prima + p_quantita else v_prima - p_quantita end;

  update public.warehouse_stock
     set quantity = quantity + case when p_tipo = 'carico' then p_quantita else -p_quantita end,
         updated_at = now()
   where id = p_stock_item_id;

  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id, order_id)
  values (p_stock_item_id, p_tipo, p_quantita, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), v_company, v_warehouse, p_order_id)
  returning id into v_mov_id;

  return jsonb_build_object('ok', true, 'movimento_id', v_mov_id, 'giacenza_prima', v_prima, 'giacenza_dopo', v_dopo);
end;
$$;

revoke all on function public.warehouse_movimento_rapido(uuid, text, integer, text, uuid) from public, anon;
grant execute on function public.warehouse_movimento_rapido(uuid, text, integer, text, uuid) to authenticated;

create or replace function public.magazzino_riordina(
  p_company_id uuid,
  p_supplier_id uuid,
  p_righe jsonb,            -- [{ "stock_item_id": uuid, "quantity": int }]
  p_warehouse_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_riga jsonb; v_art record; v_qty integer; v_gia jsonb := '[]'::jsonb; v_da jsonb := '[]'::jsonb;
  v_po uuid; v_oda text; v_ordine record; v_pos int := 0; v_wh uuid := p_warehouse_id;
begin
  if auth.uid() is null then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if p_supplier_id is null then
    raise exception 'Serve un fornitore per fare l''ordine' using errcode = '22023';
  end if;

  for v_riga in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) loop
    v_qty := coalesce((v_riga->>'quantity')::integer, 0);
    if v_qty <= 0 then continue; end if;

    -- la riga dell'articolo resta bloccata fino alla fine: un secondo clic
    -- aspetta, poi trova l'ordine appena fatto e non ne crea un altro
    select ws.id, ws.name, ws.unit_cost, ws.vat_rate, ws.company_id, ws.warehouse_id
      into v_art
      from public.warehouse_stock ws
     where ws.id = (v_riga->>'stock_item_id')::uuid and ws.company_id = p_company_id
       for update;
    if not found then continue; end if;

    select po.id, po.oda_number into v_ordine
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
     where poi.stock_item_id = v_art.id
       and po.status in ('bozza', 'inviato', 'confermato', 'parziale')
       and coalesce(poi.quantity, 0) > coalesce(poi.quantity_received, 0)
     order by po.created_at desc
     limit 1;
    if found then
      v_gia := v_gia || jsonb_build_object('stock_item_id', v_art.id, 'nome', v_art.name, 'oda_id', v_ordine.id, 'oda_number', v_ordine.oda_number);
      continue;
    end if;

    v_da := v_da || jsonb_build_object('art', to_jsonb(v_art), 'qty', v_qty);
  end loop;

  if jsonb_array_length(v_da) = 0 then
    return jsonb_build_object('purchase_order_id', null, 'oda_number', null, 'righe', 0, 'gia_in_ordine', v_gia);
  end if;

  -- destinazione: quella chiesta, altrimenti il magazzino degli articoli se è
  -- uno solo. Prima il magazzino scelto in pagina valeva per tutti, anche per
  -- articoli che stanno in un altro.
  if v_wh is null then
    select case when count(distinct a->'art'->>'warehouse_id') = 1 then min(a->'art'->>'warehouse_id')::uuid end
      into v_wh from jsonb_array_elements(v_da) a;
  end if;

  insert into public.purchase_orders (company_id, supplier_id, order_id, delivery_warehouse_id, created_by, notes)
  values (p_company_id, p_supplier_id, null, v_wh, auth.uid(), 'Riordino da sottoscorta magazzino')
  returning id, oda_number into v_po, v_oda;

  for v_riga in select * from jsonb_array_elements(v_da) loop
    insert into public.purchase_order_items (
      company_id, purchase_order_id, stock_item_id, description, quantity, unit_price, vat_rate,
      discount_percent, unit_of_measure, sort_order
    ) values (
      p_company_id, v_po, (v_riga->'art'->>'id')::uuid, v_riga->'art'->>'name', (v_riga->>'qty')::integer,
      coalesce((v_riga->'art'->>'unit_cost')::numeric, 0), coalesce((v_riga->'art'->>'vat_rate')::numeric, 22),
      0, 'pz', v_pos
    );
    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object('purchase_order_id', v_po, 'oda_number', v_oda, 'righe', v_pos, 'gia_in_ordine', v_gia);
end;
$$;

revoke all on function public.magazzino_riordina(uuid, uuid, jsonb, uuid) from public, anon;
grant execute on function public.magazzino_riordina(uuid, uuid, jsonb, uuid) to authenticated;

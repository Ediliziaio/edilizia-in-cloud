-- Magazzino: numeri calcolati dal database, giacenze che cambiano solo con un
-- movimento, legame vero con gli ordini fornitore.
--
-- 1. purchase_order_items.stock_item_id — la riga d'ordine sa a quale articolo
--    di magazzino si riferisce. Prima l'unico aggancio era il nome
--    (ilike(description, name)): niente «in arrivo» per articolo, e il riordino
--    da sottoscorta non poteva sapere se l'articolo era già in un ordine aperto.
--    Si riempie da sola all'arrivo (oda_registra_arrivo riceve già lo
--    stock_item_id per riga) e dal riordino; per lo storico si aggancia per
--    nome, solo dove il nome è unico nell'azienda.
--
-- 2. warehouse_rettifica_giacenza — la scheda articolo riscriveva la quantità
--    digitata nel modulo (update assoluto, nessun movimento): un carico o uno
--    scarico fatto mentre il modulo era aperto spariva, e la giacenza smetteva
--    di tornare con i movimenti. Ora la differenza diventa un movimento, e se
--    la giacenza è cambiata da quando il modulo è stato aperto ci si ferma.
--
-- 3. warehouse_movimento_rapido — nuovo parametro p_order_id: lo scarico
--    rapido può dire per quale commessa esce la merce.
--
-- 4. magazzino_riepilogo — i riquadri in cima alla pagina. Prima quelli delle
--    commesse contavano le 50 righe della pagina mostrata (cliccandone uno gli
--    altri andavano a zero) e quelli dell'inventario ignoravano il magazzino
--    scelto. Una regola per «sotto scorta» (disponibile sotto il minimo, come
--    get_low_stock_alerts) e una per il valore (solo giacenze positive).
--
-- 5. magazzino_in_arrivo — per ogni articolo, quanto è in arrivo dagli ordini
--    fornitore aperti.
--
-- 6. magazzino_riordina — il riordino da sottoscorta in una transazione: prima
--    testata e righe erano due scritture dal browser (se la seconda falliva
--    restava un ordine vuoto) e due clic facevano due ordini. Gli articoli già
--    in un ordine aperto non si riordinano: si dice in quale ordine sono.
--
-- Tutte SECURITY INVOKER: valgono le regole di accesso (RLS) di chi chiama.

-- ── 1. riga d'ordine → articolo ─────────────────────────────────────────────
alter table public.purchase_order_items
  add column if not exists stock_item_id uuid references public.warehouse_stock(id) on delete set null;

create index if not exists idx_purchase_order_items_stock_item
  on public.purchase_order_items(stock_item_id) where stock_item_id is not null;

comment on column public.purchase_order_items.stock_item_id is
  'Articolo di magazzino della riga: si scrive all''arrivo (oda_registra_arrivo) e nel riordino da sottoscorta.';

do $$
begin
  set local lock_timeout = '3s';
  -- storico: solo dove il nome dell'articolo è unico nell'azienda
  update public.purchase_order_items poi
     set stock_item_id = u.id
    from (
      select ws.company_id, lower(btrim(ws.name)) nome, min(ws.id::text)::uuid id
        from public.warehouse_stock ws
       group by 1, 2
      having count(*) = 1
    ) u
   where poi.stock_item_id is null
     and poi.company_id = u.company_id
     and lower(btrim(poi.description)) = u.nome;
end $$;

-- oda_registra_arrivo: quando la riga arriva abbinata a un articolo, lo ricorda
do $$
declare v_def text; v_da text := 'SET quantity_received = coalesce(quantity_received, 0) + v_qty,';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'oda_registra_arrivo';
  if position('stock_item_id = coalesce(stock_item_id, v_stock_item_id)' in v_def) > 0 then
    raise notice 'oda_registra_arrivo ricorda già l''articolo';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_da, ''))) / length(v_da) <> 1 then
    raise exception 'oda_registra_arrivo: aggiornamento righe inatteso';
  end if;
  execute replace(v_def, v_da, v_da || E'\n             stock_item_id = coalesce(stock_item_id, v_stock_item_id),');
end $$;

-- ── 2. rettifica di giacenza ────────────────────────────────────────────────
create or replace function public.warehouse_rettifica_giacenza(
  p_stock_item_id uuid,
  p_quantita_contata integer,
  p_quantita_vista integer,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_prima integer; v_company uuid; v_warehouse uuid; v_nome text; v_diff integer; v_mov uuid;
begin
  if auth.uid() is null then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if p_quantita_contata is null or p_quantita_contata < 0 then
    raise exception 'La giacenza non può essere negativa' using errcode = '22023';
  end if;

  select quantity, company_id, warehouse_id, name
    into v_prima, v_company, v_warehouse, v_nome
    from public.warehouse_stock
   where id = p_stock_item_id
   for update;
  if not found then
    raise exception 'Articolo di magazzino non trovato' using errcode = 'P0002';
  end if;

  -- qualcuno ha caricato o scaricato mentre il modulo era aperto
  if p_quantita_vista is not null and v_prima <> p_quantita_vista then
    raise exception 'La giacenza di "%" è cambiata nel frattempo: ora è %, non %. Riapri l''articolo e ricontrolla.',
      coalesce(v_nome, '—'), v_prima, p_quantita_vista using errcode = '40001';
  end if;

  v_diff := p_quantita_contata - v_prima;
  if v_diff = 0 then
    return jsonb_build_object('ok', true, 'movimento_id', null, 'giacenza_prima', v_prima, 'giacenza_dopo', v_prima);
  end if;

  update public.warehouse_stock
     set quantity = quantity + v_diff, updated_at = now()
   where id = p_stock_item_id;

  -- il tipo di movimento ammette solo carico/scarico: la rettifica è uno dei due, con la nota che lo dice
  insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, company_id, warehouse_id)
  values (p_stock_item_id, case when v_diff > 0 then 'carico' else 'scarico' end, abs(v_diff),
          'Rettifica giacenza da ' || v_prima || ' a ' || p_quantita_contata
            || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''),
          auth.uid(), v_company, v_warehouse)
  returning id into v_mov;

  return jsonb_build_object('ok', true, 'movimento_id', v_mov, 'giacenza_prima', v_prima, 'giacenza_dopo', p_quantita_contata);
end;
$$;

revoke all on function public.warehouse_rettifica_giacenza(uuid, integer, integer, text) from public, anon;
grant execute on function public.warehouse_rettifica_giacenza(uuid, integer, integer, text) to authenticated;

-- ── 3. movimento rapido con la commessa ─────────────────────────────────────
drop function if exists public.warehouse_movimento_rapido(uuid, text, integer, text);

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
  if p_order_id is not null and not exists (
    select 1 from public.orders o where o.id = p_order_id and o.company_id = v_company and o.deleted_at is null
  ) then
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

-- ── 4. i riquadri della pagina ──────────────────────────────────────────────
create or replace function public.magazzino_riepilogo(p_company_id uuid, p_warehouse_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with righe as (
    select oi.status, oi.order_id, coalesce(oi.purchase_price, 0) * coalesce(oi.quantity, 0) valore,
           coalesce(o.expected_date, o.work_start_date) posa
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where o.company_id = p_company_id
       and o.deleted_at is null
       and (p_warehouse_id is null or oi.destination_warehouse_id = p_warehouse_id)
  ),
  articoli as (
    select ws.*
      from public.warehouse_stock ws
     where ws.company_id = p_company_id
       and (p_warehouse_id is null or ws.warehouse_id = p_warehouse_id)
  ),
  arrivo as (
    select sum(greatest(coalesce(poi.quantity, 0) - coalesce(poi.quantity_received, 0), 0)) residuo,
           count(distinct poi.stock_item_id) articoli
      from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
      join articoli a on a.id = poi.stock_item_id
     where po.status in ('inviato', 'confermato', 'parziale')
  )
  select jsonb_build_object(
    'righe', jsonb_build_object(
      'in_ritardo',   (select jsonb_build_object('n', count(*), 'commesse', count(distinct order_id)) from righe
                        where status not in ('in_magazzino', 'installato') and posa < current_date),
      'in_magazzino', (select jsonb_build_object('n', count(*), 'commesse', count(distinct order_id), 'valore', coalesce(sum(valore), 0)) from righe where status = 'in_magazzino'),
      'ordinato',     (select jsonb_build_object('n', count(*), 'commesse', count(distinct order_id), 'valore', coalesce(sum(valore), 0)) from righe where status = 'ordinato'),
      'da_ordinare',  (select jsonb_build_object('n', count(*), 'commesse', count(distinct order_id), 'valore', coalesce(sum(valore), 0)) from righe where status = 'da_ordinare')
    ),
    'articoli', (select jsonb_build_object(
      'n', count(*),
      'con_giacenza', count(*) filter (where quantity > 0),
      -- valore: solo giacenze positive; un negativo è un errore da correggere, non merce che vale meno
      'valore', coalesce(sum(quantity * coalesce(unit_cost, 0)) filter (where quantity > 0), 0),
      'senza_costo', count(*) filter (where quantity > 0 and coalesce(unit_cost, 0) = 0),
      'negativi', count(*) filter (where quantity < 0),
      -- stessa regola di get_low_stock_alerts: il disponibile (giacenza meno impegnato) sotto il minimo
      'sotto_scorta', count(*) filter (where min_stock_level > 0 and quantity_available < min_stock_level),
      'impegnato', coalesce(sum(quantity_reserved), 0)
    ) from articoli),
    'in_arrivo', (select jsonb_build_object('quantita', coalesce(residuo, 0), 'articoli', coalesce(articoli, 0)) from arrivo)
  );
$$;

revoke all on function public.magazzino_riepilogo(uuid, uuid) from public, anon;
grant execute on function public.magazzino_riepilogo(uuid, uuid) to authenticated;

-- ── 5. in arrivo per articolo ───────────────────────────────────────────────
create or replace function public.magazzino_in_arrivo(p_company_id uuid)
returns table(stock_item_id uuid, quantita numeric, ordini jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select poi.stock_item_id,
         sum(greatest(coalesce(poi.quantity, 0) - coalesce(poi.quantity_received, 0), 0)),
         jsonb_agg(distinct jsonb_build_object('id', po.id, 'numero', po.oda_number, 'consegna', po.expected_delivery_date))
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
   where po.company_id = p_company_id
     and po.status in ('inviato', 'confermato', 'parziale')
     and poi.stock_item_id is not null
     and coalesce(poi.quantity, 0) > coalesce(poi.quantity_received, 0)
   group by poi.stock_item_id;
$$;

revoke all on function public.magazzino_in_arrivo(uuid) from public, anon;
grant execute on function public.magazzino_in_arrivo(uuid) to authenticated;

-- ── 6. riordino da sottoscorta ──────────────────────────────────────────────
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
  v_po uuid; v_oda text; v_ordine record; v_pos int := 0;
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
    select ws.id, ws.name, ws.unit_cost, ws.vat_rate, ws.company_id
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

  insert into public.purchase_orders (company_id, supplier_id, order_id, delivery_warehouse_id, created_by, notes)
  values (p_company_id, p_supplier_id, null, p_warehouse_id, auth.uid(), 'Riordino da sottoscorta magazzino')
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

-- Settimo controllo (19/10/2026).
--
-- Magazzino
--  1. _prelievo_campo_scarica la usano solo le funzioni prelievo_campo_*: dal browser non si chiama.
--  2. magazzino_collega_prelievi: i prelievi del cantiere senza riga si collegano alla riga che
--     scarica (fino alla sua quantità, dividendo il movimento). La usano l'installazione e ogni
--     scarico di riga (voce aggiunta o cambiata dalla modifica commessa, allineamento): così una
--     voce aggiunta dopo un prelievo non scarica una seconda volta.
--  3. Margine della commessa: dal costo del magazzino si tolgono solo i rientri della commessa,
--     non gli arrivi da ordine d'acquisto (già nel costo acquisti).
--  4. DDT confermato con ordine d'acquisto collegato: le righe abbinate avanzano l'ordine
--     (ricevuto, stato, bolla, ticket) come la registrazione dell'arrivo. Così l'ordine non resta
--     aperto e la stessa merce non entra due volte.
-- Economia
--  5. rate_incassi: gli incassi con la data, come la scheda commessa (rate pagate per il loro
--     importo, pagamenti parziali delle fatture collegate alla data del movimento). Li usano
--     l'incassato del periodo e il grafico a 12 mesi, il cui venduto conta anche le varianti.
--  6. commessa_incassi: incassato e da incassare di una commessa, per Silvio.
-- Cantiere e personale
--  7. Costo, presenze registrate e approvazione del rapportino li scrive solo l'ufficio.
--  8. Dipendenti: senza INPS scritto vale quello del tipo di dipendente (Impostazioni → Tariffe).
--     Il 28% era il valore iniziale della colonna, non una scelta: si toglie. Ore mese iniziali 173.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._prelievo_campo_scarica(uuid, uuid, uuid, jsonb, uuid, text) from public, anon, authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.magazzino_collega_prelievi(
  p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_quanto numeric)
returns numeric language plpgsql security definer set search_path = public
as $$
declare v_serve numeric := greatest(coalesce(p_quanto, 0), 0); v_preso numeric := 0; m record;
begin
  if p_riga is null or p_articolo is null or p_commessa is null or v_serve <= 0 then return 0; end if;
  for m in
    select id, quantity from public.warehouse_movements
     where stock_item_id = p_articolo and order_id = p_commessa and company_id = p_company
       and order_item_id is null and movement_type = 'scarico'
     order by created_at, id
     for update
  loop
    exit when v_serve <= 0;
    if m.quantity <= v_serve then
      update public.warehouse_movements set order_item_id = p_riga where id = m.id;
      v_serve := v_serve - m.quantity;
      v_preso := v_preso + m.quantity;
    else
      insert into public.warehouse_movements
        (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, created_at, order_id,
         lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa)
      select stock_item_id, null, movement_type, quantity - v_serve, notes, performed_by, created_at, order_id,
             lot_number, unit_cost, company_id, warehouse_id, uscita_id, rientro_commessa
        from public.warehouse_movements where id = m.id;
      update public.warehouse_movements set quantity = v_serve, order_item_id = p_riga where id = m.id;
      v_preso := v_preso + v_serve;
      v_serve := 0;
    end if;
  end loop;
  return v_preso;
end $$;
revoke all on function public.magazzino_collega_prelievi(uuid, uuid, uuid, uuid, numeric) from public, anon, authenticated;

create or replace function public.magazzino_movimento_riga(
  p_company uuid, p_commessa uuid, p_riga uuid, p_articolo uuid, p_delta numeric, p_nota text, p_attore uuid)
returns boolean language plpgsql security definer set search_path = public
as $$
declare ws public.warehouse_stock; v_delta numeric := coalesce(p_delta, 0); v_preso numeric := 0;
begin
  if p_articolo is null or v_delta = 0 then return false; end if;
  select * into ws from public.warehouse_stock where id = p_articolo and company_id = p_company for update;
  if not found then return false; end if;
  -- Merce già uscita per questa commessa (prelievi del cantiere, DDT): la riga la prende prima di
  -- scaricare altro dal magazzino.
  if v_delta > 0 then
    v_preso := public.magazzino_collega_prelievi(p_company, p_commessa, p_riga, p_articolo, v_delta);
    v_delta := v_delta - v_preso;
    if v_delta <= 0 then return v_preso > 0; end if;
  end if;
  if v_delta > 0 and coalesce(ws.quantity, 0) < v_delta then
    raise exception 'Giacenza insufficiente per «%»: disponibili %, servono %.',
      coalesce(ws.name, 'articolo di magazzino'), coalesce(ws.quantity, 0), v_delta using errcode = '23514';
  end if;
  update public.warehouse_stock
     set quantity = quantity - v_delta, updated_at = now()
   where id = p_articolo and company_id = p_company;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
     warehouse_id, unit_cost, rientro_commessa)
  values (p_articolo, p_riga, case when v_delta > 0 then 'scarico' else 'carico' end, abs(v_delta),
          p_nota, p_attore, p_commessa, p_company, ws.warehouse_id, ws.unit_cost, v_delta < 0);
  return true;
end $$;
revoke all on function public.magazzino_movimento_riga(uuid, uuid, uuid, uuid, numeric, text, uuid) from public, anon, authenticated;

create or replace function public.trg_auto_deduct_stock()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
DECLARE
  v_stock public.warehouse_stock%ROWTYPE;
  v_company uuid;
  v_used numeric := 0;
  v_remaining numeric;
BEGIN
  IF NEW.status = 'installato' AND OLD.status IS DISTINCT FROM 'installato'
     AND NEW.auto_deducted IS NOT TRUE AND NEW.stock_item_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.orders WHERE id=NEW.order_id;
    SELECT * INTO v_stock FROM public.warehouse_stock
      WHERE id=NEW.stock_item_id AND company_id=v_company FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Articolo di magazzino non valido per questa commessa'; END IF;
    IF NEW.quantity IS NULL OR NEW.quantity<=0 OR NEW.quantity<>trunc(NEW.quantity) THEN
      RAISE EXCEPTION 'Verifica la quantità: lo scarico automatico richiede unità intere positive';
    END IF;
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    -- Prelievi dal cantiere e DDT per la commessa: questa riga ne prende solo quanto le serve.
    PERFORM public.magazzino_collega_prelievi(v_company, NEW.order_id, NEW.id, NEW.stock_item_id,
                                              greatest(NEW.quantity - greatest(v_used, 0), 0));
    v_used := public.magazzino_scaricato_riga(NEW.id, NEW.stock_item_id);
    v_remaining := greatest(NEW.quantity-greatest(v_used,0),0);
    IF v_remaining>0 THEN
      IF v_stock.quantity<v_remaining THEN
        RAISE EXCEPTION 'Giacenza insufficiente: disponibili %, da scaricare %', v_stock.quantity,v_remaining;
      END IF;
      UPDATE public.warehouse_stock SET quantity=quantity-v_remaining,updated_at=now()
        WHERE id=NEW.stock_item_id AND company_id=v_company;
      INSERT INTO public.warehouse_movements
        (stock_item_id,order_item_id,movement_type,quantity,notes,performed_by,order_id,company_id,warehouse_id,unit_cost)
      VALUES (NEW.stock_item_id,NEW.id,'scarico',v_remaining,'Scarico residuo automatico a installazione',
        auth.uid(),NEW.order_id,v_company,v_stock.warehouse_id,v_stock.unit_cost);
    END IF;
    NEW.auto_deducted := true;
  END IF;
  RETURN NEW;
END;
$$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
do $v$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_viewdef('public.v_ordine_marginalita'::regclass);
  if position('wm.rientro_commessa' in v_def) > 0 then return; end if;
  v_nuova := replace(v_def,
    $a$CASE wm.movement_type
                    WHEN 'scarico'::text THEN$a$,
    $b$CASE
                    WHEN wm.movement_type = 'scarico'::text THEN$b$);
  v_nuova := replace(v_nuova,
    $a$WHEN 'carico'::text THEN (((- wm.quantity))::numeric$a$,
    $b$WHEN wm.movement_type = 'carico'::text AND wm.rientro_commessa THEN (((- wm.quantity))::numeric$b$);
  if position('wm.rientro_commessa' in v_nuova) = 0 or position('WHEN wm.movement_type = ''scarico''::text' in v_nuova) = 0 then
    raise exception 'v_ordine_marginalita: il testo della vista è diverso da quello atteso';
  end if;
  execute 'create or replace view public.v_ordine_marginalita with (security_invoker = true) as ' || v_nuova;
end $v$;

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.conferma_carico_ddt(p_carico_id uuid, p_utente uuid default null::uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_c public.email_ddt_carico%rowtype;
  v_utente uuid := coalesce(auth.uid(), p_utente);
  v_riga jsonb;
  v_testo_qta text;
  v_qta numeric;
  v_codice text;
  v_descr text;
  v_n int;
  v_art_id uuid;
  v_art_nome text;
  v_art_magazzino uuid;
  v_caricati jsonb := '[]'::jsonb;
  v_da_abbinare jsonb := '[]'::jsonb;
  v_ricezione uuid;
  v_oda_numero text; v_oda_commessa uuid; v_oda_ticket uuid;
  v_poi uuid; v_poi_riga uuid; v_residuo numeric; v_registrata numeric; v_tot_oda numeric := 0;
  v_mancante numeric; v_completo boolean; v_testo_mancante text; v_data date;
begin
  if v_utente is null then
    return jsonb_build_object('ok', false, 'errore', 'Serve una persona che confermi il carico.');
  end if;

  select * into v_c from public.email_ddt_carico where id = p_carico_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'errore', 'Carico non trovato.');
  end if;

  -- Dall'app: solo chi lavora in quell'azienda. Dal bot (chiave di servizio,
  -- nessun utente collegato) l'azienda l'ha gia verificata il bot.
  if auth.uid() is not null and not public.user_can_access_company(v_c.company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;

  if v_c.stato = 'scartato' then
    return jsonb_build_object('ok', false, 'errore', 'Questo carico e stato scartato.');
  end if;
  if v_c.stato = 'confermato' and coalesce(v_c.movimento_created, false) then
    return jsonb_build_object('ok', true, 'gia_confermato', true, 'caricati', '[]'::jsonb, 'da_abbinare', '[]'::jsonb);
  end if;
  v_data := coalesce(v_c.ddt_data, current_date);

  -- 1) Ordine collegato: la ricezione (una sola per numero DDT).
  if v_c.purchase_order_id is not null then
    select po.oda_number, po.order_id, po.ticket_id into v_oda_numero, v_oda_commessa, v_oda_ticket
      from public.purchase_orders po
     where po.id = v_c.purchase_order_id and po.company_id = v_c.company_id;
    if not found then
      return jsonb_build_object('ok', false, 'errore', 'Ordine collegato non trovato in questa azienda.');
    end if;
    select id into v_ricezione from public.ddt_ricezione
     where purchase_order_id = v_c.purchase_order_id
       and numero_ddt = coalesce(v_c.ddt_numero, 's.n.')
     limit 1;
    if v_ricezione is null then
      insert into public.ddt_ricezione (company_id, purchase_order_id, numero_ddt, data_ricezione, stato, source, created_by, note)
      values (v_c.company_id, v_c.purchase_order_id, coalesce(v_c.ddt_numero, 's.n.'),
              v_data, 'ricevuto',
              case when v_c.email_id is null then 'whatsapp' else 'manual' end,
              v_utente, 'Da DDT confermato')
      returning id into v_ricezione;
    end if;
  end if;

  -- 2) Righe -> magazzino (e, con l'ordine collegato, -> righe dell'ordine).
  for v_riga in select value from jsonb_array_elements(coalesce(v_c.righe, '[]'::jsonb)) loop
    v_testo_qta := v_riga->>'qta_bolla';
    v_qta := case when v_testo_qta ~ '^[0-9]+(\.[0-9]+)?$' then v_testo_qta::numeric else null end;
    continue when v_qta is null or v_qta <= 0;
    v_codice := nullif(btrim(coalesce(v_riga->>'codice', '')), '');
    v_descr := nullif(btrim(coalesce(v_riga->>'descrizione', '')), '');

    if v_qta <> trunc(v_qta) then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'quantita con decimali');
      continue;
    end if;

    v_art_id := null;
    if v_codice is not null then
      select count(*), min(id::text)::uuid into v_n, v_art_id from public.warehouse_stock
       where company_id = v_c.company_id
         and (lower(internal_code) = lower(v_codice) or lower(barcode) = lower(v_codice));
      if v_n <> 1 then v_art_id := null; end if;
    end if;
    if v_art_id is null and v_descr is not null then
      select count(*), min(id::text)::uuid into v_n, v_art_id from public.warehouse_stock
       where company_id = v_c.company_id
         and lower(btrim(name)) = lower(v_descr);
      if v_n <> 1 then v_art_id := null; end if;
    end if;

    if v_art_id is null then
      v_da_abbinare := v_da_abbinare || jsonb_build_object(
        'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta, 'motivo', 'articolo non trovato in magazzino');
      continue;
    end if;

    select name, warehouse_id into v_art_nome, v_art_magazzino
      from public.warehouse_stock where id = v_art_id for update;

    -- La riga dell'ordine con quell'articolo che aspetta ancora merce.
    v_poi := null; v_poi_riga := null; v_residuo := 0;
    if v_c.purchase_order_id is not null then
      select i.id, i.order_item_id, i.quantity - coalesce(i.quantity_received, 0)
        into v_poi, v_poi_riga, v_residuo
        from public.purchase_order_items i
        left join public.order_items oi on oi.id = i.order_item_id
       where i.purchase_order_id = v_c.purchase_order_id
         and i.quantity - coalesce(i.quantity_received, 0) > 0
         and (oi.stock_item_id = v_art_id
              or (v_codice is not null and lower(btrim(coalesce(i.sku, ''))) = lower(v_codice))
              or lower(btrim(coalesce(i.description, ''))) in (lower(coalesce(v_descr, '')), lower(btrim(coalesce(v_art_nome, '')))))
       order by (oi.stock_item_id = v_art_id) desc nulls last, i.sort_order nulls last, i.id
       limit 1
       for update of i;
    end if;

    if v_poi is not null then
      v_registrata := least(v_qta, v_residuo);
      update public.purchase_order_items
         set quantity_received = coalesce(quantity_received, 0) + v_registrata, received_date = v_data
       where id = v_poi;
      v_tot_oda := v_tot_oda + v_registrata;
      insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, warehouse_id,
                                              company_id, order_id, order_item_id)
      values (v_art_id, 'carico', v_qta::int,
              'Arrivo merce ordine ' || coalesce(v_oda_numero, '') || ' · bolla ' || coalesce(v_c.ddt_numero, 's.n.'),
              v_utente, v_art_magazzino, v_c.company_id, v_oda_commessa, v_poi_riga);
    else
      insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, warehouse_id, company_id)
      values (v_art_id, 'carico', v_qta::int, 'DDT ' || coalesce(v_c.ddt_numero, 's.n.') || ' confermato',
              v_utente, v_art_magazzino, v_c.company_id);
    end if;
    update public.warehouse_stock
       set quantity = coalesce(quantity, 0) + v_qta::int,
           last_delivery_date = v_data
     where id = v_art_id;
    v_caricati := v_caricati || jsonb_build_object('articolo', v_art_nome, 'quantita', v_qta::int);
  end loop;

  -- 3) L'ordine avanza come con la registrazione dell'arrivo.
  if v_c.purchase_order_id is not null and v_tot_oda > 0 then
    select coalesce(sum(greatest(quantity - coalesce(quantity_received, 0), 0)), 0) into v_mancante
      from public.purchase_order_items where purchase_order_id = v_c.purchase_order_id;
    v_completo := v_mancante <= 0;
    update public.purchase_orders
       set status = case when v_completo then 'ricevuto' else 'parziale' end,
           actual_delivery_date = case when v_completo then v_data else actual_delivery_date end,
           updated_at = now()
     where id = v_c.purchase_order_id and company_id = v_c.company_id and status not in ('annullato');
    update public.ddt_ricezione
       set quantita_ricevuta = coalesce(quantita_ricevuta, 0) + v_tot_oda,
           stato = case when v_completo then 'ricevuto' else 'parziale' end
     where id = v_ricezione;
    if v_oda_ticket is not null then
      if not v_completo then
        select string_agg(
                 coalesce(nullif(btrim(i.description), ''), i.sku, 'Riga senza descrizione')
                 || ': mancano '
                 || trim(trailing '.' from trim(to_char(i.quantity - coalesce(i.quantity_received, 0), 'FM999999990.999')))
                 || coalesce(' ' || nullif(btrim(i.unit_of_measure), ''), ''),
                 E'\n' order by i.sort_order nulls last, i.description)
          into v_testo_mancante
          from public.purchase_order_items i
         where i.purchase_order_id = v_c.purchase_order_id
           and i.quantity - coalesce(i.quantity_received, 0) > 0;
      end if;
      update public.tickets
         set merce_stato = case when v_completo then 'arrivata' else 'arrivata_parziale' end,
             merce_mancante = case when v_completo then null else v_testo_mancante end,
             updated_at = now()
       where id = v_oda_ticket and company_id = v_c.company_id;
    end if;
  end if;

  update public.email_ddt_carico
     set stato = 'confermato', confirmed_by = v_utente, confirmed_at = now(), movimento_created = true
   where id = p_carico_id;

  return jsonb_build_object('ok', true, 'ricezione_id', v_ricezione, 'caricati', v_caricati, 'da_abbinare', v_da_abbinare,
                            'registrati_su_ordine', v_tot_oda);
end;
$function$;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_incassi(p_company uuid)
returns table (order_id uuid, installment_id uuid, data date, importo numeric)
language sql stable security definer set search_path = public
as $$
  with r as (select * from public.rate_importi(p_company))
  -- rate pagate, per l'importo che conta (il saldo è il residuo)
  select r.order_id, r.installment_id, r.paid_date, r.importo
    from r where r.is_paid and r.paid_date is not null
  union all
  -- rate non ancora pagate con la fattura pagata in parte: gli incassi della fattura, alla loro data
  select d.order_id, d.installment_id, m.data_movimento, m.importo
    from (select distinct on (r.documento_fiscale_id) r.order_id, r.installment_id, r.documento_fiscale_id
            from r
           where not r.is_paid and r.documento_fiscale_id is not null
             and not exists (select 1 from r r2 where r2.documento_fiscale_id = r.documento_fiscale_id and r2.is_paid)
           order by r.documento_fiscale_id, r.installment_id) d
    join public.movimenti_cassa_native m
      on m.documento_id = d.documento_fiscale_id and m.tipo = 'incasso' and m.company_id = p_company
$$;
revoke all on function public.rate_incassi(uuid) from public, anon, authenticated;

create or replace function public.incassato_rate_periodo(p_da date, p_a date)
returns numeric language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid := public.get_my_company_id();
begin
  if auth.uid() is null or v_company is null or public.utente_bloccato()
     or not (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', v_company), false)) then
    raise exception 'Non puoi vedere gli incassi di questa azienda.' using errcode = '42501';
  end if;
  return coalesce((select round(sum(x.importo), 2) from public.rate_incassi(v_company) x
                    where x.data between p_da and p_a), 0);
end $$;
revoke all on function public.incassato_rate_periodo(date, date) from public, anon;
grant execute on function public.incassato_rate_periodo(date, date) to authenticated;

create or replace function public.cruscotto_trend_12m(p_company_id uuid)
returns table(mese_key text, venduto numeric, incassato numeric, cassa numeric)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.utente_bloccato()
     or not coalesce(public.user_can_access_company(p_company_id), false)
     or not (coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
             or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', p_company_id), false)) then
    raise exception 'Non puoi vedere gli incassi di questa azienda.' using errcode = '42501';
  end if;
  return query
  with bounds as (
    select date_trunc('month', (now() at time zone 'Europe/Rome')) - interval '11 months' as from_local
  ),
  months as (
    select to_char(date_trunc('month', (now() at time zone 'Europe/Rome')) - make_interval(months => gs), 'YYYY-MM') as k
    from generate_series(0, 11) gs
  ),
  vend as (
    -- contratto più varianti approvate, IVA esclusa, nel mese in cui nasce la commessa
    select to_char(date_trunc('month', o.created_at at time zone 'Europe/Rome'), 'YYYY-MM') as k,
           sum(coalesce(o.total_amount, 0)
               + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                            where v.order_id = o.id and v.status = 'approvato'), 0)) as v
    from public.orders o, bounds b
    where o.company_id = p_company_id and o.deleted_at is null
      and (o.created_at at time zone 'Europe/Rome') >= b.from_local
    group by 1
  ),
  inc as (
    select to_char(date_trunc('month', x.data::timestamp), 'YYYY-MM') as k, sum(x.importo) as v
    from public.rate_incassi(p_company_id) x cross join bounds b
    where x.data >= b.from_local::date
    group by 1
  ),
  costi as (
    select to_char(date_trunc('month', cc.paid_date::timestamp), 'YYYY-MM') as k,
           sum(coalesce(cc.amount, 0) * (1 + coalesce(cc.vat_rate, 0) / 100)) as v
    from public.company_costs cc, bounds b
    where cc.company_id = p_company_id
      and cc.is_paid = true
      and cc.paid_date >= b.from_local::date
    group by 1
  )
  select m.k,
         round(coalesce(v.v, 0), 2)::numeric,
         round(coalesce(i.v, 0), 2)::numeric,
         round(coalesce(i.v, 0) - coalesce(c.v, 0), 2)::numeric
  from months m
  left join vend  v on v.k = m.k
  left join inc   i on i.k = m.k
  left join costi c on c.k = m.k
  order by m.k;
end $$;
revoke all on function public.cruscotto_trend_12m(uuid) from public, anon;
grant execute on function public.cruscotto_trend_12m(uuid) to authenticated;

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.commessa_incassi(p_order uuid)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_company is null then return null; end if;
  if auth.uid() is not null and (public.utente_bloccato()
     or not coalesce(public.user_can_access_company(v_company), false)
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', v_company), false)) then
    raise exception 'Non puoi vedere gli incassi di questa commessa.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'incassato', coalesce((select round(sum(x.importo), 2) from public.rate_incassi(v_company) x where x.order_id = p_order), 0),
    'da_incassare', coalesce((select round(sum(x.residuo), 2) from public.rate_da_incassare(v_company) x where x.order_id = p_order), 0),
    'scaduto', coalesce((select round(sum(x.residuo), 2) from public.rate_da_incassare(v_company) x
                          where x.order_id = p_order and not x.finanziamento and x.expected_date < current_date), 0));
end $$;
revoke all on function public.commessa_incassi(uuid) from public, anon;
grant execute on function public.commessa_incassi(uuid) to authenticated, service_role;

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti);
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

select pg_temp.correggi('public.campo_rapportino_verifica_flusso()',
  $re$if v_ufficio then return new; end if;$re$,
  $to$if v_ufficio then return new; end if;
  -- Costo, presenze registrate e approvazione li scrive solo l'ufficio: dall'app di cantiere restano come sono.
  if (tg_op = 'INSERT' and (new.costo_manodopera is not null or new.costo_registrato_at is not null
        or new.presenze_registrate is not null or new.approvato_da is not null or new.approvato_at is not null
        or new.ufficio_employee_id is not null or new.ufficio_created_by is not null))
     or (tg_op = 'UPDATE' and (new.costo_manodopera, new.costo_registrato_at, new.presenze_registrate, new.approvato_da,
          new.approvato_at, new.ufficio_employee_id, new.ufficio_created_by) is distinct from
         (old.costo_manodopera, old.costo_registrato_at, old.presenze_registrate, old.approvato_da,
          old.approvato_at, old.ufficio_employee_id, old.ufficio_created_by)) then
    raise exception 'Costi e approvazione del rapportino li registra l’ufficio' using errcode = '42501';
  end if;$to$,
  'Costi e approvazione del rapportino li registra l’ufficio');

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
alter table public.employees alter column inps_rate drop default;
alter table public.employees alter column monthly_hours set default 173;
update public.employees set inps_rate = null where inps_rate = 28;

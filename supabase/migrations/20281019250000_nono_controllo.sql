-- Nono controllo (19/10/2026).
--
-- Magazzino
--  1. Prelievo dal cantiere senza commessa (la scelta iniziale dell'app): di nuovo accettato. Con
--     una commessa, deve essere dell'azienda di chi preleva.
--  2. Divisione di una voce tra le fasi: i prelievi del cantiere che la voce aveva preso passano
--     alla nuova voce come prelievi (non come scarico del magazzino), così togliere o ridurre la
--     nuova voce non li rimette in giacenza.
--  3. DDT confermato su un ordine d'acquisto: entra in magazzino solo quanto resta da ricevere
--     sull'ordine; l'eccedenza finisce «da abbinare», per ogni riga e con lo stesso motivo.
-- Cantiere e personale
--  4. costo_orario_dipendente: la legge chi gestisce commesse, costi o personale (prima bastava
--     essere dell'azienda, e un operaio leggeva il costo dei colleghi).
--  5. PDF e motivo del rifiuto del rapportino li scrive l'ufficio: dall'app di cantiere si possono
--     solo svuotare (quando si rimanda il rapportino corretto).
--  6. Carico di lavoro: chi non ha ore contrattuali va in fondo all'elenco, non in cima.
-- Economia
--  7. Rata segnata pagata senza data: prende la data prevista (le due rate esistenti) e d'ora in
--     poi la data di oggi; rate_incassi le conta comunque.
--  8. Widget del fatturato (totale, valore medio, migliori clienti): contratto più varianti
--     approvate, come la scheda commessa.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.prelievo_campo_registra(uuid,uuid,jsonb,text)',
  $re$if not exists \(select 1 from public\.orders o where o\.id = p_order_id$re$,
  $to$if p_order_id is not null and not exists (select 1 from public.orders o where o.id = p_order_id$to$,
  'if p_order_id is not null and not exists (select 1 from public.orders o where o.id = p_order_id');

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dividi_scarico_magazzino(p_originale uuid, p_nuova uuid, p_quantita numeric)
returns numeric language plpgsql security definer set search_path = public
as $$
declare
  a public.order_items; b public.order_items;
  v_company uuid; v_netto numeric; v_sposta numeric; v_prelievi numeric := 0; v_resto numeric;
  ws public.warehouse_stock;
begin
  select * into a from public.order_items where id = p_originale for update;
  select * into b from public.order_items where id = p_nuova for update;
  if a.id is null or b.id is null or a.order_id <> b.order_id then
    raise exception 'Le due righe non sono della stessa commessa.' using errcode = '22023';
  end if;
  select o.company_id into v_company from public.orders o where o.id = a.order_id;
  if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
     or not exists (select 1 from public.orders o where o.id = a.order_id
                     and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  if a.stock_item_id is null or b.stock_item_id is distinct from a.stock_item_id or coalesce(p_quantita, 0) <= 0 then
    return 0;
  end if;
  v_netto := public.magazzino_scaricato_riga(a.id, a.stock_item_id);
  v_sposta := least(greatest(v_netto, 0), p_quantita);
  if v_sposta <= 0 then return 0; end if;
  -- Prima i prelievi del cantiere: passano alla nuova voce restando prelievi.
  v_prelievi := public.magazzino_stacca_prelievi(a.id, a.stock_item_id, v_sposta);
  if v_prelievi > 0 then
    perform public.magazzino_collega_prelievi(v_company, a.order_id, b.id, a.stock_item_id, v_prelievi);
  end if;
  -- Il resto (merce scaricata dal magazzino per la voce) si sposta con la coppia rientro/scarico.
  v_resto := v_sposta - v_prelievi;
  if v_resto > 0 then
    select * into ws from public.warehouse_stock where id = a.stock_item_id;
    insert into public.warehouse_movements
      (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id,
       warehouse_id, unit_cost, rientro_commessa)
    values
      (a.stock_item_id, a.id, 'carico', v_resto, 'Divisione tra le fasi: quota passata alla nuova riga', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost, true),
      (a.stock_item_id, b.id, 'scarico', v_resto, 'Divisione tra le fasi: quota presa dalla riga originale', auth.uid(), a.order_id, v_company, ws.warehouse_id, ws.unit_cost, false);
  end if;
  return v_sposta;
end $$;
revoke all on function public.dividi_scarico_magazzino(uuid, uuid, numeric) from public, anon;
grant execute on function public.dividi_scarico_magazzino(uuid, uuid, numeric) to authenticated;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
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

    if v_c.purchase_order_id is not null then
      -- Con l'ordine collegato entra solo quanto l'ordine aspetta ancora, riga per riga dell'ordine.
      while v_qta > 0 loop
        v_poi := null; v_poi_riga := null; v_residuo := 0;
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
        exit when v_poi is null;
        v_registrata := trunc(least(v_qta, v_residuo));
        exit when v_registrata <= 0;
        update public.purchase_order_items
           set quantity_received = coalesce(quantity_received, 0) + v_registrata, received_date = v_data
         where id = v_poi;
        v_tot_oda := v_tot_oda + v_registrata;
        insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, warehouse_id,
                                                company_id, order_id, order_item_id)
        values (v_art_id, 'carico', v_registrata::int,
                'Arrivo merce ordine ' || coalesce(v_oda_numero, '') || ' · bolla ' || coalesce(v_c.ddt_numero, 's.n.'),
                v_utente, v_art_magazzino, v_c.company_id, v_oda_commessa, v_poi_riga);
        update public.warehouse_stock
           set quantity = coalesce(quantity, 0) + v_registrata::int, last_delivery_date = v_data
         where id = v_art_id;
        v_caricati := v_caricati || jsonb_build_object('articolo', v_art_nome, 'quantita', v_registrata::int);
        v_qta := v_qta - v_registrata;
      end loop;
      if v_qta > 0 then
        v_da_abbinare := v_da_abbinare || jsonb_build_object(
          'descrizione', v_descr, 'codice', v_codice, 'quantita', v_qta,
          'motivo', 'oltre quanto resta da ricevere sull''ordine');
      end if;
      continue;
    end if;

    insert into public.warehouse_movements (stock_item_id, movement_type, quantity, notes, performed_by, warehouse_id, company_id)
    values (v_art_id, 'carico', v_qta::int, 'DDT ' || coalesce(v_c.ddt_numero, 's.n.') || ' confermato',
            v_utente, v_art_magazzino, v_c.company_id);
    update public.warehouse_stock
       set quantity = coalesce(quantity, 0) + v_qta::int, last_delivery_date = v_data
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

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.costo_orario_dipendente(p_employee_id uuid)
returns numeric language sql stable security definer set search_path to 'public'
as $$
  select coalesce(public.costo_orario_calcolato(e.id), 0)
    from public.employees e
   where e.id = p_employee_id
     and public.user_can_access_company(e.company_id)
     -- il costo di una persona lo legge chi gestisce commesse, costi o personale (o il servizio)
     and (auth.uid() is null
          or coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', e.company_id), false)
          or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_costs', e.company_id), false)
          or coalesce(public.has_permission_for_company(auth.uid(), 'can_view_persone', e.company_id), false))
$$;
revoke all on function public.costo_orario_dipendente(uuid) from public, anon;
grant execute on function public.costo_orario_dipendente(uuid) to authenticated, service_role;

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_rapportino_verifica_flusso()',
  $re$(raise exception 'Costi e approvazione del rapportino li registra l’ufficio' using errcode = '42501';\s*end if;)$re$,
  $to$\1
  -- PDF e motivo del rifiuto: dall'app di cantiere si possono solo svuotare.
  if (tg_op = 'INSERT' and (new.pdf_url is not null or new.motivo_rifiuto is not null))
     or (tg_op = 'UPDATE' and ((new.pdf_url is distinct from old.pdf_url and new.pdf_url is not null)
                              or (new.motivo_rifiuto is distinct from old.motivo_rifiuto and new.motivo_rifiuto is not null))) then
    raise exception 'PDF e motivo del rifiuto li scrive l’ufficio' using errcode = '42501';
  end if;$to$,
  'PDF e motivo del rifiuto li scrive l’ufficio');

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.silvio_employees_workload(uuid)',
  $re$ORDER BY s\.utilizzo_pct DESC\)$re$,
  $to$ORDER BY s.utilizzo_pct DESC NULLS LAST)$to$,
  'ORDER BY s.utilizzo_pct DESC NULLS LAST)');

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
update public.order_installments
   set paid_date = coalesce(expected_date, current_date)
 where is_paid and paid_date is null;

create or replace function public.rata_pagata_con_data()
returns trigger language plpgsql set search_path = public
as $$
begin
  if coalesce(new.is_paid, false) and new.paid_date is null then
    new.paid_date := (now() at time zone 'Europe/Rome')::date;
  end if;
  return new;
end $$;
revoke all on function public.rata_pagata_con_data() from public, anon, authenticated;
drop trigger if exists trg_rata_pagata_con_data on public.order_installments;
create trigger trg_rata_pagata_con_data
  before insert or update of is_paid, paid_date on public.order_installments
  for each row execute function public.rata_pagata_con_data();

create or replace function public.rate_incassi(p_company uuid)
returns table (order_id uuid, installment_id uuid, data date, importo numeric)
language sql stable security definer set search_path = public
as $$
  with r as (select * from public.rate_importi(p_company)),
  mv as (
    select m.documento_id, m.data_movimento, m.importo
      from public.movimenti_cassa_native m
     where m.company_id = p_company and m.tipo = 'incasso' and m.documento_id is not null
  ),
  tot as (select mv.documento_id, sum(mv.importo) as t, max(mv.data_movimento) as ultima from mv group by mv.documento_id)
  -- rate pagate senza fattura, alla data del pagamento (o, se manca, a quella prevista)
  select r.order_id, r.installment_id, coalesce(r.paid_date, r.expected_date), r.importo
    from r where r.is_paid and r.documento_fiscale_id is null
  union all
  -- rate con fattura: gli incassi della fattura, alle loro date
  select r.order_id, r.installment_id, mv.data_movimento, mv.importo
    from r join mv on mv.documento_id = r.documento_fiscale_id
  union all
  -- rata pagata con la fattura incassata a un centesimo di arrotondamento: vale la rata
  select r.order_id, r.installment_id, coalesce(r.paid_date, t.ultima), r.importo - t.t
    from r join tot t on t.documento_id = r.documento_fiscale_id
   where r.is_paid and r.importo <> t.t and abs(r.importo - t.t) <= 0.011
$$;
revoke all on function public.rate_incassi(uuid) from public, anon, authenticated;

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.commessa_varianti_approvate(p_order uuid)
returns numeric language sql stable set search_path = public
as $$
  select coalesce(sum(coalesce(v.impatto_economico, 0)), 0)
    from public.ordini_variazione v
   where v.order_id = p_order and v.status = 'approvato'
$$;
revoke all on function public.commessa_varianti_approvate(uuid) from public, anon, authenticated;

select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$SUM\(total_amount\)$re$,
  $to$SUM(total_amount + public.commessa_varianti_approvate(id))$to$,
  'SUM(total_amount + public.commessa_varianti_approvate(id))');
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$SUM\(o\.total_amount\)$re$,
  $to$SUM(o.total_amount + public.commessa_varianti_approvate(o.id))$to$,
  'SUM(o.total_amount + public.commessa_varianti_approvate(o.id))');
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$AVG\(total_amount\)$re$,
  $to$AVG(total_amount + public.commessa_varianti_approvate(id))$to$,
  'AVG(total_amount + public.commessa_varianti_approvate(id))');

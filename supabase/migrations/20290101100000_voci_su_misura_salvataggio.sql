-- Le righe su misura sopravvivono al salvataggio (piano articoli su misura, fase 3).
--
-- Il popup nuovo scrive una riga per posizione, con gruppo, riferimento, misure e
-- specifiche. Tre strade le salvano:
--   * create_order_atomic (Nuova Commessa): non conosceva gruppo_id, riferimento,
--     specifiche e prezzo_fonte;
--   * commessa_salva (Modifica Commessa): le righe nuove perdevano anche famiglia,
--     assi, misure, stato misure e unità;
--   * commessa_aggiungi_voci (nuova): dal dettaglio della commessa. Prima una INSERT
--     dal browser, una riga alla volta e senza scarico del magazzino.
--
-- Le chiavi nuove valgono solo se la riga le manda: un articolo normale resta com'era.
-- Le due funzioni esistenti non si ricopiano: si aggiungono i pezzi nel punto giusto e
-- la migrazione si ferma se quel punto non c'è o ce n'è più d'uno (come 20281222170000).
-- Rieseguirla non fa niente. Nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  def text;
  quanti integer;
begin
  -- create_order_atomic
  def := pg_get_functiondef('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)'::regprocedure);
  if position('-- riga su misura (20290101100000)' in def) = 0 then
    select count(*) into quanti from regexp_matches(def, 'RETURNING id INTO v_item_id;', 'g');
    if quanti <> 1 then
      raise exception 'create_order_atomic: atteso un solo «RETURNING id INTO v_item_id;», trovati %', quanti;
    end if;
    execute replace(def, 'RETURNING id INTO v_item_id;',
      'RETURNING id INTO v_item_id;' || E'\n\n'
      || '    -- riga su misura (20290101100000): gruppo, riferimento, specifiche e fonte del costo.' || E'\n'
      || '    IF v_item ?| array[''gruppo_id'',''riferimento'',''specifiche'',''prezzo_fonte''] THEN' || E'\n'
      || '      UPDATE public.order_items SET' || E'\n'
      || '        gruppo_id = NULLIF(v_item->>''gruppo_id'', '''')::uuid,' || E'\n'
      || '        riferimento = NULLIF(btrim(v_item->>''riferimento''), ''''),' || E'\n'
      || '        specifiche = NULLIF(btrim(v_item->>''specifiche''), ''''),' || E'\n'
      || '        prezzo_fonte = NULLIF(v_item->>''prezzo_fonte'', '''')' || E'\n'
      || '      WHERE id = v_item_id;' || E'\n'
      || '    END IF;');
  end if;

  -- commessa_salva
  def := pg_get_functiondef('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure);
  if position('-- riga su misura (20290101100000)' in def) = 0 then
    select count(*) into quanti from regexp_matches(def, E'      updated_at = now\\(\\)\n      from _voci v', 'g');
    if quanti <> 1 then
      raise exception 'commessa_salva: atteso un solo aggiornamento delle voci, trovati %', quanti;
    end if;
    select count(*) into quanti from regexp_matches(def, E'balance_expected_date, delivery_date, posizioni\n    \\)', 'g');
    if quanti <> 1 then
      raise exception 'commessa_salva: atteso un solo elenco di colonne, trovati %', quanti;
    end if;
    select count(*) into quanti from regexp_matches(def, E'nullif\\(v.dati->''posizioni'',''null''::jsonb\\)\n      from _voci v where v.id is null;', 'g');
    if quanti <> 1 then
      raise exception 'commessa_salva: atteso un solo inserimento delle voci, trovati %', quanti;
    end if;

    def := replace(def, E'      updated_at = now()\n      from _voci v',
      '      -- riga su misura (20290101100000): solo se il modulo manda la chiave' || E'\n'
      || '      gruppo_id = case when v.dati ? ''gruppo_id'' then nullif(v.dati->>''gruppo_id'','''')::uuid else oi.gruppo_id end,' || E'\n'
      || '      riferimento = case when v.dati ? ''riferimento'' then nullif(btrim(v.dati->>''riferimento''),'''') else oi.riferimento end,' || E'\n'
      || '      family_id = case when v.dati ? ''family_id'' then nullif(v.dati->>''family_id'','''')::uuid else oi.family_id end,' || E'\n'
      || '      axis_selections = case when v.dati ? ''axis_selections'' then nullif(v.dati->''axis_selections'',''null''::jsonb) else oi.axis_selections end,' || E'\n'
      || '      misure_preventivo = case when v.dati ? ''misure_preventivo'' then nullif(v.dati->''misure_preventivo'',''null''::jsonb) else oi.misure_preventivo end,' || E'\n'
      || '      measure_status = case when v.dati ? ''measure_status'' then nullif(v.dati->>''measure_status'','''') else oi.measure_status end,' || E'\n'
      || '      unita_misura = case when v.dati ? ''unita_misura'' then nullif(btrim(v.dati->>''unita_misura''),'''') else oi.unita_misura end,' || E'\n'
      || '      specifiche = case when v.dati ? ''specifiche'' then nullif(btrim(v.dati->>''specifiche''),'''') else oi.specifiche end,' || E'\n'
      || '      prezzo_fonte = case when v.dati ? ''prezzo_fonte'' then nullif(v.dati->>''prezzo_fonte'','''') else oi.prezzo_fonte end,' || E'\n'
      || E'      updated_at = now()\n      from _voci v');

    def := replace(def, E'balance_expected_date, delivery_date, posizioni\n    )',
      E'balance_expected_date, delivery_date, posizioni,\n'
      || E'      gruppo_id, riferimento, family_id, axis_selections, misure_preventivo,\n'
      || E'      measure_status, unita_misura, specifiche, prezzo_fonte\n    )');

    def := replace(def, E'nullif(v.dati->''posizioni'',''null''::jsonb)\n      from _voci v where v.id is null;',
      E'nullif(v.dati->''posizioni'',''null''::jsonb),\n'
      || E'      nullif(v.dati->>''gruppo_id'','''')::uuid,\n'
      || E'      nullif(btrim(v.dati->>''riferimento''),''''),\n'
      || E'      nullif(v.dati->>''family_id'','''')::uuid,\n'
      || E'      nullif(v.dati->''axis_selections'',''null''::jsonb),\n'
      || E'      nullif(v.dati->''misure_preventivo'',''null''::jsonb),\n'
      || E'      nullif(v.dati->>''measure_status'',''''),\n'
      || E'      nullif(btrim(v.dati->>''unita_misura''),''''),\n'
      || E'      nullif(btrim(v.dati->>''specifiche''),''''),\n'
      || E'      nullif(v.dati->>''prezzo_fonte'','''')\n'
      || E'      from _voci v where v.id is null;');
    execute def;
  end if;
end
$migrazione$;

-- Aggiungere righe a una commessa già aperta, tutte o nessuna. Un articolo preso dal
-- magazzino scarica la giacenza come in creazione e in modifica.
create or replace function public.commessa_aggiungi_voci(p_commessa uuid, p_voci jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_codice  text;
  v_attore  uuid := auth.uid();
  v_voce    jsonb;
  v_id      uuid;
  v_stock   uuid;
  v_qty     numeric;
  v_fase    uuid;
  v_pos     integer;
  v_ins     integer := 0;
  v_mov     integer := 0;
  v_ids     uuid[] := '{}';
begin
  if v_attore is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  if p_voci is null or jsonb_typeof(p_voci) <> 'array' or jsonb_array_length(p_voci) = 0 then
    raise exception 'commessa_aggiungi_voci: serve almeno una voce' using errcode = '22023';
  end if;

  select o.company_id, o.order_code into v_company, v_codice
    from public.orders o where o.id = p_commessa for update;
  if v_company is null then
    raise exception 'commessa non trovata' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_company) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  perform public.assert_permesso('can_edit_orders', 'aggiungere articoli a una commessa');
  if not exists (
    select 1 from public.orders o
     where o.id = p_commessa
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
  ) then
    raise exception 'Accesso negato: questa commessa non è tra quelle che puoi vedere' using errcode = '42501';
  end if;

  select coalesce(max(oi.position), -1) + 1 into v_pos
    from public.order_items oi where oi.order_id = p_commessa;

  for v_voce in select e from jsonb_array_elements(p_voci) e loop
    v_stock := nullif(v_voce->>'stock_item_id', '')::uuid;
    v_qty   := coalesce((v_voce->>'quantity')::numeric, 1);
    v_fase  := nullif(v_voce->>'phase_id', '')::uuid;

    if v_qty <= 0 then
      raise exception 'La quantità deve essere maggiore di zero.' using errcode = '22023';
    end if;
    if v_stock is not null and not exists (
      select 1 from public.warehouse_stock ws where ws.id = v_stock and ws.company_id = v_company
    ) then
      raise exception 'Un articolo di magazzino non è di questa azienda.' using errcode = '42501';
    end if;
    if v_fase is not null and not exists (
      select 1 from public.order_work_phases f where f.id = v_fase and f.order_id = p_commessa
    ) then
      raise exception 'La fase scelta non è di questa commessa.' using errcode = '42501';
    end if;

    insert into public.order_items (
      order_id, name, description, quantity, status, position, supplier_id, purchase_price,
      vat_rate, stock_item_id, unit_price, discount_percent, standard_cost, article_template_id,
      product_code, categoria, is_paid, paid_date, payment_method, deposit_amount, deposit_paid,
      deposit_paid_date, deposit_expected_date, balance_amount, balance_paid, balance_paid_date,
      balance_expected_date, delivery_date, posizioni, phase_id, unita_misura, specifiche,
      gruppo_id, riferimento, family_id, axis_selections, misure_preventivo, measure_status, prezzo_fonte
    ) values (
      p_commessa,
      coalesce(nullif(btrim(v_voce->>'name'), ''), 'Voce senza nome'),
      nullif(v_voce->>'description', ''),
      v_qty,
      coalesce(nullif(v_voce->>'status', ''), 'da_ordinare'),
      v_pos,
      nullif(v_voce->>'supplier_id', '')::uuid,
      coalesce((v_voce->>'purchase_price')::numeric, 0),
      coalesce((v_voce->>'vat_rate')::numeric, 22),
      v_stock,
      0, 0,
      coalesce((v_voce->>'standard_cost')::numeric, 0),
      nullif(v_voce->>'article_template_id', '')::uuid,
      nullif(v_voce->>'product_code', ''),
      nullif(v_voce->>'categoria', ''),
      coalesce((v_voce->>'is_paid')::boolean, false),
      nullif(v_voce->>'paid_date', '')::date,
      nullif(v_voce->>'payment_method', ''),
      coalesce((v_voce->>'deposit_amount')::numeric, 0),
      coalesce((v_voce->>'deposit_paid')::boolean, false),
      nullif(v_voce->>'deposit_paid_date', '')::date,
      nullif(v_voce->>'deposit_expected_date', '')::date,
      coalesce((v_voce->>'balance_amount')::numeric, 0),
      coalesce((v_voce->>'balance_paid')::boolean, false),
      nullif(v_voce->>'balance_paid_date', '')::date,
      nullif(v_voce->>'balance_expected_date', '')::date,
      nullif(v_voce->>'delivery_date', '')::date,
      nullif(v_voce->'posizioni', 'null'::jsonb),
      v_fase,
      nullif(btrim(v_voce->>'unita_misura'), ''),
      nullif(btrim(v_voce->>'specifiche'), ''),
      nullif(v_voce->>'gruppo_id', '')::uuid,
      nullif(btrim(v_voce->>'riferimento'), ''),
      nullif(v_voce->>'family_id', '')::uuid,
      nullif(v_voce->'axis_selections', 'null'::jsonb),
      nullif(v_voce->'misure_preventivo', 'null'::jsonb),
      nullif(v_voce->>'measure_status', ''),
      nullif(v_voce->>'prezzo_fonte', '')
    ) returning id into v_id;
    v_pos := v_pos + 1;
    v_ins := v_ins + 1;
    v_ids := v_ids || v_id;

    if v_stock is not null and public.magazzino_movimento_riga(v_company, p_commessa, v_id, v_stock, v_qty,
         'Scarico per voce aggiunta alla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
      v_mov := v_mov + 1;
    end if;
  end loop;

  return jsonb_build_object('voci_inserite', v_ins, 'movimenti_magazzino', v_mov, 'ids', to_jsonb(v_ids));
end;
$function$;

comment on function public.commessa_aggiungi_voci(uuid, jsonb) is 'Aggiunge righe a una commessa aperta, tutte o nessuna, con lo scarico del magazzino.';
revoke all on function public.commessa_aggiungi_voci(uuid, jsonb) from public, anon;
grant execute on function public.commessa_aggiungi_voci(uuid, jsonb) to authenticated, service_role;

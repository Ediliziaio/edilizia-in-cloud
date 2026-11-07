-- Distribuita in produzione il 2026-11-06: migrazione 20261106075753.
-- Baseline per replay/test: non riapplicare su funzioni già aggiornate.
-- CHECK-71: costo trattenuto o separato. Non modifica le commesse storiche.

begin;

-- Non sovrascrivere interventi successivi: le sei definizioni sono state
-- confrontate in sola lettura con il database il 5 novembre 2026.
do $check71_preflight$
declare r record; attuale text;
begin
  for r in select * from (values
    ('cliente_rate_commesse', 'ad449a0de343fbab4d45b54c8455916b'),
    ('commessa_salva', 'd862c6514c260ba1e2dcab6e803aac48'),
    ('create_order_atomic', 'e56ce2d8fc74f7b8c95c580d3fbd9922'),
    ('rate_da_incassare', '9a839207041f9767fc1e0fea70ed6283'),
    ('rate_importi', '163edd8aad26ed40228c01b0936aaab2'),
    ('silvio_tool_rate_commessa', 'e8639c6f20d8b51f8d16ad3ec53a7742')
  ) as baseline(nome,impronta) loop
    select md5(trim(both E'\n' from pg_get_functiondef(p.oid))) into attuale
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=r.nome;
    if attuale is distinct from r.impronta then
      raise exception 'CHECK-71: funzione % diversa dalla baseline verificata. Riesaminare prima di applicare.', r.nome;
    end if;
  end loop;
end $check71_preflight$;

alter table public.orders add column if not exists financing_cost_mode text;

alter table public.orders add constraint orders_financing_cost_mode_check check (financing_cost_mode is null or financing_cost_mode in ('trattenuto','separato'));

comment on column public.orders.financing_cost_mode is 'NULL: storico da riconciliare; trattenuto: costo sull’erogazione; separato: uscita distinta. La quota finanziata è lorda.';

CREATE OR REPLACE FUNCTION public.commessa_salva(p_commessa uuid, p_campi jsonb DEFAULT NULL::jsonb, p_rate jsonb DEFAULT NULL::jsonb, p_bonus jsonb DEFAULT NULL::jsonb, p_voci jsonb DEFAULT NULL::jsonb, p_venditore jsonb DEFAULT NULL::jsonb, p_versione integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company    uuid;
  v_codice     text;
  v_chiave     text;
  v_rate       integer := 0;
  v_bonus      integer := 0;
  v_ins        integer := 0;
  v_upd        integer := 0;
  v_rim        integer := 0;
  v_mov        integer := 0;
  v_leg        jsonb;
  v_campi      jsonb;
  v_attore     uuid;
  v_ver        integer;
  v_vend       uuid;
  v_ctipo      text;
  v_cval       numeric;
  r            record;
  c_ammesse    text[] := array[
    'customer_id','order_code','description','total_amount','payment_type',
    'expected_date','internal_notes','vat_rate','warehouse_arrival_date',
    'work_start_date','work_end_date','financing_cost','financing_cost_mode','has_building_bonus',
    'destination_warehouse_id','assigned_to','work_address','work_description',
    'materials_location','work_lat','work_lng','tetto_importo','riferimento_committente'
  ];
  c_derivate   text[] := array[
    'deposit_amount','deposit_paid','deposit_paid_date','deposit_expected_date',
    'deposit_2_amount','deposit_2_paid','deposit_2_paid_date','deposit_2_expected_date',
    'balance_amount','balance_paid','balance_paid_date','balance_expected_date',
    'financing_amount','financing_paid','financing_paid_date','financing_expected_date'
  ];
begin
  select o.company_id, o.order_code, o.version into v_company, v_codice, v_ver
    from public.orders o where o.id = p_commessa for update;

  if v_company is null then
    raise exception 'commessa non trovata' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_company) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  perform public.assert_permesso('can_edit_orders', 'salvare una commessa');
  -- «Solo i propri» e «Solo il mio magazzino» valgono anche qui: la funzione
  -- è SECURITY DEFINER e la RLS di orders non la guarda.
  if not exists (
    select 1 from public.orders o
     where o.id = p_commessa
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
  ) then
    raise exception 'Accesso negato: questa commessa non è tra quelle che puoi vedere' using errcode = '42501';
  end if;

  -- Stesso controllo del trigger versione_riga, che passando di qui non
  -- scatterebbe: la funzione non tocca `version`, quindi il trigger non
  -- vedrebbe alcuna differenza da confrontare.
  if p_versione is not null and v_ver <> p_versione then
    raise exception 'Questa commessa e'' stata modificata da qualcun altro mentre la stavi aprendo (versione % invece di %). Ricarica e riprova: sovrascrivere cancellerebbe il lavoro dell''altra persona.',
      v_ver, p_versione using errcode = '40001';
  end if;

  v_attore := auth.uid();
  if v_attore is null then
    raise exception 'commessa_salva: serve un utente autenticato' using errcode = '42501';
  end if;

  if p_campi is not null then
    if jsonb_typeof(p_campi) <> 'object' then
      raise exception 'commessa_salva: p_campi deve essere un oggetto' using errcode = '22023';
    end if;
    for v_chiave in select k from jsonb_object_keys(p_campi) k loop
      if v_chiave = any (c_derivate) then
        raise exception 'commessa_salva: % si ricava dalle rate, non si scrive a mano', v_chiave
          using errcode = '22023';
      end if;
      if not (v_chiave = any (c_ammesse)) then
        raise exception 'commessa_salva: campo non scrivibile da qui: %', v_chiave
          using errcode = '22023';
      end if;
    end loop;
  end if;

  if p_rate is not null then
    if jsonb_typeof(p_rate) <> 'array' then
      raise exception 'commessa_salva: le rate devono essere un elenco' using errcode = '22023';
    end if;
    with r0 as (
      select
        coalesce(nullif(e->>'type',''),'deposit')      as tipo,
        coalesce((e->>'position')::integer, ord::int)  as pos,
        coalesce((e->>'amount')::numeric, 0)           as importo,
        coalesce((e->>'is_paid')::boolean, false)      as pagata,
        nullif(e->>'paid_date','')::date               as pagata_il,
        nullif(e->>'expected_date','')::date           as attesa_il
      from jsonb_array_elements(p_rate) with ordinality as t(e, ord)
    ),
    acc as (select *, row_number() over (order by pos) as n from r0 where tipo = 'deposit'),
    sal as (select * from r0 where tipo = 'balance'   order by pos desc limit 1),
    fin as (select * from r0 where tipo = 'financing' order by pos limit 1)
    select jsonb_build_object(
      'deposit_amount',            coalesce((select importo   from acc where n=1), 0),
      'deposit_paid',              coalesce((select pagata    from acc where n=1), false),
      'deposit_paid_date',                  (select pagata_il from acc where n=1),
      'deposit_expected_date',              (select attesa_il from acc where n=1),
      'deposit_2_amount',          coalesce((select importo   from acc where n=2), 0),
      'deposit_2_paid',            coalesce((select pagata    from acc where n=2), false),
      'deposit_2_paid_date',                (select pagata_il from acc where n=2),
      'deposit_2_expected_date',            (select attesa_il from acc where n=2),
      'balance_amount',            coalesce((select importo   from sal), 0),
      'balance_paid',              coalesce((select pagata    from sal), false),
      'balance_paid_date',                  (select pagata_il from sal),
      'balance_expected_date',              (select attesa_il from sal),
      'financing_amount',          coalesce((select importo   from fin), 0),
      'financing_paid',            coalesce((select pagata    from fin), false),
      'financing_paid_date',                (select pagata_il from fin),
      'financing_expected_date',            (select attesa_il from fin)
    ) into v_leg;
  end if;

  v_campi := coalesce(p_campi, '{}'::jsonb) || coalesce(v_leg, '{}'::jsonb);

  if v_campi <> '{}'::jsonb then
    update public.orders o set
      customer_id = n.customer_id, order_code = n.order_code, description = n.description,
      total_amount = n.total_amount, payment_type = n.payment_type,
      expected_date = n.expected_date, internal_notes = n.internal_notes,
      vat_rate = n.vat_rate, warehouse_arrival_date = n.warehouse_arrival_date,
      work_start_date = n.work_start_date, work_end_date = n.work_end_date,
      financing_cost = n.financing_cost, financing_cost_mode = n.financing_cost_mode, has_building_bonus = n.has_building_bonus,
      destination_warehouse_id = n.destination_warehouse_id, assigned_to = n.assigned_to,
      work_address = n.work_address, work_description = n.work_description,
      materials_location = n.materials_location, work_lat = n.work_lat, work_lng = n.work_lng,
      tetto_importo = n.tetto_importo, riferimento_committente = n.riferimento_committente,
      deposit_amount = n.deposit_amount, deposit_paid = n.deposit_paid,
      deposit_paid_date = n.deposit_paid_date, deposit_expected_date = n.deposit_expected_date,
      deposit_2_amount = n.deposit_2_amount, deposit_2_paid = n.deposit_2_paid,
      deposit_2_paid_date = n.deposit_2_paid_date, deposit_2_expected_date = n.deposit_2_expected_date,
      balance_amount = n.balance_amount, balance_paid = n.balance_paid,
      balance_paid_date = n.balance_paid_date, balance_expected_date = n.balance_expected_date,
      financing_amount = n.financing_amount, financing_paid = n.financing_paid,
      financing_paid_date = n.financing_paid_date, financing_expected_date = n.financing_expected_date,
      updated_at = now()
    from (
      select (jsonb_populate_record(o2::public.orders, v_campi)).*
        from public.orders o2 where o2.id = p_commessa
    ) n
    where o.id = p_commessa;
  end if;

  if p_rate is not null then
    v_rate := public.order_rate_sostituisci(p_commessa, p_rate);
  end if;

  if p_bonus is not null then
    if jsonb_typeof(p_bonus) <> 'array' then
      raise exception 'commessa_salva: le righe bonus devono essere un elenco' using errcode = '22023';
    end if;
    delete from public.order_bonus_lines where order_id = p_commessa;
    insert into public.order_bonus_lines (order_id, company_id, position, preset_id, label,
                                          imponibile, aliquota_detrazione, causale, note)
    select p_commessa, v_company,
           coalesce((e->>'position')::integer, ord::int - 1),
           nullif(e->>'preset_id',''),
           coalesce(nullif(btrim(e->>'label'),''), 'Riga ' || ord),
           coalesce((e->>'imponibile')::numeric, 0),
           nullif(e->>'aliquota_detrazione','')::numeric,
           nullif(e->>'causale',''),
           nullif(e->>'note','')
      from jsonb_array_elements(p_bonus) with ordinality as t(e, ord);
    get diagnostics v_bonus = row_count;
  end if;

  if p_voci is not null then
    if jsonb_typeof(p_voci) <> 'array' then
      raise exception 'commessa_salva: le voci devono essere un elenco' using errcode = '22023';
    end if;

    create temp table if not exists _voci (id uuid, riga integer, dati jsonb) on commit drop;
    delete from _voci where true;
    insert into _voci (id, riga, dati)
    select nullif(e->>'id','')::uuid, (ord::int - 1), e
      from jsonb_array_elements(p_voci) with ordinality as t(e, ord);

    if exists (
      select 1 from _voci v
       where v.id is not null
         and not exists (select 1 from public.order_items oi
                          where oi.id = v.id and oi.order_id = p_commessa)
    ) then
      raise exception 'commessa_salva: una delle voci non appartiene a questa commessa'
        using errcode = '42501';
    end if;

    -- Magazzino riga per riga, confrontato con quanto ogni riga ha davvero scaricato.
    if exists (select 1 from _voci v
                where nullif(v.dati->>'stock_item_id','') is not null
                  and not exists (select 1 from public.warehouse_stock ws
                                   where ws.id = (v.dati->>'stock_item_id')::uuid and ws.company_id = v_company)) then
      raise exception 'Un articolo di magazzino non è di questa azienda.' using errcode = '42501';
    end if;
    if exists (select 1 from _voci v
                where nullif(v.dati->>'stock_item_id','') is not null
                  and coalesce((v.dati->>'quantity')::numeric, 1) <= 0) then
      raise exception 'La quantità di un articolo di magazzino deve essere maggiore di zero.' using errcode = '22023';
    end if;

    create temp table if not exists _prima (id uuid, stock_item_id uuid, quantity numeric) on commit drop;
    delete from _prima where true;
    insert into _prima
    select oi.id, oi.stock_item_id, coalesce(oi.quantity, 1)
      from public.order_items oi where oi.order_id = p_commessa;

    -- Movimenti delle righe che restano e cambiano (articolo o quantità) e di quelle tolte,
    -- confrontati con quanto ogni riga ha davvero scaricato. Si fanno prima i rientri, poi gli scarichi.
    create temp table if not exists _mov (riga uuid, articolo uuid, delta numeric, nota text) on commit drop;
    delete from _mov where true;
    insert into _mov
    select p.id, p.stock_item_id, -public.magazzino_scaricato_riga(p.id, p.stock_item_id),
           'Articolo cambiato nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8))
      from _prima p join _voci v on v.id = p.id
     where p.stock_item_id is not null
       and p.stock_item_id is distinct from nullif(v.dati->>'stock_item_id','')::uuid;
    insert into _mov
    select p.id, nullif(v.dati->>'stock_item_id','')::uuid,
           coalesce((v.dati->>'quantity')::int, 1)
             - public.magazzino_scaricato_riga(p.id, nullif(v.dati->>'stock_item_id','')::uuid),
           'Modifica della voce nella commessa ' || coalesce(v_codice, left(p_commessa::text, 8))
      from _prima p join _voci v on v.id = p.id
     where nullif(v.dati->>'stock_item_id','') is not null
       and (p.stock_item_id is distinct from nullif(v.dati->>'stock_item_id','')::uuid
            or coalesce((v.dati->>'quantity')::int, 1) <> p.quantity);
    insert into _mov
    select p.id, p.stock_item_id, -public.magazzino_scaricato_riga(p.id, p.stock_item_id),
           'Ripristino per voce tolta dalla commessa ' || coalesce(v_codice, left(p_commessa::text, 8))
      from _prima p
     where p.stock_item_id is not null and p.id not in (select v.id from _voci v where v.id is not null);
    for r in select m.riga, m.articolo, m.delta, m.nota from _mov m order by m.delta loop
      if public.magazzino_movimento_riga(v_company, p_commessa, r.riga, r.articolo, r.delta, r.nota, v_attore) then
        v_mov := v_mov + 1;
      end if;
    end loop;

    update public.warehouse_movements
       set order_id = null,
           notes = coalesce(notes, '') || ' (voce tolta dalla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)) || ')'
     where order_item_id in (select oi.id from public.order_items oi
                              where oi.order_id = p_commessa
                                and oi.id not in (select v.id from _voci v where v.id is not null));
    delete from public.order_item_attachments
     where order_item_id in (select oi.id from public.order_items oi
                              where oi.order_id = p_commessa
                                and oi.id not in (select v.id from _voci v where v.id is not null));
    delete from public.order_items oi
     where oi.order_id = p_commessa
       and oi.id not in (select v.id from _voci v where v.id is not null);
    get diagnostics v_rim = row_count;

    update public.order_items oi set
      name = coalesce(nullif(v.dati->>'name',''), oi.name),
      description = nullif(v.dati->>'description',''),
      quantity = coalesce((v.dati->>'quantity')::int, 1),
      status = coalesce(nullif(v.dati->>'status',''), oi.status),
      position = v.riga,
      supplier_id = nullif(v.dati->>'supplier_id','')::uuid,
      purchase_price = coalesce((v.dati->>'purchase_price')::numeric, 0),
      vat_rate = coalesce((v.dati->>'vat_rate')::numeric, 22),
      stock_item_id = nullif(v.dati->>'stock_item_id','')::uuid,
      standard_cost = coalesce((v.dati->>'standard_cost')::numeric, 0),
      article_template_id = nullif(v.dati->>'article_template_id','')::uuid,
      product_code = nullif(v.dati->>'product_code',''),
      categoria = nullif(v.dati->>'categoria',''),
      -- data di arrivo e distinta: solo se il modulo le manda
      delivery_date = case when v.dati ? 'delivery_date' then nullif(v.dati->>'delivery_date','')::date else oi.delivery_date end,
      posizioni = case when v.dati ? 'posizioni' then nullif(v.dati->'posizioni','null'::jsonb) else oi.posizioni end,
      is_paid = coalesce((v.dati->>'is_paid')::boolean, false),
      paid_date = nullif(v.dati->>'paid_date','')::date,
      payment_method = nullif(v.dati->>'payment_method',''),
      deposit_amount = coalesce((v.dati->>'deposit_amount')::numeric, 0),
      deposit_paid = coalesce((v.dati->>'deposit_paid')::boolean, false),
      deposit_paid_date = nullif(v.dati->>'deposit_paid_date','')::date,
      deposit_expected_date = nullif(v.dati->>'deposit_expected_date','')::date,
      balance_amount = coalesce((v.dati->>'balance_amount')::numeric, 0),
      balance_paid = coalesce((v.dati->>'balance_paid')::boolean, false),
      balance_paid_date = nullif(v.dati->>'balance_paid_date','')::date,
      balance_expected_date = nullif(v.dati->>'balance_expected_date','')::date,
      updated_at = now()
      from _voci v
     where v.id is not null and oi.id = v.id;
    get diagnostics v_upd = row_count;

    insert into public.order_items (
      order_id, name, description, quantity, status, position, supplier_id,
      purchase_price, vat_rate, stock_item_id, unit_price, discount_percent,
      standard_cost, article_template_id, product_code, categoria, is_paid,
      paid_date, payment_method, deposit_amount, deposit_paid, deposit_paid_date,
      deposit_expected_date, balance_amount, balance_paid, balance_paid_date,
      balance_expected_date, delivery_date, posizioni
    )
    select p_commessa,
      coalesce(nullif(v.dati->>'name',''), 'Voce senza nome'),
      nullif(v.dati->>'description',''),
      coalesce((v.dati->>'quantity')::int, 1),
      coalesce(nullif(v.dati->>'status',''), 'da_ordinare'),
      v.riga,
      nullif(v.dati->>'supplier_id','')::uuid,
      coalesce((v.dati->>'purchase_price')::numeric, 0),
      coalesce((v.dati->>'vat_rate')::numeric, 22),
      nullif(v.dati->>'stock_item_id','')::uuid,
      0, 0,
      coalesce((v.dati->>'standard_cost')::numeric, 0),
      nullif(v.dati->>'article_template_id','')::uuid,
      nullif(v.dati->>'product_code',''),
      nullif(v.dati->>'categoria',''),
      coalesce((v.dati->>'is_paid')::boolean, false),
      nullif(v.dati->>'paid_date','')::date,
      nullif(v.dati->>'payment_method',''),
      coalesce((v.dati->>'deposit_amount')::numeric, 0),
      coalesce((v.dati->>'deposit_paid')::boolean, false),
      nullif(v.dati->>'deposit_paid_date','')::date,
      nullif(v.dati->>'deposit_expected_date','')::date,
      coalesce((v.dati->>'balance_amount')::numeric, 0),
      coalesce((v.dati->>'balance_paid')::boolean, false),
      nullif(v.dati->>'balance_paid_date','')::date,
      nullif(v.dati->>'balance_expected_date','')::date,
      nullif(v.dati->>'delivery_date','')::date,
      nullif(v.dati->'posizioni','null'::jsonb)
      from _voci v where v.id is null;
    get diagnostics v_ins = row_count;

    for r in
      select oi.id, oi.stock_item_id, coalesce(oi.quantity, 1) as quantity
        from public.order_items oi
       where oi.order_id = p_commessa and oi.stock_item_id is not null
         and oi.id not in (select p.id from _prima p)
    loop
      if public.magazzino_movimento_riga(v_company, p_commessa, r.id, r.stock_item_id, r.quantity,
           'Scarico per voce aggiunta alla commessa ' || coalesce(v_codice, left(p_commessa::text, 8)), v_attore) then
        v_mov := v_mov + 1;
      end if;
    end loop;
  end if;

  if p_venditore is not null then
    if jsonb_typeof(p_venditore) = 'null' or p_venditore = '{}'::jsonb then
      delete from public.order_salespeople where order_id = p_commessa;
    elsif nullif(p_venditore->>'salesperson_id','') is null then
      raise exception 'commessa_salva: il venditore va indicato con salesperson_id'
        using errcode = '22023';
    elsif p_venditore ? 'commission_amount' then
      raise exception 'commessa_salva: la provvigione la calcola il server, non passare commission_amount'
        using errcode = '22023';
    else
      v_vend := (p_venditore->>'salesperson_id')::uuid;
      select s.commission_type, s.commission_value into v_ctipo, v_cval
        from public.salespeople s
       where s.id = v_vend and s.company_id = v_company;
      if not found then
        raise exception 'commessa_salva: venditore inesistente o di un''altra azienda'
          using errcode = '42501';
      end if;
      v_ctipo := coalesce(nullif(p_venditore->>'commission_type',''), v_ctipo, 'percentage_sold');
      v_cval  := coalesce((p_venditore->>'commission_value')::numeric, v_cval, 0);
      if v_ctipo not in ('fixed','percentage_sold','percentage_collected') then
        raise exception 'commessa_salva: tipo provvigione non ammesso: %', v_ctipo
          using errcode = '22023';
      end if;

      delete from public.order_salespeople
       where order_id = p_commessa and salesperson_id <> v_vend;
      insert into public.order_salespeople
        (order_id, salesperson_id, commission_type, commission_value, commission_amount)
      values (p_commessa, v_vend, v_ctipo, v_cval, 0)
      on conflict (order_id, salesperson_id) do update
        set commission_type  = excluded.commission_type,
            commission_value = excluded.commission_value;
    end if;
  end if;

  return jsonb_build_object(
    'commessa', p_commessa,
    'rate', v_rate, 'bonus', v_bonus,
    'voci_inserite', v_ins, 'voci_aggiornate', v_upd, 'voci_rimosse', v_rim,
    'movimenti_magazzino', v_mov
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_atomic(p_order_data jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_salesperson jsonb DEFAULT NULL::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_installments jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id          UUID;
  v_company_id        UUID;
  v_caller_id         UUID;
  v_status_id         UUID;
  v_item              JSONB;
  v_item_id           UUID;
  v_stock_item_id     UUID;
  v_qty               INTEGER;
  v_commission_type   TEXT;
  v_commission_value  NUMERIC;
  v_commission_amount NUMERIC;
  v_total_amount      NUMERIC;
  v_inst              JSONB;
BEGIN
  v_caller_id  := COALESCE(auth.uid(), p_user_id);
  v_company_id := (p_order_data->>'company_id')::uuid;

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'create_order_atomic: utente non autenticato';
  END IF;

  -- L'accesso secondario vale solo per il chiamante autenticato, se ancora
  -- attivo e con il permesso già concesso dall'azienda destinataria.
  IF has_role(v_caller_id, 'super_admin'::app_role)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id=v_caller_id AND company_id=v_company_id) THEN
    PERFORM public.assert_permesso('can_edit_orders', 'creare una commessa');
  ELSIF auth.uid() = v_caller_id AND NOT public.utente_bloccato()
    AND NOT public.utente_e_cliente_esterno()
    AND EXISTS (SELECT 1 FROM public.multi_company_access m
      WHERE m.user_id=v_caller_id AND m.company_id=v_company_id
        AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now()))
    AND public.has_permission_for_company(v_caller_id, 'can_edit_orders', v_company_id) IS TRUE THEN
    NULL; -- Non usare i permessi dell'azienda primaria o della sessione precedente.
  ELSE
    RAISE EXCEPTION 'Non hai il permesso di creare commesse in questa azienda.' USING ERRCODE='42501';
  END IF;

  v_total_amount := COALESCE((p_order_data->>'total_amount')::numeric, 0);

  -- Stato iniziale: quello passato, altrimenti il predefinito dell'azienda.
  -- Senza questo, order_status_history.status_id (NOT NULL) rispondeva con il
  -- vincolo grezzo a chi creava la commessa senza scegliere uno stato.
  v_status_id := NULLIF(p_order_data->>'current_status_id', '')::uuid;
  IF v_status_id IS NULL THEN
    SELECT id INTO v_status_id
      FROM public.order_statuses
     WHERE company_id = v_company_id
     ORDER BY is_default DESC NULLS LAST, position ASC NULLS LAST, created_at ASC
     LIMIT 1;
  END IF;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'Per creare una commessa serve almeno uno stato ordine: configuralo in Impostazioni → Stati ordine.';
  END IF;

  INSERT INTO public.orders (
    company_id, customer_id, order_code, description,
    total_amount, deposit_amount, deposit_2_amount, financing_amount,
    payment_type, balance_amount, expected_date, internal_notes,
    current_status_id, vat_rate, warehouse_arrival_date,
    work_start_date, work_end_date,
    deposit_paid, deposit_paid_date,
    deposit_2_paid, deposit_2_paid_date,
    balance_paid, balance_paid_date,
    balance_expected_date, deposit_expected_date, deposit_2_expected_date,
    financing_paid, financing_paid_date, financing_expected_date,
    financing_cost, financing_cost_mode, has_building_bonus, assigned_to
  ) VALUES (
    v_company_id,
    (p_order_data->>'customer_id')::uuid,
    NULLIF(TRIM(p_order_data->>'order_code'), ''),
    p_order_data->>'description',
    v_total_amount,
    COALESCE((p_order_data->>'deposit_amount')::numeric, 0),
    COALESCE((p_order_data->>'deposit_2_amount')::numeric, 0),
    COALESCE((p_order_data->>'financing_amount')::numeric, 0),
    COALESCE(p_order_data->>'payment_type', 'standard'),
    COALESCE((p_order_data->>'balance_amount')::numeric, 0),
    (p_order_data->>'expected_date')::date,
    NULLIF(p_order_data->>'internal_notes', ''),
    v_status_id,
    COALESCE((p_order_data->>'vat_rate')::numeric, 22),
    (p_order_data->>'warehouse_arrival_date')::date,
    (p_order_data->>'work_start_date')::date,
    (p_order_data->>'work_end_date')::date,
    COALESCE((p_order_data->>'deposit_paid')::boolean, false),
    (p_order_data->>'deposit_paid_date')::date,
    COALESCE((p_order_data->>'deposit_2_paid')::boolean, false),
    (p_order_data->>'deposit_2_paid_date')::date,
    COALESCE((p_order_data->>'balance_paid')::boolean, false),
    (p_order_data->>'balance_paid_date')::date,
    (p_order_data->>'balance_expected_date')::date,
    (p_order_data->>'deposit_expected_date')::date,
    (p_order_data->>'deposit_2_expected_date')::date,
    COALESCE((p_order_data->>'financing_paid')::boolean, false),
    (p_order_data->>'financing_paid_date')::date,
    (p_order_data->>'financing_expected_date')::date,
    COALESCE((p_order_data->>'financing_cost')::numeric, 0),
    NULLIF(p_order_data->>'financing_cost_mode',''),
    COALESCE((p_order_data->>'has_building_bonus')::boolean, false),
    NULLIF(p_order_data->>'assigned_to', '')::uuid
  )
  RETURNING id INTO v_order_id;

  -- Status history
  INSERT INTO public.order_status_history (order_id, status_id, changed_by)
  VALUES (v_order_id, v_status_id, v_caller_id);

  -- Order items + stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_stock_item_id := NULLIF(v_item->>'stock_item_id', '')::uuid;
    v_qty := COALESCE((v_item->>'quantity')::integer, 1);

    INSERT INTO public.order_items (
      order_id, name, description, quantity, status, position,
      supplier_id, purchase_price, vat_rate, stock_item_id,
      unit_price, discount_percent, standard_cost,
      is_paid, paid_date, payment_method,
      deposit_amount, deposit_paid, deposit_paid_date,
      balance_amount, balance_paid, balance_paid_date,
      balance_expected_date, deposit_expected_date,
      product_code, family_id, axis_selections, misure_preventivo, measure_status,
      article_template_id, categoria, delivery_date, posizioni
    ) VALUES (
      v_order_id, v_item->>'name', NULLIF(v_item->>'description', ''),
      v_qty, COALESCE(v_item->>'status', 'da_ordinare'),
      COALESCE((v_item->>'position')::integer, 0),
      NULLIF(v_item->>'supplier_id', '')::uuid,
      COALESCE((v_item->>'purchase_price')::numeric, 0),
      COALESCE((v_item->>'vat_rate')::numeric, 22),
      v_stock_item_id,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      COALESCE((v_item->>'standard_cost')::numeric, 0),
      COALESCE((v_item->>'is_paid')::boolean, false),
      NULLIF(v_item->>'paid_date', '')::date,
      NULLIF(v_item->>'payment_method', ''),
      COALESCE((v_item->>'deposit_amount')::numeric, 0),
      COALESCE((v_item->>'deposit_paid')::boolean, false),
      NULLIF(v_item->>'deposit_paid_date', '')::date,
      COALESCE((v_item->>'balance_amount')::numeric, 0),
      COALESCE((v_item->>'balance_paid')::boolean, false),
      NULLIF(v_item->>'balance_paid_date', '')::date,
      NULLIF(v_item->>'balance_expected_date', '')::date,
      NULLIF(v_item->>'deposit_expected_date', '')::date,
      NULLIF(v_item->>'product_code', ''),
      NULLIF(v_item->>'family_id', '')::uuid,
      NULLIF(v_item->'axis_selections', 'null'::jsonb),
      NULLIF(v_item->'misure_preventivo', 'null'::jsonb),
      NULLIF(v_item->>'measure_status', ''),
      NULLIF(v_item->>'article_template_id', '')::uuid,
      NULLIF(v_item->>'categoria', ''),
      NULLIF(v_item->>'delivery_date', '')::date,
      NULLIF(v_item->'posizioni', 'null'::jsonb)
    )
    RETURNING id INTO v_item_id;

    IF v_stock_item_id IS NOT NULL AND v_qty <= 0 THEN
      RAISE EXCEPTION 'La quantità di un articolo di magazzino deve essere maggiore di zero.' USING ERRCODE = '22023';
    END IF;
    IF v_stock_item_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.warehouse_stock WHERE id = v_stock_item_id AND company_id = v_company_id) THEN
        RAISE EXCEPTION 'Articolo di magazzino non valido per questa azienda.' USING ERRCODE = '42501';
      END IF;
      -- Stesso scarico della modifica commessa: sulla riga, e mai oltre la giacenza.
      PERFORM public.magazzino_movimento_riga(v_company_id, v_order_id, v_item_id, v_stock_item_id, v_qty,
        'Prelievo automatico per ordine ' || COALESCE(NULLIF(TRIM(p_order_data->>'order_code'), ''), LEFT(v_order_id::text, 8)),
        v_caller_id);
    END IF;
  END LOOP;

  -- Installments
  IF p_installments IS NOT NULL AND jsonb_array_length(p_installments) > 0 THEN
    FOR v_inst IN SELECT * FROM jsonb_array_elements(p_installments)
    LOOP
      INSERT INTO public.order_installments (
        order_id, position, label, type, amount, is_paid, paid_date, expected_date, trigger_evento, trigger_status_id, giorni_preavviso, trigger_numero
      ) VALUES (
        v_order_id,
        COALESCE((v_inst->>'position')::integer, 0),
        COALESCE(v_inst->>'label', ''),
        COALESCE(v_inst->>'type', 'deposit'),
        COALESCE((v_inst->>'amount')::numeric, 0),
        COALESCE((v_inst->>'is_paid')::boolean, false),
        NULLIF(v_inst->>'paid_date', '')::date,
        NULLIF(v_inst->>'expected_date', '')::date,
        COALESCE(NULLIF(v_inst->>'trigger_evento', ''), 'data_fissa'),
        NULLIF(v_inst->>'trigger_status_id', '')::uuid,
        COALESCE((v_inst->>'giorni_preavviso')::integer, 7),
        NULLIF(v_inst->>'trigger_numero', '')::integer
      );
    END LOOP;
  END IF;

  -- Salesperson
  IF p_salesperson IS NOT NULL AND (p_salesperson->>'salesperson_id') IS NOT NULL THEN
    v_commission_type  := p_salesperson->>'commission_type';
    v_commission_value := COALESCE((p_salesperson->>'commission_value')::numeric, 0);
    IF v_commission_type = 'fixed' THEN
      v_commission_amount := v_commission_value;
    ELSE
      v_commission_amount := v_total_amount * (v_commission_value / 100);
    END IF;

    INSERT INTO public.order_salespeople (
      order_id, salesperson_id, commission_type, commission_value, commission_amount
    ) VALUES (
      v_order_id,
      (p_salesperson->>'salesperson_id')::uuid,
      v_commission_type, v_commission_value, v_commission_amount
    );
  END IF;

  RETURN jsonb_build_object('id', v_order_id, 'success', true);

EXCEPTION WHEN OTHERS THEN
  -- Rilancio con lo STESSO codice: un vincolo (23502, 23503, 23505) resta
  -- riconoscibile e il client lo traduce. Prima tutto diventava P0001 con il
  -- prefisso "create_order_atomic failed:", che arrivava a schermo com'era.
  RAISE EXCEPTION '%', SQLERRM USING ERRCODE = SQLSTATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rate_importi(p_company uuid)
 RETURNS TABLE(installment_id uuid, order_id uuid, type text, importo numeric, is_paid boolean, paid_date date, expected_date date, documento_fiscale_id uuid, invoice_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not coalesce(public.user_can_access_company(p_company), false) then
    raise exception 'Accesso non autorizzato a questa azienda.' using errcode = '42501';
  end if;
  return query
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' and o.financing_cost_mode is null then coalesce(o.financing_cost, 0) else 0 end fc,
           case when o.payment_type = 'financing' and o.financing_cost_mode = 'trattenuto' then coalesce(o.financing_cost, 0) else 0 end trattenuta
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  var as (
    select v.order_id, coalesce(v.impatto_economico, 0) imp,
           coalesce(v.offline_signed_on::date, v.firmato_il::date, v.approval_recorded_at::date,
                    v.richiesto_il::date, v.created_at::date) as il
      from public.ordini_variazione v join o on o.id = v.order_id
     where v.status = 'approvato'
  ),
  src as (
    select i.id, i.order_id, i.type::text as type, i.position, i.amount, i.is_paid, i.paid_date, i.expected_date,
           i.documento_fiscale_id, i.invoice_id
      from public.order_installments i join o on o.id = i.order_id
    union all
    select md5(oo.id::text || ':' || l.tipo || ':' || l.pos)::uuid, oo.id, l.tipo, l.pos, l.importo, l.pagata,
           l.pagata_il, l.attesa_il, null::uuid, null::uuid
      from public.orders oo join o on o.id = oo.id
      cross join lateral (values
        ('deposit', 0, coalesce(oo.deposit_amount, 0), coalesce(oo.deposit_paid, false), oo.deposit_paid_date, oo.deposit_expected_date),
        ('deposit', 1, coalesce(oo.deposit_2_amount, 0), coalesce(oo.deposit_2_paid, false), oo.deposit_2_paid_date, oo.deposit_2_expected_date),
        ('financing', 2, coalesce(oo.financing_amount, 0), coalesce(oo.financing_paid, false), oo.financing_paid_date, oo.financing_expected_date),
        ('balance', 3, coalesce(oo.balance_amount, 0), coalesce(oo.balance_paid, false), oo.balance_paid_date, oo.balance_expected_date)
      ) l(tipo, pos, importo, pagata, pagata_il, attesa_il)
     where not exists (select 1 from public.order_installments x where x.order_id = oo.id)
       and (l.importo > 0 or l.tipo = 'balance')
       and case when coalesce(oo.payment_type, 'standard') = 'standard' then l.tipo <> 'financing'
                else l.pos <> 1 end
       and (coalesce(oo.deposit_amount, 0) + coalesce(oo.deposit_2_amount, 0) + coalesce(oo.financing_amount, 0)
            + coalesce(oo.balance_amount, 0)) > 0
  ),
  r0 as (
    select s.*, row_number() over (partition by s.order_id
                                   order by (s.type = 'balance') desc, s.position desc nulls last, s.id desc) as rn
      from src s
  ),
  r1 as (
    select r0.*, (r0.type = 'balance' and r0.rn = 1) as finale,
           sum(case when r0.type = 'balance' and r0.rn = 1 then 0 else coalesce(r0.amount, 0) end)
             over (partition by r0.order_id) as altre
      from r0
  ),
  r2 as (
    select r1.*, o.fc, o.trattenuta,
           round(round((o.tot + coalesce((select sum(var.imp) from var
                                          where var.order_id = r1.order_id
                                            and (not (r1.finale and coalesce(r1.is_paid, false) and r1.paid_date is not null)
                                                 or var.il <= r1.paid_date)), 0)) * (1 + o.iva / 100), 2)
                 - r1.altre - o.fc, 2) as saldo_grezzo
      from r1 join o on o.id = r1.order_id
  ),
  r3 as (
    select r2.*,
           case when r2.trattenuta > 0 then r2.trattenuta else least(greatest(0, -max(case when r2.finale then r2.saldo_grezzo end) over (partition by r2.order_id)), r2.fc) end as avanzo
      from r2
  )
  select r3.id, r3.order_id, r3.type::text,
         case when r3.finale then greatest(0, r3.saldo_grezzo)
              when r3.type = 'financing' then greatest(0, coalesce(r3.amount, 0) - r3.avanzo)
              else coalesce(r3.amount, 0) end,
         coalesce(r3.is_paid, false), r3.paid_date, r3.expected_date, r3.documento_fiscale_id, r3.invoice_id
    from r3;
end $function$;

CREATE OR REPLACE FUNCTION public.rate_da_incassare(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (
    select o.id,
           round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' and o.financing_cost_mode is distinct from 'separato' then coalesce(o.financing_cost, 0) else 0 end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company)),
  incassato as (select x.order_id, sum(x.importo) as i from public.rate_incassi(p_company) x group by x.order_id),
  righe as (
    select r.order_id, r.installment_id, r.expected_date,
           greatest(0, r.importo - coalesce(d.importo_pagato, 0)
                     - case when d.id is null then 0 else public.documento_stornato_totale(d.id) end) as residuo,
           r.type = 'financing' as finanziamento
      from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
     where not r.is_paid
    union all
    -- La parte del totale che nessuna rata copre: piano senza saldo, variante dopo il saldo pagato,
    -- o commessa senza alcun piano (deve tutto il suo totale).
    select s.order_id, null::uuid, null::date, s.scoperto, false
      from (select o.id as order_id, round(o.totale - coalesce(sum(r.importo), 0), 2) as scoperto
              from o left join r on r.order_id = o.id
             group by o.id, o.totale) s
     where s.scoperto > 0
  ),
  ordinate as (
    select righe.*,
           sum(righe.residuo) over (partition by righe.order_id
                                    order by righe.expected_date nulls last, righe.installment_id nulls last
                                    rows unbounded preceding) as cumulato
      from righe
  )
  -- Mai oltre il totale meno l'incassato: l'eccedenza del piano si toglie dalle rate più lontane.
  select ord.order_id, ord.installment_id, ord.expected_date,
         greatest(0, least(ord.residuo, greatest(0, o.totale - coalesce(inc.i, 0)) - (ord.cumulato - ord.residuo))),
         ord.finanziamento
    from ordinate ord
    join o on o.id = ord.order_id
    left join incassato inc on inc.order_id = ord.order_id
$function$;

CREATE OR REPLACE FUNCTION public.cliente_rate_commesse(p_order_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(order_id uuid, company_id uuid, order_code text, description text, installment_id uuid, posizione integer, label text, tipo text, importo numeric, residuo numeric, is_paid boolean, paid_date date, expected_date date, finanziamento boolean, totale_commessa numeric, incassato_commessa numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_company uuid;
begin
  if v_uid is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  -- Le aziende delle commesse di cui l'utente è cliente (e a cui il suo profilo appartiene).
  for v_company in
    select distinct o.company_id
      from public.orders o
     where o.customer_id = v_uid and o.deleted_at is null
       and (p_order_id is null or o.id = p_order_id)
       and coalesce(public.user_can_access_company(o.company_id), false)
  loop
    return query
    with mie as materialized (
      select o.id, o.order_code, o.description,
             round((coalesce(o.total_amount, 0)
                    + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                                 where v.order_id = o.id and v.status = 'approvato'), 0))
                   * (1 + coalesce(o.vat_rate, 22) / 100), 2)
             - case when o.payment_type = 'financing' and o.financing_cost_mode is distinct from 'separato' then coalesce(o.financing_cost, 0) else 0 end as totale
        from public.orders o
       where o.company_id = v_company and o.customer_id = v_uid and o.deleted_at is null
         and (p_order_id is null or o.id = p_order_id)
    ),
    ri as materialized (select r.* from public.rate_importi(v_company) r join mie on mie.id = r.order_id),
    da as materialized (select d.* from public.rate_da_incassare(v_company) d join mie on mie.id = d.order_id),
    inc as materialized (
      select x.order_id, sum(x.importo) as i
        from public.rate_incassi(v_company) x join mie on mie.id = x.order_id
       group by x.order_id
    ),
    righe as (
      select ri.order_id, ri.installment_id, oi.position as pos_salvata, nullif(btrim(oi.label), '') as etichetta,
             ri.type as tipo, ri.importo, coalesce(da.residuo, 0) as residuo, ri.is_paid, ri.paid_date,
             ri.expected_date, ri.type = 'financing' as finanziamento
        from ri
        left join da on da.installment_id = ri.installment_id
        left join public.order_installments oi on oi.id = ri.installment_id
      union all
      select da.order_id, null::uuid, null::int, null::text, 'non_pianificato', da.residuo, da.residuo, false,
             null::date, null::date, false
        from da
       where da.installment_id is null and da.residuo > 0
    )
    select r.order_id, v_company, mie.order_code, mie.description, r.installment_id,
           (row_number() over (partition by r.order_id
                               order by r.tipo = 'non_pianificato', r.pos_salvata nulls last,
                                        case r.tipo when 'deposit' then 0 when 'financing' then 2 else 3 end,
                                        r.expected_date nulls last, r.installment_id))::int,
           coalesce(r.etichetta,
                    case r.tipo when 'deposit' then 'Acconto' when 'balance' then 'Saldo'
                                when 'financing' then 'Finanziamento' when 'non_pianificato' then 'Da pianificare'
                                else 'Rata' end),
           r.tipo, r.importo, r.residuo, r.is_paid, r.paid_date, r.expected_date, r.finanziamento,
           mie.totale, coalesce(inc.i, 0)
      from righe r
      join mie on mie.id = r.order_id
      left join inc on inc.order_id = r.order_id;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_rate_commessa(p_company_id uuid, p_order_code text DEFAULT NULL::text, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order record; v_rate jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_inc numeric := 0; v_res numeric := 0; v_scad numeric := 0; v_scoperto numeric := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT o.id, o.order_code, o.client_name, o.client_company, o.total_amount,
         round(o.total_amount * (1 + coalesce(oo.vat_rate, 22) / 100), 2)
           - case when oo.payment_type = 'financing' and oo.financing_cost_mode is distinct from 'separato' then coalesce(oo.financing_cost, 0) else 0 end AS totale_ivato
    INTO v_order
    FROM public.commesse_valore_pattuito o JOIN public.orders oo ON oo.id = o.id
   WHERE o.company_id = p_company_id
     AND ((p_order_id IS NOT NULL AND o.id = p_order_id)
       OR (p_order_code IS NOT NULL AND UPPER(TRIM(o.order_code)) = UPPER(TRIM(p_order_code)))) LIMIT 1;
  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Commessa non trovata: serve il codice esatto o l''id.');
  END IF;

  -- La regola della scheda commessa: importi delle rate (il saldo è il residuo), da incassare e incassato.
  WITH ri AS MATERIALIZED (SELECT * FROM public.rate_importi(p_company_id) x WHERE x.order_id = v_order.id),
       d AS MATERIALIZED (SELECT * FROM public.rate_da_incassare(p_company_id) x WHERE x.order_id = v_order.id),
       righe AS (
         SELECT coalesce(nullif(btrim(oi.label), ''),
                         CASE ri.type WHEN 'deposit' THEN 'Acconto' WHEN 'balance' THEN 'Saldo'
                                      WHEN 'financing' THEN 'Finanziamento' ELSE 'Rata' END) AS label,
                ri.type AS tipo, ri.importo, ri.is_paid, ri.paid_date, ri.expected_date,
                coalesce(dd.residuo, 0) AS residuo, coalesce(dd.finanziamento, ri.type = 'financing') AS finanziamento,
                oi.trigger_evento, oi.giorni_preavviso
           FROM ri
           LEFT JOIN public.order_installments oi ON oi.id = ri.installment_id
           LEFT JOIN d dd ON dd.installment_id = ri.installment_id
       )
  SELECT COALESCE(SUM(importo), 0),
    COALESCE(SUM(residuo), 0),
    COALESCE(SUM(residuo) FILTER (WHERE NOT finanziamento AND expected_date IS NOT NULL AND expected_date < CURRENT_DATE), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'rata', label, 'tipo', tipo, 'importo_eur', ROUND(importo::numeric, 2),
      'da_incassare_eur', ROUND(residuo::numeric, 2),
      'incassata', is_paid, 'incassata_il', paid_date, 'attesa_il', expected_date,
      'giorni', CASE WHEN is_paid OR expected_date IS NULL THEN NULL ELSE expected_date - CURRENT_DATE END,
      'semaforo', CASE WHEN is_paid THEN 'incassata'
        WHEN expected_date IS NULL THEN 'senza data'
        WHEN expected_date < CURRENT_DATE THEN 'scaduta'
        WHEN giorni_preavviso IS NOT NULL AND expected_date <= CURRENT_DATE + giorni_preavviso THEN 'in preavviso'
        ELSE 'futura' END,
      'agganciata_a_evento', trigger_evento, 'giorni_preavviso', giorni_preavviso
    ) ORDER BY expected_date NULLS LAST, importo DESC), '[]'::jsonb)
  INTO v_tot, v_res, v_scad, v_rate
  FROM righe;

  SELECT COALESCE(SUM(x.residuo), 0) INTO v_scoperto
    FROM public.rate_da_incassare(p_company_id) x WHERE x.order_id = v_order.id AND x.installment_id IS NULL;
  SELECT COALESCE(SUM(x.importo), 0) INTO v_inc
    FROM public.rate_incassi(p_company_id) x WHERE x.order_id = v_order.id;

  RETURN jsonb_build_object('ok', true, 'commessa', v_order.order_code,
    'cliente', COALESCE(NULLIF(TRIM(v_order.client_name), ''), NULLIF(TRIM(v_order.client_company), ''), 'Cliente non indicato'),
    'valore_imponibile_eur', ROUND(COALESCE(v_order.total_amount, 0)::numeric, 2),
    'valore_ivato_eur', ROUND(COALESCE(v_order.totale_ivato, 0)::numeric, 2),
    'piano_rate_eur', ROUND(v_tot::numeric, 2), 'incassato_eur', ROUND(v_inc::numeric, 2),
    'residuo_eur', ROUND((v_res + v_scoperto)::numeric, 2), 'scaduto_eur', ROUND(v_scad::numeric, 2),
    'non_pianificato_eur', ROUND(v_scoperto::numeric, 2),
    'quadra_col_valore', (ABS(COALESCE(v_order.totale_ivato, 0) - v_tot) < 0.01),
    'rate', v_rate,
    'nota', 'Importi IVA inclusa, con la regola della scheda commessa (il saldo è il residuo). Una rata "agganciata a evento" prende la data dall''evento di cantiere: se il cantiere slitta, slitta anche l''incasso.');
END;
$function$;

-- Vincoli e verifica storico aggiunti prima di COMMIT.

-- Non reinterpretare automaticamente un incasso già registrato scegliendo una modalità.
create or replace function public.check71_proteggi_incassi_storici()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if (new.financing_cost_mode is not null or old.financing_cost_mode is not null)
     and (new.financing_cost_mode is distinct from old.financing_cost_mode
          or new.financing_cost is distinct from old.financing_cost)
     and (coalesce(old.financing_paid,false) or coalesce(old.balance_paid,false)
          or exists(select 1 from public.order_installments i
                    left join public.documenti_fiscali d on d.id=i.documento_fiscale_id
                    where i.order_id=old.id and i.type in ('financing','balance')
                      and (coalesce(i.is_paid,false) or coalesce(d.importo_pagato,0)>0))) then
    raise exception 'Sono presenti incassi sul finanziamento o sul saldo: riconciliali prima di cambiare il costo o la sua modalità.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger check71_proteggi_incassi_storici before update on public.orders
for each row execute function public.check71_proteggi_incassi_storici();

-- Validazione a fine transazione: le RPC scrivono prima la testata e poi le rate.
-- Con più erogazioni la ripartizione della trattenuta richiede una scelta esplicita,
-- non una sottrazione ripetuta su ogni rata o una distribuzione presunta.
create or replace function public.check71_verifica_erogazione()
returns trigger language plpgsql security invoker set search_path=public as $$
declare
  ids uuid[];
  oid uuid;
  o public.orders;
  numero integer;
  tutte integer;
  finanziato numeric;
begin
  if tg_table_name='orders' then
    ids:=array[new.id];
  elsif tg_op='DELETE' then
    ids:=array[old.order_id];
  elsif tg_op='UPDATE' then
    ids:=array[old.order_id,new.order_id];
  else
    ids:=array[new.order_id];
  end if;
  for oid in select distinct unnest(ids) loop
    select * into o from public.orders where id=oid for update;
    if not found or o.payment_type is distinct from 'financing' or o.financing_cost_mode is null then continue; end if;
    if coalesce(o.financing_cost,0)<0 then
      raise exception 'Il costo della finanziaria non può essere negativo.' using errcode='23514';
    end if;
    if o.financing_cost_mode<>'trattenuto' or coalesce(o.financing_cost,0)=0 then continue; end if;
    select count(*),count(*) filter(where type='financing'),coalesce(sum(amount) filter(where type='financing'),0)
      into tutte,numero,finanziato from public.order_installments where order_id=oid;
    if tutte=0 then numero:=1; finanziato:=coalesce(o.financing_amount,0); end if;
    if numero<>1 then
      raise exception 'La trattenuta richiede una singola erogazione identificata nel piano.' using errcode='23514';
    end if;
    if finanziato<o.financing_cost then
      raise exception 'Il costo trattenuto supera la quota finanziata.' using errcode='23514';
    end if;
  end loop;
  return null;
end $$;
create constraint trigger check71_erogazione_ordine after insert or update on public.orders
 deferrable initially deferred for each row execute function public.check71_verifica_erogazione();
create constraint trigger check71_erogazione_rate after insert or update or delete on public.order_installments
 deferrable initially deferred for each row execute function public.check71_verifica_erogazione();
revoke all on function public.check71_proteggi_incassi_storici() from public;
revoke all on function public.check71_verifica_erogazione() from public;
commit;

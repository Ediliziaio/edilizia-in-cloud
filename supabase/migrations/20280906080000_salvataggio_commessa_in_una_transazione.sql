-- Salvare una commessa era venti mosse in fila.
--
-- EditOrder.tsx eseguiva, una dopo l'altra e ognuna per conto suo: UPDATE su
-- orders, DELETE + INSERT delle rate, DELETE + INSERT delle righe bonus, DELETE
-- dei movimenti e degli allegati delle voci rimosse, DELETE delle voci, UPDATE
-- di ogni voce rimasta, INSERT delle nuove, poi per ogni articolo di magazzino
-- una SELECT della giacenza, una UPDATE e una INSERT di movimento, infine il
-- venditore. Una connessione che cade a meta' -- o semplicemente un utente che
-- chiude la scheda -- lasciava la commessa a pezzi. Il caso peggiore era gia'
-- noto: rate cancellate e mai reinserite, cioe' uno scadenzario vuoto su una
-- commessa venduta.
--
-- Qui diventa una transazione sola: o si scrive tutto, o non cambia niente.
--
-- Tre cose migliorano oltre all'atomicita':
--
--  1. La giacenza si muoveva in lettura-modifica-scrittura dal browser
--     (SELECT quantity, poi UPDATE con il valore calcolato fuori). Due utenti
--     sulla stessa commessa, o sullo stesso articolo, si sovrascrivevano a
--     vicenda. Ora e' un solo UPDATE relativo, e il conto lo fa il database.
--
--  2. Le colonne deposit_*/balance_*/financing_* su orders sono una copia
--     appiattita delle rate, che finora calcolava il browser. Potevano
--     divergere dalle righe di order_installments. Ora le deriva il server
--     dalle rate stesse: se passi p_rate, quelle colonne non le puoi scrivere.
--
--  3. La riga della commessa viene bloccata in apertura, quindi due
--     salvataggi simultanei si mettono in fila invece di intrecciarsi.
--
-- Ogni argomento jsonb lasciato a NULL significa "non toccare": si puo' salvare
-- solo le rate, o solo le voci, senza riscrivere il resto.

create or replace function public.commessa_salva(
  p_commessa  uuid,
  p_campi     jsonb default null,
  p_rate      jsonb default null,
  p_bonus     jsonb default null,
  p_voci      jsonb default null,
  p_venditore jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
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
  v_vend       uuid;
  v_ctipo      text;
  v_cval       numeric;
  r            record;
  -- Le colonne di orders che la scheda commessa puo' scrivere. Lo stato non e'
  -- fra queste: passa da change_order_status, che verifica il percorso.
  c_ammesse    text[] := array[
    'customer_id','order_code','description','total_amount','payment_type',
    'expected_date','internal_notes','vat_rate','warehouse_arrival_date',
    'work_start_date','work_end_date','financing_cost','has_building_bonus',
    'destination_warehouse_id','assigned_to','work_address','work_description',
    'materials_location','work_lat','work_lng'
  ];
  -- Ricavate dalle rate: chi le passa a mano sta duplicando una verita'.
  c_derivate   text[] := array[
    'deposit_amount','deposit_paid','deposit_paid_date','deposit_expected_date',
    'deposit_2_amount','deposit_2_paid','deposit_2_paid_date','deposit_2_expected_date',
    'balance_amount','balance_paid','balance_paid_date','balance_expected_date',
    'financing_amount','financing_paid','financing_paid_date','financing_expected_date'
  ];
begin
  -- Blocco la commessa: due salvataggi in contemporanea si mettono in fila.
  select o.company_id, o.order_code into v_company, v_codice
    from public.orders o where o.id = p_commessa for update;

  if v_company is null then
    raise exception 'commessa non trovata' using errcode = 'P0002';
  end if;
  if public.user_can_access_company(v_company) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  perform public.assert_permesso('can_edit_orders', 'salvare una commessa');

  v_attore := auth.uid();
  if v_attore is null then
    raise exception 'commessa_salva: serve un utente autenticato' using errcode = '42501';
  end if;

  ------------------------------------------------------------------ campi
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

  -- Colonne appiattite, ricavate qui dalle rate che sto per scrivere.
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
    sal as (select * from r0 where tipo = 'balance'   order by pos limit 1),
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
    -- jsonb_populate_record parte dalla riga esistente: le chiavi assenti
    -- restano com'erano, quindi non serve enumerare cosa non si tocca.
    update public.orders o set
      customer_id = n.customer_id, order_code = n.order_code, description = n.description,
      total_amount = n.total_amount, payment_type = n.payment_type,
      expected_date = n.expected_date, internal_notes = n.internal_notes,
      vat_rate = n.vat_rate, warehouse_arrival_date = n.warehouse_arrival_date,
      work_start_date = n.work_start_date, work_end_date = n.work_end_date,
      financing_cost = n.financing_cost, has_building_bonus = n.has_building_bonus,
      destination_warehouse_id = n.destination_warehouse_id, assigned_to = n.assigned_to,
      work_address = n.work_address, work_description = n.work_description,
      materials_location = n.materials_location, work_lat = n.work_lat, work_lng = n.work_lng,
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

  ------------------------------------------------------------------ rate
  if p_rate is not null then
    v_rate := public.order_rate_sostituisci(p_commessa, p_rate);
  end if;

  ------------------------------------------------------------------ bonus
  -- NULL non tocca niente: con la funzione bonus spenta la scheda non mostra
  -- quelle righe, e cancellarle sarebbe cancellare cose mai viste.
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

  ------------------------------------------------------------------ voci
  if p_voci is not null then
    if jsonb_typeof(p_voci) <> 'array' then
      raise exception 'commessa_salva: le voci devono essere un elenco' using errcode = '22023';
    end if;

    create temp table if not exists _voci (
      id uuid, riga integer, dati jsonb
    ) on commit drop;
    delete from _voci;
    insert into _voci (id, riga, dati)
    select nullif(e->>'id','')::uuid, (ord::int - 1), e
      from jsonb_array_elements(p_voci) with ordinality as t(e, ord);

    -- Una voce di un'altra commessa non si adotta passando il suo id.
    if exists (
      select 1 from _voci v
       where v.id is not null
         and not exists (select 1 from public.order_items oi
                          where oi.id = v.id and oi.order_id = p_commessa)
    ) then
      raise exception 'commessa_salva: una delle voci non appartiene a questa commessa'
        using errcode = '42501';
    end if;

    -- Giacenza: quanto impegnava questa commessa prima, quanto impegna dopo.
    create temp table if not exists _delta (stock_item_id uuid, delta integer) on commit drop;
    delete from _delta;
    insert into _delta (stock_item_id, delta)
    select coalesce(d.sid, p.sid), coalesce(d.q, 0) - coalesce(p.q, 0)
      from (select (dati->>'stock_item_id')::uuid as sid, sum(coalesce((dati->>'quantity')::int,1)) as q
              from _voci where nullif(dati->>'stock_item_id','') is not null group by 1) d
      full join (select oi.stock_item_id as sid, sum(coalesce(oi.quantity,1)) as q
                   from public.order_items oi
                  where oi.order_id = p_commessa and oi.stock_item_id is not null group by 1) p
        on p.sid = d.sid
     where coalesce(d.q, 0) <> coalesce(p.q, 0);

    -- Voci sparite dalla scheda: prima i movimenti e gli allegati che le citano.
    delete from public.warehouse_movements
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
      balance_expected_date
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
      nullif(v.dati->>'balance_expected_date','')::date
      from _voci v where v.id is null;
    get diagnostics v_ins = row_count;

    -- La giacenza si sposta con un solo UPDATE relativo: il conto lo fa il
    -- database, non il browser, quindi due salvataggi non si sovrascrivono.
    for r in select d.stock_item_id, d.delta from _delta d loop
      update public.warehouse_stock ws
         set quantity = greatest(0, ws.quantity - r.delta), updated_at = now()
       where ws.id = r.stock_item_id and ws.company_id = v_company;
      if found then
        insert into public.warehouse_movements
          (stock_item_id, movement_type, quantity, notes, performed_by, order_id, company_id)
        values (
          r.stock_item_id,
          case when r.delta > 0 then 'scarico' else 'carico' end,
          abs(r.delta),
          case when r.delta > 0 then 'Scarico aggiuntivo' else 'Ripristino automatico' end
            || ' per modifica commessa ' || coalesce(v_codice, left(p_commessa::text, 8)),
          v_attore,
          p_commessa, v_company
        );
        v_mov := v_mov + 1;
      end if;
    end loop;
  end if;

  ------------------------------------------------------------------ venditore
  if p_venditore is not null then
    if jsonb_typeof(p_venditore) = 'null' or p_venditore = '{}'::jsonb then
      delete from public.order_salespeople where order_id = p_commessa;
    elsif nullif(p_venditore->>'salesperson_id','') is null then
      raise exception 'commessa_salva: il venditore va indicato con salesperson_id'
        using errcode = '22023';
    elsif p_venditore ? 'commission_amount' then
      -- La cifra la calcola il trigger set_order_salesperson_commission_amount
      -- leggendo salespeople e le rate incassate: accettarla dal client
      -- sarebbe far credere che conti qualcosa.
      raise exception 'commessa_salva: la provvigione la calcola il server, non passare commission_amount'
        using errcode = '22023';
    else
      v_vend := (p_venditore->>'salesperson_id')::uuid;
      -- Condizioni prese dall'anagrafica se non le riscrive la scheda.
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
$fn$;

revoke all on function public.commessa_salva(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.commessa_salva(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

comment on function public.commessa_salva(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Salva una commessa in una sola transazione: campi, rate, righe bonus, voci, giacenze e venditore. Ogni argomento a NULL significa "non toccare". Le colonne deposit_*/balance_*/financing_* di orders si ricavano dalle rate. Sostituisce le venti chiamate in fila di EditOrder.';

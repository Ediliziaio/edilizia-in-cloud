-- Recovered from the production migration journal, already applied there.
-- The registered version predates the native general-project schema in Git.
-- Fresh databases defer the original SQL until 20290313155500; production does not rerun it.
create schema if not exists private;
create table if not exists private.commesse_recovered_patches(id text primary key);
alter table private.commesse_recovered_patches enable row level security;
revoke all on private.commesse_recovered_patches from public,anon,authenticated,service_role;

DO $defer_commesse_3$ BEGIN
IF to_regclass('public.unita_movimenti') IS NOT NULL AND to_regclass('public.generale_piano_voci') IS NOT NULL THEN
-- Creazione e recupero del lavoro appaltatore sulla RPC atomica già condivisa.
-- Il registro è interno: nessuna nuova tabella esposta al client.
create schema if not exists private;
create table if not exists private.order_creation_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  request_id uuid not null,
  order_id uuid references public.orders(id) on delete set null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(company_id,request_id)
);
alter table private.order_creation_requests enable row level security;
revoke all on private.order_creation_requests from public,anon,authenticated;

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
  v_qty               NUMERIC;
  v_commission_type   TEXT;
  v_commission_value  NUMERIC;
  v_commission_amount NUMERIC;
  v_total_amount      NUMERIC;
  v_inst              JSONB;
  v_request uuid;
  v_request_payload jsonb;
  v_previous private.order_creation_requests%rowtype;
  v_appalto boolean;
  v_valorizzazione text;
  v_iva numeric;
  v_tetto numeric;
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

  -- La stessa RPC serve le commesse ordinarie e i lavori per appaltatore.
  v_appalto := p_order_data->>'order_type' = 'appaltatore_lavoro';
  v_request := nullif(p_order_data->>'creation_request_id','')::uuid;
  if v_appalto and v_request is null then
    raise exception 'Manca il riferimento del tentativo: riapri il modulo.' using errcode='22023';
  end if;
  if v_request is not null then
    if auth.uid() is null or v_caller_id is distinct from auth.uid() then
      raise exception 'Il recupero richiede una sessione autenticata.' using errcode='42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company_id::text||':'||v_request::text, 1939));
    v_request_payload := jsonb_build_object('ordine',p_order_data,'articoli',p_items,'rate',p_installments,'venditore',p_salesperson);
    select * into v_previous from private.order_creation_requests where company_id=v_company_id and request_id=v_request;
    if found then
      if v_previous.actor_id is distinct from auth.uid() then
        raise exception 'Il tentativo appartiene a un altro utente.' using errcode='42501';
      end if;
      if v_previous.payload is distinct from v_request_payload then
        raise exception 'Questo tentativo è già stato completato con dati diversi. Apri la commessa per modificarla.' using errcode='22023';
      end if;
      if v_previous.order_id is null or not exists(select 1 from public.orders where id=v_previous.order_id and company_id=v_company_id and deleted_at is null) then
        raise exception 'La commessa del tentativo è stata eliminata o cestinata: verifica il cestino.' using errcode='22023';
      end if;
      return jsonb_build_object('id',v_previous.order_id,'success',true,'gia_creata',true);
    end if;
  end if;
  v_total_amount := COALESCE((p_order_data->>'total_amount')::numeric, 0);
  if v_appalto then
    v_valorizzazione := p_order_data->>'valorizzazione';
    v_iva := coalesce((p_order_data->>'vat_rate')::numeric,22);
    v_tetto := nullif(p_order_data->>'tetto_importo','')::numeric;
    if v_valorizzazione is null or v_valorizzazione not in ('a_corpo','a_misura') then
      raise exception 'Scegli una valorizzazione a corpo o a misura.' using errcode='22023';
    end if;
    if nullif(btrim(p_order_data->>'description'),'') is null
      or v_total_amount::text in ('NaN','Infinity','-Infinity') or v_total_amount<0
      or v_iva::text in ('NaN','Infinity','-Infinity') or v_iva<0 or v_iva>100
      or (v_tetto is not null and (v_tetto::text in ('NaN','Infinity','-Infinity') or v_tetto<0)) then
      raise exception 'Descrizione, importo, IVA o tetto non validi.' using errcode='22023';
    end if;
    if not exists(select 1 from public.profiles where id=(p_order_data->>'customer_id')::uuid
      and company_id=v_company_id and customer_type='appaltatore') then
      raise exception 'Il committente non è un appaltatore di questa azienda.' using errcode='42501';
    end if;
    if nullif(p_order_data->>'work_start_date','')::date > nullif(p_order_data->>'work_end_date','')::date then
      raise exception 'La fine dei lavori precede l’inizio.' using errcode='22023';
    end if;
    if jsonb_typeof(p_installments) is distinct from 'array' then
      raise exception 'Piano rate non valido.' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_installments) i where coalesce((i->>'is_paid')::boolean,false) or nullif(i->>'paid_date','') is not null)
      or coalesce((p_order_data->>'deposit_paid')::boolean,false)
      or coalesce((p_order_data->>'deposit_2_paid')::boolean,false)
      or coalesce((p_order_data->>'balance_paid')::boolean,false)
      or coalesce((p_order_data->>'financing_paid')::boolean,false) then
      raise exception 'Registra gli incassi dalla commessa con il collegamento alla prima nota.' using errcode='22023';
    end if;
    if v_valorizzazione='a_misura' then
      if nullif(p_order_data->>'appalto_contratto_id','') is null then
        raise exception 'Per un lavoro a misura scegli il contratto del committente.' using errcode='22023';
      end if;
      if jsonb_array_length(p_installments)>0 then
        raise exception 'Una stima a misura non può generare rate da incassare.' using errcode='22023';
      end if;
    else
      if exists(select 1 from jsonb_array_elements(p_installments) i where
        nullif(i->>'amount','') is null or (i->>'amount')::numeric::text in ('NaN','Infinity','-Infinity') or (i->>'amount')::numeric<0)
        or abs(coalesce((select sum((i->>'amount')::numeric) from jsonb_array_elements(p_installments) i),0)-round(v_total_amount*(1+v_iva/100),2))>0.005 then
        raise exception 'Le rate devono coincidere con il totale IVA inclusa.' using errcode='22023';
      end if;
    end if;
  end if;

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

  if not exists(select 1 from public.order_statuses where id=v_status_id and company_id=v_company_id) then
    raise exception 'Lo stato iniziale non appartiene a questa azienda.' using errcode='23503';
  end if;

  INSERT INTO public.orders (
    order_type, valorizzazione, appalto_contratto_id, tetto_importo, riferimento_committente,
    work_address, work_description, materials_location, work_lat, work_lng, created_by,
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
    coalesce(nullif(p_order_data->>'order_type',''),'cliente'),
    nullif(p_order_data->>'valorizzazione',''),
    nullif(p_order_data->>'appalto_contratto_id','')::uuid,
    nullif(p_order_data->>'tetto_importo','')::numeric,
    nullif(btrim(p_order_data->>'riferimento_committente'),''),
    nullif(btrim(p_order_data->>'work_address'),''),
    nullif(btrim(p_order_data->>'work_description'),''),
    nullif(btrim(p_order_data->>'materials_location'),''),
    nullif(p_order_data->>'work_lat','')::double precision,
    nullif(p_order_data->>'work_lng','')::double precision,
    v_caller_id,
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
    v_qty := COALESCE((v_item->>'quantity')::numeric, 1);

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

    -- riga su misura (20290101100000): gruppo, riferimento, specifiche e fonte del costo.
    IF v_item ?| array['gruppo_id','riferimento','specifiche','prezzo_fonte'] THEN
      UPDATE public.order_items SET
        gruppo_id = NULLIF(v_item->>'gruppo_id', '')::uuid,
        riferimento = NULLIF(btrim(v_item->>'riferimento'), ''),
        specifiche = NULLIF(btrim(v_item->>'specifiche'), ''),
        prezzo_fonte = NULLIF(v_item->>'prezzo_fonte', '')
      WHERE id = v_item_id;
    END IF;

    -- unita_misura della riga (20281222170000): 12,5 m² resta in m².
    IF NULLIF(btrim(v_item->>'unita_misura'), '') IS NOT NULL THEN
      UPDATE public.order_items SET unita_misura = btrim(v_item->>'unita_misura') WHERE id = v_item_id;
    END IF;

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

  if v_request is not null then
    insert into private.order_creation_requests(company_id,request_id,order_id,actor_id,payload)
    values(v_company_id,v_request,v_order_id,auth.uid(),v_request_payload);
  end if;
  RETURN jsonb_build_object('id', v_order_id, 'success', true);

EXCEPTION WHEN OTHERS THEN
  -- Rilancio con lo STESSO codice: un vincolo (23502, 23503, 23505) resta
  -- riconoscibile e il client lo traduce. Prima tutto diventava P0001 con il
  -- prefisso "create_order_atomic failed:", che arrivava a schermo com'era.
  RAISE EXCEPTION '%', SQLERRM USING ERRCODE = SQLSTATE;
END;
$function$;

revoke all on function public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb) to authenticated,service_role;

-- Ingresso del modulo: nessun secondo motore di creazione. Il nome distinto
-- impedisce ai client nuovi di invocare per errore una vecchia RPC che ignorava
-- i campi dell'appaltatore durante l'aggiornamento del portale.
create or replace function public.crea_lavoro_appaltatore_atomic(p_order_data jsonb, p_installments jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if p_order_data->>'order_type' is distinct from 'appaltatore_lavoro' then
    raise exception 'Questo ingresso crea solo lavori per appaltatore.' using errcode='22023';
  end if;
  return public.create_order_atomic(p_order_data,'[]'::jsonb,null,null,p_installments);
end;
$$;
revoke all on function public.crea_lavoro_appaltatore_atomic(jsonb,jsonb) from public,anon;
grant execute on function public.crea_lavoro_appaltatore_atomic(jsonb,jsonb) to authenticated;


ELSE INSERT INTO private.commesse_recovered_patches(id) VALUES ('20261111185928_commesse_creazione_appaltatore_atomica.sql') ON CONFLICT DO NOTHING;
END IF; END $defer_commesse_3$;

-- Numerazione: prefisso e formato dell'azienda (preventivo_impostazioni) invece
-- di OFF-AAAA-NNN fisso. Segnaposto: {PREFIX} {YYYY} {YY} {NNN} {NNNN} {N}.
CREATE OR REPLACE FUNCTION public.generate_quote_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_anno     integer := EXTRACT(YEAR FROM now())::integer;
  v_ultimo   integer;
  v_prefix   text;
  v_formato  text;
  v_regex    text;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT upper(regexp_replace(coalesce(nullif(trim(numero_prefisso), ''), 'OFF'), '[^A-Za-z0-9]', '', 'g')),
         coalesce(nullif(trim(numero_formato), ''), '{PREFIX}-{YYYY}-{NNN}')
    INTO v_prefix, v_formato
    FROM public.preventivo_impostazioni
   WHERE company_id = p_company_id;
  v_prefix  := left(coalesce(nullif(v_prefix, ''), 'OFF'), 8);
  v_formato := coalesce(v_formato, '{PREFIX}-{YYYY}-{NNN}');
  IF position('{N' in v_formato) = 0 THEN
    v_formato := v_formato || '-{NNN}';
  END IF;

  -- Un solo salvataggio alla volta per azienda e anno, dentro la transazione.
  PERFORM pg_advisory_xact_lock(hashtext('quote_number:' || p_company_id::text || ':' || v_anno::text));

  -- Regex del formato corrente: il progressivo è il gruppo catturato.
  v_regex := '^' || regexp_replace(v_formato, '([.\\+*?\[\]^$(){}|/])', '\\\1', 'g') || '$';
  v_regex := replace(v_regex, '\{PREFIX\}', v_prefix);
  v_regex := replace(v_regex, '\{YYYY\}', v_anno::text);
  v_regex := replace(v_regex, '\{YY\}', right(v_anno::text, 2));
  v_regex := regexp_replace(v_regex, '\\\{N+\\\}', '([0-9]+)');

  -- Primo uso dell'anno: si riparte dal massimo già emesso (cestinati compresi,
  -- così un numero purgato non torna in circolo), non dal conteggio.
  INSERT INTO public.quote_number_counters (company_id, anno, ultimo)
  SELECT p_company_id, v_anno,
         COALESCE(MAX((regexp_match(quote_number, v_regex))[1]::integer), 0)
    FROM public.quotes
   WHERE company_id = p_company_id
     AND quote_number ~ v_regex
  ON CONFLICT (company_id, anno) DO NOTHING;

  UPDATE public.quote_number_counters
     SET ultimo = ultimo + 1
   WHERE company_id = p_company_id AND anno = v_anno
  RETURNING ultimo INTO v_ultimo;

  RETURN regexp_replace(
           replace(replace(replace(v_formato, '{PREFIX}', v_prefix), '{YYYY}', v_anno::text), '{YY}', right(v_anno::text, 2)),
           '\{N+\}',
           lpad(v_ultimo::text,
                greatest(3, length(coalesce((regexp_match(v_formato, '\{(N+)\}'))[1], 'NNN'))),
                '0'));
END;
$function$;

-- Demo Azienda 2: i contatti duplicati (stessa email) confluiscono nel più vecchio.
-- ATTENZIONE (incidente 05/09/2026): la prima versione girava su TUTTE le 56 tabelle
-- con FK verso marketing_contacts dentro un'unica transazione, e ha bloccato il
-- database (istanza da 1 GB) per ~10 minuti. Questa versione tocca solo le tabelle
-- che contano davvero per la demo, una alla volta, con lock_timeout: se qualcuno
-- tiene un lock si salta e si va avanti. Le copie restano nel cestino.
DO $$
DECLARE
  t record;
  v_demo uuid := 'd2000000-0000-4000-a000-000000000002';
  tabelle text[][] := ARRAY[
    ['quotes','contact_id'], ['marketing_opportunities','contact_id'], ['marketing_contact_activities','contact_id'],
    ['marketing_contact_notes','contact_id'], ['marketing_contact_field_values','contact_id'], ['marketing_contact_list_members','contact_id'],
    ['tasks','contact_id'], ['scadenze','contact_id'], ['form_submissions','contact_id'], ['contact_attributions','contact_id'],
    ['attribution_sessions','contact_id'], ['documento_sessioni','contact_id'], ['fv_progetti','cliente_id'], ['render_sessions','contact_id'],
    ['commercial_visit_debriefs','visited_contact_id'], ['customer_complaints','contact_id'], ['support_tickets','contact_id'],
    ['simulazioni','contact_id'], ['listini_cliente','contact_id'], ['crm_roi_simulations','contact_id'], ['contact_messages','contact_id']];
  i int;
BEGIN
  SET LOCAL lock_timeout = '3s';
  CREATE TEMP TABLE tmp_contatti_doppi ON COMMIT DROP AS
    SELECT keep.id AS keep_id, dup.id AS dup_id
    FROM (
      SELECT DISTINCT ON (lower(email)) id, lower(email) AS e
      FROM public.marketing_contacts
      WHERE company_id = v_demo AND deleted_at IS NULL AND email IS NOT NULL
      ORDER BY lower(email), created_at
    ) keep
    JOIN public.marketing_contacts dup
      ON dup.company_id = v_demo AND dup.deleted_at IS NULL AND lower(dup.email) = keep.e AND dup.id <> keep.id;

  FOR i IN 1 .. array_length(tabelle, 1) LOOP
    BEGIN
      EXECUTE format('UPDATE public.%I x SET %I = m.keep_id FROM tmp_contatti_doppi m WHERE x.%I = m.dup_id',
                     tabelle[i][1], tabelle[i][2], tabelle[i][2]);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'dedupe contatti demo: %.% saltata (%)', tabelle[i][1], tabelle[i][2], SQLERRM;
    END;
  END LOOP;

  UPDATE public.marketing_contacts c SET deleted_at = now()
  FROM tmp_contatti_doppi m WHERE c.id = m.dup_id AND c.deleted_at IS NULL;
END $$;

-- Reseed demo: non crea più copie dello stesso contatto.
CREATE OR REPLACE FUNCTION public.demo_scenario_applica(p_company_id uuid, p_fino_a date DEFAULT CURRENT_DATE)
 RETURNS TABLE(applicati integer, falliti integer, saltati integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c_vetrine uuid[] := array['d2000000-0000-4000-a000-000000000002'::uuid];
  e record; v_ord record; v_inv record;
  v_conto uuid; v_conto_iva uuid; v_prog int; v_anno int; v_admin uuid;
  v_sub numeric; v_iva numeric; v_contatto uuid; v_pipe uuid; v_stage uuid;
  v_esito text; v_ok int := 0; v_ko int := 0; v_sk int := 0;
begin
  if not (p_company_id = any(c_vetrine)) then
    raise exception 'demo_scenario_applica: % non e'' un tenant-vetrina', p_company_id;
  end if;
  set local session_replication_role = replica;
  select id into v_conto     from bank_accounts where company_id=p_company_id and display_name='Conto principale' limit 1;
  select id into v_conto_iva from bank_accounts where company_id=p_company_id and display_name='IVA' limit 1;
  select id into v_admin from profiles where company_id=p_company_id order by created_at limit 1;
  select p.id, s.id into v_pipe, v_stage from marketing_pipelines p
    join marketing_pipeline_stages s on s.pipeline_id=p.id
   where p.company_id=p_company_id order by s.position limit 1;

  for e in select * from demo_scenario_eventi
     where company_id=p_company_id and applicato_at is null and data_evento <= p_fino_a
     order by data_evento, case tipo when 'commessa' then 1 when 'fattura' then 2
                                     when 'incasso' then 3 else 4 end, id
  loop
    v_esito := 'ok';
    v_contatto := null;
    begin
      if e.tipo = 'lead' then
        -- Stesso nome = stesso contatto: gli eventi ciclano su 21 persone e ogni
        -- giorno ne rinasceva una copia (122 contatti per 21 email). Se esiste,
        -- si aggiorna l'ultima attività e si riusa.
        select id into v_contatto from marketing_contacts
         where company_id = p_company_id and deleted_at is null
           and lower(email) = lower(e.payload->>'nome')||'.'||lower(e.payload->>'cognome')||'@esempio.it'
         order by created_at limit 1;
        if v_contatto is not null then
          update marketing_contacts set last_activity_at = greatest(coalesce(last_activity_at, e.data_evento::timestamptz), e.data_evento::timestamptz)
           where id = v_contatto;
        else
          insert into marketing_contacts (company_id, first_name, last_name, email, phone, city, province,
                 source, tags, contact_type, created_at, last_activity_at)
          values (p_company_id, e.payload->>'nome', e.payload->>'cognome',
                 lower(e.payload->>'nome')||'.'||lower(e.payload->>'cognome')||'@esempio.it',
                 e.payload->>'telefono', e.payload->>'citta', e.payload->>'provincia',
                 e.payload->>'fonte', array['lead','demo'], 'lead',
                 e.data_evento::timestamptz, e.data_evento::timestamptz)
          returning id into v_contatto;
        end if;
        if v_pipe is not null then
          insert into marketing_opportunities (company_id, contact_id, pipeline_id, stage_id, name,
                 value, status, source, expected_close_date, created_at, stage_changed_at)
          values (p_company_id, v_contatto, v_pipe, v_stage,
                 (e.payload->>'lavoro')||' — '||(e.payload->>'nome')||' '||(e.payload->>'cognome'),
                 (e.payload->>'valore')::numeric, 'open', e.payload->>'fonte',
                 e.data_evento+45, e.data_evento::timestamptz, e.data_evento::timestamptz);
        end if;
      elsif e.tipo = 'commessa' then
        insert into orders (company_id, order_code, client_name, client_email, tipo_lavoro,
               description, work_description, total_amount, deposit_amount, balance_amount, vat_rate,
               status, work_start_date, work_end_date, expected_date, indirizzo_lavori, work_address,
               percentuale_avanzamento, created_at, updated_at)
        values (p_company_id, e.payload->>'codice', e.payload->>'cliente', e.payload->>'email',
               e.payload->>'lavoro',
               initcap(replace(e.payload->>'lavoro','_',' '))||' — '||(e.payload->>'cliente'),
               initcap(replace(e.payload->>'lavoro','_',' ')),
               (e.payload->>'imponibile')::numeric,
               round((e.payload->>'imponibile')::numeric*0.30,2),
               round((e.payload->>'imponibile')::numeric*0.70,2),
               (e.payload->>'iva')::numeric, 'confermato',
               e.data_evento, e.data_evento+(e.payload->>'durata')::int,
               e.data_evento+(e.payload->>'durata')::int,
               e.payload->>'indirizzo', e.payload->>'indirizzo', 0,
               e.data_evento::timestamptz, e.data_evento::timestamptz);
      elsif e.tipo = 'avanzamento' then
        update orders set percentuale_avanzamento=(e.payload->>'percentuale')::numeric, status='in_corso',
               updated_at=e.data_evento::timestamptz
         where company_id=p_company_id and order_code=e.payload->>'codice';
        if not found then v_esito := 'saltato: commessa inesistente'; end if;
      elsif e.tipo = 'chiusura' then
        update orders set percentuale_avanzamento=100, status='completato', work_end_date=e.data_evento,
               updated_at=e.data_evento::timestamptz
         where company_id=p_company_id and order_code=e.payload->>'codice';
        if not found then v_esito := 'saltato: commessa inesistente'; end if;
      elsif e.tipo = 'fattura' then
        select * into v_ord from orders where company_id=p_company_id and order_code=e.payload->>'codice' limit 1;
        if not found then v_esito := 'saltato: commessa inesistente';
        else
          v_anno := extract(year from e.data_evento)::int;
          select coalesce(max(progressive_number),0)+1 into v_prog from invoices
           where company_id=p_company_id and invoice_year=v_anno;
          v_sub := round(v_ord.total_amount*(e.payload->>'quota_perc')::numeric,2);
          v_iva := round(v_sub*coalesce(v_ord.vat_rate,22)/100,2);
          insert into invoices (company_id, invoice_number, invoice_year, progressive_number, document_type,
                 status, client_company_name, client_address, client_country, client_sdi_code, client_email,
                 issue_date, due_date, subtotal, tax_amount, total, paid_amount, payment_method, payment_days,
                 bank_iban, order_id, notes, external_id, created_at, updated_at)
          values (p_company_id, 'FT/'||v_anno||'/'||lpad(v_prog::text,3,'0'), v_anno, v_prog, 'invoice',
                 'issued', v_ord.client_name,
                 coalesce(split_part(v_ord.indirizzo_lavori,',',1),'Indirizzo cantiere'), 'IT', '0000000',
                 v_ord.client_email, e.data_evento, e.data_evento+30, v_sub, v_iva, v_sub+v_iva, 0,
                 'bank_transfer', 30, (select iban from bank_accounts where id=v_conto), v_ord.id,
                 coalesce(initcap(replace(v_ord.tipo_lavoro,'_',' ')),'Lavori edili')||' — '||(e.payload->>'quota'),
                 'DEMO2-'||(e.payload->>'codice')||'-'||(e.payload->>'quota'),
                 e.data_evento::timestamptz, e.data_evento::timestamptz)
          returning * into v_inv;
          insert into invoice_lines (invoice_id, sort_order, description, unit, quantity, unit_price,
                 tax_rate, line_net, line_tax, line_gross)
          select v_inv.id, v.ord, v.descr, 'corpo', 1, v.netto, coalesce(v_ord.vat_rate,22), v.netto,
                 round(v.netto*coalesce(v_ord.vat_rate,22)/100,2),
                 round(v.netto*(1+coalesce(v_ord.vat_rate,22)/100),2)
          from (values (1,'Fornitura materiali — '||coalesce(v_ord.tipo_lavoro,'lavori edili'), round(v_sub*0.60,2)),
                       (2,'Manodopera e posa in opera — '||coalesce(v_ord.tipo_lavoro,'lavori edili'), round(v_sub*0.40,2))
               ) as v(ord, descr, netto);
          -- NB: scadenze.direction e' una colonna generata, non va valorizzata
          insert into scadenze (company_id, tipo, description, amount, due_date, status,
                 invoice_id, order_id, is_auto_generated, auto_source, created_at)
          values (p_company_id,'incasso_cliente', v_inv.invoice_number||' — '||v_ord.client_name,
                 v_inv.total, e.data_evento+30,'da_pagare', v_inv.id, v_ord.id, true, 'demo_scenario',
                 e.data_evento::timestamptz);
        end if;
      elsif e.tipo = 'incasso' then
        select * into v_inv from invoices where company_id=p_company_id
           and external_id='DEMO2-'||(e.payload->>'codice')||'-'||(e.payload->>'quota') limit 1;
        if not found then v_esito := 'saltato: fattura inesistente';
        elsif v_inv.paid_amount >= v_inv.total then v_esito := 'saltato: gia'' incassata';
        else
          update invoices set paid_amount=total, status='paid', payment_date=e.data_evento,
                 updated_at=e.data_evento::timestamptz where id=v_inv.id;
          update scadenze set status='pagata', paid_amount=v_inv.total, paid_date=e.data_evento
           where invoice_id=v_inv.id;
          insert into bank_transactions (company_id, account_id, external_transaction_id, booking_date,
                 value_date, amount, currency, description, debtor_name, transaction_type, status,
                 category, reconciliation_status, reconciled_invoice_id, reconciled_at, source)
          values (p_company_id, v_conto, 'DEMO2-IN-'||v_inv.invoice_number, e.data_evento, e.data_evento,
                 v_inv.total, 'EUR', 'Bonifico SEPA da '||v_inv.client_company_name||' — saldo fatt. '||v_inv.invoice_number,
                 v_inv.client_company_name, 'credit', 'booked', 'Incassi clienti', 'reconciled',
                 v_inv.id, e.data_evento::timestamptz, 'manual');
        end if;
      elsif e.tipo = 'movimento' then
        insert into bank_transactions (company_id, account_id, external_transaction_id, booking_date,
               value_date, amount, currency, description, creditor_name, debtor_name, transaction_type,
               status, category, reconciliation_status, source)
        values (p_company_id, case when e.payload->>'conto'='iva' then v_conto_iva else v_conto end,
               'DEMO2-EV-'||e.id::text, e.data_evento, e.data_evento, (e.payload->>'importo')::numeric,
               'EUR', e.payload->>'descrizione',
               case when (e.payload->>'importo')::numeric < 0 then e.payload->>'controparte' end,
               case when (e.payload->>'importo')::numeric > 0 then e.payload->>'controparte' end,
               case when (e.payload->>'importo')::numeric < 0 then 'debit' else 'credit' end,
               'booked', e.payload->>'categoria',
               case when e.data_evento > p_fino_a - 7 then 'pending' else 'reconciled' end, 'manual');
      else
        -- preventivo, social, campagna, recensione, whatsapp, timbrature
        v_esito := demo_scenario_applica_estensioni(p_company_id, v_admin, e.tipo,
                                                    e.data_evento, e.payload, e.id);
      end if;
      update demo_scenario_eventi set applicato_at=now(), esito=v_esito where id=e.id;
      if v_esito like 'ok%' then v_ok := v_ok+1; else v_sk := v_sk+1; end if;
    exception when others then
      update demo_scenario_eventi set applicato_at=now(), esito='errore: '||sqlerrm where id=e.id;
      v_ko := v_ko+1;
    end;
  end loop;

  update bank_accounts ba set
    current_balance = coalesce(ba.opening_balance,0)
      + coalesce((select sum(t.amount) from bank_transactions t where t.account_id=ba.id),0),
    balance_updated_at = now()
  where ba.company_id = p_company_id;
  return query select v_ok, v_ko, v_sk;
end;
$function$
;

-- Undicesimo controllo (19/10/2026): vedi supabase/migrations/20281019270000_undicesimo_controllo.sql
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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

select pg_temp.correggi('public.dividi_righe_ordine_acquisto(uuid,uuid,numeric)',
  $re$v_r := round\(coalesce\(i\.quantity_received, 0\) \* v_quota, 3\);$re$,
  $to$-- il ricevuto riempie prima la riga originale: alla nuova va solo l'eccedenza
    v_r := greatest(0, coalesce(i.quantity_received, 0) - (i.quantity - v_q));$to$,
  'v_r := greatest(0, coalesce(i.quantity_received, 0) - (i.quantity - v_q));');

select pg_temp.correggi('public.conferma_carico_ddt(uuid,uuid)',
  $re$and i\.quantity - coalesce\(i\.quantity_received, 0\) > 0(\s+and \(oi\.stock_item_id = v_art_id)$re$,
  $to$and i.quantity - coalesce(i.quantity_received, 0) >= 1\1$to$,
  'and i.quantity - coalesce(i.quantity_received, 0) >= 1');

revoke all on function public.dividi_righe_ordine_acquisto(uuid, uuid, numeric) from public, anon, authenticated;

create or replace function public.rate_importi(p_company uuid)
returns table (installment_id uuid, order_id uuid, type text, importo numeric, is_paid boolean,
               paid_date date, expected_date date, documento_fiscale_id uuid, invoice_id uuid)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not coalesce(public.user_can_access_company(p_company), false) then
    raise exception 'Accesso non autorizzato a questa azienda.' using errcode = '42501';
  end if;
  return query
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end fc
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
    select r1.*, o.fc,
           round(round((o.tot + coalesce((select sum(var.imp) from var
                                          where var.order_id = r1.order_id
                                            and (not (r1.finale and coalesce(r1.is_paid, false) and r1.paid_date is not null)
                                                 or var.il <= r1.paid_date)), 0)) * (1 + o.iva / 100), 2)
                 - r1.altre - o.fc, 2) as saldo_grezzo
      from r1 join o on o.id = r1.order_id
  ),
  r3 as (
    select r2.*,
           least(greatest(0, -max(case when r2.finale then r2.saldo_grezzo end) over (partition by r2.order_id)), r2.fc) as avanzo
      from r2
  )
  select r3.id, r3.order_id, r3.type::text,
         case when r3.finale then greatest(0, r3.saldo_grezzo)
              when r3.type = 'financing' then greatest(0, coalesce(r3.amount, 0) - r3.avanzo)
              else coalesce(r3.amount, 0) end,
         coalesce(r3.is_paid, false), r3.paid_date, r3.expected_date, r3.documento_fiscale_id, r3.invoice_id
    from r3;
end $$;
revoke all on function public.rate_importi(uuid) from public, anon, authenticated;

create or replace function public.incassi_fatture_senza_rata(p_company uuid, p_da date)
returns numeric language sql stable security definer set search_path = public
as $$
  select coalesce(sum(m.importo), 0)
    from public.movimenti_cassa_native m
   where m.company_id = p_company and m.tipo = 'incasso' and m.documento_id is not null
     and m.data_movimento >= p_da
     and not exists (select 1 from public.order_installments i where i.documento_fiscale_id = m.documento_id)
$$;
revoke all on function public.incassi_fatture_senza_rata(uuid, date) from public, anon, authenticated;

create or replace function public.silvio_tool_company_kpi(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
DECLARE
  v_employees int;
  v_orders_active int;
  v_orders_ytd int;
  v_revenue_ytd numeric;
  v_quotes_open int;
  v_overdue_count int;
  v_overdue_amount numeric;
  v_bank_balance numeric;
  v_bank_accounts int := 0;
  v_inc_rate_ytd numeric;
  v_inc_fatture_ytd numeric;
  v_fatture_emesse int;
  v_fatturato_ytd numeric;
  v_anno date := date_trunc('year', CURRENT_DATE)::date;
BEGIN
  SELECT count(*) INTO v_employees
    FROM public.profiles WHERE company_id = p_company_id;

  WITH da_incassare AS MATERIALIZED (
         SELECT DISTINCT d.order_id FROM public.rate_da_incassare(p_company_id) d WHERE d.residuo > 0),
       con_piano AS MATERIALIZED (
         SELECT DISTINCT r.order_id FROM public.rate_importi(p_company_id) r)
  SELECT count(*) INTO v_orders_active
    FROM public.commesse_valore_pattuito o
   WHERE o.company_id = p_company_id
     AND (o.id IN (SELECT order_id FROM da_incassare) OR o.id NOT IN (SELECT order_id FROM con_piano));

  SELECT count(*), COALESCE(sum(total_amount), 0) INTO v_orders_ytd, v_revenue_ytd
    FROM public.commesse_valore_pattuito WHERE company_id = p_company_id
      AND created_at >= v_anno;

  BEGIN
    SELECT count(*) INTO v_quotes_open
      FROM public.quotes WHERE company_id = p_company_id
        AND status IN ('draft', 'sent', 'pending', 'aperto', 'inviato', 'inviata');
  EXCEPTION WHEN OTHERS THEN v_quotes_open := NULL; END;

  SELECT count(*), COALESCE(sum(residuo), 0) INTO v_overdue_count, v_overdue_amount
    FROM public.rate_da_incassare(p_company_id)
   WHERE NOT finanziamento AND expected_date < CURRENT_DATE AND residuo > 0;

  SELECT COALESCE(sum(importo), 0) INTO v_inc_rate_ytd
    FROM public.rate_incassi(p_company_id) WHERE data >= v_anno;
  v_inc_fatture_ytd := public.incassi_fatture_senza_rata(p_company_id, v_anno);

  SELECT count(*) INTO v_fatture_emesse
    FROM public.documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','autofattura','fattura_riepilogativa')
     AND stato <> 'bozza';

  SELECT COALESCE(sum(coalesce(imponibile_totale, 0) * public.documento_segno(tipo)), 0) INTO v_fatturato_ytd
    FROM public.documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL AND stato <> 'bozza'
     AND tipo IN ('fattura','fattura_pa','fattura_riepilogativa','nota_credito')
     AND data_emissione >= v_anno;

  BEGIN
    SELECT COALESCE(sum(current_balance), 0), count(*) INTO v_bank_balance, v_bank_accounts
      FROM public.bank_accounts WHERE company_id = p_company_id
        AND COALESCE(is_active, true);
  EXCEPTION WHEN OTHERS THEN v_bank_balance := NULL; v_bank_accounts := 0; END;

  RETURN jsonb_build_object(
    'aggiornato_al', now(),
    'team_size', v_employees,
    'commesse_attive', v_orders_active,
    'commesse_anno_corrente', v_orders_ytd,
    'venduto_anno_corrente_eur', round(v_revenue_ytd::numeric, 2),
    'fatturato_anno_corrente_eur', CASE WHEN v_fatture_emesse > 0 THEN round(v_fatturato_ytd::numeric, 2) ELSE NULL END,
    'incassato_anno_corrente_eur', round((v_inc_rate_ytd + v_inc_fatture_ytd)::numeric, 2),
    'incassato_da_rate_commesse_eur', round(v_inc_rate_ytd::numeric, 2),
    'incassato_da_fatture_senza_rata_eur', round(v_inc_fatture_ytd::numeric, 2),
    'fatture_emesse_count', v_fatture_emesse,
    'usa_fatturazione_eic', v_fatture_emesse > 0,
    'preventivi_aperti', v_quotes_open,
    'rate_scadute_count', v_overdue_count,
    'rate_scadute_eur', round(v_overdue_amount::numeric, 2),
    'banca_collegata', v_bank_accounts > 0,
    'saldo_banche_totale_eur', CASE WHEN v_bank_accounts > 0 AND v_bank_balance IS NOT NULL THEN round(v_bank_balance::numeric, 2) ELSE NULL END,
    'nota_lettura', 'Venduto = contratti più varianti, IVA esclusa, commesse non nel cestino. Fatturato = fatture emesse in EiC (vuoto se l''azienda fattura fuori piattaforma). Incassato = rate incassate (con le fatture collegate) più fatture senza rata: non si somma due volte. Importi rate e incassi IVA inclusa.'
  );
END;
$function$;
revoke all on function public.silvio_tool_company_kpi(uuid) from public, anon, authenticated;
grant execute on function public.silvio_tool_company_kpi(uuid) to service_role;

create or replace function pg_temp.correggi_g(p_firma text, p_cerca text, p_metti text, p_atteso text)
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

select pg_temp.correggi_g('public.silvio_tool_quadro_incassi(uuid,integer)',
  $re$FROM orders WHERE company_id = p_company_id AND created_at >= da;$re$,
  'FROM public.commesse_valore_pattuito WHERE company_id = p_company_id AND created_at >= da;',
  'FROM public.commesse_valore_pattuito WHERE company_id = p_company_id AND created_at >= da;');
select pg_temp.correggi_g('public.silvio_tool_quadro_incassi(uuid,integer)',
  $re$SELECT COALESCE\(sum\(amount\),0\) INTO v_inc_rate\s+FROM v_rate_commesse_unificate\s+WHERE company_id = p_company_id AND is_paid AND paid_date >= da;$re$,
  $to$-- incassi delle rate alle loro date, fatture collegate comprese, commesse nel cestino escluse
  SELECT COALESCE(sum(importo),0) INTO v_inc_rate FROM public.rate_incassi(p_company_id) WHERE data >= da;$to$,
  'SELECT COALESCE(sum(importo),0) INTO v_inc_rate FROM public.rate_incassi(p_company_id) WHERE data >= da;');
select pg_temp.correggi_g('public.silvio_tool_quadro_incassi(uuid,integer)',
  $re$SELECT COALESCE\(sum\(coalesce\(importo_pagato,0\) \* public\.documento_segno\(tipo\)\),0\) INTO v_inc_fatture\s+FROM documenti_fiscali\s+WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at >= da;$re$,
  $to$-- solo le fatture non legate a una rata: le altre sono già negli incassi delle rate
  v_inc_fatture := public.incassi_fatture_senza_rata(p_company_id, da);$to$,
  'v_inc_fatture := public.incassi_fatture_senza_rata(p_company_id, da);');
select pg_temp.correggi_g('public.silvio_tool_quadro_incassi(uuid,integer)',
  $re$SELECT COALESCE\(sum\(amount\) FILTER \(WHERE expected_date >= CURRENT_DATE\), 0\),\s+COALESCE\(sum\(amount\) FILTER \(WHERE expected_date < CURRENT_DATE\), 0\)\s+INTO v_rate_future, v_rate_scadute\s+FROM v_rate_commesse_unificate\s+WHERE company_id = p_company_id AND NOT is_paid AND expected_date IS NOT NULL;$re$,
  $to$-- da incassare con la regola della scheda commessa (la rata della finanziaria non è mai «scaduta»)
  SELECT COALESCE(sum(residuo) FILTER (WHERE expected_date >= CURRENT_DATE), 0),
         COALESCE(sum(residuo) FILTER (WHERE expected_date < CURRENT_DATE AND NOT finanziamento), 0)
    INTO v_rate_future, v_rate_scadute
    FROM public.rate_da_incassare(p_company_id)
   WHERE expected_date IS NOT NULL;$to$,
  'FROM public.rate_da_incassare(p_company_id)');
select pg_temp.correggi_g('public.silvio_tool_quadro_incassi(uuid,integer)',
  $re$\s+IF v_inc_rate > 0 AND v_inc_fatture > 0 THEN\s+v_avvisi := v_avvisi \|\| jsonb_build_array\('Risultano incassi sia da fatture sia da rate commesse[^;]*;\s+END IF;$re$,
  $to$
  -- niente avviso di doppio conteggio: rate e fatture senza rata non si sovrappongono$to$,
  'niente avviso di doppio conteggio');
select pg_temp.correggi_g('public.silvio_tool_quadro_incassi(uuid,integer)',
  $re$'nota', 'Fonti separate apposta: NON sommarle alla cieca, possono sovrapporsi \(vedi avvisi\)\.'$re$,
  $to$'nota', 'Fonti già separate: rate_commesse_eur comprende le fatture collegate alle rate, fatture_eur sono solo le fatture senza rata (si possono sommare); prima_nota_manuale_eur può ripetere incassi già registrati.'$to$,
  'Fonti già separate: rate_commesse_eur comprende');

select pg_temp.correggi_g('public.silvio_tool_rate_commessa(uuid,text,uuid)',
  $re$SELECT o\.id, o\.order_code, o\.client_name, o\.client_company, o\.total_amount INTO v_order\s+FROM public\.orders o$re$,
  $to$SELECT o.id, o.order_code, o.client_name, o.client_company, o.total_amount,
         -- il piano rate è IVA inclusa: si confronta col totale IVA inclusa, varianti comprese
         round(o.total_amount * (1 + coalesce(oo.vat_rate, 22) / 100), 2)
           - case when oo.payment_type = 'financing' then coalesce(oo.financing_cost, 0) else 0 end AS totale_ivato
    INTO v_order
  FROM public.commesse_valore_pattuito o JOIN public.orders oo ON oo.id = o.id$to$,
  'AS totale_ivato');
select pg_temp.correggi_g('public.silvio_tool_rate_commessa(uuid,text,uuid)',
  $re$'valore_commessa_eur', ROUND\(COALESCE\(v_order\.total_amount, 0\)::numeric, 2\),$re$,
  $to$'valore_imponibile_eur', ROUND(COALESCE(v_order.total_amount, 0)::numeric, 2),
    'valore_ivato_eur', ROUND(COALESCE(v_order.totale_ivato, 0)::numeric, 2),$to$,
  $at$'valore_ivato_eur'$at$);
select pg_temp.correggi_g('public.silvio_tool_rate_commessa(uuid,text,uuid)',
  $re$'quadra_col_valore', \(ABS\(COALESCE\(v_order\.total_amount, 0\) - v_tot\) < 0\.01\),$re$,
  $to$'quadra_col_valore', (ABS(COALESCE(v_order.totale_ivato, 0) - v_tot) < 0.01),$to$,
  $at$ABS(COALESCE(v_order.totale_ivato, 0) - v_tot)$at$);

select pg_temp.correggi_g('public.silvio_executive_report(uuid)',
  $re$FROM public\.orders WHERE company_id = p_company_id;$re$,
  'FROM public.commesse_valore_pattuito WHERE company_id = p_company_id;',
  'FROM public.commesse_valore_pattuito WHERE company_id = p_company_id;');
select pg_temp.correggi_g('public.silvio_executive_report(uuid)',
  $re$status IN \('nuovo','in_corso','in_lavorazione'\)$re$,
  'public.commessa_aperta(company_id, current_status_id, status, fulfillment_status)',
  'public.commessa_aperta(company_id, current_status_id, status, fulfillment_status)');
select pg_temp.correggi_g('public.silvio_executive_report(uuid)',
  $re$status = 'concluso' AND updated_at > now\(\) - interval '30 days'$re$,
  $to$NOT public.commessa_aperta(company_id, current_status_id, status, fulfillment_status) AND updated_at > now() - interval '30 days'$to$,
  $at$NOT public.commessa_aperta(company_id, current_status_id, status, fulfillment_status) AND updated_at$at$);

select pg_temp.correggi_g('public.silvio_tool_serie_grafico(uuid,text,integer)',
  $re$(SELECT date_trunc\('month', created_at\)::date AS m, sum\(coalesce\(total_amount,0\)\) AS v\s+)FROM orders$re$,
  $to$\1FROM public.commesse_valore_pattuito$to$,
  'FROM public.commesse_valore_pattuito');
select pg_temp.correggi_g('public.silvio_tool_serie_grafico(uuid,text,integer)',
  $re$count\(\*\) AS c FROM orders WHERE company_id = p_company_id GROUP BY 1$re$,
  'count(*) AS c FROM public.commesse_valore_pattuito WHERE company_id = p_company_id GROUP BY 1',
  'count(*) AS c FROM public.commesse_valore_pattuito WHERE company_id');

select pg_temp.correggi_g('public.silvio_tool_identify_dormant_customers(uuid,uuid,integer,integer)',
  $re$FROM public\.orders o\M$re$, 'FROM public.commesse_valore_pattuito o',
  'FROM public.commesse_valore_pattuito o');
select pg_temp.correggi_g('public.silvio_compute_customer_ltv(uuid)',
  $re$FROM public\.orders(\s+WHERE company_id = p_company_id)$re$, $to$FROM public.commesse_valore_pattuito\1$to$,
  'FROM public.commesse_valore_pattuito');

grant execute on function public.commessa_varianti_approvate(uuid) to authenticated;
revoke insert, update, delete, truncate on public.commesse_valore_pattuito from authenticated, service_role;

select pg_temp.correggi_g('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $re$\mFROM orders\M$re$, 'FROM public.commesse_valore_pattuito',
  'FROM public.commesse_valore_pattuito');
select pg_temp.correggi_g('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $re$\mJOIN orders o\M$re$, 'JOIN public.commesse_valore_pattuito o',
  'JOIN public.commesse_valore_pattuito o');
select pg_temp.correggi_g('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $re$public\.normalized_order_due_amount\(\s*(o\.)?total_amount,[^)]*\)$re$,
  $to$coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = \1id), 0)$to$,
  'pg_temp._da_incassare_kpi dk');
select pg_temp.correggi_g('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $re$public\.normalized_order_collected_amount\(\s*(o\.)?total_amount,[^)]*\)$re$,
  $to$coalesce((select ik.i from pg_temp._incassato_kpi ik where ik.order_id = \1id), 0)$to$,
  'pg_temp._incassato_kpi ik');
select pg_temp.correggi('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $re$(\nBEGIN\n  PERFORM public\.assert_company_access\(p_company_id\);\n)$re$,
  $to$\1  -- da incassare e incassato per commessa, con la regola della scheda commessa
  DROP TABLE IF EXISTS pg_temp._da_incassare_kpi;
  CREATE TEMP TABLE _da_incassare_kpi ON COMMIT DROP AS
    SELECT x.order_id, sum(x.residuo) AS r FROM public.rate_da_incassare(p_company_id) x GROUP BY x.order_id;
  DROP TABLE IF EXISTS pg_temp._incassato_kpi;
  CREATE TEMP TABLE _incassato_kpi ON COMMIT DROP AS
    SELECT x.order_id, sum(x.importo) AS i FROM public.rate_incassi(p_company_id) x GROUP BY x.order_id;
$to$,
  'CREATE TEMP TABLE _da_incassare_kpi ON COMMIT DROP AS');
alter function public.get_dashboard_kpis(uuid, timestamp with time zone, timestamp with time zone, uuid) volatile;

select pg_temp.correggi('public.campo_timbratura_correzione_decidi(uuid,boolean,text)',
  $re$(  if c\.stato <> 'in_attesa' then)$re$,
  $to$  -- Le decide l'ufficio, e non la propria (salvo il titolare).
  if not coalesce(public.campo_e_ufficio(c.company_id), false)
     or (c.user_id = v_uid and not coalesce(public.e_amministratore_di(c.company_id), false)) then
    raise exception 'Le correzioni delle timbrature le decide l’ufficio, e non la propria' using errcode = '42501';
  end if;
\1$to$,
  'Le correzioni delle timbrature le decide l’ufficio, e non la propria');

drop policy if exists correzioni_lettura on public.campo_timbrature_correzioni;
create policy correzioni_lettura on public.campo_timbrature_correzioni for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id = (select public.get_my_company_id())
        and (select public.campo_e_ufficio(campo_timbrature_correzioni.company_id))
        and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false)
        and (case when order_id is null then (select public.ufficio_vede_tutte_le_commesse())
                  else public.ufficio_vede_commessa(order_id) end))
  );

select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$where r\.company_id = v_company and r\.stato = 'inviato'$re$,
  $to$where r.company_id = v_company and r.stato = 'inviato' and public.campo_e_ufficio(v_company)$to$,
  $at$r.stato = 'inviato' and public.campo_e_ufficio(v_company)$at$);
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$where c\.company_id = v_company and c\.stato = 'in_attesa'$re$,
  $to$where c.company_id = v_company and c.stato = 'in_attesa' and public.campo_e_ufficio(v_company)$to$,
  $at$c.stato = 'in_attesa' and public.campo_e_ufficio(v_company)$at$);

select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$where coalesce\(oca\.data_inizio, v_giorno\) <= v_giorno and coalesce\(oca\.data_fine_prevista, v_giorno\) >= v_giorno$re$,
  $to$where coalesce(oca.data_inizio, v_giorno) <= v_giorno
         and coalesce(oca.data_fine_prevista, a.work_end_date, v_giorno) >= v_giorno
         and not exists (select 1 from public.employees e2
                          where e2.user_id = oca.user_id and e2.company_id = v_company and not coalesce(e2.is_active, true))$to$,
  'coalesce(oca.data_fine_prevista, a.work_end_date, v_giorno) >= v_giorno');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$(join public\.employees e on e\.id = nullif\(x->>'employee_id', ''\)::uuid and e\.company_id = v_company\s+where r\.company_id = v_company and r\.data_lavoro = v_giorno and r\.stato in \('inviato', 'approvato'\))$re$,
  $to$\1
         and not coalesce(r.lavoro_completato, false) and nullif(btrim(r.firma_cliente_url), '') is null$to$,
  $at$and e.company_id = v_company
       where r.company_id = v_company and r.data_lavoro = v_giorno and r.stato in ('inviato', 'approvato')
         and not coalesce(r.lavoro_completato, false)$at$);

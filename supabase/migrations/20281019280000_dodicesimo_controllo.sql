-- Dodicesimo controllo (19/10/2026).
--
-- Cantiere
--  1. «Ufficio» comprende anche chi lavora per l'azienda con l'accesso multi-azienda (titolare o
--     staff attivo e non scaduto): prima vedeva vuote le approvazioni della seconda azienda.
--  2. Avvisi di rapportini e timbrature: vanno al responsabile della commessa solo se è dell'ufficio
--     (può decidere), altrimenti ai titolari.
--  3. Le proprie timbrature dimenticate non compaiono tra quelle da decidere (salvo al titolare).
--  4. Un rapportino lo approva l'ufficio, e non il proprio (salvo il titolare): come le timbrature.
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

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.campo_e_ufficio(p_company_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles p
                   join public.user_roles ur on ur.user_id = p.id
                  where p.id = auth.uid() and p.company_id = p_company_id
                    and ur.role in ('company_admin', 'company_staff', 'super_admin'))
      -- chi lavora per l'azienda con l'accesso multi-azienda, da titolare o da staff
      or exists (select 1 from public.multi_company_access m
                   join public.profiles p on p.id = m.user_id
                  where m.user_id = auth.uid() and m.company_id = p_company_id
                    and m.access_role in ('company_admin', 'company_staff')
                    and m.status = 'active' and (m.expires_at is null or m.expires_at > now())
                    and not coalesce(p.is_blocked, false))
      or public.has_role(auth.uid(), 'super_admin')
$function$;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.campo_destinatari_ufficio(p_company_id uuid, p_order_id uuid)
returns setof uuid language sql stable security definer set search_path to 'public'
as $function$
  with responsabile as (
    -- il responsabile della commessa, se è dell'ufficio (titolare o staff): può decidere
    select o.assigned_to as id from public.orders o
     join public.profiles p on p.id = o.assigned_to
     where o.id = p_order_id and o.company_id = p_company_id and not coalesce(p.is_blocked, false)
       and (exists (select 1 from public.user_roles ur
                     where ur.user_id = o.assigned_to and ur.role in ('company_admin', 'company_staff')
                       and p.company_id = p_company_id)
            or exists (select 1 from public.multi_company_access m
                        where m.user_id = o.assigned_to and m.company_id = p_company_id
                          and m.access_role in ('company_admin', 'company_staff') and m.status = 'active'
                          and (m.expires_at is null or m.expires_at > now())))
  )
  select id from responsabile
  union
  select p.id from public.profiles p join public.user_roles ur on ur.user_id = p.id
   where not exists (select 1 from responsabile)
     and p.company_id = p_company_id and ur.role = 'company_admin' and not coalesce(p.is_blocked, false)
$function$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$c\.stato = 'in_attesa' and public\.campo_e_ufficio\(v_company\)$re$,
  $to$c.stato = 'in_attesa' and public.campo_e_ufficio(v_company)
        and (c.user_id <> auth.uid() or public.e_amministratore_di(v_company))$to$,
  'and (c.user_id <> auth.uid() or public.e_amministratore_di(v_company))');

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_rapportino_verifica_flusso()',
  $re$(  if v_ufficio then return new; end if;)$re$,
  $to$  -- L'approvazione la dà l'ufficio, e non al proprio rapportino (salvo il titolare). Il servizio
  -- (WhatsApp, Silvio) passa: ha già i suoi controlli.
  if v_ufficio and not coalesce(auth.role() = 'service_role', false)
     and (new.approvato or new.stato = 'approvato')
     and (tg_op = 'INSERT' or new.approvato is distinct from old.approvato or new.stato is distinct from old.stato)
     and (not coalesce(public.campo_e_ufficio(new.company_id), false)
          or (new.user_id = v_uid and not coalesce(public.e_amministratore_di(new.company_id), false))) then
    raise exception 'Il rapportino lo approva l’ufficio, e non il proprio' using errcode = '42501';
  end if;
\1$to$,
  'Il rapportino lo approva l’ufficio, e non il proprio');

-- Economia
--  5. rate_da_incassare: per commessa mai più del totale meno l'incassato (come la scheda). Se il
--     piano supera il contratto, l'eccedenza si toglie dalle rate più lontane.
--  6. Silvio, rate di una commessa: importi, residuo e scaduto dalla regola unica.
--  7. Silvio, rate scadute (anche per le automazioni): dalla regola unica, senza cestino, senza la
--     rata della finanziaria.
--  8. Silvio, quadro incassi: le fatture da incassare senza bozze e annullate; le rate senza data
--     restano nel da incassare (con le future). KPI: persone = dipendenti attivi; incassi solo fino a
--     oggi.
--  9. Cruscotto di casa: incassi attesi, avviso dei crediti scaduti, scadenze e anzianità dei crediti
--     per data della rata (non della commessa), senza la rata della finanziaria tra gli scaduti.
-- 5 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_da_incassare(p_company uuid)
returns table (order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id,
           round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company)),
  incassato as (select x.order_id, sum(x.importo) as i from public.rate_incassi(p_company) x group by x.order_id),
  righe as (
    select r.order_id, r.installment_id, r.expected_date,
           greatest(0, r.importo - coalesce(d.importo_pagato, 0)) as residuo, r.type = 'financing' as finanziamento
      from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
     where not r.is_paid
    union all
    -- La parte del totale che nessuna rata copre (piano senza saldo, o variante dopo il saldo pagato).
    select s.order_id, null::uuid, null::date, s.scoperto, false
      from (select r.order_id, round(o.totale - sum(r.importo), 2) as scoperto
              from r join o on o.id = r.order_id
             group by r.order_id, o.totale) s
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
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.silvio_tool_rate_commessa(p_company_id uuid, p_order_code text default null, p_order_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
DECLARE
  v_order record; v_rate jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_inc numeric := 0; v_res numeric := 0; v_scad numeric := 0; v_scoperto numeric := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT o.id, o.order_code, o.client_name, o.client_company, o.total_amount,
         round(o.total_amount * (1 + coalesce(oo.vat_rate, 22) / 100), 2)
           - case when oo.payment_type = 'financing' then coalesce(oo.financing_cost, 0) else 0 end AS totale_ivato
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
revoke all on function public.silvio_tool_rate_commessa(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.silvio_tool_rate_commessa(uuid, text, uuid) to service_role;

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
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

-- Sostituzione esatta di un pezzo di testo (deve esserci, una volta sola).
create or replace function pg_temp.sostituisci(p_firma text, p_vecchio text, p_nuovo text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuovo in v_def) > 0 then return; end if;
  if position(p_vecchio in v_def) = 0 then
    raise exception 'Testo non trovato in %: %', p_firma, left(p_vecchio, 80);
  end if;
  execute replace(v_def, p_vecchio, p_nuovo);
end $$;

select pg_temp.correggi_g('public.silvio_tool_overdue_payments(uuid)',
  $re$SELECT COUNT\(\*\) INTO v_orders_count FROM public\.orders WHERE company_id = p_company_id;\s+WITH overdue AS \([\s\S]*?\), ranked AS \($re$,
  $to$SELECT COUNT(*) INTO v_orders_count FROM public.orders WHERE company_id = p_company_id AND deleted_at IS NULL;
  -- Rate scadute con la regola della scheda commessa: residuo vero, niente cestino, niente finanziaria.
  WITH ri AS MATERIALIZED (SELECT * FROM public.rate_importi(p_company_id)),
  d AS MATERIALIZED (SELECT * FROM public.rate_da_incassare(p_company_id)),
  overdue AS (
    SELECT o.order_code,
           coalesce(nullif(btrim(o.client_name), ''), nullif(btrim(o.client_company), ''), 'Cliente') AS cliente,
           coalesce(ri.type, 'non_pianificato') AS tipo,
           CASE ri.type WHEN 'deposit' THEN 'Acconto' WHEN 'balance' THEN 'Saldo' ELSE 'Rata' END AS label,
           d.residuo AS importo_eur, d.expected_date AS data_attesa, (CURRENT_DATE - d.expected_date) AS giorni_ritardo
      FROM d
      JOIN public.orders o ON o.id = d.order_id
      LEFT JOIN ri ON ri.installment_id = d.installment_id
     WHERE d.expected_date IS NOT NULL AND d.expected_date < CURRENT_DATE AND d.residuo > 0 AND NOT d.finanziamento
  ), ranked AS ($to$,
  'Rate scadute con la regola della scheda commessa: residuo vero');
select pg_temp.correggi_g('public.silvio_tool_overdue_payments(uuid)',
  $re$'fonte_rate', 'order_installments \+ legacy solo dove mancano'$re$,
  $to$'fonte_rate', 'regola della scheda commessa (rate_da_incassare)'$to$,
  'regola della scheda commessa (rate_da_incassare)');

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.silvio_tool_quadro_incassi(uuid,integer)',
  $v$     AND tipo IN ('fattura','fattura_pa','fattura_riepilogativa');$v$,
  $n$     AND tipo IN ('fattura','fattura_pa','fattura_riepilogativa')
     AND stato NOT IN ('bozza', 'annullata');$n$);
select pg_temp.sostituisci('public.silvio_tool_quadro_incassi(uuid,integer)',
  $v$  SELECT COALESCE(sum(residuo) FILTER (WHERE expected_date >= CURRENT_DATE), 0),
         COALESCE(sum(residuo) FILTER (WHERE expected_date < CURRENT_DATE AND NOT finanziamento), 0)
    INTO v_rate_future, v_rate_scadute
    FROM public.rate_da_incassare(p_company_id)
   WHERE expected_date IS NOT NULL;$v$,
  $n$  -- le rate senza data (e la parte non pianificata) restano nel da incassare, con le future
  SELECT COALESCE(sum(residuo) FILTER (WHERE expected_date >= CURRENT_DATE OR expected_date IS NULL
                                              OR (expected_date < CURRENT_DATE AND finanziamento)), 0),
         COALESCE(sum(residuo) FILTER (WHERE expected_date < CURRENT_DATE AND NOT finanziamento), 0)
    INTO v_rate_future, v_rate_scadute
    FROM public.rate_da_incassare(p_company_id);$n$);
select pg_temp.sostituisci('public.silvio_tool_quadro_incassi(uuid,integer)',
  $v$'rate_commesse_future_eur', round(v_rate_future,2),$v$,
  $n$'rate_commesse_future_eur', round(v_rate_future,2),
      'nota_rate', 'Le future comprendono le rate senza data e la parte del contratto non ancora pianificata.',$n$);

select pg_temp.sostituisci('public.silvio_tool_company_kpi(uuid)',
  $v$  SELECT count(*) INTO v_employees
    FROM public.profiles WHERE company_id = p_company_id;$v$,
  $n$  -- persone che lavorano per l'azienda (non i clienti)
  SELECT count(*) INTO v_employees
    FROM public.employees WHERE company_id = p_company_id AND coalesce(is_active, true);$n$);
select pg_temp.sostituisci('public.silvio_tool_company_kpi(uuid)',
  $v$FROM public.rate_incassi(p_company_id) WHERE data >= v_anno;$v$,
  $n$FROM public.rate_incassi(p_company_id) WHERE data >= v_anno AND data <= CURRENT_DATE;$n$);

-- 9 ────────────────────────────────────────────────────────────────────────────────────────
-- Una tabella di lavoro in più: le rate da incassare una per una, con la loro data.
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  CREATE TEMP TABLE _da_incassare_kpi ON COMMIT DROP AS
    SELECT x.order_id, sum(x.residuo) AS r FROM public.rate_da_incassare(p_company_id) x GROUP BY x.order_id;$v$,
  $n$  DROP TABLE IF EXISTS pg_temp._rate_kpi;
  CREATE TEMP TABLE _rate_kpi ON COMMIT DROP AS
    SELECT x.order_id, x.expected_date, x.residuo, x.finanziamento
      FROM public.rate_da_incassare(p_company_id) x WHERE x.residuo > 0;
  CREATE TEMP TABLE _da_incassare_kpi ON COMMIT DROP AS
    SELECT x.order_id, sum(x.residuo) AS r FROM pg_temp._rate_kpi x GROUP BY x.order_id;$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  SELECT COALESCE(SUM(coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = id), 0)), 0) INTO v_forecast_in
  FROM public.commesse_valore_pattuito
  WHERE company_id = p_company_id
    AND expected_date IS NOT NULL
    AND expected_date BETWEEN v_now::date AND v_forecast_end::date
    AND coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = id), 0) > 0;$v$,
  $n$  -- incassi attesi: le rate con la data nei prossimi giorni
  SELECT COALESCE(SUM(rk.residuo), 0) INTO v_forecast_in
    FROM pg_temp._rate_kpi rk
   WHERE rk.expected_date BETWEEN v_now::date AND v_forecast_end::date;$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$             (SELECT COALESCE(SUM(coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = id), 0)), 0) FROM public.commesse_valore_pattuito
              WHERE company_id = p_company_id
                AND expected_date < v_now::date
                AND coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = id), 0) > 0), 'FM999G999G990D00 €'$v$,
  $n$             (SELECT COALESCE(SUM(rk.residuo), 0) FROM pg_temp._rate_kpi rk
              WHERE rk.expected_date < v_now::date AND NOT rk.finanziamento), 'FM999G999G990D00 €'$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$      SELECT 1 FROM public.commesse_valore_pattuito
      WHERE company_id = p_company_id
        AND expected_date < v_now::date
        AND coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = id), 0) > 1000$v$,
  $n$      SELECT 1 FROM pg_temp._rate_kpi rk
      WHERE rk.expected_date < v_now::date AND NOT rk.finanziamento
      HAVING SUM(rk.residuo) > 1000$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$          coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = o.id), 0) AS amount,
          o.expected_date::text                  AS "expectedDate",
          GREATEST(0, (o.expected_date - v_now::date))::int AS "daysLeft"
        FROM public.commesse_valore_pattuito o
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = p_company_id
          AND o.expected_date IS NOT NULL
          AND o.expected_date BETWEEN v_now::date AND v_forecast_end::date
          AND coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = o.id), 0) > 0
        ORDER BY o.expected_date ASC$v$,
  $n$          rk.residuo                             AS amount,
          rk.expected_date::text                 AS "expectedDate",
          GREATEST(0, (rk.expected_date - v_now::date))::int AS "daysLeft"
        FROM pg_temp._rate_kpi rk
        JOIN public.commesse_valore_pattuito o ON o.id = rk.order_id
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE rk.expected_date BETWEEN v_now::date AND v_forecast_end::date
        ORDER BY rk.expected_date ASC$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$    SELECT expected_date, coalesce((select dk.r from pg_temp._da_incassare_kpi dk where dk.order_id = id), 0) AS due_amount
    FROM public.commesse_valore_pattuito
    WHERE company_id = p_company_id
  ) normalized_orders$v$,
  $n$    -- per data della rata; la rata della finanziaria non è un credito scaduto
    SELECT rk.expected_date, rk.residuo AS due_amount
      FROM pg_temp._rate_kpi rk
     WHERE NOT (rk.finanziamento AND rk.expected_date < v_now::date)
  ) normalized_orders$n$);

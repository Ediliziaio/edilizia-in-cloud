-- Tredicesimo controllo (19/10/2026).
--
-- Cantiere e magazzino
--  1. Bolle e merce presa dal cantiere: le registra (costo, rimborso) chi può modificare le commesse
--     e vede quella commessa; le legge chi vede le commesse, anche con l'accesso multi-azienda.
--  2. Conferma di un carico DDT: serve il permesso di modificare il magazzino (il servizio WhatsApp
--     lascia in bozza i carichi degli operai e li conferma l'ufficio).
--  3. Avvisi di approvazione: mai solo all'autore della richiesta. Il responsabile della commessa
--     li riceve se può decidere, altrimenti vanno ai titolari.
--  4. Il proprio rapportino non si approva e non si rimanda indietro (salvo il titolare); in Attività
--     non compare tra quelli da decidere.
--  5. In Attività niente richieste di commesse nel cestino; le bolle solo a chi può registrarle.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

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

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.campo_acquisto_verifica(uuid,text,numeric,uuid,text)',
  $v$  if v_uid is null or not public.campo_e_ufficio(a.company_id) then$v$,
  $n$  if v_uid is null or not public.campo_e_ufficio(a.company_id)
     or not coalesce(public.has_permission_for_company(v_uid, 'can_edit_orders', a.company_id), false)
     or not coalesce(case when a.order_id is null then public.ufficio_vede_tutte_le_commesse()
                          else public.ufficio_vede_commessa(a.order_id) end, false) then$n$);

drop policy if exists campo_acquisti_lettura on public.campo_acquisti;
create policy campo_acquisti_lettura on public.campo_acquisti for select to authenticated
using (
  user_id = (select auth.uid())
  or (company_id = (select public.get_my_company_id())
      and (public.e_amministratore_di(company_id)
           or (public.campo_e_ufficio(company_id)
               and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false)
               and coalesce(case when order_id is null then public.ufficio_vede_tutte_le_commesse()
                                 else public.ufficio_vede_commessa(order_id) end, false))))
);

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.conferma_carico_ddt(uuid,uuid)',
  $v$  if auth.uid() is not null and not public.user_can_access_company(v_c.company_id) then$v$,
  $n$  if auth.uid() is not null and (not public.user_can_access_company(v_c.company_id)
       or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_c.company_id), false)) then$n$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.campo_destinatari_ufficio(uuid, uuid);
create or replace function public.campo_destinatari_ufficio(p_company_id uuid, p_order_id uuid, p_autore uuid default null)
returns setof uuid language sql stable security definer set search_path to 'public'
as $function$
  with responsabile as (
    -- il responsabile della commessa, se può decidere e non è lui ad aver chiesto
    select o.assigned_to as id from public.orders o
     join public.profiles p on p.id = o.assigned_to
     where o.id = p_order_id and o.company_id = p_company_id and not coalesce(p.is_blocked, false)
       and o.assigned_to is distinct from p_autore
       and coalesce(public.has_permission_for_company(o.assigned_to, 'can_edit_orders', p_company_id), false)
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
     and p.id is distinct from p_autore
$function$;
revoke all on function public.campo_destinatari_ufficio(uuid, uuid, uuid) from public, anon, authenticated;

select pg_temp.sostituisci('public.campo_rapportino_avvisa_ufficio()',
  $v$public.campo_destinatari_ufficio(new.company_id, new.order_id)$v$,
  $n$public.campo_destinatari_ufficio(new.company_id, new.order_id, new.user_id)$n$);
select pg_temp.sostituisci('public.campo_timbratura_correzione_chiedi(uuid,text,timestamp with time zone,text)',
  $v$public.campo_destinatari_ufficio(v_company, p_order_id)$v$,
  $n$public.campo_destinatari_ufficio(v_company, p_order_id, v_uid)$n$);

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.campo_rapportino_verifica_flusso()',
  $v$     and (new.approvato or new.stato = 'approvato')$v$,
  $n$     and (new.approvato or new.stato = 'approvato'
          or (tg_op = 'UPDATE' and old.stato = 'inviato' and new.stato = 'rifiutato'))$n$);
select pg_temp.sostituisci('public.campo_rapportino_verifica_flusso()',
  $v$'Il rapportino lo approva l’ufficio, e non il proprio'$v$,
  $n$'Il rapportino lo approva o lo rimanda indietro l’ufficio, e non il proprio'$n$);

-- 4 e 5 ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.ufficio_da_approvare()',
  $v$r.stato = 'inviato' and public.campo_e_ufficio(v_company)$v$,
  $n$r.stato = 'inviato' and public.campo_e_ufficio(v_company) and o.deleted_at is null
        and (r.user_id <> auth.uid() or public.e_amministratore_di(v_company))$n$);
select pg_temp.sostituisci('public.ufficio_da_approvare()',
  $v$c.stato = 'in_attesa' and public.campo_e_ufficio(v_company)$v$,
  $n$c.stato = 'in_attesa' and public.campo_e_ufficio(v_company) and (o.id is null or o.deleted_at is null)$n$);
select pg_temp.sostituisci('public.ufficio_da_approvare()',
  $v$        and public.campo_e_ufficio(v_company)
        and (case when ca.order_id$v$,
  $n$        and public.campo_e_ufficio(v_company) and (o.id is null or o.deleted_at is null)
        and coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
        and (case when ca.order_id$n$);

-- Numeri
--  6. rate_da_incassare: anche le commesse senza alcuna rata devono il loro totale (prima risultavano
--     a zero nel database, mentre elenco e scheda le mostravano da incassare).
--  7. Cruscotto aziendale: le rate da incassare dal database (anche piani storici e tetto sul totale).
--  8. Cruscotto di casa: anzianità dei crediti con la colonna «senza data» e periodi che non si
--     sovrappongono; scadenze dei 30 giorni tutte, non le prime dieci; costi IVA inclusa come gli
--     incassi; incassi reali del mese dalle rate incassate e dalle fatture senza rata; importi degli
--     avvisi con la virgola dei decimali.
-- 6 ────────────────────────────────────────────────────────────────────────────────────────
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
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.cruscotto_rate_da_incassare(p_company_id uuid)
returns table (id text, order_id uuid, amount numeric, expected_date date, finanziamento boolean)
language plpgsql stable security definer set search_path = public
as $function$
begin
  perform public.assert_company_access(p_company_id);
  if not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false) then
    raise exception 'Non puoi vedere gli incassi di questa azienda' using errcode = '42501';
  end if;
  return query
    select coalesce(x.installment_id::text, 'non-pianificato-' || x.order_id::text), x.order_id, x.residuo,
           x.expected_date, x.finanziamento
      from public.rate_da_incassare(p_company_id) x
     where x.residuo > 0;
end
$function$;
revoke all on function public.cruscotto_rate_da_incassare(uuid) from public, anon;
grant execute on function public.cruscotto_rate_da_incassare(uuid) to authenticated, service_role;

-- 8 ────────────────────────────────────────────────────────────────────────────────────────
-- Gli incassi uno per uno (rate incassate, per data), accanto a quelli per commessa.
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  CREATE TEMP TABLE _incassato_kpi ON COMMIT DROP AS
    SELECT x.order_id, sum(x.importo) AS i FROM public.rate_incassi(p_company_id) x GROUP BY x.order_id;$v$,
  $n$  DROP TABLE IF EXISTS pg_temp._incassi_kpi;
  CREATE TEMP TABLE _incassi_kpi ON COMMIT DROP AS
    SELECT x.order_id, x.data, x.importo FROM public.rate_incassi(p_company_id) x;
  CREATE TEMP TABLE _incassato_kpi ON COMMIT DROP AS
    SELECT x.order_id, sum(x.importo) AS i FROM pg_temp._incassi_kpi x GROUP BY x.order_id;$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  v_has_invoice_payments := EXISTS(
    SELECT 1 FROM invoice_payments WHERE company_id = p_company_id LIMIT 1
  );$v$,
  $n$  -- incassi registrati: rate incassate o fatture senza rata
  v_has_invoice_payments := EXISTS(SELECT 1 FROM pg_temp._incassi_kpi)
    OR coalesce(public.incassi_fatture_senza_rata(p_company_id, date '2000-01-01'), 0) > 0;$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  SELECT COALESCE(SUM(amount), 0) INTO v_real_income
  FROM invoice_payments
  WHERE company_id = p_company_id
    AND payment_date BETWEEN v_month_start::date AND (v_month_end - INTERVAL '1 day')::date;$v$,
  $n$  -- incassi del mese: rate incassate (con le fatture collegate) e fatture senza rata, per data
  SELECT COALESCE(SUM(x.importo), 0) INTO v_real_income
    FROM pg_temp._incassi_kpi x
   WHERE x.data >= v_month_start::date AND x.data < v_month_end::date;
  v_real_income := v_real_income + coalesce(public.incassi_fatture_senza_rata(p_company_id, v_month_start::date), 0);$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$      COALESCE((SELECT SUM(amount) FROM invoice_payments
                WHERE company_id = p_company_id AND date_trunc('month', payment_date::timestamptz) = m.month), 0) AS "realEntrate",$v$,
  $n$      COALESCE((SELECT SUM(x.importo) FROM pg_temp._incassi_kpi x
                WHERE date_trunc('month', x.data::timestamptz) = m.month), 0)
        + coalesce(public.incassi_fatture_senza_rata(p_company_id, m.month::date), 0)
        - coalesce(public.incassi_fatture_senza_rata(p_company_id, (m.month + interval '1 month')::date), 0) AS "realEntrate",$n$);
-- I costi IVA inclusa, come gli incassi (dopo le sostituzioni sopra restano solo i costi).
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$SUM(amount)$v$,
  $n$ROUND(SUM(amount * (1 + coalesce(vat_rate, 0) / 100)), 2)$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$        SELECT
          name,
          amount,
          due_date::text$v$,
  $n$        SELECT
          name,
          round(amount * (1 + coalesce(vat_rate, 0) / 100), 2) AS amount,
          due_date::text$n$);
-- Scadenze dei prossimi 30 giorni: tutte (il calendario ne fa il totale).
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$        ORDER BY rk.expected_date ASC
        LIMIT 10$v$,
  $n$        ORDER BY rk.expected_date ASC
        LIMIT 300$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$        ORDER BY due_date ASC
        LIMIT 10$v$,
  $n$        ORDER BY due_date ASC
        LIMIT 300$n$);
-- Avvisi: 1.234,56 €
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$to_char(v_real_income - v_real_outflow, 'FM999G999G990D00 €')$v$,
  $n$translate(to_char(v_real_income - v_real_outflow, 'FM999,999,990.00'), ',.', '.,') || ' €'$n$);
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$           'Crediti scaduti per ' || to_char(
             (SELECT COALESCE(SUM(rk.residuo), 0) FROM pg_temp._rate_kpi rk
              WHERE rk.expected_date < v_now::date AND NOT rk.finanziamento), 'FM999G999G990D00 €'
           ) AS message$v$,
  $n$           'Crediti scaduti per ' || translate(to_char(
             (SELECT COALESCE(SUM(rk.residuo), 0) FROM pg_temp._rate_kpi rk
              WHERE rk.expected_date < v_now::date AND NOT rk.finanziamento), 'FM999,999,990.00'
           ), ',.', '.,') || ' €' AS message$n$);
-- Anzianità dei crediti: periodi senza sovrapposizioni e la colonna delle rate senza data.
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$    'thisWeek',  COALESCE(SUM(CASE WHEN expected_date BETWEEN v_now::date AND v_week_end::date THEN due_amount ELSE 0 END),0),
    'thisMonth', COALESCE(SUM(CASE WHEN expected_date BETWEEN v_week_end::date AND v_month_end::date THEN due_amount ELSE 0 END),0),
    'future',    COALESCE(SUM(CASE WHEN expected_date > v_month_end::date THEN due_amount ELSE 0 END),0)$v$,
  $n$    'thisWeek',  COALESCE(SUM(CASE WHEN expected_date >= v_now::date AND expected_date <= v_week_end::date
                                     AND expected_date < v_month_end::date THEN due_amount ELSE 0 END),0),
    'thisMonth', COALESCE(SUM(CASE WHEN expected_date > v_week_end::date AND expected_date < v_month_end::date THEN due_amount ELSE 0 END),0),
    'future',    COALESCE(SUM(CASE WHEN expected_date >= v_month_end::date THEN due_amount ELSE 0 END),0),
    'undated',   COALESCE(SUM(CASE WHEN expected_date IS NULL THEN due_amount ELSE 0 END),0)$n$);

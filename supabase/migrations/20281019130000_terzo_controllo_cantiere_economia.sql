-- Terzo controllo di cantiere ed economia (19/10/2026).
--
-- Cantiere e ufficio
--  1. «Solo le commesse assegnate»: Cantieri oggi, Da approvare, fasi dell'ufficio e correzioni
--     seguono la stessa regola dell'elenco commesse (responsabile, squadra di campo, dipendenti,
--     commerciale), non solo «responsabile». Prima chi stava nella squadra vedeva la commessa ma
--     non i suoi rapportini; e leggeva le correzioni anche delle commesse che non segue.
--  2. Lavoro sul cantiere anche per le ditte arrivate da una squadra esterna o da un contratto
--     di subappalto attivo: possono timbrare e segnare la merce, come l'app già mostra.
--  3. Ore di un rapportino senza presenze: quelle dell'autore anche se non ha la scheda
--     dipendente («Da approvare» e avviso dicevano 0, la commessa le contava).
--  4. Correzione di timbratura: il doppione si cerca sullo stesso cantiere.
--  5. Promemoria con «lo compila il capo»: anche dove la commessa non ha un capocantiere, e alle ditte.
-- Economia
--  6. Rate da incassare con la regola della scheda commessa: il saldo è il residuo (contratto più
--     varianti, IVA inclusa, meno le altre rate), la rata della finanziaria non è un credito
--     verso il cliente, l'incassato parziale sulla fattura si toglie. Lo usano «Crediti scaduti»
--     e «Cassa a 30 giorni».
--  7. Commessa aperta = non nella fase finale del flusso né in assistenza, come in Commesse.
--     Lo usano «Ordini aperti» e l'avviso «margine basso».
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
create or replace function public.ufficio_vede_commessa(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and (public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
            or exists (select 1 from public.order_campo_assignments a where a.order_id = o.id and a.user_id = auth.uid())
            or public.order_has_employee_for_user(o.id, auth.uid())
            or public.order_has_salesperson_for_user(o.id, auth.uid())))
$$;
revoke all on function public.ufficio_vede_commessa(uuid) from public, anon;
grant execute on function public.ufficio_vede_commessa(uuid) to authenticated;

select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)$re$,
  $to$public.ufficio_vede_commessa(o.id)$to$, 'public.ufficio_vede_commessa(o.id)');
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)$re$,
  $to$public.ufficio_vede_commessa(o.id)$to$, 'public.ufficio_vede_commessa(o.id)');
select pg_temp.correggi('public.campo_timbratura_correzione_decidi(uuid,boolean,text)',
  $re$public\.can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)$re$,
  $to$public.ufficio_vede_commessa(o.id)$to$, 'public.ufficio_vede_commessa(o.id)');

drop policy if exists fasi_ufficio_visibili_in_commessa on public.tasks;
create policy fasi_ufficio_visibili_in_commessa on public.tasks for select to authenticated
  using (activity_scope = 'ufficio' and order_id is not null
         and company_id = (select public.get_my_company_id())
         and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false)
         and public.ufficio_vede_commessa(order_id));

drop policy if exists correzioni_lettura on public.campo_timbrature_correzioni;
create policy correzioni_lettura on public.campo_timbrature_correzioni for select to authenticated
  using (user_id = (select auth.uid())
         or (company_id = (select public.get_my_company_id())
             and ((select public.campo_e_ufficio(campo_timbrature_correzioni.company_id))
                  or coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id), false))
             and (order_id is null or public.ufficio_vede_commessa(order_id))));

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.campo_lavoro_su_commessa(p_order_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.user_assigned_to_order(p_order_id)
      or exists (select 1 from public.order_employees oe
                   join public.employees e on e.id = oe.employee_id
                  where oe.order_id = p_order_id and e.user_id = auth.uid())
      or exists (select 1 from public.squadre_commesse sc
                  where sc.order_id = p_order_id and sc.squadra_id in (select public.campo_mie_squadre()))
      or exists (select 1 from public.subappaltatori_sicurezza ss
                   join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
                  where ss.order_id = p_order_id and s.user_id = auth.uid())
      -- ditta con un contratto di subappalto attivo su questa commessa
      or exists (select 1 from public.contratti_subappalto cs
                   join public.subappaltatori_sicurezza ss on ss.id = cs.subappaltatore_id
                   join public.subappaltatori s on s.id = ss.campo_subappaltatore_id
                  where cs.order_id = p_order_id and cs.stato = 'attivo' and s.user_id = auth.uid())
      -- ditta assegnata come squadra esterna
      or exists (select 1 from public.order_external_teams oet
                   join public.external_teams t on t.id = oet.external_team_id
                   join public.subappaltatori s on s.id = t.subappaltatore_id
                  where oet.order_id = p_order_id and s.user_id = auth.uid())
$$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$\(select coalesce\(sum\(coalesce\(\(x->>'ore'\)::numeric, 0\)\), 0\) from jsonb_array_elements\(public\.campo_presenze_effettive\(r\)\) x where x->>'employee_id' is not null\)$re$,
  $to$(case when jsonb_typeof(r.presenze) = 'array' and jsonb_array_length(r.presenze) > 0
               then (select coalesce(sum(coalesce((x->>'ore')::numeric, 0)), 0) from jsonb_array_elements(r.presenze) x where x->>'employee_id' is not null)
               else coalesce(r.ore_lavorate, 0) + coalesce(r.ore_straordinario, 0) end)$to$,
  'jsonb_array_elements(r.presenze) x where x->>''employee_id'' is not null)');
select pg_temp.correggi('public.campo_rapportino_avvisa_ufficio()',
  $re$v_ore := coalesce\(\(select sum\(coalesce\(\(x->>'ore'\)::numeric, 0\)\) from jsonb_array_elements\(public\.campo_presenze_effettive\(new\)\) x where x->>'employee_id' is not null\), 0\);$re$,
  $to$v_ore := case when jsonb_typeof(new.presenze) = 'array' and jsonb_array_length(new.presenze) > 0
               then coalesce((select sum(coalesce((x->>'ore')::numeric, 0)) from jsonb_array_elements(new.presenze) x where x->>'employee_id' is not null), 0)
               else coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0) end;$to$,
  'jsonb_array_elements(new.presenze) x where x->>''employee_id'' is not null), 0)');

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_timbratura_correzione_decidi(uuid,boolean,text)',
  $re$where t\.user_id = c\.user_id and t\.company_id = c\.company_id and t\.tipo = c\.tipo$re$,
  $to$where t.user_id = c.user_id and t.company_id = c.company_id and t.tipo = c.tipo
       and t.order_id is not distinct from c.order_id$to$,
  'and t.order_id is not distinct from c.order_id');

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_promemoria(text)',
  $re$OR EXISTS \(SELECT 1 FROM public\.order_campo_assignments oca\s*WHERE oca\.user_id = t\.user_id AND oca\.order_id = t\.order_id AND oca\.is_capocantiere\)\)$re$,
  $to$OR EXISTS (SELECT 1 FROM public.order_campo_assignments oca
                         WHERE oca.user_id = t.user_id AND oca.order_id = t.order_id
                           AND (oca.is_capocantiere OR oca.role_type = 'subcontractor'))
             OR NOT EXISTS (SELECT 1 FROM public.order_campo_assignments oc2
                             WHERE oc2.order_id = t.order_id AND oc2.is_capocantiere))$to$,
  'OR NOT EXISTS (SELECT 1 FROM public.order_campo_assignments oc2');

-- 6 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.rate_da_incassare(p_company uuid)
returns table (order_id uuid, installment_id uuid, expected_date date, residuo numeric)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva, o.payment_type,
           coalesce(o.financing_cost, 0) fc,
           coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                      where v.order_id = o.id and v.status = 'approvato'), 0) var
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (
    select i.*, (i.type = 'balance' and i.id = (
             select j.id from public.order_installments j
              where j.order_id = i.order_id and j.type = 'balance'
              order by j.position desc nulls last, j.id desc limit 1)) as finale
      from public.order_installments i join o on o.id = i.order_id
  )
  select r.order_id, r.id, r.expected_date,
         greatest(0, round(case when r.finale
                 then (o.tot + o.var) * (1 + o.iva / 100)
                      - coalesce((select sum(coalesce(x.amount, 0)) from r x where x.order_id = r.order_id and not x.finale), 0)
                      - case when o.payment_type = 'financing' then o.fc else 0 end
                 else coalesce(r.amount, 0) end, 2)
           - coalesce((select d.importo_pagato from public.documenti_fiscali d where d.id = r.documento_fiscale_id), 0))
    from r join o on o.id = r.order_id
   where not coalesce(r.is_paid, false) and coalesce(r.type, '') <> 'financing'
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$ELSIF p_metric_id = 'overdue_receivables' THEN[\s\S]*?(\s*-- ═══ ORDINI \(storico\) ═══)$re$,
  $to$ELSIF p_metric_id = 'overdue_receivables' THEN
    -- Rate scadute da incassare, con la regola della scheda commessa (public.rate_da_incassare).
    IF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               COALESCE(SUM(x.residuo), 0) AS value
        FROM public.rate_da_incassare(v_company_id) x
        JOIN public.orders o ON o.id = x.order_id
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE x.expected_date < CURRENT_DATE AND x.residuo > 0
        GROUP BY o.customer_id, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSE
      SELECT COALESCE(SUM(x.residuo), 0) INTO v_value
        FROM public.rate_da_incassare(v_company_id) x
       WHERE x.expected_date < CURRENT_DATE;
    END IF;

  ELSIF p_metric_id = 'cashflow_forecast_30d' THEN
    -- Rate da incassare nei prossimi 30 giorni meno i costi da pagare, tutto IVA inclusa.
    SELECT
      COALESCE((SELECT SUM(x.residuo) FROM public.rate_da_incassare(v_company_id) x
                 WHERE x.expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0)
      -
      COALESCE((SELECT round(SUM(amount * (1 + COALESCE(vat_rate, 0) / 100)), 2) FROM company_costs
                WHERE company_id = v_company_id AND is_paid = false
                  AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0)
    INTO v_value;
\1$to$,
  'Rate scadute da incassare, con la regola della scheda commessa');

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.commessa_aperta(p_company uuid, p_status_id uuid, p_status text, p_fulfillment text)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when p_status_id is not null and exists (select 1 from public.order_statuses s where s.id = p_status_id) then
      not coalesce((select s.is_support_phase from public.order_statuses s where s.id = p_status_id), false)
      and p_status_id is distinct from (
        select s.id from public.order_statuses s
         where s.company_id = p_company and not coalesce(s.is_support_phase, false)
         order by s.position desc nulls last, s.id desc limit 1)
    else coalesce(p_status, '') not in ('annullato', 'cancelled', 'canceled', 'completato')
         and coalesce(p_fulfillment, '') <> 'completed'
  end
$$;
revoke all on function public.commessa_aperta(uuid, uuid, text, text) from public, anon;
grant execute on function public.commessa_aperta(uuid, uuid, text, text) to authenticated;

select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$LEFT JOIN order_statuses os ON os\.id = o\.current_status_id\s*WHERE o\.company_id = v_company_id\s*AND COALESCE\(lower\(os\.name\), ''\) NOT IN \('completato','chiuso','consegnato','annullato'\);$re$,
  $to$WHERE o.company_id = v_company_id
      AND public.commessa_aperta(o.company_id, o.current_status_id, o.status, o.fulfillment_status);$to$,
  'AND public.commessa_aperta(o.company_id, o.current_status_id, o.status, o.fulfillment_status);');
select pg_temp.correggi('public.get_cantieri_margine_basso(uuid,numeric)',
  $re$and coalesce\(o\.status, ''\) not in \('completato', 'chiuso', 'annullato', 'completed', 'cancelled', 'bozza'\)$re$,
  $to$and coalesce(o.status, '') <> 'bozza'
     and public.commessa_aperta(o.company_id, o.current_status_id, o.status, o.fulfillment_status)$to$,
  'and public.commessa_aperta(o.company_id, o.current_status_id, o.status, o.fulfillment_status)');

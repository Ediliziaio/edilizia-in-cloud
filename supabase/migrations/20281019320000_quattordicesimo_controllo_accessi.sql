-- Quattordicesimo controllo: accessi (19/10/2026).
--
-- Prima:
--  1. silvio_cashflow_forecast_90d e silvio_payment_delay_pattern erano eseguibili da ogni utente
--     autenticato dell'azienda: l'operaio e il cliente esterno (con portale attivo) leggevano saldo in
--     banca, previsione di cassa e ritardi di pagamento di tutti i clienti per nome.
--  2. get_dashboard_kpis: stesso controllo (solo l'accesso all'azienda): operaio e cliente esterno
--     leggevano i numeri della home dell'azienda.
--  3. order_installments: la policy FOR ALL «Users can manage installments for their company orders»
--     lasciava modificare e cancellare le rate a chiunque abbia il profilo nell'azienda e veda la
--     commessa: l'operaio sulle commesse assegnate, il cliente sulle proprie (importo, «pagata»).
-- Provato in transazioni annullate (prima/dopo) con titolare, staff con permessi, staff senza,
-- operaio, cliente esterno con portale acceso, staff in multi-azienda.
-- Devono continuare a funzionare: Silvio (service role), la home per chi ha can_view_dashboard,
-- il titolare e lo staff con can_edit_orders o can_manage_payments sulle rate, il cliente che LEGGE le proprie rate
-- (customer_view_own_installments), il commercialista in lettura, il super admin.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.silvio_cashflow_forecast_90d(uuid, integer, boolean) from authenticated;
revoke execute on function public.silvio_payment_delay_pattern(uuid) from authenticated;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
do $m$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)'::regprocedure);
  if position('can_view_dashboard' in v_def) = 0 then
    if position(E'  PERFORM public.assert_company_access(p_company_id);\n' in v_def) = 0 then
      raise exception 'get_dashboard_kpis: punto di aggancio non trovato';
    end if;
    execute replace(v_def, E'  PERFORM public.assert_company_access(p_company_id);\n',
      E'  PERFORM public.assert_company_access(p_company_id);\n'
      || E'  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_permission_for_company(auth.uid(), ''can_view_dashboard'', p_company_id), false) THEN\n'
      || E'    RAISE EXCEPTION ''Non puoi vedere il cruscotto di questa azienda'' USING ERRCODE = ''42501'';\n'
      || E'  END IF;\n');
  end if;
end $m$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "Users can manage installments for their company orders" on public.order_installments;
drop policy if exists rate_lettura_azienda on public.order_installments;
create policy rate_lettura_azienda on public.order_installments for select to authenticated
using (
  not (select public.utente_e_cliente_esterno())
  and exists (select 1 from public.orders o
               where o.id = order_installments.order_id
                 and public.user_can_access_company(o.company_id))
);
drop policy if exists rate_scrittura_azienda on public.order_installments;
create policy rate_scrittura_azienda on public.order_installments for all to authenticated
using (
  exists (select 1 from public.orders o
           where o.id = order_installments.order_id
             and (coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id), false)
                  -- chi registra incassi e abbina fatture (fatturazione, banca) segna le rate pagate
                  or coalesce(public.has_permission_for_company((select auth.uid()), 'can_manage_payments', o.company_id), false)))
)
with check (
  exists (select 1 from public.orders o
           where o.id = order_installments.order_id
             and (coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id), false)
                  -- chi registra incassi e abbina fatture (fatturazione, banca) segna le rate pagate
                  or coalesce(public.has_permission_for_company((select auth.uid()), 'can_manage_payments', o.company_id), false)))
);

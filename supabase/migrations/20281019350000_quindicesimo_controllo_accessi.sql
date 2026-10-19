-- Quindicesimo controllo: accessi (19/10/2026).
--
--  1. Riepilogo per il titolare, simulazione e quadro incassi di Silvio: solo service role (Silvio).
--     Dal browser un operaio leggeva per questa via saldo in banca e cassa delle prossime settimane.
--  2. Staccare una fattura da una rata: come collegarla (commesse, pagamenti o fatturazione).
--  3. Conferma di un carico DDT da WhatsApp: il permesso del magazzino si guarda sulla persona che
--     conferma anche quando chiama il servizio.
--  4. Il commercialista legge home, cruscotto e incassi delle aziende che segue (prima: errore).
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
revoke execute on function public.silvio_executive_report(uuid) from public, anon, authenticated;
revoke execute on function public.silvio_tool_simula_scenario(uuid, text, integer, jsonb) from public, anon, authenticated;
revoke execute on function public.silvio_tool_quadro_incassi(uuid, integer) from public, anon, authenticated;
grant execute on function public.silvio_executive_report(uuid) to service_role;
grant execute on function public.silvio_tool_simula_scenario(uuid, text, integer, jsonb) to service_role;
grant execute on function public.silvio_tool_quadro_incassi(uuid, integer) to service_role;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.scollega_rata_fattura(uuid)',
  $v$  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  UPDATE$v$,
  $n$  IF public.user_can_access_company(v_company) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- come per collegarla: chi modifica le commesse, gestisce i pagamenti o fa le fatture
  IF auth.uid() IS NOT NULL
     AND NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false)
     AND NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_manage_payments', v_company), false)
     AND NOT coalesce(public.puo_gestire_documento_fiscale(v_company, 'fattura'), false) THEN
    RAISE EXCEPTION 'Non hai il permesso di staccare le fatture dalle rate.' USING ERRCODE = '42501';
  END IF;
  UPDATE$n$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.conferma_carico_ddt(uuid,uuid)',
  $v$  if auth.uid() is not null and (not public.user_can_access_company(v_c.company_id)
       or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_c.company_id), false)) then$v$,
  $n$  if auth.uid() is not null and not public.user_can_access_company(v_c.company_id) then
    raise exception 'Non autorizzato' using errcode = '42501';
  end if;
  -- il permesso del magazzino di chi conferma, anche quando chiama il servizio (WhatsApp)
  if not coalesce(public.has_permission_for_company(v_utente, 'can_edit_warehouse', v_c.company_id), false) then$n$);

-- 4 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.get_dashboard_kpis(uuid,timestamp with time zone,timestamp with time zone,uuid)',
  $v$  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_dashboard', p_company_id), false) THEN$v$,
  $n$  IF auth.uid() IS NOT NULL AND NOT coalesce(public.has_permission_for_company(auth.uid(), 'can_view_dashboard', p_company_id), false)
     AND NOT coalesce(public.user_can_read_accountant_company(p_company_id), false) THEN$n$);
select pg_temp.sostituisci('public.cruscotto_rate_da_incassare(uuid)',
  $v$  if not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false) then$v$,
  $n$  if not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
     and not coalesce(public.user_can_read_accountant_company(p_company_id), false) then$n$);
select pg_temp.sostituisci('public.cruscotto_rate_incassi(uuid)',
  $v$  if not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false) then$v$,
  $n$  if not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_orders', p_company_id), false)
     and not coalesce(public.user_can_read_accountant_company(p_company_id), false) then$n$);

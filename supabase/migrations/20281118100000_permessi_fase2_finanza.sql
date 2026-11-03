-- Permessi, fase 2 (primo gruppo): banca, cassa, finanziamenti, budget, patrimonio, cespiti,
-- storico fiscale e valore clienti.
--
-- Le regole esistenti chiedevano solo «stessa azienda»: operai e subappaltatori potevano
-- leggerle e modificarle chiamando il server. Non si riscrivono: si aggiunge una regola
-- RESTRITTIVA, che vale insieme alle altre. Per tornare indietro basta togliere la regola.
--
-- Chi resta dentro: chi ha almeno un permesso di finanza, gli amministratori, il commercialista.
-- Fuori da ogni controllo le chiamate senza utente (cron e service role).

create or replace function public.puo_vedere_finanza(p_company_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_permesso text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return true; end if;
  if p_company_id is null or v_uid is null then return false; end if;
  foreach v_permesso in array array[
    'can_view_controllo_gestione', 'can_view_cruscotto', 'can_view_billing', 'can_view_costs',
    'can_view_financial_reports', 'can_view_prima_nota', 'can_view_tesoreria',
    'can_view_scadenzario', 'can_manage_payments', 'can_view_forecast'
  ] loop
    if public.has_permission_for_company(v_uid, v_permesso, p_company_id) then return true; end if;
  end loop;
  return public.can_accountant_access_company(p_company_id, null);
end $$;
revoke all on function public.puo_vedere_finanza(uuid) from public, anon;
grant execute on function public.puo_vedere_finanza(uuid) to authenticated, service_role;

do $mig$
declare
  v_tabella text;
begin
  foreach v_tabella in array array[
    'bank_reconciliations', 'movimenti_cassa_native', 'cg_budget', 'cg_loans',
    'cg_cash_flow_manuali', 'patrimonio_netto', 'cespiti', 'documenti_fiscali_storico',
    'customer_ltv_snapshots'
  ] loop
    execute format('drop policy if exists permessi_finanza on public.%I', v_tabella);
    execute format(
      'create policy permessi_finanza on public.%I as restrictive for all to authenticated
         using (public.puo_vedere_finanza(company_id))
         with check (public.puo_vedere_finanza(company_id))',
      v_tabella);
  end loop;
end $mig$;

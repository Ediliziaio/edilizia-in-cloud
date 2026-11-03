-- Permessi: le regole d'area si calcolano una volta per query, non riga per riga (03/11/2026).
--
-- puo_vedere_area(company_id, ...) girava per ogni riga: per un addetto, 1.375 riconciliazioni
-- passavano da 0 a 1.207 ms. Stesse regole e stessi elenchi: ora l'elenco delle aziende consentite
-- si calcola una volta e ogni riga fa solo un confronto. Vale lo schema di aziende_con_permesso.
-- ALTER POLICY: la regola cambia senza un istante scoperto.

create or replace function public.aziende_area(p_permessi text[])
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_out uuid[];
begin
  if v_uid is null then return '{}'; end if;
  if public.e_solo_campo() then return '{}'; end if;
  v_out := public.aziende_con_uno_dei_permessi(p_permessi);
  v_out := v_out || array(
    select aca.company_id
      from public.accountant_company_access aca
      join public.accountant_firm_members afm on afm.firm_id = aca.firm_id
     where aca.status = 'active' and afm.user_id = v_uid and afm.status = 'active'
  );
  return v_out;
end $$;
revoke all on function public.aziende_area(text[]) from public, anon;
grant execute on function public.aziende_area(text[]) to authenticated, service_role;

create or replace function public.utente_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(auth.uid(), 'super_admin'::public.app_role)
$$;
revoke all on function public.utente_super_admin() from public, anon;
grant execute on function public.utente_super_admin() to authenticated, service_role;

do $mig$
declare
  v_voce record;
  v_regola text;
begin
  for v_voce in
    select * from (values
      ('purchase_orders', 'permessi_area', array['can_view_orders','can_edit_orders','can_view_warehouse','can_edit_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_billing','can_view_financial_reports','can_view_scadenzario','can_view_tickets','can_edit_tickets','can_view_dashboard','can_view_cruscotto','can_view_settings_suppliers','can_view_forecast','can_view_tesoreria','can_view_preventivi','can_edit_preventivi','can_view_calendar','can_view_subappaltatori']),
      ('supplier_rfqs', 'permessi_area', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('supplier_rfq_items', 'permessi_area', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('supplier_rfq_quotes', 'permessi_area', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('supplier_rfq_suppliers', 'permessi_area', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities','can_view_subappaltatori','can_view_sopralluoghi']),
      ('whatsapp_messages', 'permessi_area', array['can_view_marketing_whatsapp','can_view_marketing','can_view_marketing_contacts','can_view_marketing_opportunities','can_view_marketing_activities','can_view_customers','can_view_settings_integrations','can_view_tickets','can_view_manutenzione','can_view_subappaltatori']),
      ('central_audit_log', 'permessi_area', array['can_view_settings_security']),
      ('tool_execution_log', 'permessi_area', array['can_view_settings_security']),
      ('silvio_decision_log', 'permessi_area', array['can_view_settings_security']),
      ('fea_audit_log', 'permessi_area', array['can_view_settings_security','can_view_firma_elettronica']),
      ('sms_log', 'permessi_area', array['can_view_sms_marketing','can_view_billing','can_view_marketing']),
      ('reputation_reviews', 'permessi_area', array['can_view_reputazione','can_view_marketing']),
      ('render_sessions', 'permessi_area', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_bagno_sessions', 'permessi_area', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_stanza_sessions', 'permessi_area', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_tetto_sessions', 'permessi_area', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('render_gallery', 'permessi_area', array['can_view_render_ai','can_view_preventivi','can_edit_preventivi','can_view_marketing_opportunities','can_view_marketing','can_view_settings_pricing']),
      ('bank_reconciliations', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('movimenti_cassa_native', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('cg_budget', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('cg_loans', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('cg_cash_flow_manuali', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('patrimonio_netto', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('cespiti', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('documenti_fiscali_storico', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']),
      ('customer_ltv_snapshots', 'permessi_finanza', array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast'])
    ) as t(tabella, regola, permessi)
  loop
    if to_regclass('public.' || quote_ident(v_voce.tabella)) is null then continue; end if;
    v_regola := format(
      '(select public.utente_super_admin()) or company_id = any ((select public.aziende_area(%L::text[]))::uuid[])',
      v_voce.permessi);
    execute format(
      'alter policy %I on public.%I using (%s) with check (%s)',
      v_voce.regola, v_voce.tabella, v_regola, v_regola);
  end loop;
end $mig$;

alter policy permessi_file_uffici on storage.objects
  using (
    case bucket_id
      when 'fatture-xml' then (select public.utente_super_admin())
        or public.azienda_del_percorso(name) = any ((select public.aziende_area(array['can_view_controllo_gestione','can_view_cruscotto','can_view_billing','can_view_costs','can_view_financial_reports','can_view_prima_nota','can_view_tesoreria','can_view_scadenzario','can_manage_payments','can_view_forecast']::text[]))::uuid[])
      when 'documenti-fiscali' then not (select public.e_solo_campo()) and not (select public.utente_e_cliente_esterno())
      when 'computi' then not (select public.utente_e_cliente_esterno())
      when 'ddt_attachments' then not (select public.utente_e_cliente_esterno())
      when 'order-attachments' then not (select public.e_solo_campo()) or public.file_ordine_di_mia_commessa(name)
      else true
    end
  );

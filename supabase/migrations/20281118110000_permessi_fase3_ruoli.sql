-- Permessi, fase 2 (resto) e fase 3: un permesso vale anche sui dati, non solo a schermo.
--
-- A. Chi lavora solo in cantiere (operaio, subappaltatore, senza ruoli d'ufficio) non legge né
--    modifica i dati d'ufficio. L'elenco esclude ciò che l'app di campo usa davvero, calcolato
--    seguendo gli import di campoRoutes e tecnicoRoutes e le funzioni server che chiama.
-- B. Chi lavora in ufficio vede queste aree solo con un permesso collegato: gli stessi delle
--    pagine che le usano. Vale per acquisti, messaggi WhatsApp, registri, render, SMS e recensioni.
--
-- Solo regole restrittive in più: per tornare indietro basta togliere permessi_solo_ufficio e
-- permessi_area. Le chiamate senza utente (cron, service role) non sono toccate.

create or replace function public.e_solo_campo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.role(), '') = 'authenticated'
     and exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text in ('employee', 'subcontractor'))
     and not exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role::text not in ('employee', 'subcontractor'))
$$;
revoke all on function public.e_solo_campo() from public, anon;
grant execute on function public.e_solo_campo() to authenticated, service_role;

create or replace function public.puo_vedere_area(p_company_id uuid, p_permessi text[])
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_permesso text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return true; end if;
  if p_company_id is null or v_uid is null then return false; end if;
  foreach v_permesso in array p_permessi loop
    if public.has_permission_for_company(v_uid, v_permesso, p_company_id) then return true; end if;
  end loop;
  return public.can_accountant_access_company(p_company_id, null);
end $$;
revoke all on function public.puo_vedere_area(uuid, text[]) from public, anon;
grant execute on function public.puo_vedere_area(uuid, text[]) to authenticated, service_role;

do $mig$
declare
  v_tabella text;
  v_voce record;
begin
  -- A. Dati d'ufficio: fuori chi lavora solo in cantiere.
  foreach v_tabella in array array[
    'purchase_orders', 'supplier_rfqs', 'supplier_rfq_items', 'supplier_rfq_quotes', 'supplier_rfq_suppliers',
    'tariffe_aziendali', 'listino_griglia', 'listino_griglia_history', 'listino_prezzi',
    'whatsapp_messages', 'whatsapp_sessions', 'conversazioni', 'wa_tool_calls', 'wa_operational_reminder_log',
    'ai_whatsapp_numbers', 'ai_agents_v2', 'ai_brain_documents', 'ai_brain_facts', 'ai_persona_memory',
    'ai_call_ledger', 'ai_credit_transactions', 'ai_model_usage_log', 'ai_router_usage_log',
    'central_audit_log', 'tool_execution_log', 'silvio_decision_log', 'fea_audit_log', 'flow_execution_runs',
    'automation_queue', 'bot_routine', 'cfo_weekly_reports', 'fiscal_reports', 'piano_industriale_assumptions',
    'pipeline_forecasts', 'ordine_margine_stato', 'cg_classificazione_voci', 'anomalies',
    'anagrafica_azienda', 'anagrafiche_native', 'company_governance_settings', 'company_sales_profile',
    'company_credit_pool_ledger', 'email_credits_log', 'whatsapp_credits_log', 'render_credit_ledger',
    'customer_health_history', 'customer_onboarding', 'marketing_opportunity_stage_history',
    'contratti_documents', 'contratti_manutenzione', 'document_analysis_results', 'preventivo_da_foto_runs',
    'computo_uploads', 'computo_voci_estratte', 'computo_voci_misure',
    'eic_finanziarie', 'eic_tabelle_finanziamento', 'eic_tabelle_finanziamento_righe',
    'reputation_reviews', 'simulazioni', 'sms_log', 'social_posts',
    'render_sessions', 'render_bagno_sessions', 'render_stanza_sessions', 'render_tetto_sessions', 'render_gallery'
  ] loop
    if to_regclass('public.' || quote_ident(v_tabella)) is null then continue; end if;
    execute format('drop policy if exists permessi_solo_ufficio on public.%I', v_tabella);
    execute format(
      'create policy permessi_solo_ufficio on public.%I as restrictive for all to authenticated
         using (not (select public.e_solo_campo()))
         with check (not (select public.e_solo_campo()))',
      v_tabella);
  end loop;

  -- B. In ufficio: serve un permesso dell'area.
  for v_voce in
    select * from (values
      ('purchase_orders', array['can_view_orders','can_edit_orders','can_view_warehouse','can_edit_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_billing','can_view_financial_reports','can_view_scadenzario','can_view_tickets','can_view_dashboard','can_view_cruscotto','can_view_settings_suppliers','can_view_forecast','can_view_tesoreria','can_view_preventivi']),
      ('supplier_rfqs', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities']),
      ('supplier_rfq_items', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities']),
      ('supplier_rfq_quotes', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities']),
      ('supplier_rfq_suppliers', array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing','can_validate_bom','can_view_costs','can_view_preventivi','can_view_marketing_opportunities']),
      ('whatsapp_messages', array['can_view_marketing_whatsapp','can_view_marketing','can_view_marketing_contacts','can_view_marketing_opportunities','can_view_marketing_activities','can_view_customers','can_view_settings_integrations','can_view_tickets']),
      ('central_audit_log', array['can_view_settings_security']),
      ('tool_execution_log', array['can_view_settings_security']),
      ('silvio_decision_log', array['can_view_settings_security']),
      ('fea_audit_log', array['can_view_settings_security','can_view_firma_elettronica']),
      ('sms_log', array['can_view_sms_marketing','can_view_billing','can_view_marketing']),
      ('reputation_reviews', array['can_view_reputazione','can_view_marketing']),
      ('render_sessions', array['can_view_render_ai','can_view_preventivi','can_view_marketing_opportunities']),
      ('render_bagno_sessions', array['can_view_render_ai','can_view_preventivi','can_view_marketing_opportunities']),
      ('render_stanza_sessions', array['can_view_render_ai','can_view_preventivi','can_view_marketing_opportunities']),
      ('render_tetto_sessions', array['can_view_render_ai','can_view_preventivi','can_view_marketing_opportunities']),
      ('render_gallery', array['can_view_render_ai','can_view_preventivi','can_view_marketing_opportunities'])
    ) as t(tabella, permessi)
  loop
    if to_regclass('public.' || quote_ident(v_voce.tabella)) is null then continue; end if;
    execute format('drop policy if exists permessi_area on public.%I', v_voce.tabella);
    execute format(
      'create policy permessi_area on public.%I as restrictive for all to authenticated
         using (public.puo_vedere_area(company_id, %L::text[]))
         with check (public.puo_vedere_area(company_id, %L::text[]))',
      v_voce.tabella, v_voce.permessi, v_voce.permessi);
  end loop;
end $mig$;

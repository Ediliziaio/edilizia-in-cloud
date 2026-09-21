-- ════════════════════════════════════════════════════════════════════════════
-- Permessi per chi non aveva la riga: i venditori di Ener e gli utenti demo
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ (21/09/2026)
-- Chi non è amministratore lavora coi permessi della sua riga in
-- staff_permissions. Senza riga l'app non gli mostra NIENTE (ogni permesso
-- risulta spento). Ne erano senza 37 persone:
--   · 24 venditori di Ener Italia importati da Zoho il 12/09 (mai entrati,
--     indirizzi segnaposto): Florin ha scelto i permessi da Venditore;
--   · 13 utenti delle due aziende demo (5 già entrati almeno una volta).
-- Il «Salva permessi» li avrebbe creati solo aprendo le schede una per una.
--
-- COSA: a ognuno la riga coi permessi del suo ruolo — gli stessi che l'app
-- dà a chi crea da Impostazioni → Persone (ROLE_PRESETS di
-- src/components/users/permissionsDefaults.ts, passati da
-- buildStaffPermissionsUpdate il 21/09/2026). Qui per ogni ruolo ci sono i
-- permessi ACCESI; tutti gli altri restano spenti. Il ruolo è il principale
-- (ruolo_principale_utente): Brando Conte, venditore e call center, prende
-- quelli da venditore.
--   · I venditori di Ener cambiano la password al primo accesso, come ogni
--     utente nuovo; gli account demo no (le credenziali sono condivise).
--   · Solo le tre aziende, solo chi non ha la riga: chi ce l'ha non si tocca
--     (on conflict do nothing). Rieseguirla non cambia niente.
-- 37 righe: lock e tempi stretti, come per ogni migrazione che scrive dati.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  -- I permessi sì/no di staff_permissions, come li scrive l'app.
  v_permessi text[] := array['can_view_cruscotto', 'can_view_controllo_gestione', 'can_view_dashboard', 'can_view_orders',
                             'can_edit_orders', 'can_view_order_amounts', 'can_approve_orders', 'can_delete_orders',
                             'can_view_warehouse', 'can_edit_warehouse', 'can_manage_warehouse_items', 'can_view_calendar',
                             'can_view_all_team_calendar', 'can_view_team_tasks', 'can_view_customers', 'can_edit_customers',
                             'can_export_clients', 'can_view_tickets', 'can_edit_tickets', 'can_view_interventi',
                             'can_view_manutenzione', 'can_view_sicurezza_cantiere', 'can_view_subappaltatori',
                             'can_view_firma_elettronica', 'can_view_billing', 'can_view_scadenzario', 'can_view_tesoreria',
                             'can_view_prima_nota', 'can_view_costs', 'can_view_forecast', 'can_view_financial_reports',
                             'can_view_margins', 'can_manage_payments', 'can_manage_suppliers', 'can_view_persone',
                             'can_view_employees', 'can_view_users', 'can_view_giornale_lavori', 'can_view_messaggi_esterni',
                             'can_edit_giornale_lavori', 'can_view_sopralluoghi', 'can_view_preventivi',
                             'can_edit_preventivi', 'can_approve_discounts', 'can_view_formazione', 'can_manage_portal',
                             'can_view_marketing', 'can_edit_marketing', 'can_view_marketing_dashboard',
                             'can_view_marketing_contacts', 'can_edit_marketing_contacts', 'can_view_marketing_opportunities',
                             'can_edit_marketing_opportunities', 'can_view_marketing_activities',
                             'can_view_marketing_appointments', 'can_view_marketing_email', 'can_view_marketing_whatsapp',
                             'can_view_marketing_reports', 'can_view_reputazione', 'can_view_marketing_automations',
                             'can_view_marketing_ai_agent', 'can_view_automazioni', 'can_view_render_ai', 'can_view_sales_os',
                             'can_view_sms_marketing', 'can_view_settings', 'can_edit_settings', 'can_view_settings_profile',
                             'can_edit_settings_profile', 'can_view_settings_orders', 'can_edit_settings_orders',
                             'can_view_settings_customization', 'can_edit_settings_customization', 'can_view_settings_people',
                             'can_edit_settings_people', 'can_view_settings_security', 'can_view_settings_pricing',
                             'can_edit_settings_pricing', 'can_view_settings_scontistica', 'can_edit_settings_scontistica',
                             'can_view_settings_finanziamenti', 'can_edit_settings_finanziamenti', 'can_view_settings_bundle',
                             'can_edit_settings_bundle', 'can_view_settings_suppliers', 'can_edit_settings_suppliers',
                             'can_view_settings_integrations', 'can_edit_settings_integrations', 'only_assigned',
                             'only_my_warehouse', 'sola_lettura'];
  v_colonne text;
  v_valori text;
  v_inserite integer;
begin
  select string_agg(quote_ident(k), ', '), string_agg('r.' || quote_ident(k), ', ')
    into v_colonne, v_valori
    from unnest(v_permessi || array['visible_areas', 'pipeline_visibili']) as k;

  execute format($f$
    with preset(ruolo, accesi, aree) as (values
      ('salesperson',
       array['can_view_dashboard', 'can_view_orders', 'can_edit_orders', 'can_view_order_amounts',
             'can_view_calendar', 'can_view_customers', 'can_edit_customers', 'can_view_firma_elettronica',
             'can_view_users', 'can_view_sopralluoghi', 'can_view_preventivi', 'can_edit_preventivi',
             'can_view_formazione', 'can_view_marketing', 'can_edit_marketing',
             'can_view_marketing_dashboard', 'can_view_marketing_contacts', 'can_edit_marketing_contacts',
             'can_view_marketing_opportunities', 'can_edit_marketing_opportunities',
             'can_view_marketing_activities', 'can_view_marketing_appointments', 'can_view_marketing_reports',
             'can_view_reputazione', 'can_view_sales_os']::text[],
       array['commerciale']::text[]),
      ('call_center',
       array['can_view_dashboard', 'can_view_order_amounts', 'can_view_calendar', 'can_view_customers',
             'can_edit_customers', 'can_view_users', 'can_view_sopralluoghi', 'can_view_preventivi',
             'can_edit_preventivi', 'can_view_formazione', 'can_view_marketing', 'can_edit_marketing',
             'can_view_marketing_contacts', 'can_edit_marketing_contacts', 'can_view_marketing_opportunities',
             'can_edit_marketing_opportunities', 'can_view_marketing_activities',
             'can_view_marketing_appointments']::text[],
       array['commerciale']::text[]),
      ('company_staff',
       array['can_view_dashboard', 'can_view_orders', 'can_edit_orders', 'can_view_order_amounts',
             'can_view_warehouse', 'can_edit_warehouse', 'can_manage_warehouse_items', 'can_view_calendar',
             'can_view_all_team_calendar', 'can_view_customers', 'can_edit_customers', 'can_view_tickets',
             'can_edit_tickets', 'can_view_interventi', 'can_view_manutenzione', 'can_view_firma_elettronica',
             'can_view_billing', 'can_view_prima_nota', 'can_view_costs', 'can_manage_payments',
             'can_manage_suppliers', 'can_view_persone', 'can_view_employees', 'can_view_users',
             'can_view_giornale_lavori', 'can_edit_giornale_lavori', 'can_view_formazione']::text[],
       array[]::text[]),
      ('employee',
       array['can_view_calendar', 'can_view_giornale_lavori', 'can_edit_giornale_lavori',
             'can_view_formazione', 'only_assigned']::text[],
       array['cantiere']::text[]),
      ('subcontractor',
       array['can_view_orders', 'can_edit_orders', 'can_view_calendar', 'can_view_customers',
             'can_edit_customers', 'can_view_subappaltatori', 'can_view_firma_elettronica',
             'can_view_formazione', 'only_assigned']::text[],
       array['cantiere']::text[])
    ),
    senza_riga as (
      select p.id as user_id, p.company_id,
             public.ruolo_principale_utente(p.id, p.company_id) as ruolo,
             p.company_id in ('778a2c76-1253-49f2-a5e8-283363ac3e29', 'd2000000-0000-4000-a000-000000000002') as demo
        from public.profiles p
       where p.company_id in (
               '629d91e0-9d56-4736-a030-1e3833cba2ea',  -- Ener Italia S.p.A.
               '778a2c76-1253-49f2-a5e8-283363ac3e29',  -- Demo Azienda S.r.l.
               'd2000000-0000-4000-a000-000000000002')  -- Demo Azienda 2 S.r.l.
         and not exists (select 1 from public.user_roles x
                          where x.user_id = p.id and x.role::text in ('company_admin', 'super_admin'))
         and not exists (select 1 from public.staff_permissions sp
                          where sp.user_id = p.id and sp.company_id = p.company_id)
    ),
    nuove as (
      select u.user_id, u.company_id, not u.demo as cambia_password,
             (select jsonb_object_agg(k, k = any (pr.accesi)) from unnest(%L::text[]) as k)
               || jsonb_build_object('visible_areas', pr.aree, 'pipeline_visibili', '[]'::jsonb) as permessi
        from senza_riga u
        join preset pr on pr.ruolo = u.ruolo
    )
    insert into public.staff_permissions (user_id, company_id, must_change_password, %s)
    select n.user_id, n.company_id, n.cambia_password, %s
      from nuove n
      cross join lateral jsonb_populate_record(null::public.staff_permissions, n.permessi) as r
    on conflict (user_id, company_id) do nothing
  $f$, v_permessi, v_colonne, v_valori);

  get diagnostics v_inserite = row_count;
  raise notice 'Righe dei permessi create: %', v_inserite;
end $$;

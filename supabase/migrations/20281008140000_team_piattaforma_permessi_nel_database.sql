-- Team di piattaforma: ogni ruolo vede e fa quello che gli spetta, e lo decide il DATABASE (non solo il menu).
--
-- Prima: i ruoli platform_* aprivano le pagine ma le regole di accesso ai dati leggevano solo super_admin e
-- l'amministratore dell'azienda: ogni lista era vuota (24 aziende viste 0 volte, nessun ticket, nessuna statistica).
-- Ora i permessi di `super_admin_permissions` diventano regole vere, tabella per tabella:
--   can_manage_companies / can_manage_tickets / billing_read / can_manage_plans / can_view_platform_stats.
-- `allowed_company_ids` («solo queste aziende») vale anche qui, non più solo nell'interfaccia.
-- Il CRM e il marketing della piattaforma passano da staff_permissions dell'azienda Piattaforma (vedi la funzione
-- edge manage-platform-users): non servono regole nuove, le hanno già.
--
-- Le regole sono ADDITIVE (permissive): non tolgono niente a nessuno.

-- Ruoli del team (tutti tranne il super admin).
CREATE OR REPLACE FUNCTION public.e_ruolo_piattaforma(p_user uuid DEFAULT auth.uid())
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user
       AND role::text IN ('platform_manager','platform_sales','platform_support','platform_marketing','platform_implementation','platform_callcenter')
  );
$$;

-- Chi ha UNO di questi permessi (il super admin li ha tutti). Nessun argomento di riga: dentro una policy si
-- valuta una volta sola per interrogazione, quindi per gli utenti normali non costa niente.
CREATE OR REPLACE FUNCTION public.admin_ha_uno_di(p_permessi text[])
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND NOT coalesce((SELECT is_blocked FROM public.profiles WHERE id = auth.uid()), false)
     AND (
       public.has_role(auth.uid(), 'super_admin'::public.app_role)
       OR EXISTS (
         SELECT 1
           FROM public.user_roles ur
           JOIN public.super_admin_permissions sp ON sp.user_id = ur.user_id
          WHERE ur.user_id = auth.uid()
            AND ur.role::text IN ('platform_manager','platform_sales','platform_support','platform_marketing','platform_implementation','platform_callcenter')
            AND (
              ('can_manage_companies'    = ANY (p_permessi) AND sp.can_manage_companies)
           OR ('can_manage_plans'        = ANY (p_permessi) AND sp.can_manage_plans)
           OR ('can_manage_tickets'      = ANY (p_permessi) AND sp.can_manage_tickets)
           OR ('can_manage_referrals'    = ANY (p_permessi) AND sp.can_manage_referrals)
           OR ('can_manage_admins'       = ANY (p_permessi) AND sp.can_manage_admins)
           OR ('can_view_platform_stats' = ANY (p_permessi) AND sp.can_view_platform_stats)
           OR ('can_manage_marketing'    = ANY (p_permessi) AND sp.can_manage_marketing)
           OR ('crm_operatore'           = ANY (p_permessi) AND (sp.crm_operatore OR sp.can_manage_marketing))
           OR ('billing_read'            = ANY (p_permessi) AND coalesce(sp.billing_read, sp.can_manage_plans))
           OR ('billing_write'           = ANY (p_permessi) AND coalesce(sp.billing_write, sp.can_manage_plans))
            )
       )
     );
$$;

-- L'azienda è tra quelle consentite? Super admin: sempre. Team: tutte se `allowed_company_ids` è vuoto, altrimenti
-- solo quelle elencate. Per riga, ma si chiama solo se il permesso c'è già (vedi le policy sotto).
CREATE OR REPLACE FUNCTION public.admin_azienda_consentita(p_azienda uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_azienda IS NOT NULL AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR coalesce((SELECT sp.allowed_company_ids IS NULL OR p_azienda = ANY (sp.allowed_company_ids)
                   FROM public.super_admin_permissions sp WHERE sp.user_id = auth.uid()), false)
  );
$$;

REVOKE ALL ON FUNCTION public.e_ruolo_piattaforma(uuid), public.admin_ha_uno_di(text[]), public.admin_azienda_consentita(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e_ruolo_piattaforma(uuid), public.admin_ha_uno_di(text[]), public.admin_azienda_consentita(uuid) TO authenticated, service_role;

-- Il ruolo del team conta come staff nei controlli `has_permission` (CRM della piattaforma).
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _has_perm boolean;
  _company  uuid;
BEGIN
  IF public.chiamante_anonimo() THEN RETURN false; END IF;

  IF has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Tutti i chiamanti passano l'utente corrente (assert_permesso,
  -- valida_sconto_fv, valida_sconto_progetto e le policy): si guarda l'azienda
  -- in cui sta lavorando. Se si chiede di un altro utente si ricade sul «ce
  -- l'ha in almeno una azienda», come prima.
  _company := CASE WHEN _user_id IS NOT DISTINCT FROM auth.uid()
                   THEN public.get_effective_company_id() END;

  -- Amministratore di QUESTA azienda (26/09/2026). Prima bastava il ruolo, di
  -- un'azienda qualsiasi: l'amministratore di A entrato in B come staff senza
  -- permessi, in B aveva tutti i permessi.
  IF _company IS NOT NULL THEN
    IF public.e_amministratore_di(_company) THEN
      RETURN true;
    END IF;
  ELSIF has_role(_user_id, 'company_admin'::app_role) THEN
    RETURN true;
  END IF;

  -- Staff: col ruolo, oppure con un accesso multi-azienda attivo da staff
  -- proprio in questa azienda. Chi è amministratore altrove ed è entrato qui
  -- come staff prende i permessi che gli ha dato QUESTA azienda.
  IF NOT (
    has_role(_user_id, 'company_staff'::app_role)
    -- Team di piattaforma (08/10/2026): lavora sul CRM dell'azienda Piattaforma con i permessi
    -- scritti in staff_permissions, come uno staff.
    OR public.e_ruolo_piattaforma(_user_id)
    OR (_company IS NOT NULL
        AND NOT public.utente_bloccato()
        AND EXISTS (
          SELECT 1 FROM public.multi_company_access m
           WHERE m.user_id = _user_id
             AND m.company_id = _company
             AND m.access_role = 'company_staff'
             AND m.status = 'active'
             AND (m.expires_at IS NULL OR m.expires_at > now())))
  ) THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'staff_permissions'
      AND column_name = _permission
  ) THEN
    RETURN false;
  END IF;

  BEGIN
    IF _company IS NULL THEN
      EXECUTE format(
        'SELECT bool_or(%I) FROM public.staff_permissions WHERE user_id = $1',
        _permission
      ) INTO _has_perm USING _user_id;
    ELSE
      EXECUTE format(
        'SELECT bool_or(%I) FROM public.staff_permissions WHERE user_id = $1 AND company_id = $2',
        _permission
      ) INTO _has_perm USING _user_id, _company;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  RETURN COALESCE(_has_perm, false);
END;
$function$;

-- Regole di accesso, tabella per tabella.
DROP POLICY IF EXISTS admin_piattaforma_select ON public.companies;
CREATE POLICY admin_piattaforma_select ON public.companies FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','billing_read','can_view_platform_stats','can_manage_tickets'])) AND public.admin_azienda_consentita(id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.subscription_invoices;
CREATE POLICY admin_piattaforma_select ON public.subscription_invoices FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['billing_read','can_manage_plans'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.company_subscriptions;
CREATE POLICY admin_piattaforma_select ON public.company_subscriptions FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['billing_read','can_manage_plans'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.user_sessions;
CREATE POLICY admin_piattaforma_select ON public.user_sessions FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.ai_model_usage_log;
CREATE POLICY admin_piattaforma_select ON public.ai_model_usage_log FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.ai_router_usage_log;
CREATE POLICY admin_piattaforma_select ON public.ai_router_usage_log FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.ai_test_runs;
CREATE POLICY admin_piattaforma_select ON public.ai_test_runs FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.render_sessions;
CREATE POLICY admin_piattaforma_select ON public.render_sessions FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.failure_alerts;
CREATE POLICY admin_piattaforma_select ON public.failure_alerts FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.product_events;
CREATE POLICY admin_piattaforma_select ON public.product_events FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.customer_usage_daily;
CREATE POLICY admin_piattaforma_select ON public.customer_usage_daily FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.system_health_metrics;
CREATE POLICY admin_piattaforma_select ON public.system_health_metrics FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.google_calendar_sync_log;
CREATE POLICY admin_piattaforma_select ON public.google_calendar_sync_log FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.ai_usage_thresholds;
CREATE POLICY admin_piattaforma_select ON public.ai_usage_thresholds FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.platform_announcements;
CREATE POLICY admin_piattaforma_select ON public.platform_announcements FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_view_platform_stats'])));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.customer_health_history;
CREATE POLICY admin_piattaforma_select ON public.customer_health_history FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.customer_interactions;
CREATE POLICY admin_piattaforma_all ON public.customer_interactions FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id)) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.customer_onboarding;
CREATE POLICY admin_piattaforma_all ON public.customer_onboarding FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id)) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.nps_responses;
CREATE POLICY admin_piattaforma_select ON public.nps_responses FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.profiles;
CREATE POLICY admin_piattaforma_select ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_select ON public.company_feature_overrides;
CREATE POLICY admin_piattaforma_select ON public.company_feature_overrides FOR SELECT TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.cs_tasks;
CREATE POLICY admin_piattaforma_all ON public.cs_tasks FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id)) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_companies','can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.support_conversations;
CREATE POLICY admin_piattaforma_all ON public.support_conversations FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])) AND public.admin_azienda_consentita(company_id)) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.support_messages;
CREATE POLICY admin_piattaforma_all ON public.support_messages FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])) AND public.admin_azienda_consentita(company_id)) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.support_tickets;
CREATE POLICY admin_piattaforma_all ON public.support_tickets FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])) AND public.admin_azienda_consentita(company_id)) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])) AND public.admin_azienda_consentita(company_id));
DROP POLICY IF EXISTS admin_piattaforma_all ON public.ticket_messages;
CREATE POLICY admin_piattaforma_all ON public.ticket_messages FOR ALL TO authenticated
  USING ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets']))) WITH CHECK ((SELECT public.admin_ha_uno_di(ARRAY['can_manage_tickets'])));

-- Una riga di permessi di piattaforma appartiene solo a chi ha davvero un ruolo di piattaforma o è super admin
-- (una riga rimasta a un amministratore d'azienda, con «Gestione Admin» acceso, non deve esistere).
SET LOCAL lock_timeout = '3s';
DELETE FROM public.super_admin_permissions sp
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = sp.user_id
      AND ur.role::text IN ('super_admin', 'platform_manager','platform_sales','platform_support','platform_marketing','platform_implementation','platform_callcenter')
 );

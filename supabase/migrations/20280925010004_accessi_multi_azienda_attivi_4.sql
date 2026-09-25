-- Accessi multi-azienda: contano solo se attivi e non scaduti — lotto 4 di 6
-- (25/09/2026). Il perché e il metodo sono in 20280925010001: in ogni
-- sottoquery su multi_company_access che guarda l'utente corrente si aggiunge
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())
-- e il resto della policy è il testo che il database dava il 25/09.

SET LOCAL lock_timeout = '3s';

-- sms_log
DROP POLICY IF EXISTS sms_log_insert ON public.sms_log;
CREATE POLICY sms_log_insert ON public.sms_log
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_log_select ON public.sms_log;
CREATE POLICY sms_log_select ON public.sms_log
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (NOT public.utente_e_cliente_esterno()))
  );

-- sms_provider_config
DROP POLICY IF EXISTS sms_provider_config_insert ON public.sms_provider_config;
CREATE POLICY sms_provider_config_insert ON public.sms_provider_config
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_provider_config_select ON public.sms_provider_config;
CREATE POLICY sms_provider_config_select ON public.sms_provider_config
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_provider_config_update ON public.sms_provider_config;
CREATE POLICY sms_provider_config_update ON public.sms_provider_config
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- sms_telnyx_accounts
DROP POLICY IF EXISTS sms_telnyx_accounts_insert ON public.sms_telnyx_accounts;
CREATE POLICY sms_telnyx_accounts_insert ON public.sms_telnyx_accounts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_telnyx_accounts_select ON public.sms_telnyx_accounts;
CREATE POLICY sms_telnyx_accounts_select ON public.sms_telnyx_accounts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_telnyx_accounts_update ON public.sms_telnyx_accounts;
CREATE POLICY sms_telnyx_accounts_update ON public.sms_telnyx_accounts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- sms_telnyx_numbers
DROP POLICY IF EXISTS sms_telnyx_numbers_insert ON public.sms_telnyx_numbers;
CREATE POLICY sms_telnyx_numbers_insert ON public.sms_telnyx_numbers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) AND (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );
DROP POLICY IF EXISTS sms_telnyx_numbers_select ON public.sms_telnyx_numbers;
CREATE POLICY sms_telnyx_numbers_select ON public.sms_telnyx_numbers
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_telnyx_numbers_update ON public.sms_telnyx_numbers;
CREATE POLICY sms_telnyx_numbers_update ON public.sms_telnyx_numbers
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(( SELECT auth.uid() AS uid), 'company_admin'::public.app_role) AND (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );

-- sms_templates
DROP POLICY IF EXISTS sms_templates_delete ON public.sms_templates;
CREATE POLICY sms_templates_delete ON public.sms_templates
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_templates_insert ON public.sms_templates;
CREATE POLICY sms_templates_insert ON public.sms_templates
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_templates_select ON public.sms_templates;
CREATE POLICY sms_templates_select ON public.sms_templates
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_templates_update ON public.sms_templates;
CREATE POLICY sms_templates_update ON public.sms_templates
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- sms_wallet
DROP POLICY IF EXISTS sms_wallet_insert ON public.sms_wallet;
CREATE POLICY sms_wallet_insert ON public.sms_wallet
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );
DROP POLICY IF EXISTS sms_wallet_select ON public.sms_wallet;
CREATE POLICY sms_wallet_select ON public.sms_wallet
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (NOT public.utente_e_cliente_esterno()))
  );
DROP POLICY IF EXISTS sms_wallet_update ON public.sms_wallet;
CREATE POLICY sms_wallet_update ON public.sms_wallet
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (NOT public.utente_e_cliente_esterno()))
  );

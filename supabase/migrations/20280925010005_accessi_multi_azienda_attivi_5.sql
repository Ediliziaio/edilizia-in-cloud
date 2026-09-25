-- Accessi multi-azienda: contano solo se attivi e non scaduti — lotto 5 di 6
-- (25/09/2026). Il perché e il metodo sono in 20280925010001: in ogni
-- sottoquery su multi_company_access che guarda l'utente corrente si aggiunge
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())
-- e il resto della policy è il testo che il database dava il 25/09.

SET LOCAL lock_timeout = '3s';

-- sms_wallet_transazioni
DROP POLICY IF EXISTS sms_wallet_transazioni_insert ON public.sms_wallet_transazioni;
CREATE POLICY sms_wallet_transazioni_insert ON public.sms_wallet_transazioni
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
DROP POLICY IF EXISTS sms_wallet_transazioni_select ON public.sms_wallet_transazioni;
CREATE POLICY sms_wallet_transazioni_select ON public.sms_wallet_transazioni
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

-- social_inbox_items
DROP POLICY IF EXISTS social_inbox_items_company_access ON public.social_inbox_items;
CREATE POLICY social_inbox_items_company_access ON public.social_inbox_items
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  )
  WITH CHECK (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- stock_lotti
DROP POLICY IF EXISTS stock_lotti_company_access ON public.stock_lotti;
CREATE POLICY stock_lotti_company_access ON public.stock_lotti
  AS PERMISSIVE
  FOR ALL
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

-- stock_units
DROP POLICY IF EXISTS stock_units_company_access ON public.stock_units;
CREATE POLICY stock_units_company_access ON public.stock_units
  AS PERMISSIVE
  FOR ALL
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

-- subappaltatori_sicurezza
DROP POLICY IF EXISTS subappaltatori_company_access ON public.subappaltatori_sicurezza;
CREATE POLICY subappaltatori_company_access ON public.subappaltatori_sicurezza
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (NOT ( SELECT public.utente_e_cliente_esterno() AS utente_e_cliente_esterno)))
  );

-- tipi_documento_operaio
DROP POLICY IF EXISTS tipi_doc_company_access ON public.tipi_documento_operaio;
CREATE POLICY tipi_doc_company_access ON public.tipi_documento_operaio
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))) AND (NOT ( SELECT public.utente_e_cliente_esterno() AS utente_e_cliente_esterno)))
  );

-- varianti_cliente
DROP POLICY IF EXISTS varianti_cliente_company_access ON public.varianti_cliente;
CREATE POLICY varianti_cliente_company_access ON public.varianti_cliente
  AS PERMISSIVE
  FOR ALL
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

-- verbali_sicurezza
DROP POLICY IF EXISTS verbali_company_access ON public.verbali_sicurezza;
CREATE POLICY verbali_company_access ON public.verbali_sicurezza
  AS PERMISSIVE
  FOR ALL
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

-- warehouse_lotti
DROP POLICY IF EXISTS warehouse_lotti_company_isolation ON public.warehouse_lotti;
CREATE POLICY warehouse_lotti_company_isolation ON public.warehouse_lotti
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  )
  WITH CHECK (
    (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now())))))
  );

-- warehouse_scan_events
DROP POLICY IF EXISTS scan_events_company_select ON public.warehouse_scan_events;
CREATE POLICY scan_events_company_select ON public.warehouse_scan_events
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
DROP POLICY IF EXISTS scan_events_insert_own ON public.warehouse_scan_events;
CREATE POLICY scan_events_insert_own ON public.warehouse_scan_events
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    ((user_id = ( SELECT auth.uid() AS uid)) AND (company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid))
    UNION
     SELECT multi_company_access.company_id
       FROM public.multi_company_access
      WHERE ((multi_company_access.user_id = ( SELECT auth.uid() AS uid)) AND (multi_company_access.status = 'active'::text) AND ((multi_company_access.expires_at IS NULL) OR (multi_company_access.expires_at > now()))))))
  );

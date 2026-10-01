-- Amministratore DI QUALE azienda — lotto 10: 12 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: cashflow_forecast_snapshots, cespiti, customer_complaints, customer_weekly_reports, fatt_zero_touch_runs, financial_anomalies, lead_first_touch_runs, patrimonio_netto, preventivo_da_foto_runs, pricing_suggestions, surveys, winback_campaigns.
--
-- Queste policy legano la riga all'azienda in cui si lavora
-- (get_my_company_id) e poi chiedono il ruolo company_admin, che in user_roles
-- non ha azienda. L'amministratore della propria azienda A, entrato in B con
-- un accesso multi-azienda da staff senza permessi e con B selezionata, in B
-- aveva i poteri dell'amministratore. Provato in una transazione annullata
-- con due aziende demo, per esempio sui preventivi: 45 su 45 visibili.
--
-- Unico cambiamento: has_role(auth.uid(), 'company_admin') diventa
--   ( SELECT public.e_amministratore_di(public.get_my_company_id()) )
-- cioè «amministratore dell'azienda in cui lavora» (azienda del profilo col
-- ruolo, o accesso multi-azienda attivo da amministratore). Tra parentesi con
-- SELECT si calcola una volta per richiesta e non riga per riga. Il resto di
-- ogni policy (nome, comando, ruoli, le altre condizioni) è il testo che il
-- database dava il 26/09 (pg_get_expr con search_path vuoto).
--
-- Il 26/09 nessun amministratore lavorava in un'azienda diversa dalla propria
-- se non da amministratore: per gli utenti di oggi le righe restano le
-- stesse. Devono continuare a funzionare l'amministratore nella propria
-- azienda, quello entrato da amministratore con un accesso multi-azienda, il
-- super admin, lo staff coi suoi permessi.
--
-- Rilanciabile: DROP POLICY IF EXISTS + CREATE POLICY. Le RESTRICTIVE
-- blocco_utente_bloccato non si toccano.

SET LOCAL lock_timeout = '3s';

-- ── Guardia: le policy sono ancora quelle censite ──────────────────────────
-- Impronta = md5 del testo che il database dà con search_path vuoto (USING e
-- WITH CHECK separati da '#'). «segno» riconosce la versione già riscritta da
-- questo lotto, così la migrazione resta rilanciabile.
DO $guardia$
DECLARE
  r record;
  v_path text := current_setting('search_path');
  v_testo text;
BEGIN
  PERFORM set_config('search_path', '', true);
  FOR r IN SELECT * FROM (VALUES
    ('public', 'cashflow_forecast_snapshots', 'cashflow_snap_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'cespiti', 'cespiti_delete', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'customer_complaints', 'complaints_company_admin', 'f2f854a9c3cbc90cf857128a8a4a74c6', 'e_amministratore_di'),
    ('public', 'customer_weekly_reports', 'weekly_reports_company_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'fatt_zero_touch_runs', 'fzt_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'financial_anomalies', 'anomalies_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'lead_first_touch_runs', 'lft_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'patrimonio_netto', 'pn_delete', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'preventivo_da_foto_runs', 'pdf_runs_admin', 'c4ba6ede90626789c7de518e72729f13', 'e_amministratore_di'),
    ('public', 'pricing_suggestions', 'pricing_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'surveys', 'surveys_delete', 'c4ba6ede90626789c7de518e72729f13', 'e_amministratore_di'),
    ('public', 'winback_campaigns', 'winback_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di')
  ) AS v(schema_, tabella, policy, impronta, segno)
  LOOP
    SELECT coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      INTO v_testo
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = r.schema_ AND c.relname = r.tabella AND p.polname = r.policy;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Policy %.% «%» non trovata: il lotto va rivisto', r.schema_, r.tabella, r.policy;
    END IF;
    IF md5(v_testo) <> r.impronta AND v_testo !~ r.segno THEN
      RAISE EXCEPTION 'Policy %.% «%» cambiata dopo il censimento: il lotto va rivisto', r.schema_, r.tabella, r.policy;
    END IF;
  END LOOP;
  PERFORM set_config('search_path', v_path, true);
END
$guardia$;

-- cashflow_forecast_snapshots
DROP POLICY IF EXISTS cashflow_snap_admin ON public.cashflow_forecast_snapshots;
CREATE POLICY cashflow_snap_admin ON public.cashflow_forecast_snapshots
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- cespiti
DROP POLICY IF EXISTS cespiti_delete ON public.cespiti;
CREATE POLICY cespiti_delete ON public.cespiti
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

-- customer_complaints
DROP POLICY IF EXISTS complaints_company_admin ON public.customer_complaints;
CREATE POLICY complaints_company_admin ON public.customer_complaints
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))
  );

-- customer_weekly_reports
DROP POLICY IF EXISTS weekly_reports_company_admin ON public.customer_weekly_reports;
CREATE POLICY weekly_reports_company_admin ON public.customer_weekly_reports
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- fatt_zero_touch_runs
DROP POLICY IF EXISTS fzt_admin ON public.fatt_zero_touch_runs;
CREATE POLICY fzt_admin ON public.fatt_zero_touch_runs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- financial_anomalies
DROP POLICY IF EXISTS anomalies_admin ON public.financial_anomalies;
CREATE POLICY anomalies_admin ON public.financial_anomalies
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- lead_first_touch_runs
DROP POLICY IF EXISTS lft_admin ON public.lead_first_touch_runs;
CREATE POLICY lft_admin ON public.lead_first_touch_runs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- patrimonio_netto
DROP POLICY IF EXISTS pn_delete ON public.patrimonio_netto;
CREATE POLICY pn_delete ON public.patrimonio_netto
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

-- preventivo_da_foto_runs
DROP POLICY IF EXISTS pdf_runs_admin ON public.preventivo_da_foto_runs;
CREATE POLICY pdf_runs_admin ON public.preventivo_da_foto_runs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) AND (NOT public.utente_e_cliente_esterno()))
  );

-- pricing_suggestions
DROP POLICY IF EXISTS pricing_admin ON public.pricing_suggestions;
CREATE POLICY pricing_admin ON public.pricing_suggestions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- surveys
DROP POLICY IF EXISTS surveys_delete ON public.surveys;
CREATE POLICY surveys_delete ON public.surveys
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) AND (NOT public.utente_e_cliente_esterno()))
  );

-- winback_campaigns
DROP POLICY IF EXISTS winback_admin ON public.winback_campaigns;
CREATE POLICY winback_admin ON public.winback_campaigns
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

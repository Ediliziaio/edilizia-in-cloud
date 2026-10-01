-- Amministratore DI QUALE azienda — lotto 8: 18 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: teams, team_members, permission_templates, user_audit_log, user_sessions, virtual_phone_numbers, ai_phone_numbers_v2, telegram_bot_configs, telegram_user_mappings, call_logs.
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
    ('public', 'teams', 'teams_delete', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'teams', 'teams_insert', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di'),
    ('public', 'teams', 'teams_update', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'team_members', 'team_members_delete', '4fa0064d17bcdf487deb1bec828dd32f', 'e_amministratore_di'),
    ('public', 'team_members', 'team_members_insert', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di'),
    ('public', 'team_members', 'team_members_update', '4fa0064d17bcdf487deb1bec828dd32f', 'e_amministratore_di'),
    ('public', 'permission_templates', 'perm_templates_delete', '1b9fd951dffcad16ad4bbbfafb74aa7f', 'e_amministratore_di'),
    ('public', 'permission_templates', 'perm_templates_insert', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di'),
    ('public', 'permission_templates', 'perm_templates_update', '1b9fd951dffcad16ad4bbbfafb74aa7f', 'e_amministratore_di'),
    ('public', 'user_audit_log', 'user_audit_log_select_admin', '4fa0064d17bcdf487deb1bec828dd32f', 'e_amministratore_di'),
    ('public', 'user_sessions', 'user_sessions_update_admin', 'fa10a0a6111fece62357191e2ba32b5b', 'e_amministratore_di'),
    ('public', 'virtual_phone_numbers', 'Admins can delete company phone numbers', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'virtual_phone_numbers', 'Admins can insert company phone numbers', 'dab4d78ca55d4bd8a91421f510f46c8d', 'e_amministratore_di'),
    ('public', 'virtual_phone_numbers', 'Admins can update company phone numbers', '5b38412014e92486f5c720b3b99a885b', 'e_amministratore_di'),
    ('public', 'ai_phone_numbers_v2', 'phone_v2_company_isolation_scrive', '5b38412014e92486f5c720b3b99a885b', 'e_amministratore_di'),
    ('public', 'telegram_bot_configs', 'tg_config_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'telegram_user_mappings', 'tg_mappings_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'call_logs', 'call_logs_delete', '4a65e4e39ea17952744bd675fd413930', 'e_amministratore_di')
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

-- teams
DROP POLICY IF EXISTS teams_delete ON public.teams;
CREATE POLICY teams_delete ON public.teams
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

DROP POLICY IF EXISTS teams_insert ON public.teams;
CREATE POLICY teams_insert ON public.teams
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS teams_update ON public.teams;
CREATE POLICY teams_update ON public.teams
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

-- team_members
DROP POLICY IF EXISTS team_members_delete ON public.team_members;
CREATE POLICY team_members_delete ON public.team_members
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS team_members_insert ON public.team_members;
CREATE POLICY team_members_insert ON public.team_members
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS team_members_update ON public.team_members;
CREATE POLICY team_members_update ON public.team_members
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- permission_templates
DROP POLICY IF EXISTS perm_templates_delete ON public.permission_templates;
CREATE POLICY perm_templates_delete ON public.permission_templates
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (is_system_default = false) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS perm_templates_insert ON public.permission_templates;
CREATE POLICY perm_templates_insert ON public.permission_templates
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS perm_templates_update ON public.permission_templates;
CREATE POLICY perm_templates_update ON public.permission_templates
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (is_system_default = false) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- user_audit_log
DROP POLICY IF EXISTS user_audit_log_select_admin ON public.user_audit_log;
CREATE POLICY user_audit_log_select_admin ON public.user_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- user_sessions
DROP POLICY IF EXISTS user_sessions_update_admin ON public.user_sessions;
CREATE POLICY user_sessions_update_admin ON public.user_sessions
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    ((((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)) AND (NOT ( SELECT public.utente_e_cliente_esterno() AS utente_e_cliente_esterno)))
  );

-- virtual_phone_numbers
DROP POLICY IF EXISTS "Admins can delete company phone numbers" ON public.virtual_phone_numbers;
CREATE POLICY "Admins can delete company phone numbers" ON public.virtual_phone_numbers
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

DROP POLICY IF EXISTS "Admins can insert company phone numbers" ON public.virtual_phone_numbers;
CREATE POLICY "Admins can insert company phone numbers" ON public.virtual_phone_numbers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

DROP POLICY IF EXISTS "Admins can update company phone numbers" ON public.virtual_phone_numbers;
CREATE POLICY "Admins can update company phone numbers" ON public.virtual_phone_numbers
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- ai_phone_numbers_v2
DROP POLICY IF EXISTS phone_v2_company_isolation_scrive ON public.ai_phone_numbers_v2;
CREATE POLICY phone_v2_company_isolation_scrive ON public.ai_phone_numbers_v2
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- telegram_bot_configs
DROP POLICY IF EXISTS tg_config_admin ON public.telegram_bot_configs;
CREATE POLICY tg_config_admin ON public.telegram_bot_configs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- telegram_user_mappings
DROP POLICY IF EXISTS tg_mappings_admin ON public.telegram_user_mappings;
CREATE POLICY tg_mappings_admin ON public.telegram_user_mappings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- call_logs
DROP POLICY IF EXISTS call_logs_delete ON public.call_logs;
CREATE POLICY call_logs_delete ON public.call_logs
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

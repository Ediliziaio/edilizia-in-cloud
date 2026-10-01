-- Amministratore DI QUALE azienda — lotto 4: 18 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: quotes, invoices, invoice_payments, prima_nota_entries, tariffa_costi_varianti, customer_documents, billing_integrations, dunning_actions, dunning_policies.
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
    ('public', 'quotes', 'q_del', 'f8e43030b838dd7639a6b3cd93bfeb5e', 'e_amministratore_di'),
    ('public', 'quotes', 'q_sel', 'c8f0b8cdda03081fb562c5f6c99b8e3c', 'e_amministratore_di'),
    ('public', 'invoices', 'invoices_lettura_authenticated', '1cd2cb4e5110bb57411b4f7cbd825b9f', 'e_amministratore_di'),
    ('public', 'invoice_payments', 'invoice_payments_billing', 'fc1194f6f7e9084da812f61513d24f27', 'e_amministratore_di'),
    ('public', 'prima_nota_entries', 'prima_nota_entries_lettura_authenticated', '7f2b7d1e5d2b9a650430ee5c97c1c3b8', 'e_amministratore_di'),
    ('public', 'prima_nota_entries', 'prima_nota_tenant_delete', 'f2f854a9c3cbc90cf857128a8a4a74c6', 'e_amministratore_di'),
    ('public', 'prima_nota_entries', 'prima_nota_tenant_insert', 'f74d73f3006de7b7e03a55acc98fe8c5', 'e_amministratore_di'),
    ('public', 'prima_nota_entries', 'prima_nota_tenant_update', '0d6f3dbe9763c1e87db751c6e72d8a33', 'e_amministratore_di'),
    ('public', 'tariffa_costi_varianti', 'varianti_delete', '72f7066401c09ab0ad83e34137fd8c9d', 'e_amministratore_di'),
    ('public', 'tariffa_costi_varianti', 'varianti_insert', '4bf523974d76210afb3076ce7961b167', 'e_amministratore_di'),
    ('public', 'tariffa_costi_varianti', 'varianti_select', '72f7066401c09ab0ad83e34137fd8c9d', 'e_amministratore_di'),
    ('public', 'tariffa_costi_varianti', 'varianti_update', 'c9a1590d17e090110b614298d71a2f8c', 'e_amministratore_di'),
    ('public', 'customer_documents', 'customer_documents_staff_view', '6d80d123121b8645c2eeee424bf445e4', 'e_amministratore_di'),
    ('public', 'customer_documents', 'customer_documents_staff_write', 'e1cbae7856f3ed5c996a18e8b90326e8', 'e_amministratore_di'),
    ('public', 'billing_integrations', 'billing_integrations_admin_modify', 'c9a1590d17e090110b614298d71a2f8c', 'e_amministratore_di'),
    ('public', 'billing_integrations', 'billing_integrations_admin_select', '72f7066401c09ab0ad83e34137fd8c9d', 'e_amministratore_di'),
    ('public', 'dunning_actions', 'dunning_actions_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'dunning_policies', 'dunning_policies_admin', 'c4ba6ede90626789c7de518e72729f13', 'e_amministratore_di')
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

-- quotes
DROP POLICY IF EXISTS q_del ON public.quotes;
CREATE POLICY q_del ON public.quotes
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))
  );

DROP POLICY IF EXISTS q_sel ON public.quotes;
CREATE POLICY q_sel ON public.quotes
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR (( SELECT public.has_permission(( SELECT auth.uid() AS uid), 'can_view_orders'::text) AS has_permission) AND public.check_staff_visibility(( SELECT auth.uid() AS uid), assigned_to))))
  );

-- invoices
DROP POLICY IF EXISTS invoices_lettura_authenticated ON public.invoices;
CREATE POLICY invoices_lettura_authenticated ON public.invoices
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((client_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = invoices.order_id) AND (o.customer_id = ( SELECT auth.uid() AS uid))))) OR ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role) AS has_role) OR ( SELECT public.has_permission(( SELECT auth.uid() AS uid), 'can_view_billing'::text) AS has_permission))))
  );

-- invoice_payments
DROP POLICY IF EXISTS invoice_payments_billing ON public.invoice_payments;
CREATE POLICY invoice_payments_billing ON public.invoice_payments
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role) AS has_role) OR ( SELECT public.has_permission(( SELECT auth.uid() AS uid), 'can_view_billing'::text) AS has_permission)))
  )
  WITH CHECK (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role) AS has_role) OR ( SELECT public.has_permission(( SELECT auth.uid() AS uid), 'can_view_billing'::text) AS has_permission)))
  );

-- prima_nota_entries
DROP POLICY IF EXISTS prima_nota_entries_lettura_authenticated ON public.prima_nota_entries;
CREATE POLICY prima_nota_entries_lettura_authenticated ON public.prima_nota_entries
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (public.user_can_read_accountant_company(company_id) OR ((company_id = public.get_my_company_id()) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text))))
  );

DROP POLICY IF EXISTS prima_nota_tenant_delete ON public.prima_nota_entries;
CREATE POLICY prima_nota_tenant_delete ON public.prima_nota_entries
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)))
  );

DROP POLICY IF EXISTS prima_nota_tenant_insert ON public.prima_nota_entries;
CREATE POLICY prima_nota_tenant_insert ON public.prima_nota_entries
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text)))
  );

DROP POLICY IF EXISTS prima_nota_tenant_update ON public.prima_nota_entries;
CREATE POLICY prima_nota_tenant_update ON public.prima_nota_entries
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_permission(( SELECT auth.uid() AS uid), 'can_view_prima_nota'::text)))
  );

-- tariffa_costi_varianti
DROP POLICY IF EXISTS varianti_delete ON public.tariffa_costi_varianti;
CREATE POLICY varianti_delete ON public.tariffa_costi_varianti
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS varianti_insert ON public.tariffa_costi_varianti;
CREATE POLICY varianti_insert ON public.tariffa_costi_varianti
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS varianti_select ON public.tariffa_costi_varianti;
CREATE POLICY varianti_select ON public.tariffa_costi_varianti
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS varianti_update ON public.tariffa_costi_varianti;
CREATE POLICY varianti_update ON public.tariffa_costi_varianti
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  )
  WITH CHECK (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- customer_documents
DROP POLICY IF EXISTS customer_documents_staff_view ON public.customer_documents;
CREATE POLICY customer_documents_staff_view ON public.customer_documents
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR public.has_permission(( SELECT auth.uid() AS uid), 'can_view_customers'::text)))
  );

DROP POLICY IF EXISTS customer_documents_staff_write ON public.customer_documents;
CREATE POLICY customer_documents_staff_write ON public.customer_documents
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR public.has_permission(( SELECT auth.uid() AS uid), 'can_edit_customers'::text)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR public.has_permission(( SELECT auth.uid() AS uid), 'can_edit_customers'::text)))
  );

-- billing_integrations
DROP POLICY IF EXISTS billing_integrations_admin_modify ON public.billing_integrations;
CREATE POLICY billing_integrations_admin_modify ON public.billing_integrations
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  )
  WITH CHECK (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS billing_integrations_admin_select ON public.billing_integrations;
CREATE POLICY billing_integrations_admin_select ON public.billing_integrations
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

-- dunning_actions
DROP POLICY IF EXISTS dunning_actions_admin ON public.dunning_actions;
CREATE POLICY dunning_actions_admin ON public.dunning_actions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- dunning_policies
DROP POLICY IF EXISTS dunning_policies_admin ON public.dunning_policies;
CREATE POLICY dunning_policies_admin ON public.dunning_policies
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) AND (NOT public.utente_e_cliente_esterno()))
  );

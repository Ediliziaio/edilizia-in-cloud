-- Amministratore DI QUALE azienda — lotto 6: 17 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: warehouse_movements, warehouse_stock, warehouse_transfers, warehouse_assignments, ddt_ricezione, goods_receipts, shipments_to_site, material_consumption_daily, proposed_purchase_orders, sal, sal_auto_generation_runs, foto_cantiere_analysis, capomastro_briefings, preventivo_manodopera_assegnazioni.
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
    ('public', 'warehouse_movements', 'warehouse_movements_scoped_access', 'fbbe4ec61ac87e197cc004dc4645628a', 'e_amministratore_di'),
    ('public', 'warehouse_stock', 'warehouse_stock_scoped_access', '472f1d1e65201b7976dc31247b53e9f8', 'e_amministratore_di'),
    ('public', 'warehouse_transfers', 'warehouse_transfers_scoped_access', 'acc4b4eee2563b360f76108f9e085338', 'e_amministratore_di'),
    ('public', 'warehouse_assignments', 'wa_admin_manage', '71856860e389c8d46f920e7fd188635d', 'e_amministratore_di'),
    ('public', 'ddt_ricezione', 'ddt_ricezione_scoped_access', 'abe50c492838bff1b3e84206be11c689', 'e_amministratore_di'),
    ('public', 'goods_receipts', 'goods_receipts_scoped_access', 'abe50c492838bff1b3e84206be11c689', 'e_amministratore_di'),
    ('public', 'shipments_to_site', 'shipments_scoped_access', 'b51d3af6eb91ae9eca3c23c4d2606696', 'e_amministratore_di'),
    ('public', 'material_consumption_daily', 'consumption_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'proposed_purchase_orders', 'ppo_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'sal', 'sal_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'sal_auto_generation_runs', 'sal_runs_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'foto_cantiere_analysis', 'foto_analysis_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'capomastro_briefings', 'briefing_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'preventivo_manodopera_assegnazioni', 'assegnazioni_delete', '72f7066401c09ab0ad83e34137fd8c9d', 'e_amministratore_di'),
    ('public', 'preventivo_manodopera_assegnazioni', 'assegnazioni_insert', '4bf523974d76210afb3076ce7961b167', 'e_amministratore_di'),
    ('public', 'preventivo_manodopera_assegnazioni', 'assegnazioni_select', '72f7066401c09ab0ad83e34137fd8c9d', 'e_amministratore_di'),
    ('public', 'preventivo_manodopera_assegnazioni', 'assegnazioni_update', 'c9a1590d17e090110b614298d71a2f8c', 'e_amministratore_di')
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

-- warehouse_movements
DROP POLICY IF EXISTS warehouse_movements_scoped_access ON public.warehouse_movements;
CREATE POLICY warehouse_movements_scoped_access ON public.warehouse_movements
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) OR (( SELECT s.company_id
   FROM public.warehouse_stock s
  WHERE (s.id = warehouse_movements.stock_item_id)) = ( SELECT public.get_my_company_id() AS get_my_company_id))) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  );

-- warehouse_stock
DROP POLICY IF EXISTS warehouse_stock_scoped_access ON public.warehouse_stock;
CREATE POLICY warehouse_stock_scoped_access ON public.warehouse_stock
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  )
  WITH CHECK (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  );

-- warehouse_transfers
DROP POLICY IF EXISTS warehouse_transfers_scoped_access ON public.warehouse_transfers;
CREATE POLICY warehouse_transfers_scoped_access ON public.warehouse_transfers
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (from_warehouse_id = ANY (public.get_my_warehouse_ids())) OR (to_warehouse_id = ANY (public.get_my_warehouse_ids()))))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (from_warehouse_id = ANY (public.get_my_warehouse_ids())) OR (to_warehouse_id = ANY (public.get_my_warehouse_ids()))))
  );

-- warehouse_assignments
DROP POLICY IF EXISTS wa_admin_manage ON public.warehouse_assignments;
CREATE POLICY wa_admin_manage ON public.warehouse_assignments
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- ddt_ricezione
DROP POLICY IF EXISTS ddt_ricezione_scoped_access ON public.ddt_ricezione;
CREATE POLICY ddt_ricezione_scoped_access ON public.ddt_ricezione
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  );

-- goods_receipts
DROP POLICY IF EXISTS goods_receipts_scoped_access ON public.goods_receipts;
CREATE POLICY goods_receipts_scoped_access ON public.goods_receipts
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (warehouse_id = ANY (public.get_my_warehouse_ids()))))
  );

-- shipments_to_site
DROP POLICY IF EXISTS shipments_scoped_access ON public.shipments_to_site;
CREATE POLICY shipments_scoped_access ON public.shipments_to_site
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (destination_warehouse_id = ANY (public.get_my_warehouse_ids()))))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (destination_warehouse_id = ANY (public.get_my_warehouse_ids()))))
  );

-- material_consumption_daily
DROP POLICY IF EXISTS consumption_admin ON public.material_consumption_daily;
CREATE POLICY consumption_admin ON public.material_consumption_daily
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- proposed_purchase_orders
DROP POLICY IF EXISTS ppo_admin ON public.proposed_purchase_orders;
CREATE POLICY ppo_admin ON public.proposed_purchase_orders
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- sal
DROP POLICY IF EXISTS sal_admin ON public.sal;
CREATE POLICY sal_admin ON public.sal
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- sal_auto_generation_runs
DROP POLICY IF EXISTS sal_runs_admin ON public.sal_auto_generation_runs;
CREATE POLICY sal_runs_admin ON public.sal_auto_generation_runs
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- foto_cantiere_analysis
DROP POLICY IF EXISTS foto_analysis_admin ON public.foto_cantiere_analysis;
CREATE POLICY foto_analysis_admin ON public.foto_cantiere_analysis
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- capomastro_briefings
DROP POLICY IF EXISTS briefing_admin ON public.capomastro_briefings;
CREATE POLICY briefing_admin ON public.capomastro_briefings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- preventivo_manodopera_assegnazioni
DROP POLICY IF EXISTS assegnazioni_delete ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_delete ON public.preventivo_manodopera_assegnazioni
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS assegnazioni_insert ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_insert ON public.preventivo_manodopera_assegnazioni
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS assegnazioni_select ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_select ON public.preventivo_manodopera_assegnazioni
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

DROP POLICY IF EXISTS assegnazioni_update ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_update ON public.preventivo_manodopera_assegnazioni
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  )
  WITH CHECK (
    (((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di)) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role))
  );

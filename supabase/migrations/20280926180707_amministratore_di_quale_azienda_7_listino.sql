-- Amministratore DI QUALE azienda — lotto 7: 18 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: listino_macrocategoria_fields, listino_macrocategorie, listino_override_cliente, listino_prezzi, tipi_impianto, tipi_intervento.
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
    ('public', 'listino_macrocategoria_fields', 'macrofields_delete', '834ad4079b73714df76819be0d83e0a6', 'e_amministratore_di'),
    ('public', 'listino_macrocategoria_fields', 'macrofields_insert', 'b96e80e9900917045048ca34d7c05d72', 'e_amministratore_di'),
    ('public', 'listino_macrocategoria_fields', 'macrofields_update', '834ad4079b73714df76819be0d83e0a6', 'e_amministratore_di'),
    ('public', 'listino_macrocategorie', 'macrocat_delete', 'b4ab0fe6df87ae20eea42496413e58c3', 'e_amministratore_di'),
    ('public', 'listino_macrocategorie', 'macrocat_insert', 'bec30484e90bcb8b265b3d9d57d3b43c', 'e_amministratore_di'),
    ('public', 'listino_macrocategorie', 'macrocat_update', 'b4ab0fe6df87ae20eea42496413e58c3', 'e_amministratore_di'),
    ('public', 'listino_override_cliente', 'listino_override_admin_delete', '4fa0064d17bcdf487deb1bec828dd32f', 'e_amministratore_di'),
    ('public', 'listino_override_cliente', 'listino_override_admin_update', '71856860e389c8d46f920e7fd188635d', 'e_amministratore_di'),
    ('public', 'listino_override_cliente', 'listino_override_admin_write', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di'),
    ('public', 'listino_prezzi', 'listino_prezzi_admin_delete', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'listino_prezzi', 'listino_prezzi_admin_update', 'cf8333815978b9c7edc62c7240ebaeeb', 'e_amministratore_di'),
    ('public', 'listino_prezzi', 'listino_prezzi_admin_write', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di'),
    ('public', 'tipi_impianto', 'tipi_impianto_admin_delete', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'tipi_impianto', 'tipi_impianto_admin_update', 'cf8333815978b9c7edc62c7240ebaeeb', 'e_amministratore_di'),
    ('public', 'tipi_impianto', 'tipi_impianto_admin_write', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di'),
    ('public', 'tipi_intervento', 'tipi_intervento_admin_delete', '2514a80b6286fe4f67b4075df9963b62', 'e_amministratore_di'),
    ('public', 'tipi_intervento', 'tipi_intervento_admin_update', 'cf8333815978b9c7edc62c7240ebaeeb', 'e_amministratore_di'),
    ('public', 'tipi_intervento', 'tipi_intervento_admin_write', 'b216c21b5a7837de93a340d409a1ded5', 'e_amministratore_di')
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

-- listino_macrocategoria_fields
DROP POLICY IF EXISTS macrofields_delete ON public.listino_macrocategoria_fields;
CREATE POLICY macrofields_delete ON public.listino_macrocategoria_fields
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    (EXISTS ( SELECT 1
   FROM public.listino_macrocategorie m
  WHERE ((m.id = listino_macrocategoria_fields.macrocategoria_id) AND (m.company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))
  );

DROP POLICY IF EXISTS macrofields_insert ON public.listino_macrocategoria_fields;
CREATE POLICY macrofields_insert ON public.listino_macrocategoria_fields
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (EXISTS ( SELECT 1
   FROM public.listino_macrocategorie m
  WHERE ((m.id = listino_macrocategoria_fields.macrocategoria_id) AND (m.company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))
  );

DROP POLICY IF EXISTS macrofields_update ON public.listino_macrocategoria_fields;
CREATE POLICY macrofields_update ON public.listino_macrocategoria_fields
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (EXISTS ( SELECT 1
   FROM public.listino_macrocategorie m
  WHERE ((m.id = listino_macrocategoria_fields.macrocategoria_id) AND (m.company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))))
  );

-- listino_macrocategorie
DROP POLICY IF EXISTS macrocat_delete ON public.listino_macrocategorie;
CREATE POLICY macrocat_delete ON public.listino_macrocategorie
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) AND (NOT public.utente_e_cliente_esterno()))
  );

DROP POLICY IF EXISTS macrocat_insert ON public.listino_macrocategorie;
CREATE POLICY macrocat_insert ON public.listino_macrocategorie
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

DROP POLICY IF EXISTS macrocat_update ON public.listino_macrocategorie;
CREATE POLICY macrocat_update ON public.listino_macrocategorie
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) AND (NOT public.utente_e_cliente_esterno()))
  );

-- listino_override_cliente
DROP POLICY IF EXISTS listino_override_admin_delete ON public.listino_override_cliente;
CREATE POLICY listino_override_admin_delete ON public.listino_override_cliente
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS listino_override_admin_update ON public.listino_override_cliente;
CREATE POLICY listino_override_admin_update ON public.listino_override_cliente
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS listino_override_admin_write ON public.listino_override_cliente;
CREATE POLICY listino_override_admin_write ON public.listino_override_cliente
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- listino_prezzi
DROP POLICY IF EXISTS listino_prezzi_admin_delete ON public.listino_prezzi;
CREATE POLICY listino_prezzi_admin_delete ON public.listino_prezzi
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

DROP POLICY IF EXISTS listino_prezzi_admin_update ON public.listino_prezzi;
CREATE POLICY listino_prezzi_admin_update ON public.listino_prezzi
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS listino_prezzi_admin_write ON public.listino_prezzi;
CREATE POLICY listino_prezzi_admin_write ON public.listino_prezzi
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- tipi_impianto
DROP POLICY IF EXISTS tipi_impianto_admin_delete ON public.tipi_impianto;
CREATE POLICY tipi_impianto_admin_delete ON public.tipi_impianto
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

DROP POLICY IF EXISTS tipi_impianto_admin_update ON public.tipi_impianto;
CREATE POLICY tipi_impianto_admin_update ON public.tipi_impianto
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS tipi_impianto_admin_write ON public.tipi_impianto;
CREATE POLICY tipi_impianto_admin_write ON public.tipi_impianto
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- tipi_intervento
DROP POLICY IF EXISTS tipi_intervento_admin_delete ON public.tipi_intervento;
CREATE POLICY tipi_intervento_admin_delete ON public.tipi_intervento
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  );

DROP POLICY IF EXISTS tipi_intervento_admin_update ON public.tipi_intervento;
CREATE POLICY tipi_intervento_admin_update ON public.tipi_intervento
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)) AND (NOT public.utente_e_cliente_esterno()))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

DROP POLICY IF EXISTS tipi_intervento_admin_write ON public.tipi_intervento;
CREATE POLICY tipi_intervento_admin_write ON public.tipi_intervento
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

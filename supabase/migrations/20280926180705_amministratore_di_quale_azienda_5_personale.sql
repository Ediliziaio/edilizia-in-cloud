-- Amministratore DI QUALE azienda — lotto 5: 16 policy legate
-- all'azienda attiva (26/09/2026). Richiede il lotto 1 (e_amministratore_di).
--
-- Tabelle: hr_assenze, hr_assenze_eventi, hr_kpi, hr_kpi_valori, hr_mansioni, hr_onboarding_steps, hr_profili, hr_richieste, hr_task, hr_timbrature, storage.objects, durc_documents, documenti_operai, subappaltatori_documenti, expense_reports, expense_report_items.
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
    ('public', 'hr_assenze', 'hr_assenze_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'hr_assenze_eventi', 'hr_assenze_admin', 'cc4cf38e6cf96bc789523eac48a8e5b9', 'e_amministratore_di'),
    ('public', 'hr_kpi', 'hr_kpi_admin', 'cc4cf38e6cf96bc789523eac48a8e5b9', 'e_amministratore_di'),
    ('public', 'hr_kpi_valori', 'hr_kpi_valori_admin', '10be9c75b8e2e0a5ca3d05e91dfa7454', 'e_amministratore_di'),
    ('public', 'hr_mansioni', 'hr_mansioni_admin', 'cc4cf38e6cf96bc789523eac48a8e5b9', 'e_amministratore_di'),
    ('public', 'hr_onboarding_steps', 'hr_steps_admin', 'd3c0ff62156747591d50c6c5fc341d95', 'e_amministratore_di'),
    ('public', 'hr_profili', 'hr_profili_admin', '4a2e75b7b295fccc79f9ecd88a831377', 'e_amministratore_di'),
    ('public', 'hr_richieste', 'hr_richieste_admin', '71856860e389c8d46f920e7fd188635d', 'e_amministratore_di'),
    ('public', 'hr_task', 'hr_task_admin', 'cc4cf38e6cf96bc789523eac48a8e5b9', 'e_amministratore_di'),
    ('public', 'hr_timbrature', 'hr_timbrature_admin', '4a2e75b7b295fccc79f9ecd88a831377', 'e_amministratore_di'),
    ('storage', 'objects', 'hr_doc_storage_admin', '759eaf309bc55735a2b3f9444b69cc22', 'e_amministratore_di'),
    ('public', 'durc_documents', 'durc_admin', '63a10ca614d1abd891b0280061855690', 'e_amministratore_di'),
    ('public', 'documenti_operai', 'doc_operai_company_access', 'b5d1ded853ede6566a0b3762aad474dd', 'e_amministratore_di'),
    ('public', 'subappaltatori_documenti', 'sub_docs_admin', '2c52a82a8545884a8c67b001c79ab840', 'e_amministratore_di'),
    ('public', 'expense_reports', 'expense_reports_self_or_admin', '07213f13caeac5f13810529840788747', 'e_amministratore_di'),
    ('public', 'expense_report_items', 'expense_report_items_via_report', '07536ce7e18022bcd666cb97f3b2c92c', 'e_amministratore_di')
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

-- hr_assenze
DROP POLICY IF EXISTS hr_assenze_admin ON public.hr_assenze;
CREATE POLICY hr_assenze_admin ON public.hr_assenze
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- hr_assenze_eventi
DROP POLICY IF EXISTS hr_assenze_admin ON public.hr_assenze_eventi;
CREATE POLICY hr_assenze_admin ON public.hr_assenze_eventi
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- hr_kpi
DROP POLICY IF EXISTS hr_kpi_admin ON public.hr_kpi;
CREATE POLICY hr_kpi_admin ON public.hr_kpi
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- hr_kpi_valori
DROP POLICY IF EXISTS hr_kpi_valori_admin ON public.hr_kpi_valori;
CREATE POLICY hr_kpi_valori_admin ON public.hr_kpi_valori
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((EXISTS ( SELECT 1
   FROM public.hr_kpi k
  WHERE ((k.id = hr_kpi_valori.kpi_id) AND (k.company_id = public.get_my_company_id())))) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((EXISTS ( SELECT 1
   FROM public.hr_kpi k
  WHERE ((k.id = hr_kpi_valori.kpi_id) AND (k.company_id = public.get_my_company_id())))) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- hr_mansioni
DROP POLICY IF EXISTS hr_mansioni_admin ON public.hr_mansioni;
CREATE POLICY hr_mansioni_admin ON public.hr_mansioni
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- hr_onboarding_steps
DROP POLICY IF EXISTS hr_steps_admin ON public.hr_onboarding_steps;
CREATE POLICY hr_steps_admin ON public.hr_onboarding_steps
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((EXISTS ( SELECT 1
   FROM public.employees e
  WHERE ((e.id = hr_onboarding_steps.employee_id) AND (e.company_id = public.get_my_company_id())))) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- hr_profili
DROP POLICY IF EXISTS hr_profili_admin ON public.hr_profili;
CREATE POLICY hr_profili_admin ON public.hr_profili
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)))
  )
  WITH CHECK (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)))
  );

-- hr_richieste
DROP POLICY IF EXISTS hr_richieste_admin ON public.hr_richieste;
CREATE POLICY hr_richieste_admin ON public.hr_richieste
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role)))
  );

-- hr_task
DROP POLICY IF EXISTS hr_task_admin ON public.hr_task;
CREATE POLICY hr_task_admin ON public.hr_task
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- hr_timbrature
DROP POLICY IF EXISTS hr_timbrature_admin ON public.hr_timbrature;
CREATE POLICY hr_timbrature_admin ON public.hr_timbrature
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)))
  )
  WITH CHECK (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role)))
  );

-- storage.objects
DROP POLICY IF EXISTS hr_doc_storage_admin ON storage.objects;
CREATE POLICY hr_doc_storage_admin ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((bucket_id = 'hr-documenti'::text) AND ((storage.foldername(name))[1] = (public.get_my_company_id())::text) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'company_staff'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((bucket_id = 'hr-documenti'::text) AND ((storage.foldername(name))[1] = (public.get_my_company_id())::text) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'company_staff'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- durc_documents
DROP POLICY IF EXISTS durc_admin ON public.durc_documents;
CREATE POLICY durc_admin ON public.durc_documents
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = public.get_my_company_id()) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- documenti_operai
DROP POLICY IF EXISTS doc_operai_company_access ON public.documenti_operai;
CREATE POLICY doc_operai_company_access ON public.documenti_operai
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'company_staff'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(auth.uid(), 'company_staff'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  );

-- subappaltatori_documenti
DROP POLICY IF EXISTS sub_docs_admin ON public.subappaltatori_documenti;
CREATE POLICY sub_docs_admin ON public.subappaltatori_documenti
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((company_id = ( SELECT public.get_my_company_id() AS get_my_company_id)) AND ( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di))
  );

-- expense_reports
DROP POLICY IF EXISTS expense_reports_self_or_admin ON public.expense_reports;
CREATE POLICY expense_reports_self_or_admin ON public.expense_reports
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role) OR (employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = ( SELECT auth.uid() AS uid))))))
  )
  WITH CHECK (
    ((company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (employee_id IN ( SELECT employees.id
   FROM public.employees
  WHERE (employees.user_id = ( SELECT auth.uid() AS uid))))))
  );

-- expense_report_items
DROP POLICY IF EXISTS expense_report_items_via_report ON public.expense_report_items;
CREATE POLICY expense_report_items_via_report ON public.expense_report_items
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    (EXISTS ( SELECT 1
   FROM public.expense_reports er
  WHERE ((er.id = expense_report_items.report_id) AND (er.company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR public.has_role(( SELECT auth.uid() AS uid), 'accountant'::public.app_role) OR (er.employee_id IN ( SELECT employees.id
           FROM public.employees
          WHERE (employees.user_id = ( SELECT auth.uid() AS uid))))))))
  )
  WITH CHECK (
    (EXISTS ( SELECT 1
   FROM public.expense_reports er
  WHERE ((er.id = expense_report_items.report_id) AND (er.company_id = public.get_my_company_id()) AND (( SELECT public.e_amministratore_di(public.get_my_company_id()) AS e_amministratore_di) OR public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) OR (er.employee_id IN ( SELECT employees.id
           FROM public.employees
          WHERE (employees.user_id = ( SELECT auth.uid() AS uid))))))))
  );

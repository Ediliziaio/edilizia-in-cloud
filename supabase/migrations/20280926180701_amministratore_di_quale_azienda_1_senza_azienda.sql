-- Amministratore DI QUALE azienda — lotto 1 di N: le funzioni nuove e le
-- policy che non legavano il ruolo a nessuna azienda (26/09/2026).
--
-- Il ruolo company_admin sta in user_roles senza azienda: l'azienda di un
-- amministratore è profiles.company_id, più gli accessi multi-azienda attivi
-- con access_role = 'company_admin'. Molte policy chiedevano solo «hai il
-- ruolo?». Questo lotto chiude le 15 policy che non legavano il ruolo (di
-- amministratore o di staff) a NESSUNA azienda: chi l'aveva in un'azienda
-- qualsiasi toccava i dati di tutte, senza bisogno di inviti.
--
-- Provato prima, in transazioni annullate, con utenti veri di due aziende demo:
--   · uno staff di A inseriva in order_campo_assignments un'assegnazione su una
--     commessa di B e da lì leggeva la commessa e le sue righe coi prezzi
--     (0 → 1 commessa, 0 → 3 righe): orders, order_items, order_work_phases e
--     campo_rapportini si aprono a chi è assegnato. Bastava l'id della commessa;
--   · rapportini di cantiere e documenti dei dipendenti si potevano scrivere
--     con l'azienda di un altro (campo_rapportini, documenti_dipendenti);
--   · ogni amministratore leggeva i canali di messaggistica (chat Telegram,
--     telefono WhatsApp) degli utenti di tutte le aziende, scriveva i permessi
--     personali (user_permissions) e la formazione AI di chiunque, caricava e
--     cancellava loghi (bucket branding) e allegati del personale di tutte le
--     aziende;
--   · la configurazione del punteggio dei lead si poteva scrivere per un'altra
--     azienda (il controllo c'era in lettura ma non in scrittura).
--
-- Funzioni nuove:
--   · aziende_amministrate(): le aziende di cui chi chiama è amministratore:
--     l'azienda del profilo se ha il ruolo company_admin, più gli accessi
--     multi-azienda attivi da amministratore. Vuota per anonimi, bloccati e
--     service role. È la regola di aziende_con_permesso senza i permessi dello
--     staff;
--   · e_amministratore_di(azienda): la stessa domanda per un'azienda sola, in
--     un solo EXISTS. Confrontata con aziende_amministrate() su 99 utenti veri
--     (bloccati, accessi multi-azienda, staff, super admin): 498 casi, stesse
--     risposte;
--   · allegato_personale_azienda(nome): l'azienda di un file del bucket
--     personnel-attachments (employees/<dipendente>/… o external-teams/<squadra>/…).
-- Le prime due sono eseguibili anche da anon perché stanno in policy con ruolo
-- public (regola di 20280912000005): a un anonimo rispondono «vuoto» e «no».
--
-- Devono continuare a funzionare: staff e amministratore sulle commesse della
-- propria azienda (assegnazioni, rapportini, approvazioni), l'operaio e il
-- subappaltatore sui propri rapportini e documenti, il super admin dappertutto,
-- il server (service role, fuori dalla RLS).
--
-- Rilanciabile: CREATE OR REPLACE, DROP POLICY IF EXISTS + CREATE POLICY. La
-- guardia in testa ferma tutto se una di queste policy è stata cambiata da
-- un'altra sessione dopo il censimento (impronta diversa e non ancora riscritta
-- da qui). Le RESTRICTIVE blocco_utente_bloccato non si toccano.

SET LOCAL lock_timeout = '3s';

-- ── Guardia: le policy sono ancora quelle censite ──────────────────────────
-- Impronta = md5 del testo che il database dà con search_path vuoto
-- (qualifica tutto), USING e WITH CHECK separati da '#'. «segno» riconosce la
-- versione già riscritta da questo lotto, così la migrazione resta rilanciabile.
DO $guardia$
DECLARE
  r record;
  v_path text := current_setting('search_path');
  v_testo text;
BEGIN
  PERFORM set_config('search_path', '', true);
  FOR r IN SELECT * FROM (VALUES
    ('public',  'order_campo_assignments', 'oca_insert',                                      '6924fe7df61e4ab869924f2af604eed4', 'get_order_company_id\(order_id\)'),
    ('public',  'order_campo_assignments', 'oca_delete',                                      'fb461ef9bb032559b00142726f6bd123', 'get_user_company_id'),
    ('public',  'campo_rapportini',        'cr_insert',                                       'bb468611dc4ebfa22a574d5ba07c4fb6', 'get_order_company_id\(order_id\)'),
    ('public',  'campo_rapportini',        'cr_update',                                       'a3e24e3c2d163babaff1f3b99f74caae', 'get_order_company_id\(order_id\)'),
    ('public',  'documenti_dipendenti',    'dd_insert',                                       '6924fe7df61e4ab869924f2af604eed4', 'get_user_company_id'),
    ('public',  'lead_scoring_config',     'lead_scoring_config_upsert',                      '59ab70aee411d048e4042063fa5506c8', '#.*profiles'),
    ('public',  'user_messaging_channels', 'user_messaging_channels_lettura_authenticated',   '97b4f754c3563094e481e609fc0ca3dc', 'aziende_amministrate'),
    ('public',  'user_permissions',        'user_permissions_admin_cud',                      'd973f8eb39cd8576f390efc3023b4001', 'aziende_amministrate'),
    ('public',  'user_permissions',        'user_permissions_select',                         'dea41b094371ca6c1ce43f47920106be', 'aziende_amministrate'),
    ('public',  'ai_literacy_training',    'literacy_admin_write',                            '41e27696580224ce4925af8469ab0686', 'aziende_amministrate'),
    ('public',  'ai_literacy_training',    'literacy_self_or_admin',                          'aa24dca148d9d22c1589391879b75d86', 'aziende_amministrate'),
    ('storage', 'objects',                 'branding_insert_admin',                           '76ca0f2f3542b0bfdb167a92da90627e', 'aziende_amministrate'),
    ('storage', 'objects',                 'branding_update_admin',                           '649a2eb4e1a0ea5b3ea736c3bc989c2a', 'aziende_amministrate'),
    ('storage', 'objects',                 'branding_delete_admin',                           '649a2eb4e1a0ea5b3ea736c3bc989c2a', 'aziende_amministrate'),
    ('storage', 'objects',                 'Company admins can upload personnel attachments', '0f7e42f28ec428ac2892695532cb7371', 'allegato_personale_azienda'),
    ('storage', 'objects',                 'Company admins can delete personnel attachments', 'd4a9b32e181911a990d7b2bfaf8db663', 'allegato_personale_azienda')
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

-- ── Funzioni ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aziende_amministrate()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Solo per chi non è bloccato. Anonimi e service role non hanno auth.uid():
  -- nessuna riga, elenco vuoto.
  SELECT coalesce(array(
    -- l'azienda del profilo, se ha il ruolo di amministratore
    SELECT p.company_id
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND NOT coalesce(p.is_blocked, false)
       AND p.company_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.user_roles r
                    WHERE r.user_id = p.id AND r.role = 'company_admin'::public.app_role)
    UNION
    -- gli accessi multi-azienda attivi, non scaduti, da amministratore
    SELECT m.company_id
      FROM public.multi_company_access m
      JOIN public.profiles p ON p.id = m.user_id AND NOT coalesce(p.is_blocked, false)
     WHERE m.user_id = auth.uid()
       AND m.access_role = 'company_admin'
       AND m.status = 'active'
       AND (m.expires_at IS NULL OR m.expires_at > now())
  ), '{}'::uuid[]);
$$;

COMMENT ON FUNCTION public.aziende_amministrate() IS
  'Le aziende di cui chi chiama è amministratore: azienda del profilo col ruolo company_admin + accessi multi-azienda attivi da amministratore. Vuota per anonimi, bloccati e service role. Da usare al posto di has_role(…, ''company_admin'') nudo.';

CREATE OR REPLACE FUNCTION public.e_amministratore_di(p_azienda uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- La regola di aziende_amministrate() per un'azienda sola, in un solo
  -- EXISTS (~30 µs contro ~200 µs di has_role): si può chiamare anche dentro
  -- le funzioni che le policy valutano riga per riga.
  SELECT p_azienda IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = auth.uid()
       AND NOT coalesce(p.is_blocked, false)
       AND (
         (p.company_id = p_azienda
          AND EXISTS (SELECT 1 FROM public.user_roles r
                       WHERE r.user_id = p.id AND r.role = 'company_admin'::public.app_role))
         OR EXISTS (SELECT 1 FROM public.multi_company_access m
                     WHERE m.user_id = p.id
                       AND m.company_id = p_azienda
                       AND m.access_role = 'company_admin'
                       AND m.status = 'active'
                       AND (m.expires_at IS NULL OR m.expires_at > now()))
       )
  );
$$;

COMMENT ON FUNCTION public.e_amministratore_di(uuid) IS
  'Chi chiama è amministratore di QUESTA azienda? (azienda del profilo col ruolo company_admin, o accesso multi-azienda attivo da amministratore). Nelle policy: ( SELECT public.e_amministratore_di(public.get_my_company_id()) ).';

CREATE OR REPLACE FUNCTION public.allegato_personale_azienda(p_nome text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE split_part(p_nome, '/', 1)
    WHEN 'employees' THEN
      (SELECT e.company_id FROM public.employees e WHERE e.id::text = split_part(p_nome, '/', 2))
    WHEN 'external-teams' THEN
      (SELECT t.company_id FROM public.external_teams t WHERE t.id::text = split_part(p_nome, '/', 2))
  END;
$$;

COMMENT ON FUNCTION public.allegato_personale_azienda(text) IS
  'Azienda proprietaria di un file del bucket personnel-attachments (employees/<dipendente>/… o external-teams/<squadra>/…).';

REVOKE ALL ON FUNCTION public.aziende_amministrate() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.e_amministratore_di(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.allegato_personale_azienda(text) FROM PUBLIC, anon;
-- anon: servono a VALUTARE le policy con ruolo public; rispondono vuoto e no.
GRANT EXECUTE ON FUNCTION public.aziende_amministrate() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.e_amministratore_di(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allegato_personale_azienda(text) TO authenticated, service_role;

INSERT INTO public.funzioni_pubbliche_di_proposito (nome, motivo) VALUES
  ('aziende_amministrate',
   'Helper di policy RLS con ruolo public: senza EXECUTE una lettura anonima fallirebbe invece di non restituire righe. A un anonimo restituisce un elenco vuoto.'),
  ('e_amministratore_di',
   'Helper di policy RLS con ruolo public: senza EXECUTE una lettura anonima fallirebbe invece di non restituire righe. A un anonimo risponde sempre no.')
ON CONFLICT (nome) DO UPDATE SET motivo = EXCLUDED.motivo;

-- ── order_campo_assignments ─────────────────────────────────────────────────
-- Chi assegna una persona al cantiere lo fa sulle commesse della propria
-- azienda (la stessa regola della lettura, oca_select), e l'assegnazione sta
-- nell'azienda della commessa.
DROP POLICY IF EXISTS oca_insert ON public.order_campo_assignments;
CREATE POLICY oca_insert ON public.order_campo_assignments
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((company_id = public.get_order_company_id(order_id)) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (EXISTS ( SELECT 1
       FROM public.user_roles ur
      WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['company_admin'::public.app_role, 'company_staff'::public.app_role]))))))))
  );

DROP POLICY IF EXISTS oca_delete ON public.order_campo_assignments;
CREATE POLICY oca_delete ON public.order_campo_assignments
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (EXISTS ( SELECT 1
       FROM public.user_roles ur
      WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['company_admin'::public.app_role, 'company_staff'::public.app_role])))))))
  );

-- ── campo_rapportini ────────────────────────────────────────────────────────
-- Il rapportino sta nell'azienda della sua commessa; l'ufficio lo modifica solo
-- nella propria azienda (come cr_select).
DROP POLICY IF EXISTS cr_insert ON public.campo_rapportini;
CREATE POLICY cr_insert ON public.campo_rapportini
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    ((user_id = ( SELECT auth.uid() AS uid)) AND (company_id = public.get_order_company_id(order_id)) AND ((EXISTS ( SELECT 1
       FROM public.order_campo_assignments oca
      WHERE ((oca.order_id = campo_rapportini.order_id) AND (oca.user_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
       FROM (public.order_employees oe
         JOIN public.employees e ON ((e.id = oe.employee_id)))
      WHERE ((oe.order_id = campo_rapportini.order_id) AND (e.user_id = ( SELECT auth.uid() AS uid)))))))
  );

DROP POLICY IF EXISTS cr_update ON public.campo_rapportini;
CREATE POLICY cr_update ON public.campo_rapportini
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    (((user_id = ( SELECT auth.uid() AS uid)) AND (approvato = false)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (EXISTS ( SELECT 1
       FROM public.user_roles ur
      WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['company_admin'::public.app_role, 'company_staff'::public.app_role])))))))
  )
  WITH CHECK (
    ((company_id = public.get_order_company_id(order_id)) AND (((user_id = ( SELECT auth.uid() AS uid)) AND (approvato = false)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (EXISTS ( SELECT 1
       FROM public.user_roles ur
      WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['company_admin'::public.app_role, 'company_staff'::public.app_role]))))))))
  );

-- ── documenti_dipendenti ────────────────────────────────────────────────────
-- L'ufficio carica documenti per le persone della propria azienda (come
-- dd_select); il dipendente per sé resta con dd_insert_self.
DROP POLICY IF EXISTS dd_insert ON public.documenti_dipendenti;
CREATE POLICY dd_insert ON public.documenti_dipendenti
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((company_id = ( SELECT public.get_user_company_id(( SELECT auth.uid() AS uid)) AS get_user_company_id)) AND (EXISTS ( SELECT 1
       FROM public.user_roles ur
      WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = ANY (ARRAY['company_admin'::public.app_role, 'company_staff'::public.app_role])))))))
  );

-- ── lead_scoring_config ─────────────────────────────────────────────────────
-- La scrittura chiede la stessa azienda della lettura.
DROP POLICY IF EXISTS lead_scoring_config_upsert ON public.lead_scoring_config;
CREATE POLICY lead_scoring_config_upsert ON public.lead_scoring_config
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    ((EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['company_admin'::public.app_role, 'super_admin'::public.app_role]))))) AND ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'super_admin'::public.app_role))))))
  )
  WITH CHECK (
    ((EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = ANY (ARRAY['company_admin'::public.app_role, 'super_admin'::public.app_role]))))) AND ((company_id IN ( SELECT profiles.company_id
       FROM public.profiles
      WHERE (profiles.id = ( SELECT auth.uid() AS uid)))) OR (EXISTS ( SELECT 1
       FROM public.user_roles
      WHERE ((user_roles.user_id = ( SELECT auth.uid() AS uid)) AND (user_roles.role = 'super_admin'::public.app_role))))))
  );

-- ── user_messaging_channels ─────────────────────────────────────────────────
-- I canali degli altri li vede l'amministratore della LORO azienda.
DROP POLICY IF EXISTS user_messaging_channels_lettura_authenticated ON public.user_messaging_channels;
CREATE POLICY user_messaging_channels_lettura_authenticated ON public.user_messaging_channels
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (((company_id IS NOT NULL) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (company_id IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))) OR (user_id = ( SELECT auth.uid() AS uid)))
  );

-- ── user_permissions ────────────────────────────────────────────────────────
-- Le eccezioni personali di una persona le gestisce l'amministratore
-- dell'azienda di quella persona.
DROP POLICY IF EXISTS user_permissions_admin_cud ON public.user_permissions;
CREATE POLICY user_permissions_admin_cud ON public.user_permissions
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.get_user_company_id(user_id) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))
  )
  WITH CHECK (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.get_user_company_id(user_id) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))
  );

DROP POLICY IF EXISTS user_permissions_select ON public.user_permissions;
CREATE POLICY user_permissions_select ON public.user_permissions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.get_user_company_id(user_id) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))
  );

-- ── ai_literacy_training ────────────────────────────────────────────────────
DROP POLICY IF EXISTS literacy_admin_write ON public.ai_literacy_training;
CREATE POLICY literacy_admin_write ON public.ai_literacy_training
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.get_user_company_id(user_id) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))
  );

DROP POLICY IF EXISTS literacy_self_or_admin ON public.ai_literacy_training;
CREATE POLICY literacy_self_or_admin ON public.ai_literacy_training
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.get_user_company_id(user_id) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest)))
  );

-- ── storage: bucket branding (cartella = azienda) ──────────────────────────
-- storage.objects prende un lock esclusivo su tutto lo storage: lock_timeout
-- in testa, meglio fallire che fermare i caricamenti.
DROP POLICY IF EXISTS branding_insert_admin ON storage.objects;
CREATE POLICY branding_insert_admin ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((bucket_id = 'branding'::text) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((storage.foldername(name))[1] IN ( SELECT (unnest(public.aziende_amministrate()))::text AS unnest))))
  );

DROP POLICY IF EXISTS branding_update_admin ON storage.objects;
CREATE POLICY branding_update_admin ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (
    ((bucket_id = 'branding'::text) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((storage.foldername(name))[1] IN ( SELECT (unnest(public.aziende_amministrate()))::text AS unnest))))
  );

DROP POLICY IF EXISTS branding_delete_admin ON storage.objects;
CREATE POLICY branding_delete_admin ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((bucket_id = 'branding'::text) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR ((storage.foldername(name))[1] IN ( SELECT (unnest(public.aziende_amministrate()))::text AS unnest))))
  );

-- ── storage: bucket personnel-attachments (dipendente o squadra) ───────────
-- Le policy restano solo per chi ha fatto login: un anonimo non passava
-- comunque, e così non deve poter eseguire allegato_personale_azienda.
DROP POLICY IF EXISTS "Company admins can upload personnel attachments" ON storage.objects;
CREATE POLICY "Company admins can upload personnel attachments" ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    ((bucket_id = 'personnel-attachments'::text) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.allegato_personale_azienda(name) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))))
  );

DROP POLICY IF EXISTS "Company admins can delete personnel attachments" ON storage.objects;
CREATE POLICY "Company admins can delete personnel attachments" ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (
    ((bucket_id = 'personnel-attachments'::text) AND (( SELECT public.has_role(( SELECT auth.uid() AS uid), 'super_admin'::public.app_role) AS has_role) OR (public.allegato_personale_azienda(name) IN ( SELECT unnest(public.aziende_amministrate()) AS unnest))))
  );

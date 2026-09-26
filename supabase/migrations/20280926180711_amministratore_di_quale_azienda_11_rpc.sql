-- Amministratore DI QUALE azienda — lotto 11: le RPC che decidevano «sei
-- amministratore?» dal solo ruolo (26/09/2026). Richiede il lotto 1
-- (e_amministratore_di).
--
-- Queste funzioni SECURITY DEFINER controllavano l'azienda (accesso, azienda
-- attiva o azienda della riga) e poi chiedevano has_role(…, 'company_admin'),
-- che non ha azienda. L'amministratore della propria azienda A, entrato in B
-- come staff, in B poteva:
--   · leggere i cedolini dei dipendenti (cedolino_visibile_a_chi_chiede, e con
--     lei cedolino_calcola_base, cedolino_genera, cedolino_ore_periodo,
--     cedolino_per_stampa);
--   · approvare o rifiutare le richieste di ferie e permessi, che scalano i
--     residui (hr_update_richiesta_stato);
--   · approvare, modificare, rifiutare e annullare le azioni proposte da
--     Silvio agli altri (silvio_tool_*), e aprire a Silvio tutti gli ambiti,
--     HR compresa (silvio_ambito_consentito);
--   · scrivere le memorie AI dell'azienda, i consensi della rete dati e i
--     permessi delle azioni AI (record_persona_memory, e tramite
--     ai_assert_company_admin_access: data_network_set_consent,
--     set_ai_action_permission, literacy_set_completion,
--     silvio_decision_log_audit_export);
--   · modificare le dashboard degli altri e quelle aziendali o per ruolo
--     (save_dashboard, clone_template_to_company, set_company_role_dashboard;
--     get_dashboard e list_dashboards dicevano «puoi modificare»);
--   · cambiare il magazzino predefinito (set_default_warehouse);
--   · vedere la casella email condivisa e le tabelle di Silvio: 33 policy
--     chiamano is_email_staff_interno();
--   · vedere costi e margini (has_cost_permission, oggi non chiamata dall'app).
--
-- Ora il pezzo «ha il ruolo company_admin» diventa e_amministratore_di()
-- dell'azienda di cui si parla (quella passata, quella della riga o quella in
-- cui si lavora). Il resto di ogni funzione non cambia.
--
-- Metodo, come 20280921110000 e 20280926041500: per ogni funzione si prende la
-- definizione dal database (pg_get_functiondef), si controlla l'impronta del
-- corpo, si sostituisce un solo pezzo (contato: deve comparire una volta) e
-- la si ricrea. CREATE OR REPLACE tiene proprietario e GRANT. Rilanciabile: una
-- funzione già ritoccata (ha il pezzo nuovo e non più il vecchio) si salta; una
-- cambiata da altri dopo il censimento ferma tutto.
--
-- Il 26/09 nessun amministratore lavorava in un'azienda diversa dalla propria
-- se non da amministratore: per gli utenti di oggi le risposte non cambiano.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION pg_temp.ritocca(p_firma text, p_impronta text, p_vecchio text, p_nuovo text)
RETURNS void
LANGUAGE plpgsql
AS $ritocca$
DECLARE
  v_def text;
  v_src text;
  v_volte int;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosrc INTO v_def, v_src
    FROM pg_proc p WHERE p.oid = to_regprocedure(p_firma);
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Funzione % non trovata: il lotto va rivisto', p_firma;
  END IF;
  -- già ritoccata da questo lotto
  IF strpos(v_src, p_nuovo) > 0 AND strpos(v_src, p_vecchio) = 0 THEN
    RETURN;
  END IF;
  IF md5(v_src) <> p_impronta THEN
    RAISE EXCEPTION 'Funzione % cambiata dopo il censimento: il lotto va rivisto', p_firma;
  END IF;
  v_volte := (length(v_def) - length(replace(v_def, p_vecchio, ''))) / length(p_vecchio);
  IF v_volte <> 1 THEN
    RAISE EXCEPTION 'In % il pezzo da cambiare compare % volte invece di una', p_firma, v_volte;
  END IF;
  EXECUTE replace(v_def, p_vecchio, p_nuovo);
END
$ritocca$;

SELECT pg_temp.ritocca(
  'public.ai_assert_company_admin_access(uuid)', '5494e127fc736f6351a78eb3972bb35c',
  $v$     OR public.has_role(auth.uid(), 'company_admin'::public.app_role) THEN$v$,
  $n$     OR public.e_amministratore_di(p_company_id) THEN$n$);

SELECT pg_temp.ritocca(
  'public.cedolino_visibile_a_chi_chiede(uuid)', '8fc6a2200b3d15b8d21da22cd120d969',
  $v$         OR public.has_role(auth.uid(), 'company_admin'::public.app_role)$v$,
  $n$         OR public.e_amministratore_di(e.company_id)$n$);

SELECT pg_temp.ritocca(
  'public.clone_template_to_company(uuid,text,text)', '18467107453af961bec26fd8daa78ade',
  $v$    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('company_admin','super_admin')
    ) INTO v_is_admin;$v$,
  $n$    v_is_admin := public.has_role(auth.uid(), 'super_admin'::public.app_role)
                  OR public.e_amministratore_di(v_company_id);$n$);

SELECT pg_temp.ritocca(
  'public.set_company_role_dashboard(public.app_role,uuid)', '83991d9fd61c8b8da5bb7d8e5f0337cd',
  $v$  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('company_admin','super_admin')
  ) INTO v_is_admin;$v$,
  $n$  v_is_admin := public.has_role(auth.uid(), 'super_admin'::public.app_role)
                OR public.e_amministratore_di(v_company_id);$n$);

SELECT pg_temp.ritocca(
  'public.get_dashboard(uuid)', '45a5a5f582a204290cc71cc169296715',
  $v$                OR public.has_role(v_user_id, 'company_admin'::app_role);$v$,
  $n$                OR public.e_amministratore_di(v_company_id);$n$);

SELECT pg_temp.ritocca(
  'public.list_dashboards()', '8c9f14ff25327210d0a964e81ccdf3dd',
  $v$                            OR public.has_role(v_user_id, 'company_admin'::app_role)),$v$,
  $n$                            OR public.e_amministratore_di(v_company_id)),$n$);

SELECT pg_temp.ritocca(
  'public.save_dashboard(uuid,text,text,text,text,jsonb,text)', 'de1f69932eda0fa638d7ef592008e4f0',
  $v$     AND NOT public.has_role(v_user_id, 'company_admin'::app_role) THEN$v$,
  $n$     AND NOT public.e_amministratore_di(v_company_id) THEN$n$);

SELECT pg_temp.ritocca(
  'public.has_cost_permission(uuid,text)', '3bddb8d47ff65c9431ac0ebe69895673',
  $v$    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user
        AND role IN ('super_admin'::public.app_role, 'company_admin'::public.app_role)
    ) INTO v_is_admin;$v$,
  $n$    -- Per chi chiama: amministratore dell'azienda in cui lavora. Per un altro
    -- utente resta il ruolo, come prima.
    IF p_user IS NOT DISTINCT FROM auth.uid() THEN
      v_is_admin := public.has_role(p_user, 'super_admin'::public.app_role)
                    OR public.e_amministratore_di(public.get_effective_company_id());
    ELSE
      SELECT EXISTS(
        SELECT 1 FROM public.user_roles
        WHERE user_id = p_user
          AND role IN ('super_admin'::public.app_role, 'company_admin'::public.app_role)
      ) INTO v_is_admin;
    END IF;$n$);

SELECT pg_temp.ritocca(
  'public.hr_update_richiesta_stato(uuid,text,text)', 'ee1ae3ba1cdcc209951cefa74e40f3e2',
  $v$  IF NOT (
    public.has_role(v_actor, 'company_admin'::public.app_role)
    OR public.has_role(v_actor, 'super_admin'::public.app_role)
  ) THEN$v$,
  $n$  IF NOT (
    public.e_amministratore_di(v_req.company_id)
    OR public.has_role(v_actor, 'super_admin'::public.app_role)
  ) THEN$n$);

SELECT pg_temp.ritocca(
  'public.is_email_staff_interno()', '91e7f3c39c14bb7f340d010482a577ee',
  $v$      OR public.has_role(auth.uid(), 'company_admin'::public.app_role)$v$,
  $n$      OR public.e_amministratore_di(public.get_my_company_id())$n$);

SELECT pg_temp.ritocca(
  'public.record_persona_memory(uuid,uuid,text,text,text,text,numeric)', '13b5737fcdb93bec3450d3ed6868652a',
  $v$      IF NOT public.has_role(auth.uid(), 'company_admin'::public.app_role) THEN$v$,
  $n$      IF NOT public.e_amministratore_di(p_company_id) THEN$n$);

SELECT pg_temp.ritocca(
  'public.set_default_warehouse(uuid)', 'e9c2f6785deb9625d202b5811b5a01af',
  $v$  IF NOT (public.has_role(auth.uid(), 'company_admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN$v$,
  $n$  IF NOT (public.e_amministratore_di(v_company_id) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN$n$);

SELECT pg_temp.ritocca(
  'public.silvio_ambito_consentito(text)', '77c1f3727e3af8d7ea52bbe7681bab73',
  $v$  IF public.is_super_admin(uid) OR public.has_role(uid, 'company_admin') THEN RETURN true; END IF;$v$,
  $n$  IF public.is_super_admin(uid) OR public.e_amministratore_di(public.get_my_company_id()) THEN RETURN true; END IF;$n$);

SELECT pg_temp.ritocca(
  'public.silvio_tool_approve_proposal_with_edits(uuid,uuid,jsonb,text)', 'd3c23664a3a277edf75744f9dac600bb',
  $v$    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR v_user_id = auth.uid()$v$,
  $n$    OR public.e_amministratore_di(p_company_id)
    OR v_user_id = auth.uid()$n$);

SELECT pg_temp.ritocca(
  'public.silvio_tool_batch_approve_proposals(uuid,uuid[])', '24761b097e981104e0f6284fa003da3a',
  $v$    OR public.has_role(auth.uid(), 'company_admin'::public.app_role);$v$,
  $n$    OR public.e_amministratore_di(p_company_id);$n$);

SELECT pg_temp.ritocca(
  'public.silvio_tool_reject_proposal(uuid,uuid,text)', 'dc38a7eb608aa6fb0db75621602ac7ac',
  $v$    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR v_user_id = auth.uid()$v$,
  $n$    OR public.e_amministratore_di(p_company_id)
    OR v_user_id = auth.uid()$n$);

SELECT pg_temp.ritocca(
  'public.silvio_tool_undo_executed_action(uuid,uuid,text)', '612f6dc2fdfaa0151ab160767e5d7533',
  $v$    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR v_user_id = auth.uid()$v$,
  $n$    OR public.e_amministratore_di(p_company_id)
    OR v_user_id = auth.uid()$n$);

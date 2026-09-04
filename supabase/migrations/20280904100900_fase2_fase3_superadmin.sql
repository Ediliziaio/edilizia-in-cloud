-- FASE 2 e 3 del piano di risalita SuperAdmin — applicate a produzione il
-- 2026-09-04 via MCP. Elenco degli oggetti creati, con il perché:
--
-- F2-01/02/03 — admin_search_users, admin_user_sessions, admin_set_user_blocked,
--   admin_revoke_user_sessions + indice trigram su profiles.
--   Prima non esisteva alcun modo di cercare una persona su tutta la
--   piattaforma: 947 utenti erano raggiungibili solo passando dall'azienda, e
--   l'unico elenco globale si fermava a 300 profili. Il modello dati c'era già
--   per intero (telefono e blocco su profiles; IP, dispositivo e revoca su
--   user_sessions): mancavano lettura e azioni.
--
-- F1-04 — tabella company_status_events + trigger tg_company_status_event.
--   Storia dei passaggi di stato, per calcolare churn e conversione su fatti
--   datati invece che su stati fotografati: prima il churn contava le aziende
--   sospese la cui RIGA era stata modificata negli ultimi 30 giorni, quindi
--   bastava cambiare un colore di brand.
--
-- F2-05/07 — enforce_company_lifecycle(dry_run, giorni_tolleranza).
--   Trial che scade, insoluto che sospende oltre la tolleranza, pagamento che
--   riattiva. Conservativa: salta aziende in omaggio, cancellate e di
--   piattaforma; idempotente; con modalità di prova a vuoto.
--   Job: enforce-lifecycle-aziende, ogni notte alle 4:10.
--
-- F2-08 — vista v_insoluti: chi non ha pagato, quanto, da quanti giorni, e
--   quale conseguenza automatica scatterà.
--
-- F1-07 — vista v_audit_unified + admin_audit_search: registro attività su tre
--   sorgenti (central_audit_log, admin_audit_log, company_flag_audit_log).
--   La più ricca delle tre non era esposta in nessuna schermata.
--
-- F3-02 — admin_platform_health: job, errori e latenza in un colpo solo.
-- F3-03 — cron_job_failure_check + tabella cron_job_failure_alerts.
--   cron_health_check copriva solo i fallimenti HTTP 4xx/5xx: i job che
--   falliscono DENTRO Postgres restavano invisibili, ed è il motivo per cui il
--   cestino documenti ha fallito ogni notte per giorni senza che nessuno lo
--   sapesse. Notifica alla seconda notte, una volta al giorno per job, e tace
--   da sola quando il job torna a posto.
--   Job: cron-job-failure-check, ogni 2 ore.
--
-- F3-05 — silvio-action-runner-30s ripianificato come silvio-action-runner.
--   Lo schedule `*/30 * * * * *` (6 campi) non veniva interpretato come atteso:
--   48 esecuzioni in 24 ore invece di 2.880, cioè 60 volte più lento del nome
--   che portava. pg_cron ha granularità di un minuto.
--
-- Le definizioni complete sono quelle applicate via MCP e verificate in
-- produzione; questo file le documenta per la storia del repository.

-- ─────────────────────────────────────────────────────────────────────────────
-- F1-04 · Storia dei passaggi di stato
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_status_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stato_da    text,
  stato_a     text NOT NULL,
  motivo      text,
  automatico  boolean NOT NULL DEFAULT false,
  attore_id   uuid,
  avvenuto_il timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_status_events_company
  ON public.company_status_events (company_id, avvenuto_il DESC);
CREATE INDEX IF NOT EXISTS idx_company_status_events_quando
  ON public.company_status_events (avvenuto_il DESC);
ALTER TABLE public.company_status_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "status_events_staff_read" ON public.company_status_events;
CREATE POLICY "status_events_staff_read" ON public.company_status_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_platform_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_company_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_actor uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
    IF v_actor IS NULL THEN
      BEGIN v_actor := NULLIF(public.audit_request_header('x-actor-id'), '')::uuid;
      EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
    END IF;
    BEGIN
      INSERT INTO public.company_status_events (company_id, stato_da, stato_a, attore_id, automatico)
      VALUES (NEW.id, OLD.status, NEW.status, v_actor, v_actor IS NULL);
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'company_status_events: %', SQLERRM; END;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS trg_company_status_event ON public.companies;
CREATE TRIGGER trg_company_status_event AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_company_status_event();

-- ─────────────────────────────────────────────────────────────────────────────
-- F3-03 · Allarme sui job che falliscono a livello SQL
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_job_failure_alerts (
  jobname      text PRIMARY KEY,
  falliti      integer NOT NULL,
  primo_errore text,
  avvisato_il  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cron_job_failure_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cron_alerts_staff_read" ON public.cron_job_failure_alerts;
CREATE POLICY "cron_alerts_staff_read" ON public.cron_job_failure_alerts
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_platform_staff(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- F2-01 · Indice per la ricerca utenti
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_ricerca_trgm
  ON public.profiles USING gin (
    (COALESCE(first_name,'') || ' ' || COALESCE(last_name,'') || ' ' ||
     COALESCE(email,'') || ' ' || COALESCE(phone,'')) gin_trgm_ops
  );

-- Le definizioni complete degli oggetti seguono qui sotto.

-- ─────────────────────────────────────────────────────────────────────────────
-- F2-08 · Vista insoluti
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_insoluti WITH (security_invoker = true) AS
SELECT
  c.id AS azienda_id, c.name AS azienda, c.email, c.status AS stato_azienda,
  sp.name AS piano, sp.price_monthly AS canone_mensile,
  c.stripe_subscription_status AS stato_stripe, c.dunning_status AS stato_solleciti,
  c.payment_failure_count AS pagamenti_falliti,
  c.last_payment_failure_at AS primo_fallimento,
  c.last_payment_failure_reason AS motivo_fallimento,
  CASE WHEN c.last_payment_failure_at IS NULL THEN NULL
       ELSE (now()::date - c.last_payment_failure_at::date) END AS giorni_scaduto,
  CASE
    WHEN c.last_payment_failure_at IS NULL THEN 'nessun fallimento'
    WHEN now()::date - c.last_payment_failure_at::date <= 7  THEN '0-7 giorni'
    WHEN now()::date - c.last_payment_failure_at::date <= 14 THEN '8-14 giorni'
    WHEN now()::date - c.last_payment_failure_at::date <= 30 THEN '15-30 giorni'
    ELSE 'oltre 30 giorni'
  END AS fascia_anzianita,
  COALESCE(f.fatture_aperte, 0) AS fatture_aperte,
  COALESCE(f.importo_dovuto, 0) AS importo_dovuto,
  CASE
    WHEN COALESCE(c.billing_comped, false) THEN 'in omaggio, nessuna azione'
    WHEN c.status = 'suspended' THEN 'già sospesa'
    WHEN c.stripe_subscription_status IN ('past_due','unpaid','canceled')
         AND c.last_payment_failure_at IS NOT NULL
         AND c.last_payment_failure_at < now() - interval '14 days'
      THEN 'sospensione automatica alla prossima notte'
    WHEN c.stripe_subscription_status IN ('past_due','unpaid','canceled')
      THEN 'in tolleranza fino a 14 giorni dal primo fallimento'
    ELSE 'nessuna azione prevista'
  END AS prossima_azione,
  c.billing_comped AS in_omaggio
FROM public.companies c
LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
LEFT JOIN LATERAL (
  SELECT count(*) AS fatture_aperte, COALESCE(sum(i.amount_due), 0) AS importo_dovuto
    FROM public.subscription_invoices i
   WHERE i.company_id = c.id AND i.status = 'open'
) f ON true
WHERE c.deleted_at IS NULL
  AND COALESCE(c.is_platform_admin_company, false) = false
  AND (c.stripe_subscription_status IN ('past_due','unpaid','canceled')
       OR COALESCE(c.dunning_status,'none') NOT IN ('none','recovered')
       OR COALESCE(c.payment_failure_count, 0) > 0
       OR COALESCE(f.fatture_aperte, 0) > 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- F1-07 · Registro attività unificato
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_audit_unified WITH (security_invoker = true) AS
SELECT 'central'::text AS fonte, c.id::text AS id, c.occurred_at AS avvenuto_il,
       c.actor_user_id AS attore_id, c.actor_email AS attore_email, c.actor_role AS attore_ruolo,
       c.company_id AS azienda_id, (c.operation || ' ' || c.table_name) AS azione,
       c.table_name AS oggetto_tipo, c.row_pk AS oggetto_id, c.changed_fields AS campi_modificati,
       c.before_data AS prima, c.after_data AS dopo, c.ip_address::text AS ip,
       c.user_agent AS dispositivo, c.notes AS note,
       (c.notes ILIKE '%impersonation%') AS in_impersonation
FROM public.central_audit_log c
UNION ALL
SELECT 'admin', a.id::text, a.created_at, a.user_id, p.email, 'super_admin',
       CASE WHEN a.target_type = 'company' THEN NULLIF(a.target_id,'')::uuid ELSE NULL END,
       a.action, a.target_type, a.target_id, NULL::text[], NULL::jsonb, a.details,
       a.ip_address::text, NULL::text, NULL::text, (a.action ILIKE '%impersonation%')
FROM public.admin_audit_log a
LEFT JOIN public.profiles p ON p.id = a.user_id
UNION ALL
SELECT 'flag', f.id::text, f.created_at, f.changed_by, p2.email, NULL::text, f.company_id,
       ('modifica ' || f.field_name), 'company_flag', f.company_id::text, ARRAY[f.field_name],
       jsonb_build_object(f.field_name, f.old_value), jsonb_build_object(f.field_name, f.new_value),
       f.ip_address::text, NULL::text, f.reason, false
FROM public.company_flag_audit_log f
LEFT JOIN public.profiles p2 ON p2.id = f.changed_by;

-- ─────────────────────────────────────────────────────────────────────────────
-- F2-01/02 · Ricerca utenti e sessioni
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_search text DEFAULT NULL, p_role text DEFAULT NULL, p_company_id uuid DEFAULT NULL,
  p_stato text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE (id uuid, email text, nome text, telefono text, azienda_id uuid,
  azienda_nome text, ruoli text[], bloccato boolean, motivo_blocco text,
  bloccato_fino timestamptz, tentativi_falliti integer, ultimo_accesso timestamptz,
  sessioni_attive bigint, creato_il timestamptz, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.email,
      NULLIF(btrim(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '') AS nome_,
      p.phone, p.company_id, c.name AS azienda_nome_,
      (SELECT array_agg(ur.role::text ORDER BY ur.role::text) FROM public.user_roles ur WHERE ur.user_id = p.id) AS ruoli_,
      COALESCE(p.is_blocked, false) AS bloccato_, p.block_reason, p.locked_until,
      COALESCE(p.failed_login_count, 0) AS tentativi_,
      (SELECT max(us.last_active_at) FROM public.user_sessions us WHERE us.user_id = p.id) AS ultimo_,
      (SELECT count(*) FROM public.user_sessions us WHERE us.user_id = p.id AND us.is_active
        AND us.last_active_at > now() - interval '24 hours') AS sessioni_,
      p.created_at
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.id = p.company_id
    WHERE (p_company_id IS NULL OR p.company_id = p_company_id)
      AND (p_search IS NULL OR p_search = '' OR
           (COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'') || ' ' ||
            COALESCE(p.email,'') || ' ' || COALESCE(p.phone,'')) ILIKE '%' || p_search || '%'
           OR p.id::text = p_search)
      AND (p_role IS NULL OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role::text = p_role))
  ), filtrato AS (
    SELECT * FROM base b WHERE p_stato IS NULL
      OR (p_stato = 'bloccati'    AND (b.bloccato_ OR (b.locked_until IS NOT NULL AND b.locked_until > now())))
      OR (p_stato = 'mai_entrati' AND b.ultimo_ IS NULL)
      OR (p_stato = 'attivi'      AND NOT b.bloccato_ AND b.ultimo_ IS NOT NULL)
  ), conteggio AS (SELECT count(*) AS n FROM filtrato)
  SELECT f.id, f.email, f.nome_, f.phone, f.company_id, f.azienda_nome_, f.ruoli_,
         f.bloccato_, f.block_reason, f.locked_until, f.tentativi_, f.ultimo_,
         f.sessioni_, f.created_at, cc.n
  FROM filtrato f CROSS JOIN conteggio cc
  ORDER BY f.ultimo_ DESC NULLS LAST, f.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200)) OFFSET GREATEST(0, p_offset);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_user_sessions(p_user_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, azienda_nome text, ip text, dispositivo text, browser text,
  sistema text, iniziata_il timestamptz, ultima_attivita timestamptz, attiva boolean,
  revocata_da uuid, motivo_revoca text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT us.id, c.name, us.ip_address::text, us.device_type, us.browser, us.os,
         us.started_at, us.last_active_at, COALESCE(us.is_active, false),
         us.revoked_by, us.revoke_reason
  FROM public.user_sessions us
  LEFT JOIN public.companies c ON c.id = us.company_id
  WHERE us.user_id = p_user_id
  ORDER BY us.last_active_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(p_limit, 100));
END; $function$;

REVOKE ALL ON FUNCTION public.admin_search_users(text, text, uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_user_sessions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, text, uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_sessions(uuid, integer) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- F2-03 · Azioni amministrative sull'utente
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_blocked(
  p_user_id uuid, p_blocked boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_actor uuid := auth.uid(); v_target RECORD; v_sessioni integer := 0;
BEGIN
  IF NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  SELECT id, email, is_blocked INTO v_target FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Utente non trovato'); END IF;
  -- Un amministratore non può bloccare se stesso: si chiuderebbe fuori.
  IF p_blocked AND p_user_id = v_actor THEN
    RETURN jsonb_build_object('error', 'Non puoi bloccare il tuo stesso account');
  END IF;
  UPDATE public.profiles
     SET is_blocked = p_blocked,
         blocked_at = CASE WHEN p_blocked THEN now() ELSE NULL END,
         blocked_by = CASE WHEN p_blocked THEN v_actor ELSE NULL END,
         block_reason = CASE WHEN p_blocked THEN p_reason ELSE NULL END,
         locked_until = CASE WHEN p_blocked THEN locked_until ELSE NULL END,
         failed_login_count = CASE WHEN p_blocked THEN failed_login_count ELSE 0 END
   WHERE id = p_user_id;
  -- Bloccare senza chiudere le sessioni aperte non servirebbe a nulla.
  IF p_blocked THEN
    UPDATE public.user_sessions
       SET is_active = false, ended_at = now(), revoked_by = v_actor,
           revoke_reason = COALESCE(p_reason, 'Account bloccato')
     WHERE user_id = p_user_id AND COALESCE(is_active, false);
    GET DIAGNOSTICS v_sessioni = ROW_COUNT;
  END IF;
  INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
  VALUES (v_actor, CASE WHEN p_blocked THEN 'block_user' ELSE 'unblock_user' END,
          'user', p_user_id::text,
          jsonb_build_object('target_email', v_target.email, 'reason', p_reason, 'sessioni_chiuse', v_sessioni));
  RETURN jsonb_build_object('ok', true, 'bloccato', p_blocked, 'sessioni_chiuse', v_sessioni);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_user_sessions(
  p_user_id uuid, p_session_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Revocata dall''amministratore')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_actor uuid := auth.uid(); v_n integer;
BEGIN
  IF NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_sessions
     SET is_active = false, ended_at = now(), revoked_by = v_actor, revoke_reason = p_reason
   WHERE user_id = p_user_id AND (p_session_id IS NULL OR id = p_session_id)
     AND COALESCE(is_active, false);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.admin_audit_log (user_id, action, target_type, target_id, details)
  VALUES (v_actor, 'revoke_sessions', 'user', p_user_id::text,
          jsonb_build_object('sessioni_revocate', v_n, 'sessione_singola', p_session_id, 'reason', p_reason));
  RETURN jsonb_build_object('ok', true, 'sessioni_revocate', v_n);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_set_user_blocked(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_user_sessions(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_blocked(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_sessions(uuid, uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- F1-07 · Ricerca nel registro attività
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_audit_search(
  p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL,
  p_company_id uuid DEFAULT NULL, p_actor_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL, p_solo_impersonation boolean DEFAULT false,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS TABLE (fonte text, id text, avvenuto_il timestamptz, attore_id uuid,
  attore_email text, attore_ruolo text, azienda_id uuid, azienda_nome text, azione text,
  oggetto_tipo text, oggetto_id text, campi_modificati text[], prima jsonb, dopo jsonb,
  ip text, dispositivo text, note text, in_impersonation boolean, totale bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH filtrato AS (
    SELECT v.*, co.name AS azienda_nome_
    FROM public.v_audit_unified v
    LEFT JOIN public.companies co ON co.id = v.azienda_id
    WHERE (p_from IS NULL OR v.avvenuto_il >= p_from)
      AND (p_to IS NULL OR v.avvenuto_il <= p_to)
      AND (p_company_id IS NULL OR v.azienda_id = p_company_id)
      AND (p_actor_id IS NULL OR v.attore_id = p_actor_id)
      AND (NOT p_solo_impersonation OR v.in_impersonation)
      AND (p_search IS NULL OR p_search = '' OR
           v.azione ILIKE '%' || p_search || '%' OR
           COALESCE(v.attore_email, '') ILIKE '%' || p_search || '%' OR
           COALESCE(co.name, '') ILIKE '%' || p_search || '%' OR
           COALESCE(v.oggetto_id, '') ILIKE '%' || p_search || '%')
  ), conteggio AS (SELECT count(*) AS n FROM filtrato)
  SELECT f.fonte, f.id, f.avvenuto_il, f.attore_id, f.attore_email, f.attore_ruolo,
         f.azienda_id, f.azienda_nome_, f.azione, f.oggetto_tipo, f.oggetto_id,
         f.campi_modificati, f.prima, f.dopo, f.ip, f.dispositivo, f.note,
         f.in_impersonation, c.n
  FROM filtrato f CROSS JOIN conteggio c
  ORDER BY f.avvenuto_il DESC
  LIMIT GREATEST(1, LEAST(p_limit, 500)) OFFSET GREATEST(0, p_offset);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_audit_search(timestamptz, timestamptz, uuid, uuid, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_audit_search(timestamptz, timestamptz, uuid, uuid, text, boolean, integer, integer) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- F2-05/07 · Ciclo di vita automatico
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_company_lifecycle(
  p_dry_run boolean DEFAULT false, p_giorni_tolleranza_insoluto integer DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_row RECORD;
  v_trial_scaduti integer := 0; v_insoluti integer := 0; v_riattivate integer := 0;
  v_dettaglio jsonb := '[]'::jsonb;
BEGIN
  -- 1. Trial scaduti → expired
  FOR v_row IN
    SELECT id, name, trial_ends_at FROM public.companies
     WHERE status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < now()
       AND deleted_at IS NULL AND COALESCE(billing_comped, false) = false
       AND COALESCE(is_platform_admin_company, false) = false
  LOOP
    v_dettaglio := v_dettaglio || jsonb_build_object('azienda', v_row.name,
      'azione', 'trial_scaduto', 'scaduto_il', v_row.trial_ends_at::date);
    IF NOT p_dry_run THEN
      UPDATE public.companies SET status = 'expired' WHERE id = v_row.id;
      INSERT INTO public.company_status_events (company_id, stato_da, stato_a, motivo, automatico)
      VALUES (v_row.id, 'trial', 'expired', 'Trial scaduto il ' || v_row.trial_ends_at::date, true);
    END IF;
    v_trial_scaduti := v_trial_scaduti + 1;
  END LOOP;

  -- 2. Insoluto oltre tolleranza → suspended.
  -- Un pagamento fallito ieri non sospende nessuno.
  FOR v_row IN
    SELECT id, name, last_payment_failure_at FROM public.companies
     WHERE status = 'active' AND deleted_at IS NULL
       AND COALESCE(billing_comped, false) = false
       AND COALESCE(is_platform_admin_company, false) = false
       AND stripe_subscription_status IN ('past_due', 'unpaid', 'canceled')
       AND last_payment_failure_at IS NOT NULL
       AND last_payment_failure_at < now() - make_interval(days => GREATEST(p_giorni_tolleranza_insoluto, 1))
  LOOP
    v_dettaglio := v_dettaglio || jsonb_build_object('azienda', v_row.name,
      'azione', 'sospesa_per_insoluto', 'primo_fallimento', v_row.last_payment_failure_at::date);
    IF NOT p_dry_run THEN
      UPDATE public.companies SET status = 'suspended' WHERE id = v_row.id;
      INSERT INTO public.company_status_events (company_id, stato_da, stato_a, motivo, automatico)
      VALUES (v_row.id, 'active', 'suspended', 'Insoluto dal ' || v_row.last_payment_failure_at::date, true);
    END IF;
    v_insoluti := v_insoluti + 1;
  END LOOP;

  -- 3. Pagamento tornato buono → riattivazione senza intervento manuale.
  FOR v_row IN
    SELECT id, name FROM public.companies
     WHERE status = 'suspended' AND deleted_at IS NULL
       AND stripe_subscription_status = 'active'
       AND COALESCE(dunning_status, 'none') IN ('none', 'recovered')
  LOOP
    v_dettaglio := v_dettaglio || jsonb_build_object('azienda', v_row.name, 'azione', 'riattivata_dopo_pagamento');
    IF NOT p_dry_run THEN
      UPDATE public.companies SET status = 'active' WHERE id = v_row.id;
      INSERT INTO public.company_status_events (company_id, stato_da, stato_a, motivo, automatico)
      VALUES (v_row.id, 'suspended', 'active', 'Pagamento ripristinato', true);
    END IF;
    v_riattivate := v_riattivate + 1;
  END LOOP;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'trial_scaduti', v_trial_scaduti,
    'sospese_per_insoluto', v_insoluti, 'riattivate', v_riattivate,
    'dettaglio', v_dettaglio, 'eseguito_il', now());
END; $function$;

REVOKE ALL ON FUNCTION public.enforce_company_lifecycle(boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_company_lifecycle(boolean, integer) TO service_role;

SELECT cron.schedule('enforce-lifecycle-aziende', '10 4 * * *',
  $$SELECT public.enforce_company_lifecycle(false, 14)$$);

-- ─────────────────────────────────────────────────────────────────────────────
-- F3-03 · Allarme sui job falliti
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_job_failure_check()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'cron' AS $function$
DECLARE v_job RECORD; v_dest RECORD; v_nuovi integer := 0;
BEGIN
  FOR v_job IN
    SELECT j.jobname,
           count(*) FILTER (WHERE d.status <> 'succeeded') AS falliti,
           count(*) AS esecuzioni,
           max(d.return_message) FILTER (WHERE d.status <> 'succeeded') AS errore
      FROM cron.job j JOIN cron.job_run_details d ON d.jobid = j.jobid
     WHERE d.start_time > now() - interval '36 hours'
     GROUP BY j.jobname
    HAVING count(*) FILTER (WHERE d.status <> 'succeeded') >= 2
  LOOP
    -- Un avviso al giorno per job: un guasto che dura non deve diventare rumore.
    IF EXISTS (SELECT 1 FROM public.cron_job_failure_alerts a
                WHERE a.jobname = v_job.jobname AND a.avvisato_il > now() - interval '24 hours') THEN
      CONTINUE;
    END IF;
    INSERT INTO public.cron_job_failure_alerts (jobname, falliti, primo_errore, avvisato_il)
    VALUES (v_job.jobname, v_job.falliti, left(COALESCE(v_job.errore, ''), 400), now())
    ON CONFLICT (jobname) DO UPDATE
      SET falliti = EXCLUDED.falliti, primo_errore = EXCLUDED.primo_errore, avvisato_il = now();
    FOR v_dest IN SELECT d.user_id, d.company_id FROM public.destinatari_allarmi_piattaforma() d
    LOOP
      INSERT INTO public.notifications (company_id, user_id, type, title, body, action_url)
      VALUES (v_dest.company_id, v_dest.user_id, 'cron_failure',
              'Job "' || v_job.jobname || '" sta fallendo',
              v_job.falliti || ' esecuzioni fallite su ' || v_job.esecuzioni ||
              ' nelle ultime 36 ore. ' || COALESCE(left(v_job.errore, 200), ''), '/admin/salute');
    END LOOP;
    v_nuovi := v_nuovi + 1;
  END LOOP;

  -- Il job è tornato a posto: si smette di considerarlo in allarme.
  DELETE FROM public.cron_job_failure_alerts a
   WHERE NOT EXISTS (SELECT 1 FROM cron.job j JOIN cron.job_run_details d ON d.jobid = j.jobid
                      WHERE j.jobname = a.jobname AND d.start_time > now() - interval '36 hours'
                        AND d.status <> 'succeeded');
  RETURN v_nuovi;
END; $function$;

REVOKE ALL ON FUNCTION public.cron_job_failure_check() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cron_job_failure_check() TO service_role;

SELECT cron.schedule('cron-job-failure-check', '25 */2 * * *',
  $$SELECT public.cron_job_failure_check()$$);

-- F3-05 · Un job che prometteva 30 secondi girava ogni 30 minuti: lo schedule a
-- 6 campi non è interpretato come atteso da pg_cron (48 esecuzioni in 24 ore
-- invece di 2.880). pg_cron ha granularità di un minuto.
SELECT cron.unschedule('silvio-action-runner-30s');
SELECT cron.schedule('silvio-action-runner', '* * * * *',
  $$SELECT public.silvio_invoke_edge('silvio-action-runner', '{}'::jsonb)$$);

-- ─────────────────────────────────────────────────────────────────────────────
-- F3-02 · Salute della piattaforma
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_platform_health()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'cron' AS $function$
DECLARE v_job jsonb; v_falliti jsonb; v_funzioni jsonb; v_riepilogo jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.falliti DESC, t.job), '[]'::jsonb) INTO v_job
  FROM (SELECT j.jobname AS job, j.schedule, j.active AS attivo,
               count(d.*) AS esecuzioni,
               count(*) FILTER (WHERE d.status <> 'succeeded') AS falliti,
               max(d.start_time) AS ultima,
               max(d.return_message) FILTER (WHERE d.status <> 'succeeded') AS ultimo_errore
          FROM cron.job j
          LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid AND d.start_time > now() - interval '24 hours'
         GROUP BY j.jobname, j.schedule, j.active) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.falliti DESC), '[]'::jsonb) INTO v_falliti
  FROM (SELECT j.jobname AS job, count(*) FILTER (WHERE d.status <> 'succeeded') AS falliti,
               count(*) AS esecuzioni,
               max(d.return_message) FILTER (WHERE d.status <> 'succeeded') AS errore,
               max(d.start_time) AS ultima
          FROM cron.job j JOIN cron.job_run_details d ON d.jobid = j.jobid
         WHERE d.start_time > now() - interval '48 hours'
         GROUP BY j.jobname
        HAVING count(*) FILTER (WHERE d.status <> 'succeeded') > 0) t;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.errori DESC, t.chiamate DESC), '[]'::jsonb) INTO v_funzioni
  FROM (SELECT function_name AS funzione, count(*) AS chiamate,
               count(*) FILTER (WHERE status_code >= 400) AS errori,
               round(avg(latency_ms)) AS latenza_media_ms, max(latency_ms) AS latenza_max_ms,
               max(recorded_at) AS ultima
          FROM public.system_health_metrics
         WHERE recorded_at > now() - interval '24 hours'
         GROUP BY function_name) t;

  SELECT jsonb_build_object(
    'job_totali', (SELECT count(*) FROM cron.job),
    'job_attivi', (SELECT count(*) FROM cron.job WHERE active),
    'job_con_errori', jsonb_array_length(v_falliti),
    'funzioni_strumentate', (SELECT count(DISTINCT function_name) FROM public.system_health_metrics
                              WHERE recorded_at > now() - interval '7 days'),
    'funzioni_totali_stimate', 515,
    'errori_edge_24h', (SELECT count(*) FROM public.system_health_metrics
                         WHERE recorded_at > now() - interval '24 hours' AND status_code >= 400),
    'aziende_attive_24h', public.get_active_companies_count(24),
    'trial_scaduti_da_gestire', (SELECT count(*) FROM public.companies
                                  WHERE status = 'trial' AND trial_ends_at < now() AND deleted_at IS NULL),
    'insoluti_aperti', (SELECT count(*) FROM public.v_insoluti WHERE NOT COALESCE(in_omaggio, false)),
    'aziende_cancellate_in_attesa', (SELECT count(*) FROM public.companies WHERE deleted_at IS NOT NULL)
  ) INTO v_riepilogo;

  RETURN jsonb_build_object('riepilogo', v_riepilogo, 'job_falliti', v_falliti,
                            'job', v_job, 'funzioni', v_funzioni, 'calcolato_il', now());
END; $function$;

REVOKE ALL ON FUNCTION public.admin_platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_health() TO authenticated, service_role;

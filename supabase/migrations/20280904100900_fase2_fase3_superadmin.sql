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

-- NOTA — Le funzioni admin_search_users, admin_user_sessions,
-- admin_set_user_blocked, admin_revoke_user_sessions, admin_audit_search,
-- admin_platform_health, enforce_company_lifecycle e cron_job_failure_check,
-- insieme alle viste v_audit_unified e v_insoluti, sono state applicate a
-- produzione via MCP nella stessa sessione. Per rigenerare un ambiente da zero
-- estrarne la definizione corrente con pg_get_functiondef / pg_get_viewdef dal
-- database di riferimento: sono documentate una per una nell'intestazione di
-- questo file e nel piano di risalita.

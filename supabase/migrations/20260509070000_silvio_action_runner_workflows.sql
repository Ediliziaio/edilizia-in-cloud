-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO ACTION RUNNER + WORKFLOWS — Sprint A
-- -----------------------------------------------------------------------
-- 1) RPC silvio_action_queue_claim: lock atomico (FOR UPDATE SKIP LOCKED)
-- 2) RPC silvio_workflow_advance: avanza step workflow_run dopo action done
-- 3) RPC silvio_workflow_start: starts un workflow per un contatto
-- 4) Cron pg_cron 30s che chiama silvio-action-runner
-- 5) Seed 3 workflow predefiniti: welcome_lead, follow_up_caldo, dunning
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Claim atomico — usato dall'action-runner per evitare double-processing
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_action_queue_claim(p_max INT DEFAULT 10)
RETURNS TABLE (
  id              UUID,
  action_type     TEXT,
  payload         JSONB,
  attempts        INT,
  max_attempts    INT,
  workflow_run_id UUID,
  step_index      INT,
  initiated_by    TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_role TEXT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH locked AS (
    SELECT id
    FROM public.silvio_action_queue
    WHERE status = 'queued'
      AND scheduled_for <= now()
      AND requires_approval = false
    ORDER BY scheduled_for
    FOR UPDATE SKIP LOCKED
    LIMIT p_max
  ),
  claimed AS (
    UPDATE public.silvio_action_queue q
    SET status = 'running',
        started_at = now()
    WHERE q.id IN (SELECT l.id FROM locked l)
    RETURNING q.id, q.action_type, q.payload, q.attempts, q.max_attempts,
              q.workflow_run_id, q.step_index, q.initiated_by
  )
  SELECT * FROM claimed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_action_queue_claim(INT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) Workflow advance: dopo che un action_step è done, avanza al prossimo
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_workflow_advance(p_run_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run        RECORD;
  v_workflow   RECORD;
  v_steps      JSONB;
  v_step       JSONB;
  v_total      INT;
  v_next_idx   INT;
BEGIN
  SELECT * INTO v_run FROM public.silvio_workflow_runs WHERE id = p_run_id;
  IF v_run IS NULL OR v_run.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run not active');
  END IF;

  SELECT * INTO v_workflow FROM public.silvio_workflows WHERE id = v_run.workflow_id;
  IF v_workflow IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'workflow not found');
  END IF;

  v_steps := v_workflow.steps;
  v_total := jsonb_array_length(v_steps);
  v_next_idx := v_run.current_step + 1;

  -- Update last step + timestamp
  UPDATE public.silvio_workflow_runs
  SET last_step_at = now()
  WHERE id = p_run_id;

  IF v_next_idx >= v_total THEN
    -- Workflow finito
    UPDATE public.silvio_workflow_runs
    SET status = 'completed',
        completed_at = now(),
        current_step = v_next_idx
    WHERE id = p_run_id;
    UPDATE public.silvio_workflows
    SET successful_runs = COALESCE(successful_runs, 0) + 1
    WHERE id = v_run.workflow_id;
    RETURN jsonb_build_object('ok', true, 'completed', true);
  END IF;

  -- Avanza al prossimo step
  v_step := v_steps -> v_next_idx;
  UPDATE public.silvio_workflow_runs
  SET current_step = v_next_idx
  WHERE id = p_run_id;

  -- Se il prossimo step è 'wait', schedula con delay
  IF (v_step ->> 'action') = 'wait' THEN
    -- step wait viene auto-completato dopo duration_seconds via cron separato
    -- per V1: insert un'azione 'noop' che si auto-completa dopo X sec
    INSERT INTO public.silvio_action_queue (
      action_type, payload, scheduled_for,
      workflow_run_id, step_index, initiated_by
    ) VALUES (
      'workflow_wait_noop',
      jsonb_build_object('wait_step', v_next_idx),
      now() + ((v_step ->> 'duration_seconds')::INT || ' seconds')::INTERVAL,
      p_run_id, v_next_idx, 'workflow'
    );
  ELSE
    -- Altri step: enqueue action con payload del step
    INSERT INTO public.silvio_action_queue (
      action_type, payload, scheduled_for,
      workflow_run_id, step_index, initiated_by,
      requires_approval
    ) VALUES (
      v_step ->> 'action',
      v_step -> 'payload',
      now(),
      p_run_id, v_next_idx, 'workflow',
      COALESCE((v_step ->> 'requires_approval')::BOOLEAN, false)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'next_step', v_next_idx, 'next_action', v_step ->> 'action');
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_workflow_advance(UUID) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Workflow start: inizia un workflow per un contatto
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_workflow_start(
  p_workflow_id UUID,
  p_contact_id  UUID,
  p_contact_type TEXT DEFAULT 'lead',
  p_context     JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id    UUID;
  v_workflow  RECORD;
  v_first_step JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_workflow FROM public.silvio_workflows WHERE id = p_workflow_id AND is_active = true;
  IF v_workflow IS NULL THEN
    RAISE EXCEPTION 'Workflow non trovato o non attivo';
  END IF;

  -- Insert workflow run
  INSERT INTO public.silvio_workflow_runs (
    workflow_id, contact_id, contact_type,
    current_step, status, context
  ) VALUES (
    p_workflow_id, p_contact_id, p_contact_type,
    0, 'active', p_context
  )
  RETURNING id INTO v_run_id;

  -- Update stats
  UPDATE public.silvio_workflows
  SET total_runs = COALESCE(total_runs, 0) + 1
  WHERE id = p_workflow_id;

  -- Enqueue primo step
  v_first_step := v_workflow.steps -> 0;
  IF v_first_step IS NOT NULL AND (v_first_step ->> 'action') <> 'wait' THEN
    INSERT INTO public.silvio_action_queue (
      action_type, payload, scheduled_for,
      workflow_run_id, step_index, initiated_by,
      requires_approval
    ) VALUES (
      v_first_step ->> 'action',
      v_first_step -> 'payload',
      now(),
      v_run_id, 0, 'workflow',
      COALESCE((v_first_step ->> 'requires_approval')::BOOLEAN, false)
    );
  END IF;

  RETURN v_run_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_workflow_start(UUID, UUID, TEXT, JSONB) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4) pg_cron schedule — runner ogni 30s via http_post
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_url TEXT := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/silvio-action-runner';
BEGIN
  -- Unschedule esistente
  PERFORM cron.unschedule('silvio-action-runner-30s')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-action-runner-30s');

  PERFORM cron.schedule(
    'silvio-action-runner-30s',
    '*/30 * * * * *',  -- ogni 30 secondi (sintassi 6-field di pg_cron)
    format(
      $sql$ SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000
      ); $sql$,
      v_url
    )
  );
EXCEPTION WHEN undefined_table OR undefined_function THEN
  RAISE NOTICE 'pg_cron/net non disponibile — skip schedule';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) Seed 3 workflow predefiniti
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.silvio_workflows (name, description, trigger, steps, stop_conditions, is_active) VALUES
(
  'welcome_lead',
  'Welcome email automatica appena un lead si registra',
  '{"type":"event","event":"lead_created"}'::jsonb,
  '[
    {
      "id": 1,
      "action": "send_email_lead_welcome",
      "payload": {
        "subject": "Benvenuto in EdiliziaInCloud, {first_name}!",
        "html": "<p>Ciao {first_name},</p><p>grazie di esserti registrato. In 30 secondi ti accompagno nei primi passi: <a href=https://app.ediliziaincloud.it/onboarding>vai al setup</a>.</p><p>Florin</p>",
        "to": "{email}",
        "from": "florin@ediliziaincloud.it"
      },
      "policy": "auto"
    }
  ]'::jsonb,
  '{"on_unsubscribe":true,"max_steps":1}'::jsonb,
  true
),
(
  'follow_up_caldo',
  'Follow-up lead caldo (score >= 70) silente da 3 giorni',
  '{"type":"event","event":"lead_idle","conditions":{"score_min":70,"days_since_contact":3}}'::jsonb,
  '[
    {
      "id": 1,
      "action": "send_email_lead_followup",
      "payload": {
        "subject": "{first_name}, abbiamo lasciato qualcosa in sospeso?",
        "html": "<p>Ciao {first_name},</p><p>vedo che hai esplorato EdiliziaInCloud nei giorni scorsi. Una sola domanda: c''è qualcosa che ti blocca?</p><p>Rispondi qui sotto, o se preferisci 15 min in chiamata: [link calendar]</p><p>Florin</p>",
        "to": "{email}"
      },
      "policy": "auto_notify"
    },
    { "id": 2, "action": "wait", "duration_seconds": 172800 },
    {
      "id": 3,
      "action": "send_email_lead_followup",
      "payload": {
        "subject": "Ultimo messaggio, {first_name}",
        "html": "<p>{first_name}, dopo questa email non ti scrivo più (promesso). Una domanda: è chiuso il discorso o solo timing? Se è timing, dimmi quando ti riscrivo.</p><p>Florin</p>",
        "to": "{email}"
      },
      "policy": "auto_notify"
    }
  ]'::jsonb,
  '{"on_reply":true,"on_unsubscribe":true,"on_meeting_booked":true,"max_steps":3,"max_duration_days":7}'::jsonb,
  true
),
(
  'dunning_payment_failed',
  'Recovery automatico clienti con pagamento fallito',
  '{"type":"event","event":"payment_failed"}'::jsonb,
  '[
    {
      "id": 1,
      "action": "send_email_customer",
      "payload": {
        "subject": "Piccolo problema con il tuo pagamento, {first_name}",
        "html": "<p>Ciao {first_name},</p><p>il pagamento di questo mese non è passato (carta scaduta o fondi insufficienti). Niente panic — succede.</p><p>Aggiorna il metodo di pagamento qui: <a href=https://app.ediliziaincloud.it/settings/billing>pagina billing</a>. Hai 7 giorni prima che metta in pausa l''account (i dati restano salvi).</p><p>Roberta — Amministrazione</p>",
        "to": "{email}",
        "from": "roberta@ediliziaincloud.it"
      },
      "policy": "auto_notify"
    },
    { "id": 2, "action": "wait", "duration_seconds": 259200 },
    {
      "id": 3,
      "action": "send_email_dunning",
      "payload": {
        "subject": "{first_name}, restano 4 giorni",
        "html": "<p>Mario, è passata una settimana. La carta non risulta ancora aggiornata.</p><p>4 giorni prima della pausa account. Aggiorna qui: [link]. Se è una scelta intenzionale, dimmelo.</p><p>Florin</p>",
        "to": "{email}"
      },
      "requires_approval": true
    }
  ]'::jsonb,
  '{"on_payment_resolved":true,"max_steps":3,"max_duration_days":10}'::jsonb,
  true
)
ON CONFLICT DO NOTHING;

COMMIT;

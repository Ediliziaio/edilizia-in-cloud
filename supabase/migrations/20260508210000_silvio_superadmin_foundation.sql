-- ═══════════════════════════════════════════════════════════════════════════
-- SILVIO SUPERADMIN — Foundation schema
-- -----------------------------------------------------------------------
-- Crea tutte le tabelle del masterprompt "Silvio Superadmin (Co-Founder AI)":
--   • silvio_admin_messages         — conversazioni chat persistite
--   • silvio_admin_alerts           — alert proattivi (revenue/lead/churn/...)
--   • silvio_admin_briefings        — briefing mattutini archiviati
--   • silvio_action_queue           — coda azioni outbound (email/wa/call)
--   • silvio_action_log             — audit trail outbound
--   • silvio_pending_approvals      — azioni in attesa di approvazione Florin
--   • silvio_automation_policies    — modalità auto/notify/approval per action
--   • silvio_workflows              — definizioni workflow (drip, dunning, ecc.)
--   • silvio_workflow_runs          — esecuzioni in corso per contatto
--
-- RLS: tutte super_admin only (non aggiungo nuova tabella `superadmins` —
-- riutilizzo `user_roles WHERE role='super_admin'` già esistente in DB).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Helper function: is_silvio_superadmin()
--    Estende il check esistente con allowlist email da platform_settings
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_silvio_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_role BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  ) INTO v_has_role;
  RETURN COALESCE(v_has_role, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_silvio_superadmin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_silvio_superadmin(UUID) TO service_role;

COMMENT ON FUNCTION public.is_silvio_superadmin IS
  'Helper centralizzato per check super_admin in policies + edge functions.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. silvio_admin_messages — chat persistente
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_admin_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content         TEXT,
  -- Tool calls del modello (per messaggi assistant con tool_use)
  tool_calls      JSONB,
  -- Risultati tool (per messaggi tool)
  tool_results    JSONB,
  -- Tracking modello + costo per audit
  model_id        TEXT,
  cost_usd        NUMERIC(10,6),
  -- Cache token usage
  tokens_prompt     INT,
  tokens_completion INT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_admin_msg_conv
  ON public.silvio_admin_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_silvio_admin_msg_user
  ON public.silvio_admin_messages (user_id, created_at DESC);

ALTER TABLE public.silvio_admin_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_admin_msg_super" ON public.silvio_admin_messages;
CREATE POLICY "silvio_admin_msg_super" ON public.silvio_admin_messages
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_admin_msg_service" ON public.silvio_admin_messages;
CREATE POLICY "silvio_admin_msg_service" ON public.silvio_admin_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. silvio_admin_alerts — alert proattivi
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_admin_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category          TEXT NOT NULL CHECK (category IN (
    'revenue', 'lead', 'churn', 'support', 'product', 'ops', 'security'
  )),
  severity          TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title             TEXT NOT NULL,
  description       TEXT,
  -- Entità correlata: { "type": "company"|"lead"|"ticket"|"order", "id": "uuid", "name": "..." }
  related_entity    JSONB,
  -- Azione suggerita (testo human-readable o tool-call serializzata)
  suggested_action  TEXT,
  -- Action ID se Silvio ha già preparato una bozza (pending approval o queue)
  action_id         UUID,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'acted', 'expired')),
  -- Auto-dedup: se arrivano alert identici, incrementa counter invece di duplicare
  dedup_key         TEXT,
  occurrences       INT DEFAULT 1,
  acted_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at          TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_alerts_open
  ON public.silvio_admin_alerts (severity, created_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_silvio_alerts_dedup
  ON public.silvio_admin_alerts (dedup_key)
  WHERE dedup_key IS NOT NULL AND status = 'open';

CREATE INDEX IF NOT EXISTS idx_silvio_alerts_category_status
  ON public.silvio_admin_alerts (category, status);

ALTER TABLE public.silvio_admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_alerts_super" ON public.silvio_admin_alerts;
CREATE POLICY "silvio_alerts_super" ON public.silvio_admin_alerts
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_alerts_service" ON public.silvio_admin_alerts;
CREATE POLICY "silvio_alerts_service" ON public.silvio_admin_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. silvio_admin_briefings — briefing mattutino archivio
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_admin_briefings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  for_date        DATE NOT NULL UNIQUE,
  content_md      TEXT NOT NULL,
  -- Highlights per la card UI: top 3-5 cose
  highlights      JSONB,
  -- Metriche snapshot del momento del briefing
  snapshot        JSONB,
  -- Whether sent to Telegram / email
  sent_telegram   BOOLEAN DEFAULT false,
  sent_email      BOOLEAN DEFAULT false,
  generated_by    TEXT,             -- model used
  generation_cost_usd NUMERIC(10,6),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_briefings_date
  ON public.silvio_admin_briefings (for_date DESC);

ALTER TABLE public.silvio_admin_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_briefings_super" ON public.silvio_admin_briefings;
CREATE POLICY "silvio_briefings_super" ON public.silvio_admin_briefings
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_briefings_service" ON public.silvio_admin_briefings;
CREATE POLICY "silvio_briefings_service" ON public.silvio_admin_briefings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. silvio_action_queue — coda azioni schedulate / in corso
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_action_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_for       TIMESTAMPTZ NOT NULL DEFAULT now(),
  action_type         TEXT NOT NULL,    -- 'send_email' | 'send_whatsapp' | 'make_voice_call' | ...
  payload             JSONB NOT NULL,
  -- Workflow context (nullable se azione standalone)
  workflow_id         UUID,
  workflow_run_id     UUID,
  step_index          INT,
  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'awaiting_approval', 'running', 'done', 'failed', 'cancelled'
  )),
  attempts            INT DEFAULT 0,
  max_attempts        INT DEFAULT 3,
  last_error          TEXT,
  result              JSONB,
  -- Approval tracking
  requires_approval   BOOLEAN DEFAULT false,
  approved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMPTZ,
  -- Execution
  started_at          TIMESTAMPTZ,
  executed_at         TIMESTAMPTZ,
  -- Originator
  initiated_by        TEXT NOT NULL DEFAULT 'silvio' CHECK (initiated_by IN (
    'silvio', 'workflow', 'florin', 'cron', 'webhook'
  )),
  initiated_by_user   UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_silvio_action_queue_pending
  ON public.silvio_action_queue (scheduled_for)
  WHERE status IN ('queued', 'awaiting_approval');

CREATE INDEX IF NOT EXISTS idx_silvio_action_queue_workflow
  ON public.silvio_action_queue (workflow_run_id, step_index);

ALTER TABLE public.silvio_action_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_action_queue_super" ON public.silvio_action_queue;
CREATE POLICY "silvio_action_queue_super" ON public.silvio_action_queue
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_action_queue_service" ON public.silvio_action_queue;
CREATE POLICY "silvio_action_queue_service" ON public.silvio_action_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. silvio_action_log — audit trail completo
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_action_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       UUID,    -- ref silvio_action_queue.id (nullable: log diretto)
  action_type     TEXT NOT NULL,
  -- Contact resolution
  contact_id      UUID,
  contact_email   TEXT,
  contact_phone   TEXT,
  contact_name    TEXT,
  -- Payload + result
  payload         JSONB,
  result          JSONB,
  -- Cost tracking (email + SMS + call)
  cost_usd        NUMERIC(10,6),
  cost_provider   TEXT,    -- 'resend' | 'twilio' | 'vapi' | ...
  -- Originator + policy applicata
  initiated_by    TEXT NOT NULL DEFAULT 'silvio',
  policy_mode     TEXT,    -- 'auto' | 'auto_notify' | 'approval_required' | 'blocked'
  -- Outcome
  ok              BOOLEAN DEFAULT true,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_action_log_recent
  ON public.silvio_action_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_silvio_action_log_contact
  ON public.silvio_action_log (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_silvio_action_log_type
  ON public.silvio_action_log (action_type, created_at DESC);

ALTER TABLE public.silvio_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_action_log_super" ON public.silvio_action_log;
CREATE POLICY "silvio_action_log_super" ON public.silvio_action_log
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_action_log_service" ON public.silvio_action_log;
CREATE POLICY "silvio_action_log_service" ON public.silvio_action_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. silvio_pending_approvals — UI cards che Florin vede
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_pending_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id       UUID NOT NULL REFERENCES public.silvio_action_queue(id) ON DELETE CASCADE,
  -- Preview che Florin vede nella card
  preview_md      TEXT NOT NULL,
  -- Contesto: perché Silvio sta facendo questa azione
  context         JSONB,
  -- Lifecycle
  status          TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN (
    'awaiting', 'approved', 'rejected', 'modified', 'expired'
  )),
  expires_at      TIMESTAMPTZ NOT NULL,
  -- Resolution
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  -- Modificabile: se status='modified', payload finale eseguito è qui
  modified_payload JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silvio_approvals_awaiting
  ON public.silvio_pending_approvals (created_at DESC)
  WHERE status = 'awaiting';

ALTER TABLE public.silvio_pending_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_approvals_super" ON public.silvio_pending_approvals;
CREATE POLICY "silvio_approvals_super" ON public.silvio_pending_approvals
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_approvals_service" ON public.silvio_pending_approvals;
CREATE POLICY "silvio_approvals_service" ON public.silvio_pending_approvals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. silvio_automation_policies — modalità per ogni action_type
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_automation_policies (
  action_type     TEXT PRIMARY KEY,
  mode            TEXT NOT NULL CHECK (mode IN (
    'auto', 'auto_notify', 'approval_required', 'blocked'
  )),
  -- Conditions opzionali: { "confidence_min": 0.9, "recipient_type": "lead" }
  conditions      JSONB DEFAULT '{}'::jsonb,
  -- Default approval timeout per questo action_type (override globale)
  approval_timeout_minutes INT,
  display_label   TEXT,
  description     TEXT,
  enabled         BOOLEAN DEFAULT true,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.silvio_automation_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_policies_super" ON public.silvio_automation_policies;
CREATE POLICY "silvio_policies_super" ON public.silvio_automation_policies
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_policies_service" ON public.silvio_automation_policies;
CREATE POLICY "silvio_policies_service" ON public.silvio_automation_policies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed: balanced default policy
INSERT INTO public.silvio_automation_policies (action_type, mode, approval_timeout_minutes, display_label, description) VALUES
  ('send_email_lead_welcome',  'auto',              NULL, 'Email benvenuto lead',         'Da template approvato, basso rischio'),
  ('send_email_lead_followup', 'auto_notify',       60,   'Follow-up lead',                'Notifica con annulla 5min'),
  ('send_email_customer',      'auto_notify',       30,   'Email a cliente paying',        'Notifica subito a Florin'),
  ('send_email_dunning',       'approval_required', 1440, 'Sollecito pagamento',           'Sempre review per tono'),
  ('send_whatsapp',            'auto_notify',       30,   'WhatsApp a contatto',           'Notifica con annulla'),
  ('send_sms',                 'approval_required', 240,  'SMS',                           'SMS sempre review'),
  ('make_voice_call_lead',     'approval_required', 60,   'Chiamata vocale a lead',        'Sempre review script + numero'),
  ('make_voice_call_customer', 'approval_required', 60,   'Chiamata vocale a cliente',     'Sempre review'),
  ('reply_to_ticket_info',     'auto',              NULL, 'Risposta ticket info',          'Solo se confidence>90%'),
  ('reply_to_ticket_complaint','approval_required', 240,  'Risposta ticket lamentela',     'Sempre review'),
  ('reply_to_ticket_technical','auto_notify',       60,   'Risposta ticket tecnico',       'Notifica'),
  ('book_meeting',             'auto',              NULL, 'Prenota meeting',               'Conferma automatica'),
  ('start_workflow',           'auto_notify',       60,   'Avvia workflow',                'Notifica piano completo'),
  ('escalate_to_human',        'auto',              NULL, 'Escalation umana',              'Sempre permesso'),
  ('cancel_subscription',      'blocked',           NULL, 'Annulla abbonamento',           'MAI — solo Florin manuale'),
  ('refund',                   'blocked',           NULL, 'Rimborso',                      'MAI — solo Florin manuale'),
  ('delete_data',              'blocked',           NULL, 'Cancella dati',                 'MAI — protezione assoluta')
ON CONFLICT (action_type) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. silvio_workflows — definizioni workflow (drip, dunning, ecc.)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  -- Trigger: { "type": "event", "event": "lead_created" } o { "type": "cron", "expr": "0 9 * * 1" }
  trigger         JSONB NOT NULL,
  -- Steps array: [{ "id": "1", "action": "send_email", "template": "...", "policy": "auto", ... }]
  steps           JSONB NOT NULL,
  -- Stop conditions: { "on_reply": true, "on_unsubscribe": true, "max_steps": 5 }
  stop_conditions JSONB DEFAULT '{}'::jsonb,
  is_active       BOOLEAN DEFAULT true,
  -- Stats
  total_runs      INT DEFAULT 0,
  successful_runs INT DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_silvio_workflows_active
  ON public.silvio_workflows (is_active)
  WHERE is_active = true;

ALTER TABLE public.silvio_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_workflows_super" ON public.silvio_workflows;
CREATE POLICY "silvio_workflows_super" ON public.silvio_workflows
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_workflows_service" ON public.silvio_workflows;
CREATE POLICY "silvio_workflows_service" ON public.silvio_workflows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. silvio_workflow_runs — esecuzioni in corso per contatto
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.silvio_workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.silvio_workflows(id) ON DELETE CASCADE,
  -- Contatto target (lead/customer/company)
  contact_id      UUID NOT NULL,
  contact_type    TEXT,                             -- 'lead'|'customer'|'company'
  -- Lifecycle
  current_step    INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'completed', 'stopped', 'failed', 'paused'
  )),
  stop_reason     TEXT,                             -- 'lead_replied'|'unsubscribed'|...
  -- Variabili accumulate durante la run (es. risposte ricevute)
  context         JSONB DEFAULT '{}'::jsonb,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_step_at    TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_silvio_workflow_runs_active
  ON public.silvio_workflow_runs (workflow_id, status)
  WHERE status IN ('active', 'paused');

CREATE INDEX IF NOT EXISTS idx_silvio_workflow_runs_contact
  ON public.silvio_workflow_runs (contact_id, status);

ALTER TABLE public.silvio_workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "silvio_workflow_runs_super" ON public.silvio_workflow_runs;
CREATE POLICY "silvio_workflow_runs_super" ON public.silvio_workflow_runs
  FOR ALL TO authenticated
  USING (public.is_silvio_superadmin())
  WITH CHECK (public.is_silvio_superadmin());

DROP POLICY IF EXISTS "silvio_workflow_runs_service" ON public.silvio_workflow_runs;
CREATE POLICY "silvio_workflow_runs_service" ON public.silvio_workflow_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 11. Trigger updated_at sulle tabelle che lo usano
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_silvio_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_silvio_alerts_updated_at ON public.silvio_admin_alerts;
CREATE TRIGGER trg_silvio_alerts_updated_at
  BEFORE UPDATE ON public.silvio_admin_alerts
  FOR EACH ROW EXECUTE FUNCTION public.fn_silvio_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_workflows_updated_at ON public.silvio_workflows;
CREATE TRIGGER trg_silvio_workflows_updated_at
  BEFORE UPDATE ON public.silvio_workflows
  FOR EACH ROW EXECUTE FUNCTION public.fn_silvio_updated_at();

DROP TRIGGER IF EXISTS trg_silvio_policies_updated_at ON public.silvio_automation_policies;
CREATE TRIGGER trg_silvio_policies_updated_at
  BEFORE UPDATE ON public.silvio_automation_policies
  FOR EACH ROW EXECUTE FUNCTION public.fn_silvio_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 12. Documentazione
-- ───────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.silvio_admin_messages       IS 'Silvio Superadmin chat: conversazioni persistite del co-founder AI con Florin.';
COMMENT ON TABLE public.silvio_admin_alerts         IS 'Alert proattivi (revenue/lead/churn/support/product/ops/security) auto-deduplicati.';
COMMENT ON TABLE public.silvio_admin_briefings      IS 'Briefing mattutini archiviati (cron 8:00 IT).';
COMMENT ON TABLE public.silvio_action_queue         IS 'Coda azioni outbound in attesa di esecuzione (email/wa/call/...). Runner pg_cron 30s.';
COMMENT ON TABLE public.silvio_action_log           IS 'Audit trail completo di OGNI azione outbound eseguita.';
COMMENT ON TABLE public.silvio_pending_approvals    IS 'Card di approvazione che Florin vede in /admin/silvio/approvals.';
COMMENT ON TABLE public.silvio_automation_policies  IS 'Modalità (auto/auto_notify/approval_required/blocked) per ogni action_type.';
COMMENT ON TABLE public.silvio_workflows            IS 'Definizioni workflow (drip, dunning, follow-up...) con trigger + steps + stop_conditions.';
COMMENT ON TABLE public.silvio_workflow_runs        IS 'Esecuzioni in corso di workflow per uno specifico contatto.';

COMMIT;

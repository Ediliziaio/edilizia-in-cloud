-- ============================================================
-- SuperAdmin Gap Features — Migrazione unica
-- Feature 4: dunning_email_templates
-- Feature 5: csv_import_jobs
-- Feature 6: companies (region, company_size, sector, employee_count, annual_revenue_range)
-- Feature 7: campaign_variants, campaign_events
-- Feature 8: lifecycle_playbooks, playbook_executions
-- Feature 9: company_flag_audit_log + trigger
-- Feature 11: failure_alerts + companies (consecutive_payment_failures, last_failure_at, failure_alert_sent_at)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- FEATURE 6 — Colonne segmentazione su companies
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS company_size TEXT CHECK (company_size IN ('micro','piccola','media','grande')),
  ADD COLUMN IF NOT EXISTS employee_count INTEGER,
  ADD COLUMN IF NOT EXISTS annual_revenue_range TEXT;

-- ─────────────────────────────────────────────────────────────
-- FEATURE 11 — Colonne failure su companies
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS consecutive_payment_failures INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_alert_sent_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────
-- FEATURE 4 — Template email dunning personalizzabili
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dunning_email_templates (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number          INTEGER      NOT NULL CHECK (step_number BETWEEN 1 AND 10),
  step_name            TEXT         NOT NULL,
  trigger_days_overdue INTEGER      NOT NULL,
  subject              TEXT         NOT NULL,
  body_html            TEXT         NOT NULL,
  body_text            TEXT         NOT NULL,
  is_active            BOOLEAN      DEFAULT true,
  variables            JSONB        DEFAULT '{"available": ["company_name","amount_due","due_date","payment_link"]}',
  created_at           TIMESTAMPTZ  DEFAULT now(),
  updated_at           TIMESTAMPTZ  DEFAULT now(),
  updated_by           UUID         REFERENCES auth.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dunning_step_active
  ON public.dunning_email_templates(step_number)
  WHERE is_active = true;

ALTER TABLE public.dunning_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_dunning_all"
  ON public.dunning_email_templates FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

-- Seed dati iniziali step 1-3
INSERT INTO public.dunning_email_templates
  (step_number, step_name, trigger_days_overdue, subject, body_html, body_text)
VALUES
  (1, 'Promemoria gentile', 1,
   'Fattura in scadenza — {{company_name}}',
   '<p>Gentile {{company_name}},</p><p>ricordiamo che la fattura di €{{amount_due}} scade il {{due_date}}.</p><p><a href="{{payment_link}}">Paga ora</a></p>',
   'Gentile {{company_name}}, la fattura di €{{amount_due}} scade il {{due_date}}. Paga su: {{payment_link}}'),
  (2, 'Sollecito 1', 3,
   'Pagamento in ritardo — Azione richiesta',
   '<p>Gentile {{company_name}},</p><p>il pagamento di €{{amount_due}} risulta in ritardo dal {{due_date}}. Ti chiediamo di regolarizzarlo al più presto.</p><p><a href="{{payment_link}}">Paga ora</a></p>',
   'Gentile {{company_name}}, il pagamento di €{{amount_due}} risulta in ritardo. Paga su: {{payment_link}}'),
  (3, 'Sollecito finale', 7,
   'Ultima comunicazione prima della sospensione',
   '<p>Gentile {{company_name}},</p><p>questa è l''ultima comunicazione prima della sospensione del tuo account. Il pagamento di €{{amount_due}} non è stato ricevuto.</p><p><a href="{{payment_link}}">Regolarizza ora</a></p>',
   'Gentile {{company_name}}, ultima comunicazione prima della sospensione. Paga €{{amount_due}} su: {{payment_link}}')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- FEATURE 5 — Import CSV lead
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.csv_import_jobs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  filename        TEXT         NOT NULL,
  status          TEXT         NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
  total_rows      INTEGER      DEFAULT 0,
  imported_rows   INTEGER      DEFAULT 0,
  failed_rows     INTEGER      DEFAULT 0,
  error_log       JSONB        DEFAULT '[]',
  column_mapping  JSONB        DEFAULT '{}',
  source          TEXT,
  notes           TEXT,
  created_by      UUID         REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ  DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

ALTER TABLE public.csv_import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_csv_all"
  ON public.csv_import_jobs FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE INDEX IF NOT EXISTS idx_csv_jobs_created ON public.csv_import_jobs(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- FEATURE 7 — Assicura esistenza crm_campaigns (dependency)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_campaigns (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text         NOT NULL,
  subject         text         NOT NULL,
  html_body       text         NOT NULL DEFAULT '',
  contact_filter  jsonb        NOT NULL DEFAULT '{}',
  status          text         NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','scheduled','sending','sent','failed','cancelled')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  total_contacts  int          NOT NULL DEFAULT 0,
  sent_count      int          NOT NULL DEFAULT 0,
  error_count     int          NOT NULL DEFAULT 0,
  error_message   text,
  created_by      uuid         REFERENCES auth.users(id),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

-- Aggiunge 'cancelled' al CHECK se non già presente (idempotente via IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_campaigns_status_check' AND contype = 'c'
  ) THEN NULL; END IF;
END $$;

ALTER TABLE public.crm_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_campaigns' AND policyname = 'super_admin_crm_campaigns_gap'
  ) THEN
    EXECUTE 'CREATE POLICY "super_admin_crm_campaigns_gap" ON public.crm_campaigns FOR ALL USING (auth.jwt() ->> ''role'' = ''super_admin'')';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- FEATURE 7 — Campaign variants + events per AB test
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campaign_variants (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID         NOT NULL REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  variant_name      TEXT         NOT NULL CHECK (variant_name IN ('A','B','C')),
  weight_pct        INTEGER      NOT NULL DEFAULT 50 CHECK (weight_pct BETWEEN 1 AND 100),
  subject           TEXT,
  body_html         TEXT,
  body_text         TEXT,
  sent_count        INTEGER      DEFAULT 0,
  open_count        INTEGER      DEFAULT 0,
  click_count       INTEGER      DEFAULT 0,
  conversion_count  INTEGER      DEFAULT 0,
  unsubscribe_count INTEGER      DEFAULT 0,
  created_at        TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cv_campaign ON public.campaign_variants(campaign_id);
ALTER TABLE public.campaign_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_cv_all"
  ON public.campaign_variants FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID         REFERENCES public.crm_campaigns(id) ON DELETE CASCADE,
  variant_id   UUID         REFERENCES public.campaign_variants(id) ON DELETE SET NULL,
  company_id   UUID         REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type   TEXT         NOT NULL CHECK (event_type IN ('sent','opened','clicked','converted','bounced','unsubscribed')),
  occurred_at  TIMESTAMPTZ  DEFAULT now(),
  metadata     JSONB        DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_ce_campaign ON public.campaign_events(campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_variant  ON public.campaign_events(variant_id);
ALTER TABLE public.campaign_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_ce_all"
  ON public.campaign_events FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

-- ─────────────────────────────────────────────────────────────
-- FEATURE 8 — Lifecycle playbooks
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lifecycle_playbooks (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT         NOT NULL,
  trigger_event  TEXT         NOT NULL CHECK (trigger_event IN (
    'trial_started','trial_expiring_7d','trial_expired',
    'payment_failed','payment_recovered','plan_upgraded',
    'plan_downgraded','account_suspended','churned','reactivated'
  )),
  is_active      BOOLEAN      DEFAULT true,
  delay_hours    INTEGER      DEFAULT 0,
  actions        JSONB        NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE public.lifecycle_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_playbooks_all"
  ON public.lifecycle_playbooks FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

CREATE INDEX IF NOT EXISTS idx_playbooks_trigger ON public.lifecycle_playbooks(trigger_event) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.playbook_executions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id    UUID         REFERENCES public.lifecycle_playbooks(id) ON DELETE SET NULL,
  company_id     UUID         REFERENCES public.companies(id) ON DELETE CASCADE,
  trigger_event  TEXT         NOT NULL,
  status         TEXT         NOT NULL CHECK (status IN ('pending','running','completed','failed')),
  actions_log    JSONB        DEFAULT '[]',
  started_at     TIMESTAMPTZ  DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  error_message  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pe_company ON public.playbook_executions(company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pe_playbook ON public.playbook_executions(playbook_id);
ALTER TABLE public.playbook_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_pe_all"
  ON public.playbook_executions FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

-- ─────────────────────────────────────────────────────────────
-- FEATURE 9 — Audit log cambiamenti flag azienda
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_flag_audit_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  changed_by  UUID         NOT NULL REFERENCES auth.users(id),
  field_name  TEXT         NOT NULL,
  old_value   JSONB,
  new_value   JSONB,
  reason      TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_company ON public.company_flag_audit_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user    ON public.company_flag_audit_log(changed_by, created_at DESC);

ALTER TABLE public.company_flag_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_audit_all"
  ON public.company_flag_audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

-- Trigger automatico per tracciare modifiche flag critici
CREATE OR REPLACE FUNCTION public.log_company_flag_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_user UUID;
BEGIN
  -- uid() può essere NULL in contesti service_role; accettiamo
  v_user := auth.uid();

  IF OLD.subscription_plan_id IS DISTINCT FROM NEW.subscription_plan_id THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid),
            'subscription_plan_id', to_jsonb(OLD.subscription_plan_id), to_jsonb(NEW.subscription_plan_id));
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid),
            'status', to_jsonb(OLD.status::text), to_jsonb(NEW.status::text));
  END IF;

  IF OLD.billing_status IS DISTINCT FROM NEW.billing_status THEN
    INSERT INTO public.company_flag_audit_log (company_id, changed_by, field_name, old_value, new_value)
    VALUES (NEW.id, COALESCE(v_user, '00000000-0000-0000-0000-000000000000'::uuid),
            'billing_status', to_jsonb(OLD.billing_status::text), to_jsonb(NEW.billing_status::text));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS company_flag_audit_trigger ON public.companies;
CREATE TRIGGER company_flag_audit_trigger
  AFTER UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.log_company_flag_changes();

-- ─────────────────────────────────────────────────────────────
-- FEATURE 11 — Failure alerts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.failure_alerts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID         REFERENCES public.companies(id) ON DELETE CASCADE,
  alert_type    TEXT         NOT NULL CHECK (alert_type IN ('payment_failure','email_failure','sync_failure','api_failure')),
  failure_count INTEGER      NOT NULL,
  details       JSONB        DEFAULT '{}',
  alert_sent_at TIMESTAMPTZ  DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID         REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_fa_company      ON public.failure_alerts(company_id, alert_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_fa_unresolved   ON public.failure_alerts(resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE public.failure_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin_fa_all"
  ON public.failure_alerts FOR ALL
  USING (auth.jwt() ->> 'role' = 'super_admin');

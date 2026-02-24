
-- =============================================
-- Meta Lead Ads Integration Tables
-- =============================================

-- 1. integrations (generic, supports multiple providers)
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  status TEXT NOT NULL DEFAULT 'disconnected',
  connected_by UUID,
  last_sync_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_message TEXT,
  health TEXT NOT NULL DEFAULT 'ok',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, provider)
);

CREATE INDEX idx_integrations_company ON public.integrations(company_id);
CREATE INDEX idx_integrations_status ON public.integrations(status);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage own company integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 2. integration_credentials (encrypted token store)
CREATE TABLE public.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  access_token_encrypted TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'bearer',
  expires_at TIMESTAMPTZ,
  granted_scopes JSONB DEFAULT '[]'::jsonb,
  meta_user_id TEXT,
  meta_user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_creds_integration ON public.integration_credentials(integration_id);

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

-- Credentials only accessible via service role (edge functions), no client-side access
CREATE POLICY "No direct client access to credentials"
  ON public.integration_credentials FOR SELECT TO authenticated
  USING (false);

-- 3. meta_assets (pages, ad accounts, business managers)
CREATE TABLE public.meta_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  selected BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id, asset_type, asset_id)
);

CREATE INDEX idx_meta_assets_integration ON public.meta_assets(integration_id);
CREATE INDEX idx_meta_assets_company ON public.meta_assets(company_id);

ALTER TABLE public.meta_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company meta assets"
  ON public.meta_assets FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage own company meta assets"
  ON public.meta_assets FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 4. meta_lead_forms
CREATE TABLE public.meta_lead_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  page_asset_id UUID REFERENCES public.meta_assets(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  form_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive',
  sync_mode TEXT NOT NULL DEFAULT 'new_only',
  since_date TIMESTAMPTZ,
  last_pull_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, form_id)
);

CREATE INDEX idx_meta_lead_forms_company ON public.meta_lead_forms(company_id);
CREATE INDEX idx_meta_lead_forms_integration ON public.meta_lead_forms(integration_id);

ALTER TABLE public.meta_lead_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company lead forms"
  ON public.meta_lead_forms FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage own company lead forms"
  ON public.meta_lead_forms FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 5. integration_field_mappings
CREATE TABLE public.integration_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  mapping_version INT NOT NULL DEFAULT 1,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, integration_id, form_id)
);

CREATE INDEX idx_field_mappings_company ON public.integration_field_mappings(company_id);

ALTER TABLE public.integration_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company field mappings"
  ON public.integration_field_mappings FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage own company field mappings"
  ON public.integration_field_mappings FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 6. integration_webhook_subscriptions
CREATE TABLE public.integration_webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  object TEXT NOT NULL DEFAULT 'page',
  fields JSONB DEFAULT '["leadgen"]'::jsonb,
  callback_url TEXT,
  verify_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company webhook subs"
  ON public.integration_webhook_subscriptions FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage own company webhook subs"
  ON public.integration_webhook_subscriptions FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 7. integration_webhook_events (event inbox/queue)
CREATE TABLE public.integration_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'meta',
  event_type TEXT NOT NULL DEFAULT 'leadgen',
  event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  fail_count INT NOT NULL DEFAULT 0,
  last_fail_reason TEXT,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  UNIQUE(company_id, provider, event_id)
);

CREATE INDEX idx_webhook_events_status ON public.integration_webhook_events(status);
CREATE INDEX idx_webhook_events_company ON public.integration_webhook_events(company_id);

ALTER TABLE public.integration_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company webhook events"
  ON public.integration_webhook_events FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- No client-side write; only edge functions via service role
CREATE POLICY "No direct client write to webhook events"
  ON public.integration_webhook_events FOR INSERT TO authenticated
  WITH CHECK (false);

-- 8. integration_sync_jobs (job queue)
CREATE TABLE public.integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_jobs_status ON public.integration_sync_jobs(status);
CREATE INDEX idx_sync_jobs_company ON public.integration_sync_jobs(company_id);

ALTER TABLE public.integration_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company sync jobs"
  ON public.integration_sync_jobs FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage own company sync jobs"
  ON public.integration_sync_jobs FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin')));

-- 9. integration_audit_log
CREATE TABLE public.integration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_audit_company ON public.integration_audit_log(company_id);
CREATE INDEX idx_integration_audit_action ON public.integration_audit_log(action);

ALTER TABLE public.integration_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company audit log"
  ON public.integration_audit_log FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- No client-side write; only edge functions via service role
CREATE POLICY "No direct client write to audit log"
  ON public.integration_audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

-- Triggers for updated_at
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integration_credentials_updated_at BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meta_assets_updated_at BEFORE UPDATE ON public.meta_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meta_lead_forms_updated_at BEFORE UPDATE ON public.meta_lead_forms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integration_field_mappings_updated_at BEFORE UPDATE ON public.integration_field_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

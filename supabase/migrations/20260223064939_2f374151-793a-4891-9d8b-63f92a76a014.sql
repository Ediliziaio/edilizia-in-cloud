
-- Email Templates
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  html_content TEXT NOT NULL DEFAULT '',
  json_content JSONB DEFAULT '{}'::jsonb,
  folder TEXT NOT NULL DEFAULT 'Home',
  type TEXT NOT NULL DEFAULT 'html',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their email templates" ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view email templates if permitted" ON public.email_templates FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all email templates" ON public.email_templates FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Email Campaigns
CREATE TABLE public.email_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  type TEXT NOT NULL DEFAULT 'broadcast',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_filter JSONB DEFAULT '{}'::jsonb,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  ab_test_enabled BOOLEAN NOT NULL DEFAULT false,
  ab_subject_b TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their email campaigns" ON public.email_campaigns FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view email campaigns if permitted" ON public.email_campaigns FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all email campaigns" ON public.email_campaigns FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Email Logs
CREATE TABLE public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  sendgrid_message_id TEXT,
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their email logs" ON public.email_logs FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Staff can view email logs if permitted" ON public.email_logs FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_marketing'::text) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all email logs" ON public.email_logs FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Email Billing
CREATE TABLE public.email_billing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  emails_sent INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  month_reference DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_billing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view their email billing" ON public.email_billing FOR SELECT
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all email billing" ON public.email_billing FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Indexes
CREATE INDEX idx_email_templates_company ON public.email_templates(company_id);
CREATE INDEX idx_email_campaigns_company ON public.email_campaigns(company_id);
CREATE INDEX idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX idx_email_logs_campaign ON public.email_logs(campaign_id);
CREATE INDEX idx_email_logs_company ON public.email_logs(company_id);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
CREATE INDEX idx_email_billing_company ON public.email_billing(company_id);
CREATE INDEX idx_email_billing_month ON public.email_billing(month_reference);

-- Triggers for updated_at
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

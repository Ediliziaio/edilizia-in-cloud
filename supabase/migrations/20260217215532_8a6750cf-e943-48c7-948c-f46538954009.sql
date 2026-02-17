
-- 1. Feature flag on companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS messaging_beta_enabled boolean NOT NULL DEFAULT false;

-- 2. messaging_conversations
CREATE TABLE public.messaging_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  phone_number text,
  contact_name text,
  contact_type text NOT NULL DEFAULT 'sconosciuto',
  status text NOT NULL DEFAULT 'da_gestire',
  is_urgent boolean NOT NULL DEFAULT false,
  linked_entity_type text,
  linked_entity_id uuid,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messaging_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their messaging conversations"
  ON public.messaging_conversations FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all messaging conversations"
  ON public.messaging_conversations FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view messaging conversations if permitted"
  ON public.messaging_conversations FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

-- 3. messaging_messages
CREATE TABLE public.messaging_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.messaging_conversations(id) ON DELETE CASCADE,
  sender_type text NOT NULL DEFAULT 'contact',
  sender_name text,
  message_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  transcription text,
  ai_processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messaging_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their messaging messages"
  ON public.messaging_messages FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.messaging_conversations c WHERE c.id = messaging_messages.conversation_id AND c.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Super admins can manage all messaging messages"
  ON public.messaging_messages FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view messaging messages if permitted"
  ON public.messaging_messages FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND EXISTS (
    SELECT 1 FROM public.messaging_conversations c WHERE c.id = messaging_messages.conversation_id AND c.company_id = get_user_company_id(auth.uid())
  ));

-- 4. messaging_ai_runs
CREATE TABLE public.messaging_ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messaging_messages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  raw_input text,
  ai_output jsonb,
  confidence numeric,
  intent text,
  status text NOT NULL DEFAULT 'pending',
  created_actions jsonb,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messaging_ai_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their messaging ai runs"
  ON public.messaging_ai_runs FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all messaging ai runs"
  ON public.messaging_ai_runs FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view messaging ai runs if permitted"
  ON public.messaging_ai_runs FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

-- 5. messaging_daily_reports
CREATE TABLE public.messaging_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  description text,
  work_done jsonb DEFAULT '[]'::jsonb,
  work_planned jsonb DEFAULT '[]'::jsonb,
  materials_used jsonb DEFAULT '[]'::jsonb,
  source_message_id uuid REFERENCES public.messaging_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messaging_daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage their messaging daily reports"
  ON public.messaging_daily_reports FOR ALL
  USING (has_role(auth.uid(), 'company_admin'::app_role) AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Super admins can manage all messaging daily reports"
  ON public.messaging_daily_reports FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Staff can view messaging daily reports if permitted"
  ON public.messaging_daily_reports FOR SELECT
  USING (has_permission(auth.uid(), 'can_view_orders'::text) AND company_id = get_user_company_id(auth.uid()));

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_conversations;

-- 7. Indexes
CREATE INDEX idx_messaging_conversations_company ON public.messaging_conversations(company_id);
CREATE INDEX idx_messaging_messages_conversation ON public.messaging_messages(conversation_id);
CREATE INDEX idx_messaging_ai_runs_message ON public.messaging_ai_runs(message_id);
CREATE INDEX idx_messaging_daily_reports_company ON public.messaging_daily_reports(company_id);


-- =============================================
-- Google Calendar Integration — 4 tables + RLS
-- =============================================

-- 1. google_calendar_connections (per-user OAuth)
CREATE TABLE public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_account_email text,
  google_sub text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status text NOT NULL DEFAULT 'disconnected',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_gcc_company_user ON public.google_calendar_connections(company_id, user_id);
CREATE INDEX idx_gcc_status ON public.google_calendar_connections(status);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own google connection"
  ON public.google_calendar_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins full access google connections"
  ON public.google_calendar_connections FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 2. google_calendar_settings (sync config per-user)
CREATE TABLE public.google_calendar_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.google_calendar_connections(id) ON DELETE CASCADE,
  primary_calendar_id text,
  conflict_calendar_ids text[] NOT NULL DEFAULT '{}',
  sync_mode text NOT NULL DEFAULT 'one_way',
  import_google_events_to_crm boolean NOT NULL DEFAULT false,
  create_contacts_from_guests boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_gcs_company_user ON public.google_calendar_settings(company_id, user_id);

ALTER TABLE public.google_calendar_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own google settings"
  ON public.google_calendar_settings FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins full access google settings"
  ON public.google_calendar_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 3. google_calendar_event_map (bidirectional mapping)
CREATE TABLE public.google_calendar_event_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  google_event_id text NOT NULL,
  google_calendar_id text,
  source text NOT NULL DEFAULT 'crm',
  etag text,
  last_synced_at timestamptz,
  last_updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcem_company_user ON public.google_calendar_event_map(company_id, user_id);
CREATE INDEX idx_gcem_google_event ON public.google_calendar_event_map(google_event_id);
CREATE INDEX idx_gcem_appointment ON public.google_calendar_event_map(appointment_id);

ALTER TABLE public.google_calendar_event_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own event mappings"
  ON public.google_calendar_event_map FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins full access event map"
  ON public.google_calendar_event_map FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 4. google_calendar_busy_slots (cached busy blocks)
CREATE TABLE public.google_calendar_busy_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_event_id text,
  google_calendar_id text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  summary text,
  is_all_day boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcbs_company_user_time ON public.google_calendar_busy_slots(company_id, user_id, start_at, end_at);

ALTER TABLE public.google_calendar_busy_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own busy slots"
  ON public.google_calendar_busy_slots FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Company members read busy slots"
  ON public.google_calendar_busy_slots FOR SELECT
  TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "System manages busy slots"
  ON public.google_calendar_busy_slots FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Updated_at triggers
CREATE TRIGGER update_gcc_updated_at BEFORE UPDATE ON public.google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gcs_updated_at BEFORE UPDATE ON public.google_calendar_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_gcem_updated_at BEFORE UPDATE ON public.google_calendar_event_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

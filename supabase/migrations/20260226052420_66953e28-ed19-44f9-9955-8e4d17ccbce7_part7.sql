CREATE UNIQUE INDEX IF NOT EXISTS idx_gcs_company_user ON public.google_calendar_settings(company_id, user_id);

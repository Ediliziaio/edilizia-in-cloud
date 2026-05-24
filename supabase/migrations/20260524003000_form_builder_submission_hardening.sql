-- Form builder hardening: keep public submissions aligned with captured ad click IDs.
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS wbraid text,
  ADD COLUMN IF NOT EXISTS gbraid text;

-- Keep tenant listing and public lookup snappy as forms grow per company.
CREATE INDEX IF NOT EXISTS idx_lead_forms_company_created_at
  ON public.lead_forms(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_forms_public_lookup
  ON public.lead_forms(company_id, slug, is_published, is_active);

CREATE INDEX IF NOT EXISTS idx_form_submissions_google_click_ids
  ON public.form_submissions(company_id, gclid, wbraid, gbraid);

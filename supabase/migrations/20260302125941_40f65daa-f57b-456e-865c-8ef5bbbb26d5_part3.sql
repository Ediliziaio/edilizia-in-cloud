-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_company_notes_company_id ON public.company_notes(company_id);

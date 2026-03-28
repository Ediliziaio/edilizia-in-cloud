-- Index for organigramma tree queries
CREATE INDEX IF NOT EXISTS idx_hr_profili_responsabile ON public.hr_profili(responsabile_id);

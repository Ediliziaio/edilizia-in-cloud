-- Add unique constraint on (company_id, session_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attribution_sessions_company_session_unique') THEN
    ALTER TABLE public.attribution_sessions DROP CONSTRAINT IF EXISTS attribution_sessions_company_session_unique,
  ADD CONSTRAINT attribution_sessions_company_session_unique UNIQUE (company_id, session_id);
  END IF;
END $$;

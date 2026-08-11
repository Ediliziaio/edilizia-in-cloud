-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.outreach_sequence_steps
  ADD COLUMN IF NOT EXISTS template_name     text,
  ADD COLUMN IF NOT EXISTS template_language text,
  ADD COLUMN IF NOT EXISTS template_params   jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_template_params_chk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_template_params_chk
      CHECK (
        template_params IS NULL
        OR (template_name IS NOT NULL AND jsonb_typeof(template_params) = 'object')
      ) NOT VALID;
  END IF;
END $$;

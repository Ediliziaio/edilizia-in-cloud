-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.outreach_sequence_steps
  ADD COLUMN IF NOT EXISTS node_type      text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS condition_type text,
  ADD COLUMN IF NOT EXISTS next_default   uuid,
  ADD COLUMN IF NOT EXISTS next_alt       uuid,
  ADD COLUMN IF NOT EXISTS pos_x          integer,
  ADD COLUMN IF NOT EXISTS pos_y          integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_sequence_steps'::regclass AND conname = 'outreach_steps_node_type_chk') THEN
    ALTER TABLE public.outreach_sequence_steps ADD CONSTRAINT outreach_steps_node_type_chk CHECK (node_type IN ('email','wait','condition','end')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_sequence_steps'::regclass AND conname = 'outreach_steps_condition_type_chk') THEN
    ALTER TABLE public.outreach_sequence_steps ADD CONSTRAINT outreach_steps_condition_type_chk CHECK (condition_type IS NULL OR condition_type IN ('opened','not_opened','replied','not_replied')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_sequence_steps'::regclass AND conname = 'outreach_steps_next_default_fk') THEN
    ALTER TABLE public.outreach_sequence_steps ADD CONSTRAINT outreach_steps_next_default_fk FOREIGN KEY (next_default) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_sequence_steps'::regclass AND conname = 'outreach_steps_next_alt_fk') THEN
    ALTER TABLE public.outreach_sequence_steps ADD CONSTRAINT outreach_steps_next_alt_fk FOREIGN KEY (next_alt) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.outreach_enrollments
  ADD COLUMN IF NOT EXISTS current_node_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_enrollments'::regclass AND conname = 'outreach_enrollments_current_node_fk') THEN
    ALTER TABLE public.outreach_enrollments ADD CONSTRAINT outreach_enrollments_current_node_fk FOREIGN KEY (current_node_id) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outreach_steps_next_default ON public.outreach_sequence_steps (next_default);
CREATE INDEX IF NOT EXISTS idx_outreach_steps_next_alt ON public.outreach_sequence_steps (next_alt);

ALTER TABLE public.outreach_send_queue
  ADD COLUMN IF NOT EXISTS node_id uuid,
  ADD COLUMN IF NOT EXISTS kind    text NOT NULL DEFAULT 'send';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_send_queue'::regclass AND conname = 'outreach_queue_kind_chk') THEN
    ALTER TABLE public.outreach_send_queue ADD CONSTRAINT outreach_queue_kind_chk CHECK (kind IN ('send','advance')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.outreach_send_queue'::regclass AND conname = 'outreach_queue_node_fk') THEN
    ALTER TABLE public.outreach_send_queue ADD CONSTRAINT outreach_queue_node_fk FOREIGN KEY (node_id) REFERENCES public.outreach_sequence_steps(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outreach_queue_advance ON public.outreach_send_queue (scheduled_for) WHERE status = 'queued' AND kind = 'advance';

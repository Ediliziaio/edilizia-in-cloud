-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

DO $$
BEGIN
  ALTER TABLE public.outreach_sequence_steps
    DROP CONSTRAINT IF EXISTS outreach_steps_node_type_chk;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_steps_node_type_chk'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_steps_node_type_chk
      CHECK (node_type IN ('email','wait','condition','end','whatsapp','sms')) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.outreach_sequence_steps
    DROP CONSTRAINT IF EXISTS outreach_sequence_steps_channel_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_sequence_steps'::regclass
      AND conname = 'outreach_sequence_steps_channel_check'
  ) THEN
    ALTER TABLE public.outreach_sequence_steps
      ADD CONSTRAINT outreach_sequence_steps_channel_check
      CHECK (channel IN ('email','whatsapp','sms')) NOT VALID;
  END IF;

  ALTER TABLE public.outreach_send_queue
    DROP CONSTRAINT IF EXISTS outreach_send_queue_channel_check;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.outreach_send_queue'::regclass
      AND conname = 'outreach_send_queue_channel_check'
  ) THEN
    ALTER TABLE public.outreach_send_queue
      ADD CONSTRAINT outreach_send_queue_channel_check
      CHECK (channel IN ('email','whatsapp','sms')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outreach_queue_msg_channel
  ON public.outreach_send_queue (channel, scheduled_for)
  WHERE status = 'queued' AND kind = 'send' AND channel <> 'email';

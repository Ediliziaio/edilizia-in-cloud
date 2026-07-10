-- ============================================================================
-- Canale 'call' per le sequenze outreach — task chiamata per il commerciale
-- ============================================================================
-- Uno step 'call' NON invia nulla all'esterno: quando il dispatcher lo raggiunge
-- crea una riga in outreach_call_tasks (promemoria di chiamata) e avanza la
-- cadenza. Additivo: il path email/whatsapp/sms resta invariato.
--
-- 1. Ampliamento dei CHECK (idempotente, NOT VALID come le migrazioni multicanale)
-- 2. Tabella outreach_call_tasks + RLS super_admin + indici
-- ============================================================================

-- 1a. node_type degli step: aggiungi 'call'
ALTER TABLE public.outreach_sequence_steps DROP CONSTRAINT IF EXISTS outreach_steps_node_type_chk;
ALTER TABLE public.outreach_sequence_steps
  ADD CONSTRAINT outreach_steps_node_type_chk
  CHECK (node_type = ANY (ARRAY['email','wait','condition','end','whatsapp','sms','call'])) NOT VALID;

-- 1b. channel degli step: aggiungi 'call'
ALTER TABLE public.outreach_sequence_steps DROP CONSTRAINT IF EXISTS outreach_sequence_steps_channel_check;
ALTER TABLE public.outreach_sequence_steps
  ADD CONSTRAINT outreach_sequence_steps_channel_check
  CHECK (channel = ANY (ARRAY['email','whatsapp','sms','call'])) NOT VALID;

-- 1c. channel della coda: aggiungi 'call'
ALTER TABLE public.outreach_send_queue DROP CONSTRAINT IF EXISTS outreach_send_queue_channel_check;
ALTER TABLE public.outreach_send_queue
  ADD CONSTRAINT outreach_send_queue_channel_check
  CHECK (channel = ANY (ARRAY['email','whatsapp','sms','call'])) NOT VALID;

-- 2. Tabella task chiamata
CREATE TABLE IF NOT EXISTS public.outreach_call_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL,
  enrollment_id uuid,
  contact_id    uuid,
  sequence_id   uuid,
  node_id       uuid,
  phone         text,
  contact_name  text,
  company_name  text,
  note          text,                       -- script/promemoria (body del nodo, renderizzato)
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status = ANY (ARRAY['pending','done','skipped','cancelled'])),
  assigned_to   uuid,
  due_at        timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz,
  done_by       uuid
);

CREATE INDEX IF NOT EXISTS idx_outreach_call_tasks_company_status_due
  ON public.outreach_call_tasks (company_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_outreach_call_tasks_contact
  ON public.outreach_call_tasks (contact_id);
CREATE INDEX IF NOT EXISTS idx_outreach_call_tasks_enrollment
  ON public.outreach_call_tasks (enrollment_id);

ALTER TABLE public.outreach_call_tasks ENABLE ROW LEVEL SECURITY;

-- L'outreach engine è admin-piattaforma: gestione riservata al super_admin.
-- Il dispatcher scrive via service-role (bypassa RLS).
DROP POLICY IF EXISTS outreach_call_tasks_super_admin ON public.outreach_call_tasks;
CREATE POLICY outreach_call_tasks_super_admin
  ON public.outreach_call_tasks FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

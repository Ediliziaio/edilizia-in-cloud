-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.silvio_outbound_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id),
  dest_tipo     text CHECK (dest_tipo IN ('cliente','fornitore','dipendente','lead')),
  dest_id       uuid,
  canale        text NOT NULL DEFAULT 'email' CHECK (canale IN ('email','whatsapp','sms')),
  oggetto       text,
  corpo         text NOT NULL,
  scopo         text,
  thread_id     uuid,
  doc_id        uuid,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','cancelled')),
  provider_message_id text,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_silvio_outbound_company ON public.silvio_outbound_messages (company_id, status, created_at DESC);

ALTER TABLE public.silvio_outbound_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_outbound_staff ON public.silvio_outbound_messages;
CREATE POLICY silvio_outbound_staff ON public.silvio_outbound_messages FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS silvio_outbound_service ON public.silvio_outbound_messages;
CREATE POLICY silvio_outbound_service ON public.silvio_outbound_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_outbound_super ON public.silvio_outbound_messages;
CREATE POLICY silvio_outbound_super ON public.silvio_outbound_messages FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.silvio_tool_componi_e_invia_messaggio(
  p_company_id uuid, p_user_id uuid, p_dest_tipo text, p_dest_id uuid,
  p_canale text DEFAULT 'email', p_oggetto text DEFAULT NULL, p_corpo text DEFAULT NULL,
  p_scopo text DEFAULT 'informativo'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_corpo IS NULL OR p_corpo = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id e corpo obbligatori');
  END IF;
  INSERT INTO public.silvio_outbound_messages
    (company_id, created_by, dest_tipo, dest_id, canale, oggetto, corpo, scopo, status)
  VALUES
    (p_company_id, p_user_id, p_dest_tipo, p_dest_id, COALESCE(p_canale,'email'), p_oggetto, p_corpo, COALESCE(p_scopo,'informativo'), 'queued')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'outbound_id', v_id, 'canale', COALESCE(p_canale,'email'), 'status', 'queued');
END $$;

CREATE OR REPLACE FUNCTION public.silvio_tool_rispondi_a_email(
  p_company_id uuid, p_user_id uuid, p_thread_id uuid, p_corpo text, p_doc_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_thread_id IS NULL OR p_corpo IS NULL OR p_corpo = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id, thread_id e corpo obbligatori');
  END IF;
  INSERT INTO public.silvio_outbound_messages
    (company_id, created_by, canale, corpo, scopo, thread_id, doc_id, status)
  VALUES
    (p_company_id, p_user_id, 'email', p_corpo, 'email_reply', p_thread_id, p_doc_id, 'queued')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'outbound_id', v_id, 'thread_id', p_thread_id, 'status', 'queued');
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_tool_componi_e_invia_messaggio(uuid,uuid,text,uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_tool_rispondi_a_email(uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_componi_e_invia_messaggio(uuid,uuid,text,uuid,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_rispondi_a_email(uuid,uuid,uuid,text,uuid) TO authenticated, service_role;

COMMENT ON TABLE public.silvio_outbound_messages IS 'MP-SILVIO-ACTIONS-EXTERNAL-01: outbound di Silvio (audit + coda). Invio solo dopo approvazione action_proposal (tool yellow).';

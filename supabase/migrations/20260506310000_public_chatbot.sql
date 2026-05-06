-- Public Chatbot — lead capture dal sito web
-- ════════════════════════════════════════════════════════════════════════════
-- Schema per chatbot pubblico embeddable. Sessioni anonime + handoff a CRM.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.public_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Identità anonima (tracciato via cookie/localStorage)
  visitor_token text NOT NULL,
  visitor_ip inet,
  visitor_user_agent text,
  visitor_country text,

  -- Origine
  source_page text,                -- URL pagina dove è iniziata
  source_referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,

  -- Lead progressivo (popolato man mano)
  collected_name text,
  collected_email text,
  collected_phone text,
  collected_intent text,           -- 'preventivo' | 'info' | 'demo' | 'altro'
  collected_data jsonb DEFAULT '{}'::jsonb,

  -- Quando il bot ha qualificato → contact creato
  marketing_contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  qualified_at timestamptz,

  -- Stato sessione
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'qualified', 'abandoned', 'closed_human_handoff')),

  message_count int DEFAULT 0,
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  started_at timestamptz DEFAULT now(),
  last_message_at timestamptz DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_public_chat_company_status
  ON public.public_chat_sessions(company_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_chat_visitor
  ON public.public_chat_sessions(visitor_token);

ALTER TABLE public.public_chat_sessions ENABLE ROW LEVEL SECURITY;

-- Solo admin company può leggere le proprie sessioni
DROP POLICY IF EXISTS public_chat_sessions_company ON public.public_chat_sessions;
CREATE POLICY public_chat_sessions_company ON public.public_chat_sessions
  FOR SELECT USING (company_id = public.get_my_company_id());

-- Edge function (service_role) inserisce/aggiorna - no policy authenticated INSERT/UPDATE

-- ────────────────────────────────────────────────────────────────────────────
-- Messages (storico conversazione)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.public_chat_sessions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,

  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_chat_messages_session
  ON public.public_chat_messages(session_id, created_at);

ALTER TABLE public.public_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_chat_messages_company ON public.public_chat_messages;
CREATE POLICY public_chat_messages_company ON public.public_chat_messages
  FOR SELECT USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- Settings per company: configurazione chatbot pubblico
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.public_chatbot_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,

  enabled boolean DEFAULT false,
  welcome_message text DEFAULT 'Ciao! Posso aiutarti a preparare un preventivo o rispondere a domande sui nostri servizi.',
  primary_color text DEFAULT '#2563EB',
  bot_name text DEFAULT 'Assistente Edile',

  -- AI behavior
  vertical_key text,
  ai_persona text DEFAULT 'sales',
  collect_phone_required boolean DEFAULT true,
  collect_email_required boolean DEFAULT true,
  auto_handoff_after_messages int DEFAULT 8,

  -- Limiti
  daily_session_limit int DEFAULT 100,
  rate_limit_per_minute int DEFAULT 10,

  -- API key pubblica (visibile nel widget JS embedded)
  public_widget_token uuid DEFAULT gen_random_uuid(),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.public_chatbot_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatbot_settings_company ON public.public_chatbot_settings;
CREATE POLICY chatbot_settings_company ON public.public_chatbot_settings
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_qualify_public_lead — chiamata dall'edge quando AI ha
-- raccolto abbastanza info per creare un marketing_contact
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_qualify_public_lead(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_session record;
  v_contact_id uuid;
  v_existing record;
BEGIN
  SELECT * INTO v_session FROM public.public_chat_sessions WHERE id = p_session_id;
  IF v_session IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_not_found');
  END IF;

  -- Cerca contact esistente per email o telefono
  IF v_session.collected_email IS NOT NULL OR v_session.collected_phone IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.marketing_contacts
    WHERE company_id = v_session.company_id
      AND deleted_at IS NULL
      AND (
        (v_session.collected_email IS NOT NULL AND lower(email) = lower(v_session.collected_email))
        OR (v_session.collected_phone IS NOT NULL AND phone = v_session.collected_phone)
      )
    ORDER BY last_activity_at DESC NULLS LAST LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      v_contact_id := v_existing.id;
      -- Aggiorna campi vuoti
      UPDATE public.marketing_contacts SET
        first_name = COALESCE(NULLIF(first_name, ''), v_session.collected_name),
        last_activity_at = now(),
        updated_at = now()
      WHERE id = v_contact_id;
    END IF;
  END IF;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.marketing_contacts(
      company_id, first_name, email, phone,
      source, contact_type, last_activity_at,
      attr_source, attr_medium, attr_campaign,
      qualificazione_json
    )
    VALUES (
      v_session.company_id,
      v_session.collected_name,
      v_session.collected_email,
      v_session.collected_phone,
      'public_chatbot',
      'lead',
      now(),
      v_session.utm_source,
      v_session.utm_medium,
      v_session.utm_campaign,
      jsonb_build_object(
        'intent', v_session.collected_intent,
        'source_page', v_session.source_page,
        'session_id', p_session_id,
        'collected_data', v_session.collected_data
      )
    )
    RETURNING id INTO v_contact_id;
  END IF;

  UPDATE public.public_chat_sessions SET
    marketing_contact_id = v_contact_id,
    status = 'qualified',
    qualified_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('ok', true, 'contact_id', v_contact_id, 'reused', v_existing.id IS NOT NULL);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_qualify_public_lead(uuid) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: get_chatbot_config — dati pubblici per widget JS embedded
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_chatbot_config(p_widget_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row record;
BEGIN
  SELECT s.company_id, s.welcome_message, s.primary_color, s.bot_name, s.enabled,
         c.name AS company_name
  INTO v_row
  FROM public.public_chatbot_settings s
  JOIN public.companies c ON c.id = s.company_id
  WHERE s.public_widget_token = p_widget_token;

  IF v_row IS NULL OR NOT v_row.enabled THEN
    RETURN jsonb_build_object('ok', false, 'error', 'widget_disabled');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'company_id', v_row.company_id,
    'company_name', v_row.company_name,
    'welcome_message', v_row.welcome_message,
    'primary_color', v_row.primary_color,
    'bot_name', v_row.bot_name
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_chatbot_config(uuid) TO anon, authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'Public chatbot schema ready'; END $$;

-- MP-OPS-02 — Briefing Capomastro Mattutino (06:30)
-- ════════════════════════════════════════════════════════════════════════════
-- Cron daily 06:30 Europe/Rome → invia WhatsApp/Telegram/Push al capomastro
-- di ogni cantiere attivo con: piano giornata, operai, materiali, meteo,
-- alert sicurezza specifici (vento, pioggia, gelo, caldo).
--
-- Defensive: orders.capomastro_id può non esistere → ALTER ADD COLUMN.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Estensione orders + profiles
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS capomastro_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_capomastro
  ON public.orders(capomastro_user_id) WHERE capomastro_user_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_briefing_channel text NOT NULL DEFAULT 'whatsapp'
    CHECK (preferred_briefing_channel IN ('whatsapp','telegram','push','email','sms','none'));

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS morning_briefing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS morning_briefing_hour int NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS morning_briefing_minute int NOT NULL DEFAULT 30;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) capomastro_briefings — log briefing inviati
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.capomastro_briefings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  capomastro_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  briefing_date   date NOT NULL,

  -- Snapshot dati
  operai_count             int,
  operai_ids               uuid[],
  materiali_disponibili    jsonb,
  materiali_in_arrivo      jsonb,
  lavorazioni_piano        jsonb,
  weather_data             jsonb,
  safety_alerts            jsonb,

  -- AI compose
  ai_message               text NOT NULL,
  ai_persona_used          text DEFAULT 'capocantiere',
  ai_cost_billed_eur       numeric(10,4),

  -- Delivery
  channel                  text NOT NULL CHECK (channel IN ('whatsapp','telegram','push','email','sms')),
  external_message_id      text,
  sent_at                  timestamptz,
  read_at                  timestamptz,
  capomastro_responded     boolean NOT NULL DEFAULT false,
  capomastro_response      text,

  -- Errori delivery
  error_message            text,
  retry_channel            text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_briefing_per_day UNIQUE (cantiere_id, briefing_date)
);

CREATE INDEX IF NOT EXISTS idx_briefing_capo_date
  ON public.capomastro_briefings(capomastro_user_id, briefing_date DESC);
CREATE INDEX IF NOT EXISTS idx_briefing_company_date
  ON public.capomastro_briefings(company_id, briefing_date DESC);
CREATE INDEX IF NOT EXISTS idx_briefing_unsent
  ON public.capomastro_briefings(briefing_date)
  WHERE sent_at IS NULL AND error_message IS NULL;

ALTER TABLE public.capomastro_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS briefing_capo_self ON public.capomastro_briefings;
CREATE POLICY briefing_capo_self ON public.capomastro_briefings FOR SELECT
  USING (capomastro_user_id = auth.uid() OR company_id = public.get_my_company_id());

DROP POLICY IF EXISTS briefing_admin ON public.capomastro_briefings;
CREATE POLICY briefing_admin ON public.capomastro_briefings FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS briefing_super_admin ON public.capomastro_briefings;
CREATE POLICY briefing_super_admin ON public.capomastro_briefings FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.capomastro_briefings IS
  'MP-OPS-02: log briefing mattutini inviati al capomastro con snapshot dati + meteo + safety alerts.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_tool_lista_cantieri_per_briefing (dati per cron)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_cantieri_per_briefing(
  p_company_id uuid,
  p_briefing_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_target_date date := COALESCE(p_briefing_date, CURRENT_DATE);
BEGIN
  SELECT jsonb_build_object(
    'count', COUNT(*),
    'cantieri', COALESCE(jsonb_agg(
      jsonb_build_object(
        'cantiere_id', o.id,
        'order_code', o.order_code,
        'capomastro_user_id', o.capomastro_user_id,
        'capomastro_name', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''),
        'capomastro_channel', COALESCE(p.preferred_briefing_channel, 'whatsapp'),
        'capomastro_phone', p.phone,
        'cantiere_address', o.indirizzo_lavori,
        'cantiere_city', o.comune_lavori,
        'work_description', o.work_description
      )
    ) FILTER (WHERE o.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.capomastro_user_id
  WHERE o.company_id = p_company_id
    AND o.status IN ('in_corso','programmato')
    AND o.capomastro_user_id IS NOT NULL
    AND COALESCE(p.preferred_briefing_channel, 'whatsapp') <> 'none'
    -- Skip se già inviato briefing oggi
    AND NOT EXISTS (
      SELECT 1 FROM public.capomastro_briefings b
       WHERE b.cantiere_id = o.id AND b.briefing_date = v_target_date AND b.sent_at IS NOT NULL
    );

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'cantieri', '[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_lista_cantieri_per_briefing(uuid, date) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_lista_cantieri_per_briefing(uuid, date) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_log_briefing_sent (chiamata da edge dopo invio)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_log_briefing_sent(
  p_company_id uuid,
  p_user_id uuid,
  p_cantiere_id uuid,
  p_briefing_date date,
  p_capomastro_user_id uuid,
  p_channel text,
  p_ai_message text,
  p_weather_data jsonb DEFAULT NULL,
  p_safety_alerts jsonb DEFAULT NULL,
  p_external_message_id text DEFAULT NULL,
  p_ai_cost_billed_eur numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.capomastro_briefings (
    company_id, cantiere_id, capomastro_user_id, briefing_date,
    ai_message, weather_data, safety_alerts,
    channel, external_message_id, ai_cost_billed_eur, sent_at
  ) VALUES (
    p_company_id, p_cantiere_id, p_capomastro_user_id, p_briefing_date,
    p_ai_message, p_weather_data, p_safety_alerts,
    p_channel, p_external_message_id, p_ai_cost_billed_eur, NOW()
  )
  ON CONFLICT (cantiere_id, briefing_date) DO UPDATE
    SET ai_message = EXCLUDED.ai_message,
        weather_data = EXCLUDED.weather_data,
        safety_alerts = EXCLUDED.safety_alerts,
        channel = EXCLUDED.channel,
        external_message_id = EXCLUDED.external_message_id,
        sent_at = NOW(),
        error_message = NULL
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'briefing_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_log_briefing_sent(uuid, uuid, uuid, date, uuid, text, text, jsonb, jsonb, text, numeric)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_log_briefing_sent(uuid, uuid, uuid, date, uuid, text, text, jsonb, jsonb, text, numeric)
  TO service_role;

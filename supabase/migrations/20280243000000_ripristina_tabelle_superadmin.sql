-- Quattro pannelli del superadmin interrogano tabelle che non esistono.
--
-- Le migration che le creavano risultano applicate, con le loro istruzioni
-- registrate: sono girate davvero. Le tabelle sono quindi state eliminate
-- dopo, fuori dalle migration — nessun DROP compare nel repo. Qui si
-- ricreano identiche, perche' il codice che le usa e' vivo e raggiungibile:
--
--   cac_input            → SaasMetricsGrid, il CAC nella dashboard
--   ai_usage_thresholds  → /admin/impostazioni/ai-usage, le soglie di spesa
--   elevenlabs_voices    → /admin/impostazioni/ai, la scelta delle voci
--   cs_alerts            → dashboard, la coda dei detrattori NPS
--
-- Tutte con IF NOT EXISTS: se una riapparisse per altra via, questa migration
-- non le fa niente.

-- ── CAC mensile (input manuale) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cac_input (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anno                  int NOT NULL,
  mese                  int NOT NULL CHECK (mese BETWEEN 1 AND 12),
  spesa_marketing_cents int NOT NULL DEFAULT 0,
  nuove_aziende         int NOT NULL DEFAULT 0,
  note                  text,
  inserito_da           uuid REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anno, mese)
);
ALTER TABLE public.cac_input ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SuperAdmin cac_input full access" ON public.cac_input;
CREATE POLICY "SuperAdmin cac_input full access"
  ON public.cac_input FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE INDEX IF NOT EXISTS idx_cac_input_periodo ON public.cac_input (anno DESC, mese DESC);

-- ── Soglie di spesa AI per piano ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_usage_thresholds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           text NOT NULL,
  daily_limit_eur   numeric(10,2) NOT NULL DEFAULT 5.00,
  monthly_limit_eur numeric(10,2) NOT NULL DEFAULT 50.00,
  alert_channels    text[] NOT NULL DEFAULT '{"email"}',
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_thresholds_plan_unique UNIQUE (plan_id)
);

CREATE TABLE IF NOT EXISTS public.ai_usage_alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  threshold_type text NOT NULL CHECK (threshold_type IN ('daily','monthly')),
  usage_eur      numeric(10,2) NOT NULL,
  limit_eur      numeric(10,2) NOT NULL,
  alerted_at     timestamptz NOT NULL DEFAULT now(),
  resolved_at    timestamptz
);

INSERT INTO public.ai_usage_thresholds (plan_id, daily_limit_eur, monthly_limit_eur)
VALUES ('__default__', 5.00, 50.00), ('basic', 3.00, 25.00),
       ('pro', 10.00, 100.00), ('enterprise', 25.00, 250.00)
ON CONFLICT (plan_id) DO NOTHING;

ALTER TABLE public.ai_usage_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_alerts     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin_ai_thresholds" ON public.ai_usage_thresholds;
CREATE POLICY "super_admin_ai_thresholds" ON public.ai_usage_thresholds FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS "super_admin_ai_alerts" ON public.ai_usage_alerts;
CREATE POLICY "super_admin_ai_alerts" ON public.ai_usage_alerts FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE INDEX IF NOT EXISTS ai_usage_alerts_company_idx
  ON public.ai_usage_alerts (company_id, alerted_at DESC);

-- ── Voci ElevenLabs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.elevenlabs_voices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_id    text UNIQUE NOT NULL,
  name        text NOT NULL,
  language    text NOT NULL DEFAULT 'it',
  gender      text CHECK (gender IN ('male','female','neutral')),
  preview_url text,
  is_active   boolean NOT NULL DEFAULT true,
  is_default  boolean NOT NULL DEFAULT false,
  use_case    text CHECK (use_case IN ('agent','narration','general')),
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.elevenlabs_voices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin_manage_elevenlabs_voices" ON public.elevenlabs_voices;
CREATE POLICY "super_admin_manage_elevenlabs_voices" ON public.elevenlabs_voices FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE UNIQUE INDEX IF NOT EXISTS elevenlabs_voices_single_default
  ON public.elevenlabs_voices (is_default) WHERE is_default = true;

-- ── Alert CS (detrattori NPS) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cs_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alert_type  text NOT NULL,
  priority    text NOT NULL DEFAULT 'medium',
  title       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.cs_alerts ENABLE ROW LEVEL SECURITY;

-- L'originale accendeva RLS senza scrivere nessuna policy: deny-all. Anche
-- quando la tabella c'era, la coda dei detrattori era vuota per costruzione.
DROP POLICY IF EXISTS "super_admin_cs_alerts" ON public.cs_alerts;
CREATE POLICY "super_admin_cs_alerts" ON public.cs_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE INDEX IF NOT EXISTS cs_alerts_aperti_idx
  ON public.cs_alerts (alert_type, created_at DESC) WHERE resolved_at IS NULL;

-- Il trigger sui detrattori e' sparito con la tabella: senza, un punteggio
-- basso non genera piu' nessun avviso.
CREATE OR REPLACE FUNCTION public.notify_nps_detractor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.score IS NOT NULL AND NEW.score < 7 THEN
    INSERT INTO public.cs_alerts (company_id, alert_type, priority, title, description, created_at)
    VALUES (
      NEW.company_id, 'nps_detractor', 'high',
      'NPS Detractor — score ' || NEW.score,
      COALESCE(NULLIF(NEW.feedback_text, ''), NULLIF(NEW.comment, ''), 'Nessun commento lasciato'),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_nps_response_detractor ON public.nps_responses;
CREATE TRIGGER on_nps_response_detractor
  AFTER INSERT ON public.nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.notify_nps_detractor();

NOTIFY pgrst, 'reload schema';

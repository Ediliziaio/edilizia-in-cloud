-- MP02 — Tool calling support per bot operativo WhatsApp
-- Crea: wa_tool_calls, wa_ai_daily_budget, cantiere_segnalazioni + RPC trigram + RPC budget.
-- Adattato allo schema reale del progetto:
--   - RLS su user_roles (non user_company_roles che non esiste)
--   - orders usa description come nome cantiere (non name)
--   - campo_rapportini uniqueness su (user_id, order_id, data_lavoro) non (employee_id, cantiere_id, data)
-- Owner: Florin Andriciuc | Data: 2026-04-23

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Unicità rapportino giornaliero (per user_id + order_id + data_lavoro)
-- ───────────────────────────────────────────────────────────────────────────

-- Deduplica eventuali duplicati esistenti (mantieni il più recente)
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, order_id, data_lavoro
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         ) AS rn
  FROM public.campo_rapportini
  WHERE user_id IS NOT NULL AND order_id IS NOT NULL
)
DELETE FROM public.campo_rapportini
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campo_rapportini_unique_day
  ON public.campo_rapportini (user_id, order_id, data_lavoro)
  WHERE user_id IS NOT NULL AND order_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Trigram search per risoluzione fuzzy cantieri (orders.description)
-- ───────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Compatibilità catena migrazioni pulita:
-- il tool fuzzy usa client_name/client_company prima della migrazione
-- 20260705000000 che li introduce formalmente per la conversione preventivo.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_company TEXT,
  ADD COLUMN IF NOT EXISTS indirizzo_lavori TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS ix_orders_description_trgm
  ON public.orders USING gin (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS ix_orders_client_name_trgm
  ON public.orders USING gin (COALESCE(client_name, '') gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_cantieri_by_trigram(
  p_company_id uuid,
  p_query text,
  p_limit int DEFAULT 5
) RETURNS TABLE (
  id uuid,
  name text,
  indirizzo text,
  similarity real
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    COALESCE(o.description, o.order_code, 'Cantiere') AS name,
    o.indirizzo_lavori AS indirizzo,
    GREATEST(
      similarity(COALESCE(o.description, ''), p_query),
      similarity(COALESCE(o.client_name, ''), p_query),
      similarity(COALESCE(o.order_code, ''), p_query)
    ) AS sim
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND (
      o.status IS NULL
      OR o.status IN ('in_produzione','in_corso','attivo','aperto','in_lavorazione')
    )
    AND (
      similarity(COALESCE(o.description, ''), p_query) > 0.2
      OR similarity(COALESCE(o.client_name, ''), p_query) > 0.2
      OR similarity(COALESCE(o.order_code, ''), p_query) > 0.2
    )
  ORDER BY sim DESC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.search_cantieri_by_trigram(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_cantieri_by_trigram(uuid, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.search_cantieri_by_trigram(uuid, text, int) TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Observability: wa_tool_calls
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_tool_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ts                TIMESTAMPTZ DEFAULT now(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wa_message_id     UUID REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  tool_name         TEXT NOT NULL,
  role_kind         TEXT,
  args_json         JSONB,
  result_ok         BOOLEAN,
  result_summary    TEXT,
  duration_ms       INT,
  model_used        TEXT,
  tokens_prompt     INT,
  tokens_completion INT,
  cost_eur          NUMERIC(10,5)
);

CREATE INDEX IF NOT EXISTS ix_wa_tool_calls_ts
  ON public.wa_tool_calls(ts DESC);
CREATE INDEX IF NOT EXISTS ix_wa_tool_calls_company_ts
  ON public.wa_tool_calls(company_id, ts DESC);
CREATE INDEX IF NOT EXISTS ix_wa_tool_calls_tool
  ON public.wa_tool_calls(tool_name, ts DESC);

ALTER TABLE public.wa_tool_calls ENABLE ROW LEVEL SECURITY;

-- RLS: usa il pattern del progetto (profiles.company_id + user_roles role)
DROP POLICY IF EXISTS "wa_tool_calls_company_read" ON public.wa_tool_calls;
CREATE POLICY "wa_tool_calls_company_read" ON public.wa_tool_calls
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "wa_tool_calls_service_role_all" ON public.wa_tool_calls;
CREATE POLICY "wa_tool_calls_service_role_all" ON public.wa_tool_calls
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Budget giornaliero OpenAI
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_ai_daily_budget (
  company_id          UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  daily_limit_eur     NUMERIC(10,2) DEFAULT 5.00,
  hard_limit_eur      NUMERIC(10,2) DEFAULT 10.00,
  current_day         DATE DEFAULT CURRENT_DATE,
  current_spend_eur   NUMERIC(10,4) DEFAULT 0,
  degraded_mode       BOOLEAN DEFAULT false,
  suspended           BOOLEAN DEFAULT false,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.reset_daily_budget_if_needed(p_company_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wa_ai_daily_budget
  SET current_day = CURRENT_DATE,
      current_spend_eur = 0,
      degraded_mode = false,
      suspended = false,
      updated_at = now()
  WHERE company_id = p_company_id AND current_day < CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_budget_spend(p_company_id uuid, p_eur numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.wa_ai_daily_budget
  SET current_spend_eur = COALESCE(current_spend_eur, 0) + p_eur,
      updated_at = now()
  WHERE company_id = p_company_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_daily_budget_if_needed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_budget_spend(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_daily_budget_if_needed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_budget_spend(uuid, numeric) TO service_role;

ALTER TABLE public.wa_ai_daily_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_ai_daily_budget_company_read" ON public.wa_ai_daily_budget;
CREATE POLICY "wa_ai_daily_budget_company_read" ON public.wa_ai_daily_budget
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "wa_ai_daily_budget_service_role_all" ON public.wa_ai_daily_budget;
CREATE POLICY "wa_ai_daily_budget_service_role_all" ON public.wa_ai_daily_budget
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. cantiere_segnalazioni
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cantiere_segnalazioni (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  employee_id     UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  descrizione     TEXT NOT NULL,
  urgenza         TEXT CHECK (urgenza IN ('alta', 'media', 'bassa')) DEFAULT 'media',
  tipo_problema   TEXT,
  stato           TEXT CHECK (stato IN ('aperta', 'in_lavorazione', 'risolta', 'archiviata'))
                    DEFAULT 'aperta',
  source          TEXT DEFAULT 'whatsapp',
  photo_urls      JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_cantiere_segnalazioni_company
  ON public.cantiere_segnalazioni(company_id, stato);
CREATE INDEX IF NOT EXISTS ix_cantiere_segnalazioni_order
  ON public.cantiere_segnalazioni(order_id);
CREATE INDEX IF NOT EXISTS ix_cantiere_segnalazioni_urgenti
  ON public.cantiere_segnalazioni(created_at DESC)
  WHERE urgenza = 'alta' AND stato = 'aperta';

ALTER TABLE public.cantiere_segnalazioni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segnalazioni_company_read" ON public.cantiere_segnalazioni;
CREATE POLICY "segnalazioni_company_read" ON public.cantiere_segnalazioni
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "segnalazioni_company_write" ON public.cantiere_segnalazioni;
CREATE POLICY "segnalazioni_company_write" ON public.cantiere_segnalazioni
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "segnalazioni_company_update" ON public.cantiere_segnalazioni;
CREATE POLICY "segnalazioni_company_update" ON public.cantiere_segnalazioni
  FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "segnalazioni_service_all" ON public.cantiere_segnalazioni;
CREATE POLICY "segnalazioni_service_all" ON public.cantiere_segnalazioni
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fn_cantiere_segnalazioni_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.stato = 'risolta' AND OLD.stato <> 'risolta' THEN
    NEW.resolved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cantiere_segnalazioni_updated_at ON public.cantiere_segnalazioni;
CREATE TRIGGER trg_cantiere_segnalazioni_updated_at
  BEFORE UPDATE ON public.cantiere_segnalazioni
  FOR EACH ROW EXECUTE FUNCTION public.fn_cantiere_segnalazioni_updated_at();

COMMENT ON TABLE public.cantiere_segnalazioni IS
  'MP02 — Segnalazioni problema su cantiere da WhatsApp bot operativo. Urgenza alta → notifica titolare.';

COMMENT ON TABLE public.wa_tool_calls IS
  'MP02 — Log di ogni tool-call invocato dal bot operativo: tokens, costo, durata, risultato.';

COMMENT ON TABLE public.wa_ai_daily_budget IS
  'MP02 — Budget giornaliero OpenAI per company. Soft limit → gpt-4o-mini, hard limit → suspend.';

COMMIT;

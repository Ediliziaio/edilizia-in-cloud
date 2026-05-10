-- ════════════════════════════════════════════════════════════════════════════
-- GAP 2 — Apply Proactive Proposals schema + cron (paste-and-run)
-- Generato 2026-05-10T08:34:42Z — versione INLINED (no \i, no psql)
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
--
-- DOPO l'esecuzione, setta i secret per attivare il cron daily 07:00 UTC:
--   ALTER DATABASE postgres SET app.proactive_cron_secret = 'random_string_qui';
--   ALTER DATABASE postgres SET app.supabase_url = 'https://rsbrguhkodgnqfomrevo.supabase.co';
--   E lo stesso valore in Supabase Dashboard → Edge Functions → Secrets → PROACTIVE_CRON_SECRET
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- GAP 2 (Proattività) — Proactive Action Proposals
-- ────────────────────────────────────────────────────────────────────────────
-- Estende ai_action_proposals con campi per proposals AUTO-GENERATE da
-- cron giornaliero (vs proposals triggerate da tool yellow/red durante chat).
--
-- Esempi di signal_type:
--   - 'cantiere_in_ritardo'         (data_fine_prevista < today AND not completed)
--   - 'fattura_scaduta_30gg'         (scadenza < today - 30gg AND not pagata)
--   - 'durc_scadenza_subappaltatore' (DURC scade < 30gg)
--   - 'lead_dormiente_30gg'          (no contatti 30+gg in pipeline aperta)
--
-- Idempotenza: indice unique parziale per evitare doppi proposals dello stesso
-- signal sulla stessa entità (es. stesso cantiere) finché c'è una pending.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Schema extensions ───────────────────────────────────────────────────
ALTER TABLE public.ai_action_proposals
  ADD COLUMN IF NOT EXISTS auto_generated  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signal_type     text,
  ADD COLUMN IF NOT EXISTS signal_entity_id uuid,
  ADD COLUMN IF NOT EXISTS signal_metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ai_action_proposals.auto_generated IS
  'true se generato dal cron ai-proactive-proposals-daily, false se da tool yellow/red';
COMMENT ON COLUMN public.ai_action_proposals.signal_type IS
  'tipo del segnale che ha triggerato la proposal (cantiere_in_ritardo, fattura_scaduta, ecc.)';
COMMENT ON COLUMN public.ai_action_proposals.signal_entity_id IS
  'id dell entità a cui la proposal si riferisce (cantiere_id, fattura_id, lead_id, ...)';

-- Indice idempotenza: massimo 1 proposal pending per (company, signal_type, entity)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_action_proposals_signal_dedup
  ON public.ai_action_proposals (company_id, signal_type, signal_entity_id)
  WHERE status = 'pending' AND auto_generated = true;

-- Indice per query "tutte le proposte auto-generate aperte di una company"
CREATE INDEX IF NOT EXISTS idx_ai_action_proposals_auto_pending
  ON public.ai_action_proposals (company_id, created_at DESC)
  WHERE status = 'pending' AND auto_generated = true;

-- ─── 2) RPC helper: insert idempotente (no doppia proposal per stesso signal) ──
CREATE OR REPLACE FUNCTION public.create_proactive_proposal(
  p_company_id        uuid,
  p_user_id           uuid,
  p_persona_key       text,
  p_action_type       text,
  p_summary           text,
  p_payload           jsonb,
  p_signal_type       text,
  p_signal_entity_id  uuid,
  p_signal_metadata   jsonb DEFAULT '{}'::jsonb,
  p_risk_level        text DEFAULT 'yellow',
  p_ttl_days          int  DEFAULT 7
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing uuid;
  v_new_id   uuid;
BEGIN
  -- Idempotency check: se c'è già una proposal pending per stesso signal+entity, skip
  SELECT id INTO v_existing
  FROM public.ai_action_proposals
  WHERE company_id = p_company_id
    AND signal_type = p_signal_type
    AND signal_entity_id = p_signal_entity_id
    AND status = 'pending'
    AND auto_generated = true
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing; -- ritorna quella esistente (no insert duplicato)
  END IF;

  INSERT INTO public.ai_action_proposals (
    company_id, user_id, persona_key, action_type, summary, payload,
    risk_level, expires_at,
    auto_generated, signal_type, signal_entity_id, signal_metadata
  ) VALUES (
    p_company_id, p_user_id, p_persona_key, p_action_type, p_summary, p_payload,
    p_risk_level, now() + (p_ttl_days || ' days')::interval,
    true, p_signal_type, p_signal_entity_id, COALESCE(p_signal_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_proactive_proposal FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_proactive_proposal TO service_role;

COMMENT ON FUNCTION public.create_proactive_proposal IS
  'Insert idempotente di proactive proposal. Service-role only (chiamato da cron edge).';

-- ─── 3) pg_cron daily 07:00 UTC ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('ai-proactive-proposals-daily');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'ai-proactive-proposals-daily',
      '0 7 * * *', -- daily 07:00 UTC ≈ 08:00-09:00 Italia
      $cron$
      SELECT net.http_post(
        url:=current_setting('app.supabase_url', true) || '/functions/v1/ai-proactive-proposals-daily',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', current_setting('app.proactive_cron_secret', true)
        ),
        body:='{"source": "pg_cron_daily"}'::jsonb,
        timeout_milliseconds:=600000
      ) AS request_id;
      $cron$
    );
  END IF;
END $$;

COMMIT;

-- ─── Verifica ───────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_action_proposals' AND column_name='auto_generated') AS auto_gen_col_ok,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_action_proposals' AND column_name='signal_type')    AS signal_type_col_ok,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='create_proactive_proposal' AND pronamespace='public'::regnamespace) AS rpc_ok;

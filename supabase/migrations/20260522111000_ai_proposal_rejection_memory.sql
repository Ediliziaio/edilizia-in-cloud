-- ════════════════════════════════════════════════════════════════════════════
-- AI Feature #16 — Rejection Memory (parte di Memory enterprise)
-- ────────────────────────────────────────────────────────────────────────────
-- Quando l'utente rifiuta più volte la stessa proposta proattiva per la
-- stessa entità + segnale, l'AI deve smettere di proporla per un periodo.
--
-- Implementazione:
--   - Aggiorniamo create_proactive_proposal aggiungendo un controllo:
--     conta i rejected per (company_id, signal_type, signal_entity_id)
--     negli ultimi 30 giorni. Se >= 3, ritorna NULL (skip silenzioso).
--   - Idempotenza esistente (skip se pending già esiste) preservata.
--   - Behavior-preserving: il worker (ai-proactive-proposals-daily) già conta
--     come "skipped" il NULL ritornato → nessun cambio nei detector.
--
-- Soglia: 3 reject in 30gg. Soft-block: dopo 30gg l'AI riprova.
-- Questa è memoria implicita: l'utente non deve gestirla manualmente.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

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
  v_recent_rejections int;
  v_new_id   uuid;
BEGIN
  -- 1) Idempotency check: se c'è già una proposal pending per stesso signal+entity, skip
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

  -- 2) Feature #16 — Rejection memory: se l'utente ha già rifiutato questa
  -- combinazione (company, signal, entity) >= 3 volte negli ultimi 30 giorni,
  -- l'AI smette di proporla. Soft-block: dopo 30gg si riprova.
  -- Ignora signal_entity_id NULL (alcuni segnali sono company-wide).
  IF p_signal_entity_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_rejections
    FROM public.ai_action_proposals
    WHERE company_id = p_company_id
      AND signal_type = p_signal_type
      AND signal_entity_id = p_signal_entity_id
      AND status = 'rejected'
      AND resolved_at >= now() - interval '30 days';

    IF v_recent_rejections >= 3 THEN
      -- Skip silenzioso: il worker conta come "skipped_dedup".
      RETURN NULL;
    END IF;
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

REVOKE ALL ON FUNCTION public.create_proactive_proposal(uuid, uuid, text, text, text, jsonb, text, uuid, jsonb, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_proactive_proposal(uuid, uuid, text, text, text, jsonb, text, uuid, jsonb, text, int) TO service_role;

COMMIT;

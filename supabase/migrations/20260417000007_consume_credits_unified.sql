-- ============================================================================
-- P0 · RPC unificata consume_credits(company_id, credit_type, amount)
-- ============================================================================
-- Il masterprompt richiede un'unica entry-point per consumare crediti con
-- semantica uniforme (atomic, row-level lock, log transazione). Oggi abbiamo
-- N funzioni sparse:
--   - deduct_ai_credits(uuid, numeric)             → jsonb, no log
--   - consume_ai_credits(uuid, numeric, ...)       → jsonb, log su ai_credit_transactions
--   - deduct_email_credits_with_log(...)           → jsonb, log su email_credits_log
--   - deduct_whatsapp_credits_with_log(...)        → json, RAISE su saldo insuff.
--   - deduct_render_credit(uuid)                   → text 'ok'|'insufficient'
-- Ognuna con signature, error handling e contract diversi → edge function e UI
-- devono conoscere il quirk per ogni tipo. Aggiungiamo una façade unificata.
--
-- Design:
--   - Unica RPC `consume_credits(company_id, credit_type, amount, description?, metadata?)`
--   - Dispatch case-based sul credit_type (ai | email | whatsapp | render)
--   - Ogni branch: SELECT ... FOR UPDATE → validazione saldo → UPDATE + log
--   - Fail-soft su saldo insufficiente: ritorna { success:false, error:'insufficient_credits' }
--     invece di RAISE (coerente con la convenzione di consume_ai_credits esistente)
--   - Scrive il log sulla tabella per-tipo esistente (email_credits_log, whatsapp_credits_log).
--     ai_credit_transactions resta gestita da consume_ai_credits legacy per non duplicare
--     (quella funzione scala bonus+crediti, qui consumo solo balance_eur).
--   - Render usa integer amount, raise se frazionario.
--
-- Le RPC legacy restano per backward-compat. Nessuna viene rimossa in questa migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_company_id  uuid,
  p_credit_type text,
  p_amount      numeric,
  p_description text DEFAULT NULL,
  p_metadata    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type           text;
  v_balance_before numeric;
  v_balance_after  numeric;
  v_amount_int     integer;
BEGIN
  -- ── Validazione input ──────────────────────────────────────────────────
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id è obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount deve essere > 0 (ricevuto: %)', p_amount USING ERRCODE = '22023';
  END IF;

  v_type := lower(trim(COALESCE(p_credit_type, '')));

  IF v_type NOT IN ('ai', 'email', 'whatsapp', 'render') THEN
    RAISE EXCEPTION 'credit_type "%" non supportato (valori ammessi: ai, email, whatsapp, render)',
      p_credit_type USING ERRCODE = '22023';
  END IF;

  -- ── Dispatch atomico per tipo (ciascun branch prende row-level lock) ──
  CASE v_type

    -- ── AI (wallet EUR-based, no auto-create con saldo negativo qui) ────
    WHEN 'ai' THEN
      SELECT balance_eur INTO v_balance_before
        FROM public.ai_credits
       WHERE company_id = p_company_id
       FOR UPDATE;

      IF v_balance_before IS NULL OR v_balance_before < p_amount THEN
        RETURN jsonb_build_object(
          'success',       false,
          'error',         'insufficient_credits',
          'credit_type',   v_type,
          'balance_before', COALESCE(v_balance_before, 0),
          'amount',        p_amount
        );
      END IF;

      UPDATE public.ai_credits
         SET balance_eur     = balance_eur - p_amount,
             total_spent_eur = COALESCE(total_spent_eur, 0) + p_amount,
             updated_at      = now()
       WHERE company_id = p_company_id
       RETURNING balance_eur INTO v_balance_after;

    -- ── EMAIL (wallet EUR-based + log su email_credits_log) ─────────────
    WHEN 'email' THEN
      SELECT balance_eur INTO v_balance_before
        FROM public.email_credits
       WHERE company_id = p_company_id
       FOR UPDATE;

      IF v_balance_before IS NULL OR v_balance_before < p_amount THEN
        RETURN jsonb_build_object(
          'success',       false,
          'error',         'insufficient_credits',
          'credit_type',   v_type,
          'balance_before', COALESCE(v_balance_before, 0),
          'amount',        p_amount
        );
      END IF;

      UPDATE public.email_credits
         SET balance_eur     = balance_eur - p_amount,
             total_spent_eur = COALESCE(total_spent_eur, 0) + p_amount,
             updated_at      = now()
       WHERE company_id = p_company_id
       RETURNING balance_eur INTO v_balance_after;

      INSERT INTO public.email_credits_log
        (company_id, type, amount_eur, balance_before, balance_after, description, metadata)
      VALUES
        (p_company_id, 'deduct', p_amount, v_balance_before, v_balance_after, p_description, p_metadata);

    -- ── WHATSAPP (wallet EUR-based + log + auto-block a saldo zero) ────
    WHEN 'whatsapp' THEN
      SELECT balance_eur INTO v_balance_before
        FROM public.whatsapp_credits
       WHERE company_id = p_company_id
       FOR UPDATE;

      IF v_balance_before IS NULL OR v_balance_before < p_amount THEN
        RETURN jsonb_build_object(
          'success',       false,
          'error',         'insufficient_credits',
          'credit_type',   v_type,
          'balance_before', COALESCE(v_balance_before, 0),
          'amount',        p_amount
        );
      END IF;

      v_balance_after := ROUND(v_balance_before - p_amount, 4);

      UPDATE public.whatsapp_credits
         SET balance_eur     = v_balance_after,
             total_spent_eur = total_spent_eur + p_amount,
             sends_blocked   = CASE WHEN v_balance_after <= 0 THEN true ELSE sends_blocked END,
             updated_at      = now()
       WHERE company_id = p_company_id;

      INSERT INTO public.whatsapp_credits_log
        (company_id, amount_eur, balance_before, balance_after, type, description, metadata)
      VALUES
        (p_company_id, -p_amount, v_balance_before, v_balance_after, 'deduct', p_description, p_metadata);

    -- ── RENDER (wallet INTEGER-based, no log table nativa) ───────────────
    WHEN 'render' THEN
      IF p_amount <> FLOOR(p_amount) THEN
        RAISE EXCEPTION 'Per credit_type=render l''amount deve essere intero (ricevuto: %)', p_amount
          USING ERRCODE = '22023';
      END IF;
      v_amount_int := p_amount::integer;

      SELECT balance INTO v_balance_before
        FROM public.render_credits
       WHERE company_id = p_company_id
       FOR UPDATE;

      IF v_balance_before IS NULL OR v_balance_before < v_amount_int THEN
        RETURN jsonb_build_object(
          'success',       false,
          'error',         'insufficient_credits',
          'credit_type',   v_type,
          'balance_before', COALESCE(v_balance_before, 0),
          'amount',        p_amount
        );
      END IF;

      UPDATE public.render_credits
         SET balance    = balance - v_amount_int,
             total_used = total_used + v_amount_int,
             updated_at = now()
       WHERE company_id = p_company_id
       RETURNING balance INTO v_balance_after;

  END CASE;

  -- ── Risposta uniforme ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',        true,
    'credit_type',    v_type,
    'amount',         p_amount,
    'balance_before', v_balance_before,
    'balance_after',  v_balance_after,
    'description',    p_description
  );
END;
$$;

COMMENT ON FUNCTION public.consume_credits(uuid, text, numeric, text, jsonb) IS
  'Entry point unificato per consumo crediti (credit_type ∈ {ai,email,whatsapp,render}). '
  'Atomic (row-level lock), fail-soft su saldo insufficiente (ritorna success=false), '
  'logga nelle tabelle per-tipo (email_credits_log, whatsapp_credits_log) quando disponibili. '
  'Non rimpiazza le legacy deduct_*: rimane la facade canonica per il nuovo codice.';

-- Le RPC legacy sono usate da edge functions attive → mantenute per backward-compat.
-- Il grant è su authenticated perché il gating è a monte (edge fn super_admin / stesso company).
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, text, numeric, text, jsonb) TO authenticated;

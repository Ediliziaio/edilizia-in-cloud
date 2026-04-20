-- ============================================================================
-- P0 · render_credits_log: tabella di log transazioni per wallet render
-- ============================================================================
-- Audit: il wallet `render_credits` è l'unico dei 4 (ai/email/whatsapp/render)
-- privo di una tabella di log dedicata. Il consumo viene tracciato solo via
-- `render_sessions.cost_billed`, che è una proxy e non un ledger:
--   - se la sessione fallisce e `cost_billed` non viene settato → nessuna riga
--   - se una sessione viene cancellata → perdiamo lo storico movimento
--   - non abbiamo balance_before/after → non c'è traccia del saldo nel tempo
--
-- Questa migration chiude il gap:
--   1. CREATE TABLE public.render_credits_log (stesso shape di email_credits_log,
--      con integer al posto di numeric e session_id al posto di campaign_id).
--   2. AGGIORNA la RPC consume_credits: nel branch 'render' inserisce in log
--      dopo l'UPDATE, usando metadata->>'session_id' se passato dal chiamante.
--   3. AGGIORNA la view credit_transactions_unified per usare il log reale
--      (con balance_before/after popolati) al posto del SELECT da render_sessions.
--
-- Backward-compat: nessuna tabella / funzione / view esistente viene rimossa.
-- Il nuovo insert nel branch render è additivo → se per qualsiasi motivo la
-- INSERT fallisse, la transazione abortirebbe e il saldo verrebbe rollbackato,
-- impedendo consumi silenti. Questo è il comportamento desiderato per un ledger.
-- ============================================================================

-- ── 1. TABLE: render_credits_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.render_credits_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type           text NOT NULL DEFAULT 'deduct',
  amount         integer NOT NULL DEFAULT 0,
  balance_before integer NOT NULL DEFAULT 0,
  balance_after  integer NOT NULL DEFAULT 0,
  description    text,
  session_id     uuid REFERENCES public.render_sessions(id) ON DELETE SET NULL,
  metadata       jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.render_credits_log IS
  'Log movimenti del wallet render_credits (deduct/topup/refund). Shape parallelo a email_credits_log/whatsapp_credits_log, con integer al posto di numeric perché i render si contano come unità intere.';

CREATE INDEX IF NOT EXISTS idx_render_credits_log_company
  ON public.render_credits_log(company_id);

CREATE INDEX IF NOT EXISTS idx_render_credits_log_created
  ON public.render_credits_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_render_credits_log_session
  ON public.render_credits_log(session_id)
  WHERE session_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.render_credits_log ENABLE ROW LEVEL SECURITY;

-- SuperAdmin: accesso pieno per debugging / audit
CREATE POLICY "sa_render_credits_log_all"
  ON public.render_credits_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- Company members: solo lettura del proprio log
CREATE POLICY "co_render_credits_log_select_own"
  ON public.render_credits_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_my_company_id());

GRANT SELECT ON public.render_credits_log TO authenticated;

-- ── 2. RPC: consume_credits con branch render che scrive il log ──────────
-- Rimpiazza la versione del migration 20260417000007. Unica differenza:
-- il branch 'render' fa INSERT in render_credits_log dopo l'UPDATE.
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
  v_session_id     uuid;
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

    -- ── RENDER (wallet INTEGER-based + log dedicato in render_credits_log) ─
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

      -- Estrae session_id dal metadata (il chiamante tipicamente passa
      -- { "session_id": "<uuid>" } quando consuma crediti per un render).
      -- Se non presente o malformato, la colonna resta NULL.
      BEGIN
        v_session_id := (p_metadata->>'session_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_session_id := NULL;
      END;

      INSERT INTO public.render_credits_log
        (company_id, type, amount, balance_before, balance_after, description, session_id, metadata)
      VALUES
        (p_company_id, 'deduct', v_amount_int, v_balance_before::integer, v_balance_after::integer, p_description, v_session_id, p_metadata);

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
  'logga nelle tabelle per-tipo (email_credits_log, whatsapp_credits_log, render_credits_log). '
  'Non rimpiazza le legacy deduct_*: rimane la facade canonica per il nuovo codice.';

GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, text, numeric, text, jsonb) TO authenticated;

-- ── 3. VIEW: credit_transactions_unified che usa render_credits_log ──────
-- Rimpiazza la versione del migration 20260417000008. Unica differenza:
-- il branch render usa render_credits_log (con balance_before/after) invece
-- di render_sessions. Nessun'altra sorgente cambia.
CREATE OR REPLACE VIEW public.credit_transactions_unified AS
  -- ── AI ────────────────────────────────────────────────────────────────
  SELECT
    t.id::text                                          AS id,
    'ai'::text                                          AS credit_type,
    t.company_id                                        AS company_id,
    CASE WHEN t.crediti < 0 THEN 'out' ELSE 'in' END    AS direction,
    ABS(t.crediti)::numeric                             AS amount,
    t.saldo_prima::numeric                              AS balance_before,
    t.saldo_dopo::numeric                               AS balance_after,
    COALESCE(t.tipo, 'consumo')                         AS type,
    t.descrizione                                       AS description,
    t.conversation_id::text                             AS reference_id,
    'conversation'::text                                AS reference_kind,
    t.metadata                                          AS metadata,
    t.creato_il                                         AS created_at
  FROM public.ai_credit_transactions t

  UNION ALL

  -- ── EMAIL ─────────────────────────────────────────────────────────────
  SELECT
    l.id::text                                          AS id,
    'email'::text                                       AS credit_type,
    l.company_id                                        AS company_id,
    CASE
      WHEN l.type IN ('deduct','consume','deduction')   THEN 'out'
      ELSE 'in'
    END                                                 AS direction,
    l.amount_eur::numeric                               AS amount,
    l.balance_before::numeric                           AS balance_before,
    l.balance_after::numeric                            AS balance_after,
    COALESCE(l.type, 'deduct')                          AS type,
    l.description                                       AS description,
    l.campaign_id::text                                 AS reference_id,
    'campaign'::text                                    AS reference_kind,
    l.metadata                                          AS metadata,
    l.created_at                                        AS created_at
  FROM public.email_credits_log l

  UNION ALL

  -- ── WHATSAPP ──────────────────────────────────────────────────────────
  SELECT
    l.id::text                                          AS id,
    'whatsapp'::text                                    AS credit_type,
    l.company_id                                        AS company_id,
    CASE WHEN l.amount_eur < 0 THEN 'out' ELSE 'in' END AS direction,
    ABS(l.amount_eur)::numeric                          AS amount,
    l.balance_before::numeric                           AS balance_before,
    l.balance_after::numeric                            AS balance_after,
    COALESCE(l.type, 'deduct')                          AS type,
    l.description                                       AS description,
    l.broadcast_id::text                                AS reference_id,
    'broadcast'::text                                   AS reference_kind,
    l.metadata                                          AS metadata,
    l.created_at                                        AS created_at
  FROM public.whatsapp_credits_log l

  UNION ALL

  -- ── RENDER (da render_credits_log — ledger reale, non più proxy sessions) ─
  -- balance_before/after ora popolati → UI può mostrare la timeline del saldo.
  SELECT
    l.id::text                                          AS id,
    'render'::text                                      AS credit_type,
    l.company_id                                        AS company_id,
    CASE
      WHEN l.type IN ('deduct','consume','deduction')   THEN 'out'
      ELSE 'in'
    END                                                 AS direction,
    l.amount::numeric                                   AS amount,
    l.balance_before::numeric                           AS balance_before,
    l.balance_after::numeric                            AS balance_after,
    COALESCE(l.type, 'deduct')                          AS type,
    l.description                                       AS description,
    l.session_id::text                                  AS reference_id,
    'render_session'::text                              AS reference_kind,
    l.metadata                                          AS metadata,
    l.created_at                                        AS created_at
  FROM public.render_credits_log l;

COMMENT ON VIEW public.credit_transactions_unified IS
  'Storico unificato transazioni crediti (ai/email/whatsapp/render). Dal 2026-04-18 il branch render usa render_credits_log (ledger) invece di render_sessions, con balance_before/after sempre popolati.';

GRANT SELECT ON public.credit_transactions_unified TO authenticated;

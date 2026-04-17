-- ============================================================================
-- P0 · View unificata storico transazioni crediti (multi-wallet)
-- ============================================================================
-- Il masterprompt richiede uno storico completo delle transazioni crediti
-- consultabile dal SuperAdmin. Oggi abbiamo 3 tabelle di log con schemi
-- leggermente diversi:
--   - ai_credit_transactions   (tipo, crediti, saldo_prima, saldo_dopo)
--   - email_credits_log        (type, amount_eur, balance_before/after, metadata)
--   - whatsapp_credits_log     (type, amount_eur, balance_before/after)
--
-- Creiamo una view che normalizza lo schema e aggiunge il `credit_type`.
-- `render_credits` non ha oggi una tabella di log — il consumo viene tracciato
-- solo via `render_sessions.cost_billed`, che non è un log di movimento ma
-- di operazione. Includiamo un SELECT best-effort da render_sessions come
-- riga "render" con amount negativo.
--
-- Prima però aggiungiamo `metadata jsonb` a whatsapp_credits_log per allineare
-- lo schema (la RPC `consume_credits` e la legacy `deduct_whatsapp_credits_with_log`
-- ne avevano bisogno — creando questa colonna ora è safe anche quando quelle
-- vengono chiamate in produzione).
-- ============================================================================

-- ── FIX SCHEMA: metadata column on whatsapp_credits_log ─────────────────────
ALTER TABLE public.whatsapp_credits_log
  ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.whatsapp_credits_log.metadata IS
  'Payload extra libero per la transazione (es. conversation_id, template_name). Aggiunto 2026-04-17.';

-- ── VIEW: credit_transactions_unified ────────────────────────────────────
-- Normalizza:
--   credit_type   ∈ {ai, email, whatsapp, render}
--   direction     ∈ {in, out}
--   amount        sempre in valore assoluto (usa direction per segno)
--   balance_before / balance_after
--   reference_id  id entità collegata (agent, campaign, broadcast, session)
--   reference_label etichetta umana per la UI
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
  -- In email_credits_log `amount_eur` è sempre ≥ 0 e il segno è implicito
  -- nel `type` ('deduct' = out, 'topup'/'refund' = in).
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
  -- In whatsapp_credits_log `amount_eur` è spesso firmato (negativo = deduct).
  -- Calcoliamo direction sul segno per robustezza.
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

  -- ── RENDER (best-effort da render_sessions) ───────────────────────────
  -- render_credits non ha log; ricostruiamo le uscite dalle sessioni.
  -- balance_before/after sono NULL perché non tracciati per questa tabella.
  SELECT
    s.id::text                                          AS id,
    'render'::text                                      AS credit_type,
    s.company_id                                        AS company_id,
    'out'::text                                         AS direction,
    COALESCE(s.cost_billed, 1)::numeric                 AS amount,
    NULL::numeric                                       AS balance_before,
    NULL::numeric                                       AS balance_after,
    s.status                                            AS type,
    CASE
      WHEN s.prompt_used IS NOT NULL
        THEN left(s.prompt_used, 80)
      ELSE 'Generazione render AI'
    END                                                 AS description,
    s.id::text                                          AS reference_id,
    'render_session'::text                              AS reference_kind,
    s.config_snapshot                                   AS metadata,
    s.created_at                                        AS created_at
  FROM public.render_sessions s
  WHERE s.status IN ('completed','processing');

COMMENT ON VIEW public.credit_transactions_unified IS
  'Storico unificato transazioni crediti (ai/email/whatsapp/render). Normalizza direction/amount e riduce il boilerplate del SuperAdmin che prima doveva unire 3-4 query lato client. Per render usa render_sessions come sorgente (non c''è un log nativo).';

-- ── PERMESSI E RLS ───────────────────────────────────────────────────────
-- Una view normale eredita i permessi dalle tabelle sottostanti, ma Supabase
-- richiede un GRANT esplicito sulla view per farla apparire nei tipi.
-- RLS a monte (sulle tabelle sorgente) fa già il filtro per company_id;
-- la view non aggiunge un layer nuovo.
GRANT SELECT ON public.credit_transactions_unified TO authenticated;

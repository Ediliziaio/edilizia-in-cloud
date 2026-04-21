-- ============================================================================
-- credit_transactions_unified: render ledger hardening
-- ============================================================================
-- The admin Render AI wallet adjustment path writes to render_credit_ledger,
-- while older render flows may still have rows in render_credits_log or only
-- render_sessions. This view keeps the admin history readable and prevents
-- huge prompt text from appearing as a transaction description.
-- ============================================================================

CREATE OR REPLACE VIEW public.credit_transactions_unified AS
  -- AI
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

  -- Email
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

  -- WhatsApp
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

  -- Render admin/generation ledger (current source of truth)
  SELECT
    l.id::text                                          AS id,
    'render'::text                                      AS credit_type,
    l.company_id                                        AS company_id,
    CASE WHEN l.delta < 0 THEN 'out' ELSE 'in' END      AS direction,
    ABS(l.delta)::numeric                               AS amount,
    NULL::numeric                                       AS balance_before,
    l.balance_after::numeric                            AS balance_after,
    l.reason                                            AS type,
    CASE
      WHEN l.reason = 'adjust_admin' THEN COALESCE(l.metadata->>'reason_text', 'Rettifica crediti render da admin')
      WHEN l.reason = 'consume'      THEN 'Generazione render AI'
      WHEN l.reason = 'topup'        THEN COALESCE(l.metadata->>'reason_text', 'Ricarica crediti render')
      WHEN l.reason = 'refund'       THEN COALESCE(l.metadata->>'reason_text', 'Rimborso crediti render')
      WHEN l.reason = 'seed'         THEN 'Seed crediti render'
      ELSE COALESCE(l.metadata->>'reason_text', 'Movimento crediti render')
    END                                                 AS description,
    l.session_id::text                                  AS reference_id,
    CASE WHEN l.session_id IS NULL THEN 'render_wallet' ELSE 'render_session' END AS reference_kind,
    l.metadata                                          AS metadata,
    l.created_at                                        AS created_at
  FROM public.render_credit_ledger l

  UNION ALL

  -- Legacy render log, kept for environments/runs that populated this table.
  SELECT
    l.id::text                                          AS id,
    'render'::text                                      AS credit_type,
    l.company_id                                        AS company_id,
    CASE
      WHEN l.type IN ('deduct','consume','deduction')   THEN 'out'
      ELSE 'in'
    END                                                 AS direction,
    ABS(l.amount)::numeric                              AS amount,
    l.balance_before::numeric                           AS balance_before,
    l.balance_after::numeric                            AS balance_after,
    COALESCE(l.type, 'deduct')                          AS type,
    COALESCE(l.description, 'Movimento crediti render') AS description,
    l.session_id::text                                  AS reference_id,
    'render_session'::text                              AS reference_kind,
    l.metadata                                          AS metadata,
    l.created_at                                        AS created_at
  FROM public.render_credits_log l

  UNION ALL

  -- Last-resort legacy fallback for completed render sessions without ledger.
  -- Keep descriptions generic: never expose prompt_used in the admin wallet log.
  SELECT
    s.id::text                                          AS id,
    'render'::text                                      AS credit_type,
    s.company_id                                        AS company_id,
    'out'::text                                         AS direction,
    COALESCE(s.cost_billed, 1)::numeric                 AS amount,
    NULL::numeric                                       AS balance_before,
    NULL::numeric                                       AS balance_after,
    COALESCE(s.status, 'completed')                     AS type,
    'Generazione render AI'                             AS description,
    s.id::text                                          AS reference_id,
    'render_session'::text                              AS reference_kind,
    NULL::jsonb                                         AS metadata,
    s.created_at                                        AS created_at
  FROM public.render_sessions s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.render_credit_ledger l WHERE l.session_id = s.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.render_credits_log l WHERE l.session_id = s.id
  );

COMMENT ON VIEW public.credit_transactions_unified IS
  'Storico unificato transazioni crediti. Render usa render_credit_ledger + legacy render_credits_log, con fallback render_sessions sanitizzato senza prompt_used.';

GRANT SELECT ON public.credit_transactions_unified TO authenticated;

NOTIFY pgrst, 'reload schema';

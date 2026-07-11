-- ═══════════════════════════════════════════════════════════════════
-- Storico crediti unificato: aggiunge i movimenti SMS (sms_wallet_transazioni)
-- alla vista credit_transactions_unified. Audit /admin/aziende 2026-07-09:
-- gli SMS erano aggiustabili dal tab Billing ma i loro movimenti non
-- comparivano MAI nello "Storico Transazioni Crediti".
-- NB: importi SMS = crediti (unità), non EUR — la UI li esclude dai totali
-- in euro, come già fa per i render.
-- Ricrea la vista = definizione corrente di prod + ramo SMS in coda.
-- ═══════════════════════════════════════════════════════════════════

create or replace view public.credit_transactions_unified as
 SELECT t.id::text AS id,
    'ai'::text AS credit_type,
    t.company_id,
        CASE
            WHEN t.crediti < 0::numeric THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(t.crediti) AS amount,
    t.saldo_prima AS balance_before,
    t.saldo_dopo AS balance_after,
    COALESCE(t.tipo, 'consumo'::text) AS type,
    t.descrizione AS description,
    t.conversation_id::text AS reference_id,
    'conversation'::text AS reference_kind,
    t.metadata,
    t.creato_il AS created_at
   FROM ai_credit_transactions t
UNION ALL
 SELECT l.id::text AS id,
    'email'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.type = ANY (ARRAY['deduct'::text, 'consume'::text, 'deduction'::text]) THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    l.amount_eur AS amount,
    l.balance_before,
    l.balance_after,
    COALESCE(l.type, 'deduct'::text) AS type,
    l.description,
    l.campaign_id::text AS reference_id,
    'campaign'::text AS reference_kind,
    l.metadata,
    l.created_at
   FROM email_credits_log l
UNION ALL
 SELECT l.id::text AS id,
    'whatsapp'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.amount_eur < 0::numeric THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(l.amount_eur) AS amount,
    l.balance_before,
    l.balance_after,
    COALESCE(l.type, 'deduct'::text) AS type,
    l.description,
    l.broadcast_id::text AS reference_id,
    'broadcast'::text AS reference_kind,
    l.metadata,
    l.created_at
   FROM whatsapp_credits_log l
UNION ALL
 SELECT l.id::text AS id,
    'render'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.delta < 0 THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(l.delta)::numeric AS amount,
    NULL::numeric AS balance_before,
    l.balance_after::numeric AS balance_after,
    l.reason AS type,
        CASE
            WHEN l.reason = 'adjust_admin'::text THEN COALESCE(l.metadata ->> 'reason_text'::text, 'Rettifica crediti render da admin'::text)
            WHEN l.reason = 'consume'::text THEN 'Generazione render AI'::text
            WHEN l.reason = 'topup'::text THEN COALESCE(l.metadata ->> 'reason_text'::text, 'Ricarica crediti render'::text)
            WHEN l.reason = 'refund'::text THEN COALESCE(l.metadata ->> 'reason_text'::text, 'Rimborso crediti render'::text)
            WHEN l.reason = 'seed'::text THEN 'Seed crediti render'::text
            ELSE COALESCE(l.metadata ->> 'reason_text'::text, 'Movimento crediti render'::text)
        END AS description,
    l.session_id::text AS reference_id,
        CASE
            WHEN l.session_id IS NULL THEN 'render_wallet'::text
            ELSE 'render_session'::text
        END AS reference_kind,
    l.metadata,
    l.created_at
   FROM render_credit_ledger l
UNION ALL
 SELECT l.id::text AS id,
    'render'::text AS credit_type,
    l.company_id,
        CASE
            WHEN l.type = ANY (ARRAY['deduct'::text, 'consume'::text, 'deduction'::text]) THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(l.amount)::numeric AS amount,
    l.balance_before::numeric AS balance_before,
    l.balance_after::numeric AS balance_after,
    COALESCE(l.type, 'deduct'::text) AS type,
    COALESCE(l.description, 'Movimento crediti render'::text) AS description,
    l.session_id::text AS reference_id,
    'render_session'::text AS reference_kind,
    l.metadata,
    l.created_at
   FROM render_credits_log l
UNION ALL
 SELECT s.id::text AS id,
    'render'::text AS credit_type,
    s.company_id,
    'out'::text AS direction,
    COALESCE(s.cost_billed, 1::numeric) AS amount,
    NULL::numeric AS balance_before,
    NULL::numeric AS balance_after,
    COALESCE(s.status, 'completed'::text) AS type,
    'Generazione render AI'::text AS description,
    s.id::text AS reference_id,
    'render_session'::text AS reference_kind,
    NULL::jsonb AS metadata,
    s.created_at
   FROM render_sessions s
  WHERE NOT (EXISTS ( SELECT 1
           FROM render_credit_ledger l
          WHERE l.session_id = s.id)) AND NOT (EXISTS ( SELECT 1
           FROM render_credits_log l
          WHERE l.session_id = s.id))
UNION ALL
 SELECT w.id::text AS id,
    'sms'::text AS credit_type,
    w.company_id,
        CASE
            WHEN w.importo < 0::numeric THEN 'out'::text
            ELSE 'in'::text
        END AS direction,
    abs(w.importo) AS amount,
    NULL::numeric AS balance_before,
    w.saldo_dopo AS balance_after,
    COALESCE(w.tipo, 'movimento'::text) AS type,
    COALESCE(w.descrizione, 'Movimento crediti SMS'::text) AS description,
    w.riferimento_id::text AS reference_id,
    'sms_wallet'::text AS reference_kind,
    NULL::jsonb AS metadata,
    w.created_at
   FROM sms_wallet_transazioni w;

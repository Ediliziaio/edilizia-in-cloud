-- ════════════════════════════════════════════════════════════════════════════
-- FIX (audit QA) · MP-SILVIO-BRIEF-ACTIONABLE — idempotenza PER-UTENTE
-- ────────────────────────────────────────────────────────────────────────────
-- Difetto latente: silvio_brief_promote_alert riusava una proposta pending dello
-- STESSO alert ignorando user_id. La proposta è di proprietà di p_user_id e
-- silvio-execute-action impone proposal.user_id = chi approva. In un'azienda con
-- 2+ admin il brief del 2° admin riusava la proposta del 1° → 403 all'approvazione.
-- Fix: l'idempotenza ora è per (company, user_id, alert) → ogni admin ha la sua card.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.silvio_brief_promote_alert(
  p_company_id uuid, p_user_id uuid, p_alert_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_alert record; v_existing uuid; v_proposal_id uuid; v_summary text;
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL OR p_alert_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_alert FROM public.silvio_alerts
  WHERE id = p_alert_id AND company_id = p_company_id AND status = 'open';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_alert.cta_action IS NULL
     OR v_alert.cta_action NOT IN (
       'send_overdue_reminder', 'send_quote_followup', 'create_purchase_order',
       'mark_payment_received', 'create_logistics_task', 'generic_email',
       'create_quote_draft', 'create_invoice_draft'
     ) THEN
    RETURN NULL;
  END IF;

  -- idempotenza PER-UTENTE
  SELECT id INTO v_existing
  FROM public.ai_action_proposals
  WHERE company_id = p_company_id
    AND user_id = p_user_id
    AND status = 'pending'
    AND payload->>'alert_id' = p_alert_id::text
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_summary := COALESCE(v_alert.cta_label, 'Azione') || ': ' || v_alert.title;

  INSERT INTO public.ai_action_proposals (
    company_id, user_id, persona_key, action_type, summary, payload,
    status, risk_level, auto_generated, signal_type, signal_metadata, expires_at
  ) VALUES (
    p_company_id, p_user_id, 'silvio', v_alert.cta_action, left(v_summary, 200),
    COALESCE(v_alert.cta_payload, '{}'::jsonb) || jsonb_build_object('alert_id', v_alert.id),
    'pending', 'yellow', true, 'morning_brief',
    jsonb_build_object('alert_type', v_alert.alert_type, 'severity', v_alert.severity),
    now() + interval '2 days'
  )
  RETURNING id INTO v_proposal_id;
  RETURN v_proposal_id;
END $$;

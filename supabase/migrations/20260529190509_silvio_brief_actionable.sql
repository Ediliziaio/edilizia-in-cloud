-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-SILVIO-BRIEF-ACTIONABLE-01 · Blocco 3 — brief mattutino azionabile
ALTER TABLE public.silvio_morning_briefings
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.silvio_morning_briefings.actions IS
  'MP-SILVIO-BRIEF-ACTIONABLE-01: proposte pronte collegate al brief [{proposal_id, action_type, label, alert_title, severity}].';

CREATE OR REPLACE FUNCTION public.silvio_brief_promote_alert(
  p_company_id uuid,
  p_user_id uuid,
  p_alert_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_alert   record;
  v_existing uuid;
  v_proposal_id uuid;
  v_summary text;
BEGIN
  IF p_company_id IS NULL OR p_user_id IS NULL OR p_alert_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_alert
  FROM public.silvio_alerts
  WHERE id = p_alert_id
    AND company_id = p_company_id
    AND status = 'open';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_alert.cta_action IS NULL
     OR v_alert.cta_action NOT IN (
       'send_overdue_reminder', 'send_quote_followup', 'create_purchase_order',
       'mark_payment_received', 'create_logistics_task', 'generic_email',
       'create_quote_draft', 'create_invoice_draft'
     ) THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_existing
  FROM public.ai_action_proposals
  WHERE company_id = p_company_id
    AND status = 'pending'
    AND payload->>'alert_id' = p_alert_id::text
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

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

REVOKE EXECUTE ON FUNCTION public.silvio_brief_promote_alert(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_brief_promote_alert(uuid, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.silvio_brief_promote_alert(uuid, uuid, uuid) IS
  'MP-SILVIO-BRIEF-ACTIONABLE-01: promuove un alert open ad action_proposal pending (idempotente, solo cta_action operative). Service-role-safe per il cron morning-brief.';

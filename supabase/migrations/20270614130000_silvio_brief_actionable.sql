-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-BRIEF-ACTIONABLE-01 · Blocco 3 — brief mattutino azionabile
-- ────────────────────────────────────────────────────────────────────────────
-- Collega detection → proposta → brief. NESSUN nuovo sistema: i pezzi esistono.
--  1) Colonna `actions` su silvio_morning_briefings: elenco delle proposte pronte
--     (proposal_id + label + alert) collegate al brief del giorno.
--  2) RPC `silvio_brief_promote_alert`: gemello service-role-safe di
--     silvio_promote_alert_to_proposal (che usa auth.uid()/get_my_company_id e quindi
--     NON gira dal cron). Qui id espliciti, idempotente, e gate sui SOLI cta_action
--     che l'applier silvio-execute-action esegue davvero (no navigazione open_*).
-- L'action_type della proposta = alert.cta_action: convenzione MATURA già eseguita
-- dai dispatcher di silvio-execute-action (send_overdue_reminder→email reale, ecc.).
-- Tutto resta 'pending' (yellow): nessuna esecuzione senza approvazione umana.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) colonna actions (additiva, default vuoto → nessuna riga storica rotta)
ALTER TABLE public.silvio_morning_briefings
  ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.silvio_morning_briefings.actions IS
  'MP-SILVIO-BRIEF-ACTIONABLE-01: proposte pronte collegate al brief [{proposal_id, action_type, label, alert_title, severity}].';

-- 2) RPC service-role-safe per promuovere un alert ad action_proposal (idempotente)
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

  -- Solo azioni OPERATIVE: cta_action con un handler reale in silvio-execute-action.
  -- Le cta_action di navigazione (open_*) non hanno handler → non diventano proposte.
  IF v_alert.cta_action IS NULL
     OR v_alert.cta_action NOT IN (
       'send_overdue_reminder', 'send_quote_followup', 'create_purchase_order',
       'mark_payment_received', 'create_logistics_task', 'generic_email',
       'create_quote_draft', 'create_invoice_draft'
     ) THEN
    RETURN NULL;
  END IF;

  -- Idempotenza: se esiste già una proposta pending per questo alert, riusala.
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

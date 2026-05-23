-- Email operativo AI: permette alle proposte create dalla mailbox di aggiornare
-- una data prevista ODA solo dopo conferma utente nel pannello action proposals.
BEGIN;

-- Le azioni operative email possono essere low-risk ("green") quando creano
-- solo un task interno. Il vincolo storico della tabella accettava yellow/red.
ALTER TABLE public.ai_action_proposals
  DROP CONSTRAINT IF EXISTS ai_action_proposals_risk_level_check;

ALTER TABLE public.ai_action_proposals
  ADD CONSTRAINT ai_action_proposals_risk_level_check
  CHECK (risk_level IN ('green', 'yellow', 'red'));

CREATE OR REPLACE FUNCTION public.ai_default_action_policy(p_action_type text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_action_type
    WHEN 'mark_payment_received' THEN jsonb_build_object(
      'risk_level', 'red',
      'mode', 'require_strong_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin'),
      'requires_company_admin', true,
      'max_daily_executions', null
    )
    WHEN 'generic_email' THEN jsonb_build_object(
      'risk_level', 'red',
      'mode', 'require_strong_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin'),
      'requires_company_admin', true,
      'max_daily_executions', null
    )
    WHEN 'send_overdue_reminder' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'send_quote_followup' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff', 'salesperson'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'create_purchase_order' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 25
    )
    WHEN 'update_purchase_order_delay' THEN jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 50
    )
    WHEN 'create_logistics_task' THEN jsonb_build_object(
      'risk_level', 'green',
      'mode', 'require_confirmation',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin', 'company_staff'),
      'requires_company_admin', false,
      'max_daily_executions', 100
    )
    ELSE jsonb_build_object(
      'risk_level', 'yellow',
      'mode', 'propose',
      'allowed_roles', jsonb_build_array('super_admin', 'company_admin'),
      'requires_company_admin', false,
      'max_daily_executions', 10
    )
  END;
$$;

COMMENT ON FUNCTION public.ai_default_action_policy(text) IS
  'Policy default per azioni AI confermabili. Include azioni operative email fornitore: ritardo ODA e task logistici/DDT.';

COMMIT;

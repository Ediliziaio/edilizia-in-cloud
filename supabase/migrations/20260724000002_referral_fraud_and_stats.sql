-- ============================================================
-- Sprint 2: Statistiche referrer + Fraud detection
-- ============================================================

-- 1. Funzione aggiornamento statistiche referrer
CREATE OR REPLACE FUNCTION public.update_referrer_stats(p_referrer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total  INTEGER;
  v_active INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE rc.is_active = true)
    INTO v_total, v_active
    FROM referral_companies rc
   WHERE rc.referrer_id = p_referrer_id;

  UPDATE referrers SET
    total_conversions = v_total,
    conversion_rate   = CASE WHEN total_clicks > 0
                             THEN ROUND(v_active::NUMERIC / total_clicks * 100, 2)
                             ELSE 0 END
  WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Tabella fraud log
CREATE TABLE IF NOT EXISTS public.referral_fraud_log (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID         REFERENCES public.referrers(id),
  company_id  UUID,
  fraud_type  TEXT         NOT NULL,
  details     JSONB        DEFAULT '{}',
  detected_at TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE public.referral_fraud_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_fraud_log" ON public.referral_fraud_log;
CREATE POLICY "super_admin_fraud_log" ON public.referral_fraud_log FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Funzione fraud check
CREATE OR REPLACE FUNCTION public.check_referral_fraud(
  p_referrer_id UUID,
  p_company_id  UUID,
  p_ip_address  TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result           JSONB    := '{"ok": true}'::JSONB;
  v_referrer_email   TEXT;
  v_company_email    TEXT;
  v_existing_count   INTEGER;
BEGIN
  -- Check 1: Self-referral (stesso email)
  SELECT email INTO v_referrer_email FROM referrers WHERE id = p_referrer_id;

  SELECT u.email INTO v_company_email
    FROM companies c
    JOIN auth.users u ON u.id = c.owner_id
   WHERE c.id = p_company_id;

  IF LOWER(v_referrer_email) = LOWER(v_company_email) THEN
    INSERT INTO referral_fraud_log(referrer_id, company_id, fraud_type, details)
    VALUES(p_referrer_id, p_company_id, 'self_referral',
           jsonb_build_object('referrer_email', v_referrer_email));
    RETURN '{"ok": false, "reason": "self_referral"}'::JSONB;
  END IF;

  -- Check 2: Stessa company già referenziata da questo referrer
  SELECT COUNT(*) INTO v_existing_count
    FROM referral_companies
   WHERE referrer_id = p_referrer_id AND company_id = p_company_id;

  IF v_existing_count > 0 THEN
    RETURN '{"ok": false, "reason": "duplicate_referral"}'::JSONB;
  END IF;

  -- Check 3: IP duplication (stesso IP con >2 conversioni per questo referrer in 30gg)
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO v_existing_count
      FROM referral_clicks rc
      JOIN referral_companies rco ON rco.referrer_id = rc.referrer_id
     WHERE rc.referrer_id = p_referrer_id
       AND rc.ip_address  = p_ip_address
       AND rc.created_at >= NOW() - INTERVAL '30 days';

    IF v_existing_count >= 3 THEN
      INSERT INTO referral_fraud_log(referrer_id, company_id, fraud_type, details)
      VALUES(p_referrer_id, p_company_id, 'ip_duplication',
             jsonb_build_object('ip', p_ip_address, 'count', v_existing_count));
      RETURN '{"ok": false, "reason": "ip_duplication"}'::JSONB;
    END IF;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger su referral_companies per notifica real-time
CREATE OR REPLACE FUNCTION public.notify_referral_conversion()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'referral_conversion',
    json_build_object(
      'referrer_id', NEW.referrer_id,
      'company_id',  NEW.company_id,
      'referred_at', NEW.referred_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_conversion ON public.referral_companies;
CREATE TRIGGER trg_referral_conversion
  AFTER INSERT ON public.referral_companies
  FOR EACH ROW EXECUTE FUNCTION public.notify_referral_conversion();

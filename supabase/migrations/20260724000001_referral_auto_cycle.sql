-- ============================================================
-- Sprint 1: Referral auto-cycle
-- Aggiunge colonne ai payout + referrers + funzione generate_monthly_payouts
-- + 2 cron jobs pg_cron
-- ============================================================

-- 1. Aggiungi colonne mancanti a referral_payouts
ALTER TABLE public.referral_payouts
  ADD COLUMN IF NOT EXISTS scheduled_payment_date DATE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
  ADD COLUMN IF NOT EXISTS requested_by_referrer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

-- 2. Aggiungi colonne a referrers per onboarding completato
ALTER TABLE public.referrers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS has_accepted_terms BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_method TEXT DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS payout_details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_conversions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS partner_type TEXT DEFAULT 'referrer',
  ADD COLUMN IF NOT EXISTS tier_id UUID;

-- 3. Funzione che genera i payout pending dal ledger
CREATE OR REPLACE FUNCTION public.generate_monthly_payouts(p_month INT, p_year INT)
RETURNS INTEGER AS $$
DECLARE
  v_referrer RECORD;
  v_total NUMERIC;
  v_period_start DATE;
  v_period_end DATE;
  v_payment_date DATE;
  v_count INTEGER := 0;
BEGIN
  v_period_start := make_date(p_year, p_month, 1);
  v_period_end   := (make_date(p_year, p_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  -- Pagamento il 12 del mese SUCCESSIVO
  v_payment_date := make_date(
    CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
    CASE WHEN p_month = 12 THEN 1 ELSE p_month + 1 END,
    12
  );

  FOR v_referrer IN
    SELECT r.id, r.name, r.email, r.payout_method,
           COALESCE(SUM(rcl.commission_amount), 0) AS total_commission
    FROM referrers r
    JOIN referral_commission_ledger rcl ON rcl.referrer_id = r.id
    WHERE rcl.period_month = p_month
      AND rcl.period_year  = p_year
      AND rcl.status       = 'pending'
      AND r.is_active      = true
      AND r.has_accepted_terms = true
    GROUP BY r.id, r.name, r.email, r.payout_method
    HAVING SUM(rcl.commission_amount) > 0
  LOOP
    -- Evita duplicati
    IF NOT EXISTS (
      SELECT 1 FROM referral_payouts
      WHERE referrer_id    = v_referrer.id
        AND period_start   = v_period_start
        AND auto_generated = true
    ) THEN
      INSERT INTO referral_payouts (
        referrer_id, amount, period_start, period_end,
        paid_at, payment_method, status,
        scheduled_payment_date, auto_generated
      ) VALUES (
        v_referrer.id, v_referrer.total_commission,
        v_period_start, v_period_end,
        NOW(), COALESCE(v_referrer.payout_method, 'bank_transfer'),
        'pending', v_payment_date, true
      );

      -- Marca le voci ledger come incluse in questo payout
      UPDATE referral_commission_ledger
        SET status = 'approved'
      WHERE referrer_id  = v_referrer.id
        AND period_month = p_month
        AND period_year  = p_year
        AND status       = 'pending';

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Estensioni pg_cron e pg_net sono gestite da Supabase — non riattivarle qui

-- 5. Cron job 1: ogni 1° del mese ore 08:00 UTC → calcola commissioni + genera payout
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'referral-monthly-cycle') THEN
    PERFORM cron.unschedule('referral-monthly-cycle');
  END IF;
END $$;

SELECT cron.schedule(
  'referral-monthly-cycle',
  '0 8 1 * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/referral-monthly-cycle',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- 6. Cron job 2: ogni 12° del mese ore 09:00 UTC → esegui i pagamenti approvati
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'referral-payout-executor') THEN
    PERFORM cron.unschedule('referral-payout-executor');
  END IF;
END $$;

SELECT cron.schedule(
  'referral-payout-executor',
  '0 9 12 * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url', true) || '/functions/v1/referral-payout-executor',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      ),
      body    := '{}'::jsonb
    );
  $$
);

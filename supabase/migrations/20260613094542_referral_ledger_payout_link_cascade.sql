-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.generate_monthly_payouts(p_month integer, p_year integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referrer record;
  v_period_start date;
  v_period_end date;
  v_payment_date date;
  v_count integer := 0;
  v_payout_id uuid;
  v_policy jsonb := public.get_referral_commission_policy();
  v_min_payout numeric := COALESCE((v_policy->>'minPayoutAmount')::numeric, 50);
  v_require_terms boolean := COALESCE((v_policy->>'requireAcceptedTerms')::boolean, true);
  v_require_payout_details boolean := COALESCE((v_policy->>'requirePayoutDetails')::boolean, true);
BEGIN
  v_period_start := make_date(p_year, p_month, 1);
  v_period_end := (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date;
  v_payment_date := make_date(
    CASE WHEN p_month = 12 THEN p_year + 1 ELSE p_year END,
    CASE WHEN p_month = 12 THEN 1 ELSE p_month + 1 END,
    12
  );

  FOR v_referrer IN
    SELECT
      r.id,
      r.name,
      r.email,
      r.payout_method,
      r.payout_details,
      r.has_accepted_terms,
      COALESCE(SUM(rcl.commission_amount), 0) AS total_commission
    FROM public.referrers r
    JOIN public.referral_commission_ledger rcl ON rcl.referrer_id = r.id
    WHERE rcl.period_month = p_month
      AND rcl.period_year = p_year
      AND rcl.status = 'pending'
      AND r.is_active = true
      AND (NOT v_require_terms OR COALESCE(r.has_accepted_terms, false) = true)
      AND (
        NOT v_require_payout_details
        OR public.is_referrer_payout_compliant(r.payout_details, r.has_accepted_terms, r.payout_method)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.referral_fraud_log rfl
        WHERE rfl.referrer_id = r.id
          AND COALESCE(rfl.detected_at, now()) >= now() - interval '60 days'
      )
    GROUP BY r.id, r.name, r.email, r.payout_method, r.payout_details, r.has_accepted_terms
    HAVING COALESCE(SUM(rcl.commission_amount), 0) >= v_min_payout
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.referral_payouts
      WHERE referrer_id = v_referrer.id
        AND period_start = v_period_start
        AND auto_generated = true
    ) THEN
      INSERT INTO public.referral_payouts (
        referrer_id,
        amount,
        period_start,
        period_end,
        paid_at,
        payment_method,
        status,
        scheduled_payment_date,
        auto_generated,
        notes
      )
      VALUES (
        v_referrer.id,
        v_referrer.total_commission,
        v_period_start,
        v_period_end,
        now(),
        COALESCE(v_referrer.payout_method, 'bank_transfer'),
        'pending',
        v_payment_date,
        true,
        'Generato da policy referral con compliance payout approvata'
      )
      RETURNING id INTO v_payout_id;

      UPDATE public.referral_commission_ledger
      SET status = 'approved',
          payout_id = v_payout_id
      WHERE referrer_id = v_referrer.id
        AND period_month = p_month
        AND period_year = p_year
        AND status = 'pending';

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.referral_payout_status_cascade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.referral_commission_ledger
    SET status = 'paid'
    WHERE payout_id = NEW.id
      AND status <> 'paid';
  ELSIF NEW.status = 'rejected' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.referral_commission_ledger
    SET status = 'pending',
        payout_id = NULL
    WHERE payout_id = NEW.id
      AND status NOT IN ('paid', 'cancelled');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_referral_payout_status_cascade ON public.referral_payouts;
CREATE TRIGGER trg_referral_payout_status_cascade
  AFTER UPDATE OF status ON public.referral_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.referral_payout_status_cascade();

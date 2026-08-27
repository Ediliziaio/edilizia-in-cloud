-- Dieci RPC SECURITY DEFINER erano eseguibili da QUALSIASI utente autenticato,
-- senza controllo di ruolo. Diverse restituiscono dati di piattaforma
-- cross-tenant: provato in prod, uno staff di un'azienda qualsiasi chiamava
-- get_top_companies_by_email e riceveva nome + fatturato + saldo delle
-- aziende concorrenti. Altre ricalcolano commissioni o tier referral.
--
-- Il fix e' una guardia unica, aggiunta IN TESTA al corpo — non si tocca la
-- logica sotto. Passano: super_admin e ruoli platform_* (i pannelli admin
-- girano con questi), il service_role (le edge function le chiamano cosi'), e
-- il contesto interno senza utente (cron/trigger, auth.uid() NULL). Un utente
-- azienda normale prende 42501.

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- service_role (edge function) o contesto interno senza utente: passano.
    COALESCE(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
    OR p_user_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user_id
        AND role IN ('super_admin','platform_manager','platform_sales',
                     'platform_support','platform_marketing','platform_implementation')
    );
$function$;

COMMENT ON FUNCTION public.is_platform_staff(uuid) IS
  'true per super_admin/platform_*, per il service_role e per il contesto interno senza utente. Guardia delle RPC di sola lettura/scrittura di piattaforma.';

-- calculate_monthly_commissions
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(p_month integer, p_year integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_referrer       RECORD;
  v_company        RECORD;
  v_plan_mrr       NUMERIC;
  v_plan_comm      NUMERIC;
  v_addon_total    NUMERIC;
  v_addon_comm     NUMERIC;
  v_plan_pct       NUMERIC;
  v_addon_pct      NUMERIC;
  v_multiplier     NUMERIC;
  v_usage          NUMERIC;
  v_usage_comm     NUMERIC;
  v_usage_pct      NUMERIC;
  v_period_start   TIMESTAMPTZ;
  v_period_end     TIMESTAMPTZ;
  v_count          INTEGER := 0;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  v_period_start := make_date(p_year, p_month, 1)::TIMESTAMPTZ;
  v_period_end   := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ;

  FOR v_referrer IN
    SELECT r.*,
           COALESCE(rt.commission_multiplier, 1.00)   AS tier_multiplier,
           COALESCE(rt.commission_plan_pct,  20.0)     AS tier_plan_pct,
           COALESCE(rt.commission_addon_pct,  5.0)     AS tier_addon_pct,
           COALESCE(rt.commission_on_usage, false)     AS on_usage,
           COALESCE(rt.usage_commission_pct, 5.0)      AS tier_usage_pct
    FROM referrers r
    LEFT JOIN referral_tiers rt ON r.tier_id = rt.id
    WHERE r.is_active = true
  LOOP
    v_plan_pct  := v_referrer.tier_plan_pct;
    v_addon_pct := v_referrer.tier_addon_pct;
    v_multiplier := COALESCE(v_referrer.tier_multiplier, 1.00);

    -- ── Plan-based commissions ──────────────────────────────────
    FOR v_company IN
      SELECT rc.company_id, sp.price_monthly, sp.name AS plan_name
      FROM referral_companies rc
      JOIN companies c ON rc.company_id = c.id
      JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
      WHERE rc.referrer_id = v_referrer.id
        AND rc.is_active = true
        AND c.status = 'active'
    LOOP
      v_plan_mrr := COALESCE(v_company.price_monthly, 0);

      -- Plan commission: tier plan_pct * multiplier
      v_plan_comm := ROUND(v_plan_mrr * (v_plan_pct / 100) * v_multiplier, 2);

      -- Addon commission: sum active add-on prices for this company
      SELECT COALESCE(SUM(pff.price_per_month), 0)
      INTO v_addon_total
      FROM public.company_feature_overrides cfo
      JOIN public.platform_feature_flags pff ON pff.key = cfo.feature_key
      WHERE cfo.company_id = v_company.company_id
        AND cfo.is_enabled = true
        AND pff.category = 'addon'
        AND pff.price_per_month IS NOT NULL
        AND (cfo.expires_at IS NULL OR cfo.expires_at > now());

      v_addon_comm := ROUND(v_addon_total * (v_addon_pct / 100) * v_multiplier, 2);

      INSERT INTO referral_commission_ledger (
        referrer_id, company_id, period_month, period_year,
        subscription_plan_name, plan_mrr,
        commission_type, commission_rate, tier_multiplier, commission_amount,
        status
      ) VALUES (
        v_referrer.id, v_company.company_id, p_month, p_year,
        v_company.plan_name, v_plan_mrr,
        'percentage', v_plan_pct,
        v_multiplier, v_plan_comm + v_addon_comm,
        'pending'
      )
      ON CONFLICT (referrer_id, company_id, period_month, period_year)
      DO UPDATE SET
        plan_mrr               = EXCLUDED.plan_mrr,
        commission_amount      = EXCLUDED.commission_amount,
        commission_rate        = EXCLUDED.commission_rate,
        tier_multiplier        = EXCLUDED.tier_multiplier,
        subscription_plan_name = EXCLUDED.subscription_plan_name,
        calculated_at          = now();

      v_count := v_count + 1;
    END LOOP;

    -- ── Usage-based commissions ─────────────────────────────────
    IF v_referrer.on_usage THEN
      v_usage_pct := COALESCE(v_referrer.tier_usage_pct, 5.0);

      FOR v_company IN
        SELECT rc.company_id
        FROM referral_companies rc
        WHERE rc.referrer_id = v_referrer.id
          AND rc.is_active = true
      LOOP
        SELECT COALESCE(
          (
            SELECT SUM(ABS(ecl.amount_eur))
            FROM email_credits_log ecl
            WHERE ecl.company_id = v_company.company_id
              AND ecl.type = 'deduct'
              AND ecl.created_at >= v_period_start
              AND ecl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(ABS(wcl.amount_eur))
            FROM whatsapp_credits_log wcl
            WHERE wcl.company_id = v_company.company_id
              AND wcl.type = 'deduct'
              AND wcl.created_at >= v_period_start
              AND wcl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(acu.cost_eur)
            FROM ai_credit_usage acu
            WHERE acu.company_id = v_company.company_id
              AND acu.created_at >= v_period_start
              AND acu.created_at <  v_period_end
          ), 0
        )
        INTO v_usage;

        IF v_usage > 0 THEN
          v_usage_comm := ROUND(v_usage * v_usage_pct / 100, 4);

          INSERT INTO referral_commission_ledger (
            referrer_id, company_id, period_month, period_year,
            subscription_plan_name, plan_mrr,
            commission_type, commission_rate, tier_multiplier, commission_amount,
            status
          ) VALUES (
            v_referrer.id, v_company.company_id, p_month, p_year,
            'usage_commission', v_usage,
            'usage', v_usage_pct,
            1.0, v_usage_comm,
            'pending'
          )
          ON CONFLICT (referrer_id, company_id, period_month, period_year)
          DO UPDATE SET
            commission_amount = referral_commission_ledger.commission_amount + v_usage_comm,
            plan_mrr          = EXCLUDED.plan_mrr,
            calculated_at     = now();

          v_count := v_count + 1;
        END IF;
      END LOOP;
    END IF;

    -- Update total_earned for this referrer
    UPDATE referrers SET
      total_earned = (
        SELECT COALESCE(SUM(commission_amount), 0)
        FROM referral_commission_ledger
        WHERE referrer_id = v_referrer.id AND status != 'cancelled'
      )
    WHERE id = v_referrer.id;

  END LOOP;

  RETURN v_count;
END;
$function$;

-- get_company_health_data (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_company_health_data()
 RETURNS TABLE(company_id uuid, order_count bigint, orders_last_30d bigint, user_count bigint, last_order_date timestamp with time zone, has_customers boolean, has_staff boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT 
    c.id AS company_id,
    COALESCE(os.order_count, 0)::bigint,
    COALESCE(os.orders_last_30d, 0)::bigint,
    COALESCE(uc.user_count, 0)::bigint,
    os.last_order_date,
    COALESCE(cust_check.has_customers, false),
    COALESCE(staff_check.has_staff, false)
  FROM public.companies c
  LEFT JOIN (
    SELECT o.company_id, 
           COUNT(*)::bigint AS order_count,
           COUNT(*) FILTER (WHERE o.created_at >= now() - interval '30 days')::bigint AS orders_last_30d,
           MAX(o.created_at) AS last_order_date
    FROM public.orders o
    GROUP BY o.company_id
  ) os ON os.company_id = c.id
  LEFT JOIN (
    SELECT p.company_id, COUNT(*)::bigint AS user_count
    FROM public.profiles p
    WHERE p.company_id IS NOT NULL
    GROUP BY p.company_id
  ) uc ON uc.company_id = c.id
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur2 
      JOIN public.profiles p2 ON p2.id = ur2.user_id
      WHERE p2.company_id = c.id AND ur2.role = 'customer'
    ) AS has_customers
  ) cust_check ON true
  LEFT JOIN LATERAL (
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur3
      JOIN public.profiles p3 ON p3.id = ur3.user_id
      WHERE p3.company_id = c.id AND ur3.role = 'company_staff'
    ) AS has_staff
  ) staff_check ON true;
END;
$function$;

-- get_company_last_access (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_company_last_access()
 RETURNS TABLE(company_id uuid, last_access timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT x.company_id, MAX(x.last_access) AS last_access
  FROM (
    SELECT us.company_id, MAX(us.last_active_at) AS last_access
    FROM public.user_sessions us
    WHERE us.company_id IS NOT NULL
    GROUP BY us.company_id
    UNION ALL
    SELECT p.company_id, MAX(u.last_sign_in_at) AS last_access
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.company_id IS NOT NULL
    GROUP BY p.company_id
  ) x
  WHERE x.company_id IS NOT NULL
  GROUP BY x.company_id;
END;
$function$;

-- get_company_order_stats (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_company_order_stats()
 RETURNS TABLE(company_id uuid, order_count bigint, total_value numeric, last_order_date timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT 
    o.company_id,
    COUNT(*)::bigint,
    COALESCE(SUM(o.total_amount), 0)::numeric,
    MAX(o.created_at)::timestamptz
  FROM public.orders o
  GROUP BY o.company_id;
END;
$function$;

-- get_company_user_counts (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_company_user_counts()
 RETURNS TABLE(company_id uuid, user_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT 
    p.company_id,
    COUNT(*)::bigint
  FROM public.profiles p
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id;
END;
$function$;

-- get_company_user_counts_v2 (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_company_user_counts_v2()
 RETURNS TABLE(company_id uuid, staff_count bigint, customer_count bigint, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    p.company_id,
    COUNT(*) FILTER (
      WHERE ur.role IN (
        'company_admin', 'company_staff', 'employee', 'subcontractor',
        'salesperson', 'call_center', 'referrer'
      )
    )::bigint AS staff_count,
    COUNT(*) FILTER (WHERE ur.role = 'customer')::bigint AS customer_count,
    COUNT(*)::bigint AS total_count
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id;
END;
$function$;

-- get_feature_usage_stats (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_feature_usage_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN ( SELECT jsonb_build_object(
    'total_companies', (SELECT COUNT(*) FROM public.companies),
    'orders', (SELECT COUNT(DISTINCT company_id) FROM public.orders),
    'calendar', (SELECT COUNT(DISTINCT company_id) FROM public.appointments),
    'employees', (SELECT COUNT(DISTINCT company_id) FROM public.employees),
    'marketing', (SELECT COUNT(DISTINCT company_id) FROM public.email_campaigns)
  ) );
END;
$function$;

-- get_plan_company_counts (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_plan_company_counts()
 RETURNS TABLE(subscription_plan_id uuid, company_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT c.subscription_plan_id, COUNT(*)::bigint
  FROM public.companies c
  WHERE c.subscription_plan_id IS NOT NULL
  GROUP BY c.subscription_plan_id;
END;
$function$;

-- get_platform_email_stats (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_platform_email_stats(p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(total_sent bigint, total_delivered bigint, total_opened bigint, total_clicked bigint, total_bounced bigint, total_unsubscribed bigint, total_spam bigint, total_credits_used numeric, total_revenue numeric, active_companies bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE el.status IN ('delivered','opened','clicked'))::bigint,
    COUNT(*) FILTER (WHERE el.status IN ('opened','clicked'))::bigint,
    COUNT(*) FILTER (WHERE el.status = 'clicked')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'bounced')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'unsubscribed')::bigint,
    COUNT(*) FILTER (WHERE el.status = 'spam')::bigint,
    COALESCE((SELECT SUM(ec2.credits_used) FROM public.email_campaigns ec2
      WHERE (p_date_from IS NULL OR ec2.sent_at >= p_date_from)
      AND (p_date_to IS NULL OR ec2.sent_at <= p_date_to)), 0)::numeric,
    COALESCE((SELECT SUM(ecr.total_spent_eur) FROM public.email_credits ecr), 0)::numeric,
    COUNT(DISTINCT el.company_id)::bigint
  FROM public.email_logs el
  WHERE (p_date_from IS NULL OR el.event_timestamp >= p_date_from)
    AND (p_date_to IS NULL OR el.event_timestamp <= p_date_to);
END;
$function$;

-- get_top_companies_by_email (sql→plpgsql)
CREATE OR REPLACE FUNCTION public.get_top_companies_by_email(p_limit integer DEFAULT 10)
 RETURNS TABLE(company_id uuid, company_name text, total_spent numeric, balance numeric, total_sent bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    ec.company_id, c.name,
    COALESCE(ec.total_spent_eur, 0),
    COALESCE(ec.balance_eur, 0),
    COALESCE(logs.cnt, 0)::bigint
  FROM public.email_credits ec
  JOIN public.companies c ON c.id = ec.company_id
  LEFT JOIN (
    SELECT el.company_id, COUNT(*)::bigint AS cnt FROM public.email_logs el GROUP BY el.company_id
  ) logs ON logs.company_id = ec.company_id
  ORDER BY ec.total_spent_eur DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

-- update_referrer_tier
CREATE OR REPLACE FUNCTION public.update_referrer_tier(p_referrer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active_count INTEGER;
  v_tier_id UUID;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM referral_companies rc
  JOIN companies c ON rc.company_id = c.id
  WHERE rc.referrer_id = p_referrer_id
    AND rc.is_active = true
    AND c.status = 'active';

  SELECT id INTO v_tier_id
  FROM referral_tiers
  WHERE min_active_companies <= v_active_count
  ORDER BY min_active_companies DESC
  LIMIT 1;

  UPDATE referrers SET
    tier_id = v_tier_id,
    tier_updated_at = now(),
    total_conversions = v_active_count,
    conversion_rate = CASE
      WHEN COALESCE(total_clicks, 0) > 0 THEN (v_active_count::NUMERIC / total_clicks * 100)
      ELSE 0
    END
  WHERE id = p_referrer_id;
END;
$function$;

-- ── Conteggio clienti di UNA azienda (per il pannello admin CompanySaaSTab) ──
-- Il tab leggeva una tabella 'customers' inesistente → 0 clienti per tutte le
-- aziende, e has_customers sempre falso nel punteggio salute.
CREATE OR REPLACE FUNCTION public.get_company_customer_count(p_company_id uuid)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT COUNT(DISTINCT p.id)
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.company_id = p_company_id AND ur.role = 'customer'
  );
END;
$function$;

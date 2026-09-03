-- ════════════════════════════════════════════════════════════════════════════
-- Crediti email: il piano si legge da dove lo legge tutto il resto dell'app
-- ════════════════════════════════════════════════════════════════════════════
-- `get_company_email_quota` cercava il piano SOLO in company_subscriptions con
-- status='active'. Ma la fonte di verità del piano, in tutta la piattaforma
-- (feature gating compreso), è `companies.subscription_plan_id`. Un'azienda in
-- prova, una con l'abbonamento `past_due`, o una senza riga di abbonamento non
-- ha nessun record 'active' → il piano risultava NULL → email incluse 0 →
-- OGNI email finiva a borsellino → borsellino vuoto → invio bloccato.
--
-- Il caso che l'ha rivelato: Demo Azienda 2 ha il piano **Enterprise con email
-- illimitate (-1)** e il 02/09 la richiesta di firma di un preventivo
-- (quote_signature) è stata bloccata per "crediti insufficienti". Aveva persino
-- 2 € nel borsellino. Nella stessa condizione c'erano **14 aziende**, fra cui
-- Energia Più (in prova, Enterprise) e Domus Group.
--
-- Misurato dopo il fix: 12 aziende tornano coperte dal loro piano; restano 4 su
-- piani a cui nessuno ha configurato le email incluse (decisione di prezzo).
--
-- Si aggiunge anche `plan_limit_unconfigured`: distingue "piano che include 0
-- email" da "piano a cui nessuno ha configurato le email incluse". Erano
-- indistinguibili, e la seconda è una paywall silenziosa su chi paga.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_company_email_quota(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id         UUID;
  v_plan_name       TEXT;
  v_plan_slug       TEXT;
  v_plan_limit      INTEGER;
  v_plan_price      NUMERIC;
  v_plan_fonte      TEXT;
  v_override_limit  INTEGER;
  v_override_price  NUMERIC;
  v_override_free   BOOLEAN;
  v_effective_limit INTEGER;
  v_effective_price NUMERIC;
  v_month_start     TIMESTAMPTZ;
  v_sent_this_month INTEGER;
  v_wallet_balance  NUMERIC;
  v_wallet_blocked  BOOLEAN;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- 4a. Piano: prima l'abbonamento attivo…
  SELECT cs.plan_id INTO v_plan_id
    FROM company_subscriptions cs
   WHERE cs.company_id = p_company_id
     AND cs.status = 'active'
   ORDER BY cs.created_at DESC
   LIMIT 1;

  v_plan_fonte := CASE WHEN v_plan_id IS NOT NULL THEN 'abbonamento_attivo' ELSE NULL END;

  -- …e se non c'è, il piano dell'azienda: è la fonte usata dal resto della
  -- piattaforma. Senza questo ripiego, prova / past_due / nessun abbonamento
  -- significavano "zero email incluse" anche con un piano illimitato.
  IF v_plan_id IS NULL THEN
    SELECT c.subscription_plan_id INTO v_plan_id
      FROM companies c WHERE c.id = p_company_id;
    IF v_plan_id IS NOT NULL THEN
      v_plan_fonte := 'companies.subscription_plan_id';
    END IF;
  END IF;

  IF v_plan_id IS NOT NULL THEN
    SELECT name, slug, email_monthly_included, email_overage_price_eur
      INTO v_plan_name, v_plan_slug, v_plan_limit, v_plan_price
      FROM subscription_plans
     WHERE id = v_plan_id;
  END IF;

  -- 4b. Override per singola azienda (service = 'email')
  SELECT custom_monthly_email_limit, price_per_unit_eur, is_free
    INTO v_override_limit, v_override_price, v_override_free
    FROM company_billing_overrides
   WHERE company_id = p_company_id
     AND service = 'email'
   LIMIT 1;

  v_effective_limit := COALESCE(v_override_limit, v_plan_limit, 0);
  v_effective_price := COALESCE(v_override_price, v_plan_price, 0.0015);

  -- 4c. Uso del mese corrente
  v_month_start := date_trunc('month', now());
  SELECT COUNT(*)::INTEGER INTO v_sent_this_month
    FROM email_delivery_log
   WHERE company_id = p_company_id
     AND sent_at >= v_month_start
     AND status IN ('sent','delivered','queued');

  -- 4d. Borsellino
  SELECT balance_eur, sends_blocked
    INTO v_wallet_balance, v_wallet_blocked
    FROM email_credits
   WHERE company_id = p_company_id
   LIMIT 1;

  RETURN jsonb_build_object(
    'company_id',          p_company_id,
    'plan_id',             v_plan_id,
    'plan_name',           v_plan_name,
    'plan_slug',           v_plan_slug,
    'plan_limit',          v_plan_limit,
    'plan_price_eur',      v_plan_price,
    'plan_source',         v_plan_fonte,
    -- true = al piano non è stato configurato un monte email: è una svista di
    -- configurazione, non una scelta. Chi legge deve poterle distinguere.
    'plan_limit_unconfigured', (v_plan_id IS NOT NULL AND v_plan_limit IS NULL AND v_override_limit IS NULL),
    'override_limit',      v_override_limit,
    'override_price_eur',  v_override_price,
    'is_free',             COALESCE(v_override_free, FALSE),
    'effective_limit',     v_effective_limit,
    'effective_price_eur', v_effective_price,
    'sent_this_month',     COALESCE(v_sent_this_month, 0),
    'remaining',           CASE
                             WHEN v_effective_limit = -1 THEN -1
                             ELSE GREATEST(0, v_effective_limit - COALESCE(v_sent_this_month, 0))
                           END,
    'over_quota',          CASE
                             WHEN v_effective_limit = -1 THEN FALSE
                             ELSE COALESCE(v_sent_this_month, 0) >= v_effective_limit
                           END,
    'wallet_balance_eur',  COALESCE(v_wallet_balance, 0),
    'wallet_sends_blocked',COALESCE(v_wallet_blocked, FALSE),
    'computed_at',         now()
  );
END;
$function$;

-- ── Il messaggio d'errore diventa leggibile ─────────────────────────────────
-- Prima si sottraeva e basta: col saldo insufficiente esplodeva il CHECK del
-- database e nei log finiva
--   'new row for relation "email_credits" violates check constraint
--    "email_credits_balance_eur_nonneg"'
-- che non dice a nessuno quanto manca. Ora il controllo è esplicito e il
-- messaggio porta i numeri:
--   'Crediti email insufficienti: saldo 0.0000 EUR, servono 5.0000 EUR'
-- Il comportamento non cambia: l'invio si blocca prima di partire, come già.
CREATE OR REPLACE FUNCTION public.deduct_email_credits_with_log(
  p_company_id uuid, p_cost numeric, p_description text DEFAULT NULL::text,
  p_campaign_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT balance_eur INTO v_balance_before
  FROM public.email_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF COALESCE(v_balance_before, 0) < p_cost THEN
    RAISE EXCEPTION 'Crediti email insufficienti: saldo % EUR, servono % EUR',
      to_char(COALESCE(v_balance_before, 0), 'FM999999990.0000'),
      to_char(p_cost, 'FM999999990.0000')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_balance_before IS NULL THEN
    INSERT INTO public.email_credits (company_id, balance_eur, total_spent_eur)
    VALUES (p_company_id, -p_cost, p_cost)
    ON CONFLICT (company_id) DO UPDATE
    SET balance_eur = email_credits.balance_eur - p_cost,
        total_spent_eur = COALESCE(email_credits.total_spent_eur, 0) + p_cost,
        updated_at = now()
    RETURNING balance_eur INTO v_balance_after;
    v_balance_before := 0;
  ELSE
    UPDATE public.email_credits
    SET balance_eur = balance_eur - p_cost,
        total_spent_eur = COALESCE(total_spent_eur, 0) + p_cost,
        updated_at = now()
    WHERE company_id = p_company_id
    RETURNING balance_eur INTO v_balance_after;
  END IF;

  INSERT INTO public.email_credits_log (company_id, type, amount_eur, balance_before, balance_after, description, campaign_id, metadata)
  VALUES (p_company_id, 'deduct', p_cost, v_balance_before, v_balance_after, p_description, p_campaign_id, p_metadata);

  RETURN jsonb_build_object('balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$function$;

NOTIFY pgrst, 'reload schema';

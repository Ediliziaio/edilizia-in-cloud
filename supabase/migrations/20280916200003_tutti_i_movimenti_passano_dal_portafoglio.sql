-- Tutti i movimenti di credito passano dal portafoglio unico.
--
-- Il 07/09/2026 il saldo in euro e' diventato UNO (company_credit_pool) e
-- pool_rispecchia() ricopia quel saldo sui vecchi borsellini
-- (ai_credits / email_credits / whatsapp_credits), che restano solo specchi
-- per i lettori. Ma cinque funzioni scrivevano ancora sugli specchi, e ogni
-- loro movimento veniva CANCELLATO dal primo rispecchio successivo:
--
--   adjust_credits_atomic        rettifica crediti dal pannello admin
--                                (CreditManagerCard): una ricarica manuale
--                                di 20 EUR spariva al primo invio email.
--   consume_credits              addebito degli invii WhatsApp
--                                (whatsappCredits.ts, send-whatsapp-reply,
--                                whatsapp-broadcast): WhatsApp usciva gratis.
--   deduct_ai_credits            costo delle chiamate vocali (webhook
--                                ElevenLabs / agente interno).
--   refund_email_credit_on_bounce rimborso del credito per hard bounce
--                                (email-provider-webhook): il cliente non lo
--                                riceveva mai.
--   precheck_ai_credit           leggeva lo specchio AI, che per Demo Azienda
--                                diceva 24,73 EUR con 174,99 nel portafoglio.
--
-- Misurato il 13/09: Demo Azienda specchio AI 24,73 / email 149,99 /
-- WhatsApp 0,00 contro portafoglio 174,99; Renova e Demo 2 con lo specchio AI
-- piu' basso del portafoglio di quanto Silvio aveva scalato a vuoto.
--
-- Firme e forme di risposta invariate. I registri per servizio
-- (email_credits_log, whatsapp_credits_log) si continuano a scrivere: li
-- leggono lo storico e il grafico dei consumi. Le aziende senza portafoglio
-- lo ricevono qui (Ener Italia); alla fine gli specchi vengono riallineati.

-- ── 1. Rettifica crediti dell'admin: euro dal portafoglio ──────────────────
CREATE OR REPLACE FUNCTION public.adjust_credits_atomic(p_company_id uuid, p_service text, p_amount numeric, p_reason text, p_adjusted_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before numeric;
  v_after  numeric;
  v_amount_int int;
  v_pool   jsonb;
  v_servizio_pool text;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF p_service NOT IN ('email','ai_agents','whatsapp','render','sms') THEN
    RETURN jsonb_build_object('error', 'Servizio non valido: ' || p_service);
  END IF;

  IF p_service IN ('email', 'ai_agents', 'whatsapp') THEN
    -- Il saldo in euro e' uno solo: la rettifica va nel portafoglio, che poi
    -- rispecchia da solo sui tre borsellini. Prima toccava lo specchio del
    -- servizio scelto, e il primo consumo lo riportava al valore del portafoglio.
    v_servizio_pool := CASE p_service WHEN 'ai_agents' THEN 'ai' ELSE p_service END;
    SELECT balance_eur INTO v_before FROM public.company_credit_pool
     WHERE company_id = p_company_id FOR UPDATE;
    v_before := COALESCE(v_before, 0);

    IF p_amount > 0 THEN
      v_pool := public.pool_ricarica(p_company_id, v_servizio_pool, p_amount,
                  COALESCE(NULLIF(p_reason, ''), 'Rettifica amministratore'),
                  jsonb_build_object('source', 'admin_adjust', 'adjusted_by', p_adjusted_by, 'service', p_service));
      v_after := (v_pool->>'balance_after')::numeric;
    ELSIF p_amount < 0 THEN
      IF v_before + p_amount < 0 THEN
        RETURN jsonb_build_object(
          'error', 'Saldo insufficiente (richiesto ' || p_amount || ', saldo ' || v_before || ')'
        );
      END IF;
      v_pool := public.pool_consuma(p_company_id, v_servizio_pool, -p_amount,
                  COALESCE(NULLIF(p_reason, ''), 'Rettifica amministratore'),
                  jsonb_build_object('source', 'admin_adjust', 'adjusted_by', p_adjusted_by, 'service', p_service));
      v_after := (v_pool->>'balance_after')::numeric;
    ELSE
      v_after := v_before;
    END IF;

  ELSIF p_service = 'sms' THEN
    SELECT crediti INTO v_before FROM public.sms_wallet
     WHERE company_id = p_company_id FOR UPDATE;
    IF v_before IS NULL THEN
      IF p_amount < 0 THEN
        RETURN jsonb_build_object('error', 'Saldo SMS non inizializzato: impossibile detrarre');
      END IF;
      INSERT INTO public.sms_wallet (company_id, crediti, totale_ricaricato, ultima_ricarica_at)
      VALUES (p_company_id, p_amount, GREATEST(p_amount, 0), now())
      ON CONFLICT (company_id) DO NOTHING;
      v_before := 0;
      v_after  := p_amount;
    ELSE
      IF v_before + p_amount < 0 THEN
        RETURN jsonb_build_object(
          'error', 'Saldo SMS insufficiente (richiesto ' || p_amount || ', saldo ' || v_before || ')'
        );
      END IF;
      UPDATE public.sms_wallet
         SET crediti           = crediti + p_amount,
             totale_ricaricato = totale_ricaricato + GREATEST(p_amount, 0),
             ultima_ricarica_at = CASE WHEN p_amount > 0 THEN now() ELSE ultima_ricarica_at END,
             updated_at        = now()
       WHERE company_id = p_company_id
       RETURNING crediti INTO v_after;
    END IF;
    -- Traccia nel registro transazioni SMS (saldo_dopo + descrizione obbligatori)
    INSERT INTO public.sms_wallet_transazioni (company_id, tipo, importo, saldo_dopo, descrizione)
    VALUES (p_company_id, 'rettifica_admin', p_amount, v_after,
            COALESCE(NULLIF(p_reason, ''), 'Rettifica amministratore'));

  ELSIF p_service = 'render' THEN
    v_amount_int := floor(p_amount)::int;
    IF v_amount_int = 0 AND p_amount <> 0 THEN
      RETURN jsonb_build_object('error', 'Per render gli amount devono essere interi (N crediti)');
    END IF;

    SELECT balance INTO v_before FROM public.render_credits
     WHERE company_id = p_company_id FOR UPDATE;
    IF v_before IS NULL THEN
      IF v_amount_int < 0 THEN
        RETURN jsonb_build_object('error', 'Saldo render non inizializzato: impossibile detrarre');
      END IF;
      INSERT INTO public.render_credits (company_id, balance, total_purchased, total_used)
      VALUES (p_company_id, v_amount_int, GREATEST(v_amount_int, 0), 0)
      ON CONFLICT (company_id) DO NOTHING;
      v_before := 0;
      v_after  := v_amount_int;
    ELSE
      IF v_before + v_amount_int < 0 THEN
        RETURN jsonb_build_object(
          'error', 'Saldo render insufficiente (richiesto ' || v_amount_int || ', saldo ' || v_before || ')'
        );
      END IF;
      UPDATE public.render_credits
         SET balance         = balance + v_amount_int,
             total_purchased = total_purchased + GREATEST(v_amount_int, 0),
             total_used      = total_used + GREATEST(-v_amount_int, 0),
             updated_at      = now()
       WHERE company_id = p_company_id
       RETURNING balance INTO v_after;
    END IF;
  END IF;

  -- Log audit
  INSERT INTO public.admin_credit_adjustments (company_id, service, amount_eur, reason, created_by)
  VALUES (p_company_id, p_service, p_amount, p_reason, p_adjusted_by);

  RETURN jsonb_build_object(
    'success', true,
    'balance_before', v_before,
    'balance_after',  v_after
  );
END;
$function$;

-- ── 2. consume_credits: gli invii WhatsApp (e ogni altro consumo in euro) ──
CREATE OR REPLACE FUNCTION public.consume_credits(p_company_id uuid, p_credit_type text, p_amount numeric, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type           text;
  v_balance_before numeric;
  v_balance_after  numeric;
  v_amount_int     integer;
  v_pool           jsonb;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;
  -- ── Validazione input ──────────────────────────────────────────────────
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id è obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount deve essere > 0 (ricevuto: %)', p_amount USING ERRCODE = '22023';
  END IF;

  v_type := lower(trim(COALESCE(p_credit_type, '')));

  IF v_type NOT IN ('ai', 'email', 'whatsapp', 'render') THEN
    RAISE EXCEPTION 'credit_type "%" non supportato (valori ammessi: ai, email, whatsapp, render)',
      p_credit_type USING ERRCODE = '22023';
  END IF;

  CASE v_type

    -- ── Consumi in EURO (ai / email / whatsapp): dal portafoglio unico ────
    -- Prima ogni ramo scalava il proprio specchio: WhatsApp risultava
    -- addebitato, e il primo invio email lo riportava al saldo del portafoglio.
    WHEN 'ai', 'email', 'whatsapp' THEN
      SELECT balance_eur INTO v_balance_before
        FROM public.company_credit_pool
       WHERE company_id = p_company_id
       FOR UPDATE;

      IF v_balance_before IS NULL OR v_balance_before < p_amount THEN
        RETURN jsonb_build_object(
          'success',       false,
          'error',         'insufficient_credits',
          'credit_type',   v_type,
          'balance_before', COALESCE(v_balance_before, 0),
          'amount',        p_amount
        );
      END IF;

      v_pool := public.pool_consuma(p_company_id, v_type, p_amount, p_description, COALESCE(p_metadata, '{}'::jsonb));
      v_balance_after := (v_pool->>'balance_after')::numeric;

      IF v_type = 'email' THEN
        INSERT INTO public.email_credits_log
          (company_id, type, amount_eur, balance_before, balance_after, description, metadata)
        VALUES
          (p_company_id, 'deduct', p_amount, v_balance_before, v_balance_after, p_description, p_metadata);
      ELSIF v_type = 'whatsapp' THEN
        -- Il blocco a saldo zero resta sullo specchio WhatsApp: e' il flag che
        -- il mittente controlla prima di spedire.
        UPDATE public.whatsapp_credits
           SET sends_blocked = CASE WHEN v_balance_after <= 0 THEN true ELSE sends_blocked END,
               updated_at    = now()
         WHERE company_id = p_company_id;

        INSERT INTO public.whatsapp_credits_log
          (company_id, amount_eur, balance_before, balance_after, type, description, metadata)
        VALUES
          (p_company_id, -p_amount, v_balance_before, v_balance_after, 'deduct', p_description, p_metadata);
      END IF;

    -- ── RENDER (wallet INTEGER-based, no log table nativa) ───────────────
    WHEN 'render' THEN
      IF p_amount <> FLOOR(p_amount) THEN
        RAISE EXCEPTION 'Per credit_type=render l''amount deve essere intero (ricevuto: %)', p_amount
          USING ERRCODE = '22023';
      END IF;
      v_amount_int := p_amount::integer;

      SELECT balance INTO v_balance_before
        FROM public.render_credits
       WHERE company_id = p_company_id
       FOR UPDATE;

      IF v_balance_before IS NULL OR v_balance_before < v_amount_int THEN
        RETURN jsonb_build_object(
          'success',       false,
          'error',         'insufficient_credits',
          'credit_type',   v_type,
          'balance_before', COALESCE(v_balance_before, 0),
          'amount',        p_amount
        );
      END IF;

      UPDATE public.render_credits
         SET balance    = balance - v_amount_int,
             total_used = total_used + v_amount_int,
             updated_at = now()
       WHERE company_id = p_company_id
       RETURNING balance INTO v_balance_after;

  END CASE;

  -- ── Risposta uniforme ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'success',        true,
    'credit_type',    v_type,
    'amount',         p_amount,
    'balance_before', v_balance_before,
    'balance_after',  v_balance_after,
    'description',    p_description
  );
END;
$function$;

-- ── 3. deduct_ai_credits (voce): dal portafoglio, ammettendo il negativo ───
-- La chiamata telefonica e' gia' avvenuta quando arriva il webhook: il costo
-- va registrato anche se il saldo non basta, come faceva prima sullo specchio.
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(p_company_id uuid, p_cost numeric)
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
    FROM public.company_credit_pool
   WHERE company_id = p_company_id
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.company_credit_pool
       SET balance_eur     = round((balance_eur - p_cost)::numeric, 4),
           total_spent_eur = round((COALESCE(total_spent_eur, 0) + p_cost)::numeric, 4),
           updated_at      = now()
     WHERE company_id = p_company_id
     RETURNING balance_eur INTO v_balance_after;

    INSERT INTO public.company_credit_pool_ledger
      (company_id, service, direction, amount_eur, balance_after, description, metadata)
    VALUES (p_company_id, 'ai', 'out', p_cost, v_balance_after, 'AI — voce (chiamata)',
            jsonb_build_object('source', 'deduct_ai_credits'));

    PERFORM public.pool_rispecchia(p_company_id, v_balance_after);

    RETURN jsonb_build_object(
      'balance_before', v_balance_before,
      'balance_after', v_balance_after
    );
  END IF;

  -- Azienda senza portafoglio: comportamento storico sullo specchio AI.
  SELECT balance_eur INTO v_balance_before
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance_before IS NULL THEN
    INSERT INTO public.ai_credits (company_id, balance_eur, total_spent_eur)
    VALUES (p_company_id, -p_cost, p_cost)
    ON CONFLICT (company_id) DO UPDATE
    SET balance_eur = ai_credits.balance_eur - p_cost,
        total_spent_eur = COALESCE(ai_credits.total_spent_eur, 0) + p_cost,
        updated_at = now()
    RETURNING balance_eur INTO v_balance_after;
    v_balance_before := 0;
  ELSE
    UPDATE public.ai_credits
    SET balance_eur = balance_eur - p_cost,
        total_spent_eur = COALESCE(total_spent_eur, 0) + p_cost,
        updated_at = now()
    WHERE company_id = p_company_id
    RETURNING balance_eur INTO v_balance_after;
  END IF;

  RETURN jsonb_build_object(
    'balance_before', v_balance_before,
    'balance_after', v_balance_after
  );
END;
$function$;

-- ── 4. Rimborso per hard bounce: torna nel portafoglio ─────────────────────
CREATE OR REPLACE FUNCTION public.refund_email_credit_on_bounce(p_provider_message_id text, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deduct_row  record;
  v_already     int;
  v_balance_after numeric;
  v_pool        jsonb;
BEGIN
  IF p_provider_message_id IS NULL OR length(btrim(p_provider_message_id)) = 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'missing_message_id');
  END IF;

  -- 1. Cerca la deduzione originale per quel message_id
  SELECT company_id, amount_eur, id
    INTO v_deduct_row
    FROM public.email_credits_log
   WHERE type = 'deduct'
     AND (metadata ->> 'provider_message_id') = p_provider_message_id
   ORDER BY created_at ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'deduction_not_found');
  END IF;

  -- 2. Idempotenza: esiste già un refund per lo stesso message_id?
  SELECT count(*) INTO v_already
    FROM public.email_credits_log
   WHERE type = 'refund'
     AND (metadata ->> 'refund_of_message_id') = p_provider_message_id;

  IF v_already > 0 THEN
    RETURN jsonb_build_object('refunded', false, 'reason', 'already_refunded');
  END IF;

  -- 3. Il rimborso torna nel portafoglio (prima finiva sullo specchio email,
  --    che il consumo successivo riportava al saldo del portafoglio: il
  --    cliente non lo vedeva mai).
  v_pool := public.pool_ricarica(v_deduct_row.company_id, 'email', v_deduct_row.amount_eur,
              'Hard bounce refund: ' || COALESCE(p_reason, 'provider-reported'),
              jsonb_build_object('refund_of_message_id', p_provider_message_id, 'refund_of_log_id', v_deduct_row.id));
  v_balance_after := (v_pool->>'balance_after')::numeric;

  INSERT INTO public.email_credits_log (
    company_id, type, amount_eur, balance_before, balance_after,
    description, metadata
  )
  VALUES (
    v_deduct_row.company_id,
    'refund',
    v_deduct_row.amount_eur,
    v_balance_after - v_deduct_row.amount_eur,
    v_balance_after,
    'Hard bounce refund: ' || COALESCE(p_reason, 'provider-reported'),
    jsonb_build_object(
      'refund_of_message_id', p_provider_message_id,
      'refund_of_log_id',     v_deduct_row.id,
      'bounce_reason',        p_reason
    )
  );

  RETURN jsonb_build_object(
    'refunded',     true,
    'company_id',   v_deduct_row.company_id,
    'amount_eur',   v_deduct_row.amount_eur,
    'balance_after', v_balance_after
  );
END;
$function$;

-- ── 5. precheck_ai_credit: il saldo pagato e' quello del portafoglio ───────
CREATE OR REPLACE FUNCTION public.precheck_ai_credit(
  p_company_id uuid,
  p_estimated_cost_eur numeric DEFAULT 0.10,
  p_tier_key text DEFAULT NULL::text,
  p_tokens_in integer DEFAULT NULL::integer,
  p_tokens_out integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_credits record;
  v_pricing jsonb;
  v_est     numeric;
  v_free    numeric;
  v_paid    numeric;
  v_avail   numeric;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant (reader)
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_cost_eur < 0 THEN
    RAISE EXCEPTION 'estimated_cost_eur non può essere negativo' USING ERRCODE = '22023';
  END IF;

  -- Omaggio del mese: si rinnova qui. Ritorna quanto ne resta (crea la riga
  -- ai_credits se manca).
  v_free := COALESCE(public.ensure_monthly_free_ai_credits(p_company_id), 0);

  -- ── Stima: dai token quando disponibili, altrimenti la costante ────────
  v_est := p_estimated_cost_eur;
  IF p_tier_key IS NOT NULL
     AND (COALESCE(p_tokens_in, 0) + COALESCE(p_tokens_out, 0)) > 0 THEN
    v_pricing := public.get_ai_pricing(p_company_id, p_tier_key);
    IF v_pricing ? 'retail_per_1m_input_eur' THEN
      v_est := (COALESCE(p_tokens_in, 0)::numeric  / 1000000.0)
                 * (v_pricing->>'retail_per_1m_input_eur')::numeric
             + (COALESCE(p_tokens_out, 0)::numeric / 1000000.0)
                 * (v_pricing->>'retail_per_1m_output_eur')::numeric;
      v_est := GREATEST(v_est, 0.001);
    END IF;
  END IF;

  SELECT balance_eur, calls_blocked, blocked_reason,
         soft_cap_eur_monthly, hard_cap_eur_monthly,
         mtd_spent_eur, mtd_period_start
    INTO v_credits
    FROM public.ai_credits
   WHERE company_id = p_company_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wallet_missing',
      'message', 'Wallet AI non inizializzato per questa azienda');
  END IF;

  IF v_credits.calls_blocked THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_credits.blocked_reason, 'blocked'),
      'message', 'Chiamate AI bloccate');
  END IF;

  -- Il saldo pagato e' quello del portafoglio unico; lo specchio AI serve
  -- solo se l'azienda un portafoglio non lo ha.
  SELECT balance_eur INTO v_paid FROM public.company_credit_pool WHERE company_id = p_company_id;
  v_paid  := COALESCE(v_paid, v_credits.balance_eur, 0);
  v_avail := v_paid + v_free;

  IF v_avail < (v_est * 1.5) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_balance',
      'message', format('Saldo €%s insufficiente per stima €%s',
                        round(v_avail, 2), round(v_est, 4)),
      'balance_eur', v_avail,
      'paid_balance_eur', v_paid,
      'free_balance_eur', v_free,
      'estimated_cost_eur', v_est);
  END IF;

  IF v_credits.hard_cap_eur_monthly IS NOT NULL
     AND COALESCE(v_credits.mtd_spent_eur, 0) + v_est > v_credits.hard_cap_eur_monthly THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hard_cap_exceeded',
      'message', format('Hard cap mensile €%s superato (MTD: €%s)',
                       round(v_credits.hard_cap_eur_monthly, 2), round(COALESCE(v_credits.mtd_spent_eur, 0), 4)),
      'hard_cap_eur_monthly', v_credits.hard_cap_eur_monthly, 'mtd_spent_eur', v_credits.mtd_spent_eur);
  END IF;

  RETURN jsonb_build_object('ok', true,
    'balance_eur', v_avail,
    'paid_balance_eur', v_paid,
    'free_balance_eur', v_free,
    'mtd_spent_eur', v_credits.mtd_spent_eur,
    'estimated_cost_eur', v_est,
    'soft_cap_eur_monthly', v_credits.soft_cap_eur_monthly,
    'soft_cap_pct_used', CASE
      WHEN v_credits.soft_cap_eur_monthly > 0
      THEN round((COALESCE(v_credits.mtd_spent_eur, 0) / v_credits.soft_cap_eur_monthly * 100.0)::numeric, 2)
      ELSE 0 END,
    'soft_cap_warning', v_credits.soft_cap_eur_monthly > 0
      AND COALESCE(v_credits.mtd_spent_eur, 0) >= v_credits.soft_cap_eur_monthly * 0.80);
END;
$function$;

-- ── 6. Ogni azienda ha il suo portafoglio, e gli specchi tornano uguali ────
INSERT INTO public.company_credit_pool (company_id, balance_eur)
SELECT c.id, 0
  FROM public.companies c
 WHERE NOT EXISTS (SELECT 1 FROM public.company_credit_pool p WHERE p.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;

DO $$
DECLARE r record;
BEGIN
  -- Riallinea i tre specchi al portafoglio: e' cio' che pool_rispecchia fa a
  -- ogni movimento, applicato una volta a tutti. Demo Azienda aveva lo
  -- specchio AI a 24,73 e quello WhatsApp a 0 con 174,99 nel portafoglio.
  FOR r IN SELECT company_id, balance_eur FROM public.company_credit_pool LOOP
    PERFORM public.pool_rispecchia(r.company_id, r.balance_eur);
  END LOOP;
END $$;

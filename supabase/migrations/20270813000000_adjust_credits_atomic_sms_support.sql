-- Aggiunge il tipo 'rettifica_admin' alle transazioni SMS (aggiustamento
-- manuale di un super_admin, distinto da ricarica Stripe / addebiti d'uso).
ALTER TABLE public.sms_wallet_transazioni
  DROP CONSTRAINT IF EXISTS sms_wallet_transazioni_tipo_check;
ALTER TABLE public.sms_wallet_transazioni
  ADD CONSTRAINT sms_wallet_transazioni_tipo_check
  CHECK (tipo = ANY (ARRAY['ricarica','addebito_sms','addebito_numero','rimborso','bonus','rettifica_admin']));

-- Estende adjust_credits_atomic per gestire service='sms' sul wallet
-- sms_wallet (colonna `crediti`, EUR) + traccia in sms_wallet_transazioni.
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
BEGIN
  IF p_service NOT IN ('email','ai_agents','whatsapp','render','sms') THEN
    RETURN jsonb_build_object('error', 'Servizio non valido: ' || p_service);
  END IF;

  IF p_service = 'email' THEN
    SELECT balance_eur INTO v_before FROM public.email_credits
     WHERE company_id = p_company_id FOR UPDATE;
    IF v_before IS NULL THEN
      INSERT INTO public.email_credits (company_id, balance_eur)
      VALUES (p_company_id, GREATEST(p_amount, 0))
      ON CONFLICT (company_id) DO NOTHING;
      v_before := 0;
      v_after  := GREATEST(p_amount, 0);
    ELSE
      UPDATE public.email_credits
         SET balance_eur = balance_eur + p_amount, updated_at = now()
       WHERE company_id = p_company_id
       RETURNING balance_eur INTO v_after;
    END IF;

  ELSIF p_service = 'ai_agents' THEN
    SELECT balance_eur INTO v_before FROM public.ai_credits
     WHERE company_id = p_company_id FOR UPDATE;
    IF v_before IS NULL THEN
      INSERT INTO public.ai_credits (company_id, balance_eur)
      VALUES (p_company_id, GREATEST(p_amount, 0))
      ON CONFLICT (company_id) DO NOTHING;
      v_before := 0;
      v_after  := GREATEST(p_amount, 0);
    ELSE
      UPDATE public.ai_credits
         SET balance_eur = balance_eur + p_amount, updated_at = now()
       WHERE company_id = p_company_id
       RETURNING balance_eur INTO v_after;
    END IF;

  ELSIF p_service = 'whatsapp' THEN
    SELECT balance_eur INTO v_before FROM public.whatsapp_credits
     WHERE company_id = p_company_id FOR UPDATE;
    IF v_before IS NULL THEN
      INSERT INTO public.whatsapp_credits (company_id, balance_eur)
      VALUES (p_company_id, GREATEST(p_amount, 0))
      ON CONFLICT (company_id) DO NOTHING;
      v_before := 0;
      v_after  := GREATEST(p_amount, 0);
    ELSE
      UPDATE public.whatsapp_credits
         SET balance_eur = balance_eur + p_amount, updated_at = now()
       WHERE company_id = p_company_id
       RETURNING balance_eur INTO v_after;
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
         SET crediti = crediti + p_amount,
             totale_ricaricato = totale_ricaricato + GREATEST(p_amount, 0),
             ultima_ricarica_at = CASE WHEN p_amount > 0 THEN now() ELSE ultima_ricarica_at END,
             updated_at = now()
       WHERE company_id = p_company_id
       RETURNING crediti INTO v_after;
    END IF;
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
         SET balance = balance + v_amount_int,
             total_purchased = total_purchased + GREATEST(v_amount_int, 0),
             total_used = total_used + GREATEST(-v_amount_int, 0),
             updated_at = now()
       WHERE company_id = p_company_id
       RETURNING balance INTO v_after;
    END IF;
  END IF;

  INSERT INTO public.admin_credit_adjustments (company_id, service, amount_eur, reason, created_by)
  VALUES (p_company_id, p_service, p_amount, p_reason, p_adjusted_by);

  RETURN jsonb_build_object('success', true, 'balance_before', v_before, 'balance_after', v_after);
END;
$function$;

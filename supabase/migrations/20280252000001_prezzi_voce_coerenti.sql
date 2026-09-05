-- Check dei prezzi del centralino AI: cosa il superadmin imposta e cosa il
-- codice legge non combaciavano in tre punti.

-- 1) Il prezzo al minuto si legge da platform_pricing per (llm, tts). Gli
--    agenti creati dalla UI parlano con eleven_flash_v2_5 (lo imposta il proxy),
--    ma in tabella NON esisteva nessuna riga per quel TTS: la fatturazione
--    ripiegava su 0,04/0,02 hardcodati e le tariffe del superadmin restavano
--    lettera morta. Si crea la riga "in uso" per ogni LLM gia' prezzato,
--    copiando costo e markup della riga Turbo (stessa fascia di prezzo EL).
INSERT INTO public.platform_pricing (llm_model, tts_model, label, cost_real_per_min, markup_multiplier, cost_billed_per_min, is_active)
SELECT p.llm_model, 'eleven_flash_v2_5',
       coalesce(nullif(split_part(p.label, ' + ', 1), ''), p.llm_model) || ' + Flash v2.5 (in uso)',
       p.cost_real_per_min, p.markup_multiplier, p.cost_billed_per_min, true
FROM public.platform_pricing p
WHERE p.tts_model = 'eleven_turbo_v2_5'
ON CONFLICT (llm_model, tts_model) DO NOTHING;

-- 2) I pacchetti (feature_bundles) template erano tutti doppi: seed girato due
--    volte. Si tiene il piu' vecchio per nome e si mette il vincolo.
DELETE FROM public.feature_bundles b
USING public.feature_bundles piu_vecchio
WHERE b.is_template AND piu_vecchio.is_template
  AND b.company_id IS NULL AND piu_vecchio.company_id IS NULL
  AND b.name = piu_vecchio.name
  AND (b.created_at > piu_vecchio.created_at OR (b.created_at = piu_vecchio.created_at AND b.id > piu_vecchio.id));

CREATE UNIQUE INDEX IF NOT EXISTS feature_bundles_template_nome_unico
  ON public.feature_bundles (name) WHERE is_template AND company_id IS NULL;

-- 3) Wallet SMS: telnyx-invia-sms chiama update_sms_wallet_dopo_invio, che NON
--    esisteva; supabase-js non lancia sull'errore RPC, quindi nemmeno il
--    fallback scattava. Le campagne SMS non venivano MAI addebitate.
CREATE OR REPLACE FUNCTION public.update_sms_wallet_dopo_invio(
  p_company_id uuid, p_costo_reale numeric, p_riservato_da_liberare numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.sms_wallet
  SET crediti = crediti - coalesce(p_costo_reale, 0),
      crediti_riservati = greatest(0, crediti_riservati - coalesce(p_riservato_da_liberare, 0)),
      totale_speso = coalesce(totale_speso, 0) + coalesce(p_costo_reale, 0),
      updated_at = now()
  WHERE company_id = p_company_id;
END $$;
REVOKE ALL ON FUNCTION public.update_sms_wallet_dopo_invio(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;

-- 4) Addebito atomico sul wallet SMS (canone numero: acquisto e rinnovo).
--    Rifiuta se il saldo non basta, e scrive la transazione nello stesso giro.
CREATE OR REPLACE FUNCTION public.addebita_sms_wallet(
  p_company_id uuid, p_importo numeric, p_tipo text, p_descrizione text, p_riferimento_id uuid DEFAULT NULL
) RETURNS TABLE(ok boolean, saldo_dopo numeric, motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_saldo numeric;
BEGIN
  SELECT crediti INTO v_saldo FROM public.sms_wallet WHERE company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::numeric, 'wallet inesistente'; RETURN;
  END IF;
  IF v_saldo < p_importo THEN
    RETURN QUERY SELECT false, v_saldo, 'credito insufficiente'; RETURN;
  END IF;
  UPDATE public.sms_wallet
  SET crediti = crediti - p_importo, totale_speso = coalesce(totale_speso, 0) + p_importo, updated_at = now()
  WHERE company_id = p_company_id;
  INSERT INTO public.sms_wallet_transazioni (company_id, tipo, importo, saldo_dopo, descrizione, riferimento_id)
  VALUES (p_company_id, p_tipo, -p_importo, v_saldo - p_importo, p_descrizione, p_riferimento_id);
  RETURN QUERY SELECT true, v_saldo - p_importo, NULL::text;
END $$;
REVOKE ALL ON FUNCTION public.addebita_sms_wallet(uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- 5) Rinnovo mensile dei numeri: prossimo_rinnovo veniva scritto all'acquisto
--    e mai piu' letto da nessuno. Cron giornaliero alle 05:10 UTC.
DO $$
DECLARE v bigint;
BEGIN
  SELECT jobid INTO v FROM cron.job WHERE jobname = 'sms-rinnovo-numeri-daily';
  IF v IS NOT NULL THEN PERFORM cron.unschedule(v); END IF;
  PERFORM cron.schedule('sms-rinnovo-numeri-daily', '10 5 * * *', $cmd$
    SELECT net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/sms-rinnovo-numeri',
      headers := jsonb_build_object('Content-Type','application/json',
        'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='silvio_internal_cron_secret' LIMIT 1)),
      body := '{}'::jsonb, timeout_milliseconds := 120000);
  $cmd$);
END $$;
INSERT INTO public.ops_cron_visti (jobid, jobname)
SELECT jobid, jobname FROM cron.job WHERE jobname = 'sms-rinnovo-numeri-daily'
ON CONFLICT (jobid) DO NOTHING;

NOTIFY pgrst, 'reload schema';

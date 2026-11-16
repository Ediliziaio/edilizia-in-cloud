-- Decisioni commerciali sull'AI approvate dal titolare il 16/11/2026
-- (docs/ai-addebiti-censimento.md §9, docs/piano-punti-aperti-20261116.md §6).
--
-- Questa migrazione cambia il COME, non i prezzi:
--
-- 1. Ricarico per compito. Nasce `ai_ricarico_compito`: un moltiplicatore sul costo
--    vero per compito, con lo stesso minimo di 3× per tutte le strade
--    (`charge_ai_call` e `deduct_ai_credits_with_markup`, quindi anche
--    `addebita_ai_diretta`). Qui la tabella nasce SENZA moltiplicatori: finché non
--    c'è la riga del compito (o la riga `default`), valgono le regole di prima.
--    I prezzi cambiano con la migrazione successiva, che riempie la tabella dopo
--    l'anteprima (`ai_ricarico_anteprima`).
-- 2. Errore nostro dopo che il provider ha lavorato: `ai_rimborsa_addebito` storna
--    l'addebito con una riga di rimborso nel registro (status `refunded` nel
--    router, `error_code = 'rimborso'` nella diretta). La riga originale resta.
-- 3. Chiamata fatta a credito finito: l'importo diventa un debito (`ai_debiti`) e
--    si scala alla ricarica successiva, compreso l'omaggio mensile (trigger
--    differito su `ai_credits`). L'azienda lo vede in Crediti.
-- 4. Embedding: non si addebitano più (modello `*embed*` o riga `regalato`).
--    Restano registrati col costo vero come costo della piattaforma.
--
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ───────────────────────── 1. Tabella dei ricarichi ─────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_ricarico_compito (
  compito        text PRIMARY KEY,
  moltiplicatore numeric(8,2),
  regalato       boolean NOT NULL DEFAULT false,
  origine        text,
  note           text,
  aggiornato_il  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_ricarico_compito_minimo CHECK (regalato OR moltiplicatore >= 3)
);

COMMENT ON TABLE public.ai_ricarico_compito IS
  'Ricarico AI per compito (16/11/2026): prezzo = costo vero × moltiplicatore, mai sotto 3×. '
  'Riga «default» per i compiti senza riga. «regalato» = costo della piattaforma, non addebitato.';

ALTER TABLE public.ai_ricarico_compito ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_ricarico_compito FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_ricarico_compito TO authenticated;
GRANT ALL ON public.ai_ricarico_compito TO service_role;
DROP POLICY IF EXISTS ai_ricarico_compito_super_admin ON public.ai_ricarico_compito;
CREATE POLICY ai_ricarico_compito_super_admin ON public.ai_ricarico_compito
  FOR ALL TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role));

-- Gli embedding fatti per un'azienda: regalati (decisione 6). La regola sul
-- modello copre anche quelli che nasceranno; le righe lo dicono per nome.
INSERT INTO public.ai_ricarico_compito (compito, regalato, origine, note) VALUES
  ('email_embedding',              true, 'decisione 16/11', 'embedding'),
  ('email_silvio_embedding',       true, 'decisione 16/11', 'embedding'),
  ('semantic_search_embedding',    true, 'decisione 16/11', 'embedding'),
  ('silvio_rag_embedding',         true, 'decisione 16/11', 'embedding'),
  ('computo_match_embedding',      true, 'decisione 16/11', 'embedding'),
  ('preventivo_storico_embedding', true, 'decisione 16/11', 'embedding'),
  ('preventivo_listino_embedding', true, 'decisione 16/11', 'embedding'),
  ('memory_summary_embedding',     true, 'decisione 16/11', 'embedding'),
  ('search_brain_embedding',       true, 'decisione 16/11', 'embedding'),
  ('brain_ingest_embedding',       true, 'decisione 16/11', 'embedding'),
  ('embedding_catalog',            true, 'decisione 16/11', 'embedding'),
  ('embedding_kb',                 true, 'decisione 16/11', 'embedding'),
  ('embedding_test',               true, 'decisione 16/11', 'embedding')
ON CONFLICT (compito) DO NOTHING;

-- La regola per un compito. NULL = nessuna riga: valgono le regole di prima.
CREATE OR REPLACE FUNCTION public.ai_ricarico_per(p_compito text, p_modello text)
RETURNS TABLE(moltiplicatore numeric, regalato boolean, regola text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF COALESCE(p_modello, '') ILIKE '%embed%' THEN
    RETURN QUERY SELECT NULL::numeric, true, 'embedding: costo della piattaforma'::text;
    RETURN;
  END IF;
  SELECT * INTO r FROM public.ai_ricarico_compito c WHERE c.compito = p_compito;
  IF FOUND THEN
    IF r.regalato THEN
      RETURN QUERY SELECT NULL::numeric, true,
        ('regalato: ' || COALESCE(r.note, 'compito'))::text;
    ELSE
      RETURN QUERY SELECT GREATEST(r.moltiplicatore, 3.0), false, 'compito'::text;
    END IF;
    RETURN;
  END IF;
  SELECT * INTO r FROM public.ai_ricarico_compito c WHERE c.compito = 'default';
  IF FOUND AND NOT r.regalato THEN
    RETURN QUERY SELECT GREATEST(r.moltiplicatore, 3.0), false, 'default'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT NULL::numeric, false, NULL::text;
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_ricarico_per(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_ricarico_per(text, text) TO service_role;

-- ───────────────────────── 3. Debito AI ─────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_debiti (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  origine        text NOT NULL CHECK (origine IN ('router', 'diretta')),
  riferimento_id uuid NOT NULL,
  compito        text,
  importo_eur    numeric(14,6) NOT NULL CHECK (importo_eur > 0),
  residuo_eur    numeric(14,6) NOT NULL CHECK (residuo_eur >= 0),
  saldato_eur    numeric(14,6) NOT NULL DEFAULT 0,
  annullato_eur  numeric(14,6) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  chiuso_il      timestamptz,
  UNIQUE (origine, riferimento_id)
);
CREATE INDEX IF NOT EXISTS ai_debiti_aperti_idx ON public.ai_debiti (company_id, created_at) WHERE residuo_eur > 0;

COMMENT ON TABLE public.ai_debiti IS
  'Chiamate AI fatte a credito finito (16/11/2026): si scalano alla ricarica successiva, omaggio mensile compreso.';

ALTER TABLE public.ai_debiti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_debiti FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_debiti TO authenticated;
GRANT ALL ON public.ai_debiti TO service_role;
DROP POLICY IF EXISTS ai_debiti_azienda_legge ON public.ai_debiti;
CREATE POLICY ai_debiti_azienda_legge ON public.ai_debiti
  FOR SELECT TO authenticated
  USING (
    (company_id = public.get_my_company_id() AND NOT public.utente_e_cliente_esterno())
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );

-- Scala i debiti aperti con quello che c'è: prima l'omaggio del mese, poi il
-- portafoglio. Un debito si può saldare a pezzi.
CREATE OR REPLACE FUNCTION public.ai_debito_salda(p_company_id uuid)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  d          record;
  v_free     numeric;
  v_period   date;
  v_bal      numeric;
  v_pool     boolean;
  v_da_free  numeric;
  v_da_paid  numeric;
  v_paga     numeric;
  v_tot      numeric := 0;
BEGIN
  SELECT free_balance_eur, free_period_start, balance_eur
    INTO v_free, v_period, v_bal
    FROM public.ai_credits WHERE company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- L'omaggio vale solo nel suo mese.
  IF v_period IS DISTINCT FROM date_trunc('month', now())::date THEN v_free := 0; END IF;
  v_free := COALESCE(v_free, 0);

  v_pool := EXISTS (SELECT 1 FROM public.company_credit_pool WHERE company_id = p_company_id);
  IF v_pool THEN
    SELECT balance_eur INTO v_bal FROM public.company_credit_pool
     WHERE company_id = p_company_id FOR UPDATE;
  END IF;
  v_bal := COALESCE(v_bal, 0);

  FOR d IN
    SELECT * FROM public.ai_debiti
     WHERE company_id = p_company_id AND residuo_eur > 0
     ORDER BY created_at
     FOR UPDATE
  LOOP
    v_da_free := LEAST(v_free, d.residuo_eur);
    v_da_paid := LEAST(v_bal, d.residuo_eur - v_da_free);
    -- Il portafoglio lavora a 4 decimali.
    v_da_paid := floor(v_da_paid * 10000) / 10000;
    v_paga := v_da_free + v_da_paid;
    EXIT WHEN v_paga <= 0;

    IF v_da_free > 0 THEN
      UPDATE public.ai_credits
         SET free_balance_eur = free_balance_eur - v_da_free, updated_at = now()
       WHERE company_id = p_company_id;
    END IF;
    IF v_da_paid > 0 THEN
      IF v_pool THEN
        PERFORM public.pool_consuma(p_company_id, 'ai', v_da_paid,
          format('AI — debito saldato (%s)', COALESCE(d.compito, 'AI')),
          jsonb_build_object('debito_id', d.id, 'compito', d.compito));
      ELSE
        UPDATE public.ai_credits
           SET balance_eur = balance_eur - v_da_paid, updated_at = now()
         WHERE company_id = p_company_id;
      END IF;
    END IF;

    INSERT INTO public.ai_credit_transactions (
      company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
    ) VALUES (
      p_company_id, 'consumo_ai', v_paga, v_free + v_bal, v_free + v_bal - v_paga,
      format('AI — debito saldato: %s', COALESCE(d.compito, 'chiamata a credito finito')),
      jsonb_build_object('source', 'ai_debito', 'debito_id', d.id, 'compito', d.compito,
                         'da_omaggio', v_da_free, 'da_portafoglio', v_da_paid)
    );

    v_free := v_free - v_da_free;
    v_bal  := v_bal - v_da_paid;
    v_tot  := v_tot + v_paga;

    UPDATE public.ai_debiti
       SET residuo_eur = residuo_eur - v_paga,
           saldato_eur = saldato_eur + v_paga,
           chiuso_il   = CASE WHEN residuo_eur - v_paga <= 0 THEN now() END
     WHERE id = d.id;
  END LOOP;

  RETURN v_tot;
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_debito_salda(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_debito_salda(uuid) TO service_role;

-- Il trigger scatta quando il saldo o l'omaggio CRESCONO (ricarica, omaggio del
-- mese, rimborso) ed è differito alla fine della transazione: la ricarica finisce
-- il suo lavoro, poi si saldano i debiti. Non fa mai fallire la ricarica.
CREATE OR REPLACE FUNCTION public.tg_ai_debito_salda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_debiti WHERE company_id = NEW.company_id AND residuo_eur > 0) THEN
    BEGIN
      PERFORM public.ai_debito_salda(NEW.company_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ai_debito_salda(%) fallita: % %', NEW.company_id, SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.tg_ai_debito_salda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ai_credits_salda_debito ON public.ai_credits;
CREATE CONSTRAINT TRIGGER ai_credits_salda_debito
  AFTER UPDATE ON public.ai_credits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.balance_eur > OLD.balance_eur OR NEW.free_balance_eur > OLD.free_balance_eur)
  EXECUTE FUNCTION public.tg_ai_debito_salda();

-- ───────────────────────── Router: charge_ai_call ─────────────────────────

-- Righe di rimborso: importo negativo, solo con status 'refunded'.
ALTER TABLE public.ai_call_ledger DROP CONSTRAINT IF EXISTS ai_call_ledger_cost_billed_eur_check;
ALTER TABLE public.ai_call_ledger ADD CONSTRAINT ai_call_ledger_cost_billed_eur_check
  CHECK (cost_billed_eur >= 0 OR status = 'refunded');

CREATE OR REPLACE FUNCTION public.charge_ai_call(p_idempotency_key text, p_company_id uuid, p_user_id uuid, p_task_key text, p_tier_key text, p_model_used text, p_used_primary boolean, p_fallback_index integer, p_persona_key text, p_tokens_in integer, p_tokens_out integer, p_cost_real_usd numeric, p_fx_usd_to_eur numeric, p_status text DEFAULT 'success'::text, p_error_message text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pricing       jsonb;
  v_cost_real_eur numeric;
  v_cost_billed_eur numeric;
  v_balance_after numeric;
  v_existing_id   uuid;
  v_ledger_id     uuid;
  v_markup_pct    numeric;
  v_override_id   uuid;
  v_period_start  date;
  v_tokens_total  int;
  v_min_mult      numeric;
  v_free          numeric := 0;
  v_from_free     numeric := 0;
  v_from_paid     numeric := 0;
  v_debito        numeric := 0;
  v_saldo         numeric := 0;
  v_ha_pool       boolean;
  v_pool          jsonb;
  v_regola        record;
  v_regola_nome   text;
  v_status        text := p_status;
  v_regalato      boolean := false;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key obbligatoria (min 8 char)' USING ERRCODE = '22023';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('success', 'error', 'timeout') THEN
    RAISE EXCEPTION 'status non valido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_cost_real_usd < 0 THEN
    RAISE EXCEPTION 'cost_real_usd non può essere negativo' USING ERRCODE = '22023';
  END IF;
  IF p_fx_usd_to_eur <= 0 THEN
    p_fx_usd_to_eur := 0.92;
  END IF;

  SELECT id INTO v_existing_id
    FROM public.ai_call_ledger
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'ledger_id', v_existing_id,
      'message', 'Chiamata già registrata (idempotency_key)'
    );
  END IF;

  v_cost_real_eur := round((p_cost_real_usd * p_fx_usd_to_eur)::numeric, 8);
  v_tokens_total := COALESCE(p_tokens_in, 0) + COALESCE(p_tokens_out, 0);

  IF p_status IN ('error', 'timeout') THEN
    v_cost_billed_eur := 0;
    v_markup_pct := 0;
    v_override_id := NULL;
  ELSE
    SELECT * INTO v_regola FROM public.ai_ricarico_per(p_task_key, p_model_used);
    v_pricing := public.get_ai_pricing(p_company_id, p_tier_key);
    v_override_id := NULLIF(v_pricing->>'override_id', '')::uuid;

    IF v_regola.regalato THEN
      -- Costo della piattaforma (embedding): registrato col costo vero, non addebitato.
      v_cost_billed_eur := 0;
      v_markup_pct := 0;
      v_regalato := true;
      v_status := 'skipped';
      v_regola_nome := v_regola.regola;
    ELSIF v_override_id IS NULL AND v_regola.moltiplicatore IS NOT NULL AND v_cost_real_eur > 0 THEN
      -- Ricarico per compito (16/11/2026): costo vero × moltiplicatore, minimo 3×.
      v_cost_billed_eur := round((v_cost_real_eur * v_regola.moltiplicatore)::numeric, 8);
      v_markup_pct := round((v_regola.moltiplicatore - 1) * 100, 2);
      v_regola_nome := v_regola.regola;
    ELSE
      v_markup_pct := (v_pricing->>'applied_markup_pct')::numeric;
      v_regola_nome := CASE WHEN v_override_id IS NOT NULL THEN 'override' ELSE 'tier' END;

      IF v_tokens_total = 0 AND v_cost_real_eur > 0 THEN
        v_cost_billed_eur := round((v_cost_real_eur * (1 + (v_markup_pct / 100.0)))::numeric, 8);
      ELSE
        v_cost_billed_eur := round((
          (COALESCE(p_tokens_in, 0)::numeric  / 1000000.0) * (v_pricing->>'retail_per_1m_input_eur')::numeric +
          (COALESCE(p_tokens_out, 0)::numeric / 1000000.0) * (v_pricing->>'retail_per_1m_output_eur')::numeric
        )::numeric, 8);
      END IF;

      -- Pavimento sul costo REALE (dal 01/08/2026), mai sotto 3× (16/11/2026).
      v_min_mult := GREATEST(COALESCE((v_pricing->>'min_markup_multiplier')::numeric, 3.0), 3.0);
      IF v_cost_real_eur > 0 THEN
        v_cost_billed_eur := GREATEST(
          v_cost_billed_eur,
          round((v_cost_real_eur * v_min_mult)::numeric, 8)
        );
      END IF;
    END IF;
  END IF;

  PERFORM 1 FROM public.ai_credits WHERE company_id = p_company_id FOR UPDATE;

  v_period_start := date_trunc('month', now())::date;
  UPDATE public.ai_credits
     SET mtd_spent_eur = 0,
         mtd_period_start = v_period_start,
         soft_cap_warning_sent_at = NULL
   WHERE company_id = p_company_id
     AND mtd_period_start < v_period_start;

  IF v_cost_billed_eur > 0 THEN
    -- Prima l'omaggio del mese (scade a fine mese), poi il portafoglio (non scade).
    v_free      := COALESCE(public.ensure_monthly_free_ai_credits(p_company_id), 0);

    v_ha_pool := EXISTS (SELECT 1 FROM public.company_credit_pool WHERE company_id = p_company_id);
    IF v_ha_pool THEN
      SELECT balance_eur INTO v_saldo FROM public.company_credit_pool
       WHERE company_id = p_company_id FOR UPDATE;
    ELSE
      SELECT balance_eur INTO v_saldo FROM public.ai_credits WHERE company_id = p_company_id;
    END IF;
    v_saldo := COALESCE(v_saldo, 0);

    IF v_free + v_saldo < v_cost_billed_eur THEN
      -- Credito finito (16/11/2026): il provider ha già lavorato. L'importo intero
      -- diventa un debito e si scala alla ricarica successiva (ai_debiti).
      v_debito := v_cost_billed_eur;
      v_from_free := 0;
      v_from_paid := 0;
    ELSE
      v_from_free := LEAST(v_free, v_cost_billed_eur);
      v_from_paid := v_cost_billed_eur - v_from_free;
    END IF;

    UPDATE public.ai_credits
       SET free_balance_eur = COALESCE(free_balance_eur, 0) - v_from_free,
           total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed_eur,
           mtd_spent_eur    = COALESCE(mtd_spent_eur, 0) + v_cost_billed_eur,
           updated_at       = now()
     WHERE company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Wallet AI non trovato per company %', p_company_id USING ERRCODE = 'P0002';
    END IF;

    IF v_from_paid > 0 THEN
      IF v_ha_pool THEN
        v_pool := public.pool_consuma(
          p_company_id, 'ai', v_from_paid,
          format('AI — %s', p_task_key),
          jsonb_build_object(
            'model', p_model_used, 'task_key', p_task_key,
            'persona_key', p_persona_key, 'idempotency_key', p_idempotency_key
          )
        );
        v_balance_after := COALESCE((v_pool->>'balance_after')::numeric, 0);
      ELSE
        UPDATE public.ai_credits
           SET balance_eur = balance_eur - v_from_paid,
               updated_at  = now()
         WHERE company_id = p_company_id
         RETURNING balance_eur INTO v_balance_after;

        IF v_balance_after < 0 THEN
          RAISE EXCEPTION 'Saldo insufficiente: post-charge sarebbe €%', v_balance_after USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSE
      v_balance_after := v_saldo;
    END IF;

    -- Il saldo restituito e' quanto resta da spendere: ricarica + omaggio residuo.
    v_balance_after := COALESCE(v_balance_after, 0) + (v_free - v_from_free);

    UPDATE public.ai_credits
       SET calls_blocked = true,
           blocked_at = now(),
           blocked_reason = 'hard_cap_exceeded'
     WHERE company_id = p_company_id
       AND hard_cap_eur_monthly IS NOT NULL
       AND mtd_spent_eur >= hard_cap_eur_monthly
       AND calls_blocked = false;
  END IF;

  INSERT INTO public.ai_call_ledger (
    idempotency_key, company_id, user_id,
    task_key, tier_key, model_used, used_primary, fallback_index, persona_key,
    tokens_in, tokens_out,
    cost_real_usd, cost_real_eur, cost_billed_eur, fx_usd_to_eur,
    applied_markup_pct, pricing_override_id,
    status, error_message, duration_ms, metadata
  ) VALUES (
    p_idempotency_key, p_company_id, p_user_id,
    p_task_key, p_tier_key, p_model_used, p_used_primary, p_fallback_index, p_persona_key,
    COALESCE(p_tokens_in, 0), COALESCE(p_tokens_out, 0),
    p_cost_real_usd, v_cost_real_eur, v_cost_billed_eur, p_fx_usd_to_eur,
    v_markup_pct, v_override_id,
    v_status, p_error_message, p_duration_ms,
    COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object('da_omaggio', v_from_free, 'da_portafoglio', v_from_paid,
                            'da_debito', v_debito, 'regola_ricarico', v_regola_nome)
      || CASE WHEN v_regalato
              THEN jsonb_build_object('interno', true, 'motivo', v_regola_nome)
              ELSE '{}'::jsonb END
  )
  RETURNING id INTO v_ledger_id;

  IF v_debito > 0 THEN
    INSERT INTO public.ai_debiti (company_id, origine, riferimento_id, compito, importo_eur, residuo_eur)
    VALUES (p_company_id, 'router', v_ledger_id, p_task_key, v_debito, v_debito)
    ON CONFLICT (origine, riferimento_id) DO NOTHING;
  END IF;

  -- La riga per lo storico del cliente: solo quello che è uscito davvero.
  IF v_from_free + v_from_paid > 0 THEN
    INSERT INTO public.ai_credit_transactions (
      company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
    ) VALUES (
      p_company_id, 'consumo_ai', v_from_free + v_from_paid,
      COALESCE(v_balance_after, 0) + v_from_free + v_from_paid, COALESCE(v_balance_after, 0),
      format('AI — %s [%s]',
             CASE WHEN p_persona_key = 'silvio' THEN 'Silvio'
                  ELSE COALESCE(NULLIF(p_persona_key, ''), p_task_key) END,
             split_part(p_model_used, '/', 2)),
      jsonb_build_object(
        'source', 'ai_router',
        'task_key', p_task_key,
        'model_used', p_model_used,
        'persona_key', p_persona_key,
        'tokens_total', v_tokens_total,
        'da_omaggio', v_from_free,
        'da_portafoglio', v_from_paid,
        'ledger_id', v_ledger_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'ledger_id', v_ledger_id,
    'cost_real_eur', v_cost_real_eur,
    'cost_billed_eur', v_cost_billed_eur,
    'margin_eur', v_cost_billed_eur - v_cost_real_eur,
    'balance_after', v_balance_after,
    'da_omaggio', v_from_free,
    'da_portafoglio', v_from_paid,
    'debito_eur', v_debito,
    'regalato', v_regalato,
    'regola_ricarico', v_regola_nome,
    'applied_markup_pct', v_markup_pct,
    'tokenless_billing_applied', (v_tokens_total = 0 AND v_cost_real_eur > 0 AND p_status = 'success')
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_id FROM public.ai_call_ledger WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'ledger_id', v_existing_id,
      'message', 'Concurrent insert prevented duplicate'
    );
END;
$function$;

-- ───────────────────────── Strada diretta ─────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_ai_credits_with_markup(p_company_id uuid, p_task_kind text, p_model_used text, p_cost_usd_real numeric, p_tokens_prompt integer, p_tokens_completion integer, p_wa_message_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(ok boolean, reason text, cost_real_eur numeric, cost_billed_eur numeric, margin_eur numeric, balance_before numeric, balance_after numeric, markup_used numeric, usage_log_id uuid, tx_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate          NUMERIC;
  v_markup        NUMERIC;
  v_markup_source TEXT;
  v_cost_real     NUMERIC;
  v_cost_billed   NUMERIC;
  v_margin        NUMERIC;
  v_balance       NUMERIC;
  v_free          NUMERIC;
  v_avail         NUMERIC;
  v_blocked       BOOLEAN;
  v_from_free     NUMERIC;
  v_from_paid     NUMERIC;
  v_new_avail     NUMERIC;
  v_log_id        UUID;
  v_tx_id         UUID;
  v_label         TEXT;
  v_regola        record;
  v_meta          jsonb := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  PERFORM public.ensure_monthly_free_ai_credits(p_company_id);

  SELECT COALESCE(NULLIF(value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings WHERE key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  v_cost_real := COALESCE(p_cost_usd_real, 0) * v_rate;

  SELECT * INTO v_regola FROM public.ai_ricarico_per(p_task_kind, p_model_used);

  -- Embedding e compiti regalati (16/11/2026): costo della piattaforma,
  -- registrato col costo vero e l'azienda, a 0 sul portafoglio.
  IF v_regola.regalato THEN
    INSERT INTO public.ai_model_usage_log (
      ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
      tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
      usd_eur_rate, cost_real_eur, markup_applied_pct, cost_billed_eur, margin_eur,
      credits_deducted, error_code, error_detail, wa_message_id, metadata
    ) VALUES (
      now(), p_company_id, p_task_kind, p_model_used, p_model_used,
      split_part(p_model_used, '/', 1), 0,
      p_tokens_prompt, p_tokens_completion, p_tokens_prompt + p_tokens_completion,
      p_cost_usd_real, true, v_rate, v_cost_real, 0, 0, -v_cost_real,
      false, 'interno_piattaforma', v_regola.regola, p_wa_message_id,
      v_meta || jsonb_build_object('interno', true, 'motivo', v_regola.regola, 'markup_source', 'regalato')
    ) RETURNING id INTO v_log_id;
    RETURN QUERY SELECT true, 'regalato'::TEXT, v_cost_real, 0::NUMERIC, -v_cost_real,
      NULL::NUMERIC, NULL::NUMERIC, 0::NUMERIC, v_log_id, NULL::UUID;
    RETURN;
  END IF;

  IF v_regola.moltiplicatore IS NOT NULL THEN
    v_markup := v_regola.moltiplicatore;
    v_markup_source := v_regola.regola;
  END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = p_task_kind
      AND model_pattern IS NOT NULL
      AND p_model_used ILIKE model_pattern
      AND enabled = true
    ORDER BY LENGTH(model_pattern) DESC
    LIMIT 1;
    IF v_markup IS NOT NULL THEN v_markup_source := 'task+model'; END IF;
  END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = p_task_kind AND model_pattern IS NULL AND enabled = true;
    IF v_markup IS NOT NULL THEN v_markup_source := 'task_catchall'; END IF;
  END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = 'default'
      AND model_pattern IS NOT NULL
      AND p_model_used ILIKE model_pattern
      AND enabled = true
    ORDER BY LENGTH(model_pattern) DESC
    LIMIT 1;
    IF v_markup IS NOT NULL THEN v_markup_source := 'default+model'; END IF;
  END IF;

  IF v_markup IS NULL THEN
    SELECT markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup
    WHERE task_kind = 'default' AND model_pattern IS NULL AND enabled = true;
    v_markup_source := 'default_catchall';
  END IF;

  IF v_markup IS NULL THEN
    RETURN QUERY SELECT false, 'markup_missing'::TEXT,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC,
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  v_cost_billed := v_cost_real * v_markup;
  v_margin      := v_cost_billed - v_cost_real;

  SELECT balance_eur, free_balance_eur, calls_blocked
    INTO v_balance, v_free, v_blocked
  FROM public.ai_credits
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    INSERT INTO public.ai_credits (company_id, balance_eur)
    VALUES (p_company_id, 0)
    ON CONFLICT (company_id) DO NOTHING;
    v_balance := 0;
    v_blocked := false;
  END IF;

  v_free  := COALESCE(v_free, 0);
  v_avail := COALESCE(v_balance, 0) + v_free;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_avail, v_avail, v_markup, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  IF v_avail < v_cost_billed THEN
    -- Credito finito (16/11/2026): il provider ha già lavorato. L'importo
    -- diventa un debito, scalato alla ricarica successiva.
    UPDATE public.ai_credits
       SET total_spent_eur = COALESCE(total_spent_eur, 0) + v_cost_billed, updated_at = now()
     WHERE company_id = p_company_id;
    INSERT INTO public.ai_model_usage_log (
      ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
      tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
      usd_eur_rate, cost_real_eur, markup_applied_pct, cost_billed_eur, margin_eur,
      credits_deducted, error_code, error_detail, wa_message_id, metadata
    ) VALUES (
      now(), p_company_id, p_task_kind, p_model_used, p_model_used,
      split_part(p_model_used, '/', 1), 0,
      p_tokens_prompt, p_tokens_completion, p_tokens_prompt + p_tokens_completion,
      p_cost_usd_real, true, v_rate, v_cost_real, (v_markup - 1) * 100, v_cost_billed, v_margin,
      false, 'a_debito', 'credito esaurito: si scala alla prossima ricarica', p_wa_message_id,
      v_meta || jsonb_build_object('markup_source', v_markup_source, 'da_debito', v_cost_billed)
    ) RETURNING id INTO v_log_id;
    IF v_cost_billed > 0 THEN
      INSERT INTO public.ai_debiti (company_id, origine, riferimento_id, compito, importo_eur, residuo_eur)
      VALUES (p_company_id, 'diretta', v_log_id, p_task_kind, v_cost_billed, v_cost_billed);
    END IF;
    RETURN QUERY SELECT true, 'a_debito'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_avail, v_avail, v_markup, v_log_id, NULL::UUID;
    RETURN;
  END IF;

  -- Prima l'omaggio (scade a fine mese), poi la ricarica (non scade).
  v_from_free := LEAST(v_free, v_cost_billed);
  v_from_paid := v_cost_billed - v_from_free;
  v_new_avail := v_avail - v_cost_billed;

  UPDATE public.ai_credits
  SET free_balance_eur = v_free - v_from_free,
      total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed,
      updated_at       = now()
  WHERE company_id = p_company_id;
  IF v_from_paid > 0 THEN
    PERFORM public.pool_consuma(p_company_id, 'ai', v_from_paid,
      format('AI — %s', p_task_kind),
      jsonb_build_object('model', p_model_used, 'task_kind', p_task_kind));
  END IF;

  SELECT COALESCE(apm.display_label, p_task_kind) INTO v_label
  FROM public.ai_pricing_markup apm
  WHERE apm.task_kind = p_task_kind AND apm.model_pattern IS NULL
  LIMIT 1;
  IF v_label IS NULL THEN v_label := p_task_kind; END IF;

  INSERT INTO public.ai_credit_transactions (
    company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
  ) VALUES (
    p_company_id, 'consumo_ai', v_cost_billed, v_avail, v_new_avail,
    format('AI — %s [%s]', v_label, split_part(p_model_used, '/', 2)),
    jsonb_build_object(
      'task_kind',     p_task_kind,
      'model_used',    p_model_used,
      'markup_source', v_markup_source,
      'tokens_total',  p_tokens_prompt + p_tokens_completion,
      'wa_message_id', p_wa_message_id,
      'source',        'ai_provider',
      'da_omaggio',    v_from_free,
      'da_ricarica',   v_from_paid
    ) || v_meta
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind,
    model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total,
    cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct,
    cost_billed_eur, margin_eur,
    credits_deducted, credit_tx_id,
    wa_message_id, metadata
  ) VALUES (
    now(), p_company_id, p_task_kind,
    p_model_used, p_model_used,
    split_part(p_model_used, '/', 1), 0,
    p_tokens_prompt, p_tokens_completion,
    p_tokens_prompt + p_tokens_completion,
    p_cost_usd_real, true,
    v_rate, v_cost_real, (v_markup - 1) * 100,
    v_cost_billed, v_margin,
    true, v_tx_id,
    p_wa_message_id,
    v_meta || jsonb_build_object(
      'markup_source', v_markup_source,
      'da_omaggio',    v_from_free,
      'da_ricarica',   v_from_paid
    )
  )
  RETURNING id INTO v_log_id;

  UPDATE public.ai_credits
  SET alert_email_sent_at = now()
  WHERE company_id = p_company_id
    AND v_new_avail < COALESCE(alert_threshold_eur, 0)
    AND (alert_email_sent_at IS NULL
         OR alert_email_sent_at < now() - interval '24 hours');

  RETURN QUERY SELECT true, 'success'::TEXT,
    v_cost_real, v_cost_billed, v_margin,
    v_avail, v_new_avail, v_markup,
    v_log_id, v_tx_id;
END;
$function$;

-- addebita_ai_diretta: «regalato» e «a_debito» sono esiti buoni (la riga c'è,
-- con la chiave), ma non sono un addebito sul portafoglio.
CREATE OR REPLACE FUNCTION public.addebita_ai_diretta(p_idempotency_key text, p_company_id uuid, p_task_kind text, p_model_used text, p_cost_usd_real numeric, p_tokens_prompt integer, p_tokens_completion integer, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_rate    numeric;
  r         record;
  v_meta    jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_ok      boolean := false;
  v_reason  text;
  v_billed  numeric;
  v_markup  numeric;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF length(p_idempotency_key) < 8 THEN
      RAISE EXCEPTION 'idempotency_key troppo corta' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('ai_diretta:' || p_idempotency_key, 0));
    SELECT id INTO v_id FROM public.ai_model_usage_log WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'charged', false, 'reason', 'idempotent_replay',
                                'idempotent_replay', true, 'usage_log_id', v_id);
    END IF;
  END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 0.92) INTO v_rate
    FROM public.platform_settings WHERE key = 'usd_eur_rate';
  v_rate := COALESCE(v_rate, 0.92);

  IF p_company_id IS NULL THEN
    INSERT INTO public.ai_model_usage_log (
      ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
      tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
      usd_eur_rate, cost_real_eur, cost_billed_eur, margin_eur, credits_deducted,
      cost_is_estimated, error_code, metadata, idempotency_key
    ) VALUES (
      now(), NULL, p_task_kind, p_model_used, p_model_used, split_part(p_model_used, '/', 1), 0,
      COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0),
      COALESCE(p_tokens_prompt, 0) + COALESCE(p_tokens_completion, 0), COALESCE(p_cost_usd_real, 0), true,
      v_rate, COALESCE(p_cost_usd_real, 0) * v_rate, 0, 0, false,
      COALESCE((v_meta->>'cost_is_estimated')::boolean, true), 'interno_piattaforma',
      v_meta || jsonb_build_object('interno', true), p_idempotency_key
    ) RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'charged', false, 'reason', 'no_company', 'usage_log_id', v_id);
  END IF;

  BEGIN
    SELECT * INTO r FROM public.deduct_ai_credits_with_markup(
      p_company_id, p_task_kind, p_model_used, p_cost_usd_real,
      COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0), NULL, v_meta);
    v_ok := COALESCE(r.ok, false);
    v_reason := r.reason;
    v_billed := r.cost_billed_eur;
    v_markup := r.markup_used;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
    v_reason := 'errore_' || SQLSTATE;
    v_billed := NULL;
    v_markup := NULL;
  END;

  IF v_ok THEN
    UPDATE public.ai_model_usage_log SET idempotency_key = p_idempotency_key WHERE id = r.usage_log_id;
    RETURN jsonb_build_object('ok', true, 'charged', r.reason = 'success', 'reason', r.reason,
      'cost_real_eur', r.cost_real_eur, 'cost_billed_eur', r.cost_billed_eur, 'margin_eur', r.margin_eur,
      'balance_before', r.balance_before, 'balance_after', r.balance_after,
      'markup_used', r.markup_used, 'usage_log_id', r.usage_log_id,
      'debito_eur', CASE WHEN r.reason = 'a_debito' THEN r.cost_billed_eur ELSE 0 END);
  END IF;

  INSERT INTO public.ai_model_usage_log (
    ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
    tokens_prompt, tokens_completion, tokens_total, cost_usd, ok,
    usd_eur_rate, cost_real_eur, markup_applied_pct, cost_billed_eur, margin_eur, credits_deducted,
    cost_is_estimated, error_code, error_detail, metadata, idempotency_key
  ) VALUES (
    now(), p_company_id, p_task_kind, p_model_used, p_model_used, split_part(p_model_used, '/', 1), 0,
    COALESCE(p_tokens_prompt, 0), COALESCE(p_tokens_completion, 0),
    COALESCE(p_tokens_prompt, 0) + COALESCE(p_tokens_completion, 0), COALESCE(p_cost_usd_real, 0), true,
    v_rate, COALESCE(p_cost_usd_real, 0) * v_rate, COALESCE((v_markup - 1) * 100, NULL), 0,
    -(COALESCE(p_cost_usd_real, 0) * v_rate), false,
    COALESCE((v_meta->>'cost_is_estimated')::boolean, true), 'non_addebitato',
    v_reason, v_meta || jsonb_build_object('addebito_mancato', v_reason, 'prezzo_non_addebitato_eur', v_billed),
    p_idempotency_key
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', false, 'charged', false, 'reason', v_reason, 'usage_log_id', v_id,
    'cost_billed_eur', v_billed);
END;
$function$;

-- ───────────────────────── 2. Rimborso ─────────────────────────

CREATE OR REPLACE FUNCTION public.ai_rimborsa_addebito(
  p_motivo text,
  p_idempotency_key text DEFAULT NULL,
  p_ledger_id uuid DEFAULT NULL,
  p_usage_log_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l          public.ai_call_ledger%ROWTYPE;
  m          public.ai_model_usage_log%ROWTYPE;
  v_origine  text;
  v_rif      uuid;
  v_key      text;
  v_company  uuid;
  v_compito  text;
  v_quando   timestamptz;
  v_importo  numeric;
  v_free     numeric := 0;
  v_paid     numeric := 0;
  v_deb      numeric := 0;
  v_annull   numeric := 0;
  v_free_ok  numeric := 0;
  v_period   date;
  v_mese     date := date_trunc('month', now())::date;
  v_pool     numeric;
  v_new_id   uuid;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'motivo del rimborso obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_usage_log_id IS NULL THEN
    IF p_ledger_id IS NOT NULL THEN
      SELECT * INTO l FROM public.ai_call_ledger WHERE id = p_ledger_id;
    ELSIF p_idempotency_key IS NOT NULL THEN
      SELECT * INTO l FROM public.ai_call_ledger WHERE idempotency_key = p_idempotency_key;
    END IF;
    IF l.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'non_trovato');
    END IF;
    IF l.status <> 'success' OR l.cost_billed_eur <= 0 THEN
      RETURN jsonb_build_object('ok', true, 'rimborsato_eur', 0, 'reason', 'niente_da_rimborsare');
    END IF;
    v_origine := 'router'; v_rif := l.id; v_company := l.company_id; v_compito := l.task_key;
    v_quando := l.created_at; v_importo := l.cost_billed_eur;
    v_key := 'rimborso:' || l.idempotency_key;
    v_free := COALESCE((l.metadata->>'da_omaggio')::numeric, 0);
    v_deb  := COALESCE((l.metadata->>'da_debito')::numeric, 0);
    v_paid := GREATEST(v_importo - v_free - v_deb, 0);
  ELSE
    SELECT * INTO m FROM public.ai_model_usage_log WHERE id = p_usage_log_id;
    IF m.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'non_trovato');
    END IF;
    IF m.error_code = 'a_debito' THEN
      v_deb := COALESCE(m.cost_billed_eur, 0);
    ELSIF COALESCE(m.credits_deducted, false) AND COALESCE(m.cost_billed_eur, 0) > 0 THEN
      v_free := COALESCE((m.metadata->>'da_omaggio')::numeric, 0);
      v_paid := GREATEST(m.cost_billed_eur - v_free, 0);
    ELSE
      RETURN jsonb_build_object('ok', true, 'rimborsato_eur', 0, 'reason', 'niente_da_rimborsare');
    END IF;
    v_origine := 'diretta'; v_rif := m.id; v_company := m.company_id; v_compito := m.task_kind;
    v_quando := m.ts; v_importo := m.cost_billed_eur;
    v_key := 'rimborso:' || COALESCE(m.idempotency_key, m.id::text);
  END IF;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'rimborsato_eur', 0, 'reason', 'senza_azienda');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
  IF EXISTS (SELECT 1 FROM public.ai_call_ledger WHERE idempotency_key = v_key)
     OR EXISTS (SELECT 1 FROM public.ai_model_usage_log WHERE idempotency_key = v_key) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_replay', true, 'reason', 'gia_rimborsato');
  END IF;

  SELECT free_period_start INTO v_period FROM public.ai_credits WHERE company_id = v_company FOR UPDATE;

  -- Debito ancora aperto: si annulla il residuo. La parte già saldata torna come credito.
  IF v_deb > 0 THEN
    UPDATE public.ai_debiti
       SET annullato_eur = annullato_eur + LEAST(residuo_eur, v_deb),
           residuo_eur   = residuo_eur - LEAST(residuo_eur, v_deb),
           chiuso_il     = now()
     WHERE origine = v_origine AND riferimento_id = v_rif
     RETURNING annullato_eur INTO v_annull;
    v_annull := COALESCE(v_annull, 0);
    v_paid := v_paid + GREATEST(v_deb - v_annull, 0);
  END IF;

  -- L'omaggio torna solo se è ancora il suo mese.
  IF v_free > 0 AND date_trunc('month', v_quando)::date = v_mese AND v_period = v_mese THEN
    v_free_ok := v_free;
    UPDATE public.ai_credits
       SET free_balance_eur = COALESCE(free_balance_eur, 0) + v_free_ok, updated_at = now()
     WHERE company_id = v_company;
  END IF;

  v_paid := round(v_paid, 4);
  IF v_paid > 0 THEN
    IF EXISTS (SELECT 1 FROM public.company_credit_pool WHERE company_id = v_company) THEN
      UPDATE public.company_credit_pool
         SET balance_eur = round((balance_eur + v_paid)::numeric, 4),
             total_spent_eur = GREATEST(round((COALESCE(total_spent_eur, 0) - v_paid)::numeric, 4), 0),
             updated_at = now()
       WHERE company_id = v_company
      RETURNING balance_eur INTO v_pool;
      INSERT INTO public.company_credit_pool_ledger
        (company_id, service, direction, amount_eur, balance_after, description, metadata)
      VALUES (v_company, 'ai', 'in', v_paid, v_pool, format('Rimborso AI — %s', v_compito),
              jsonb_build_object('rimborso_di', v_rif, 'origine', v_origine, 'motivo', p_motivo));
      PERFORM public.pool_rispecchia(v_company, v_pool);
    ELSE
      UPDATE public.ai_credits SET balance_eur = balance_eur + v_paid, updated_at = now()
       WHERE company_id = v_company;
    END IF;
  END IF;

  UPDATE public.ai_credits
     SET total_spent_eur = GREATEST(COALESCE(total_spent_eur, 0) - (v_free + v_paid + v_annull), 0),
         mtd_spent_eur = CASE WHEN mtd_period_start = v_mese AND date_trunc('month', v_quando)::date = v_mese
                              THEN GREATEST(COALESCE(mtd_spent_eur, 0) - (v_free + v_paid + v_annull), 0)
                              ELSE mtd_spent_eur END,
         updated_at = now()
   WHERE company_id = v_company;

  IF v_origine = 'router' THEN
    INSERT INTO public.ai_call_ledger (
      idempotency_key, company_id, user_id, task_key, tier_key, model_used, used_primary,
      fallback_index, persona_key, tokens_in, tokens_out, cost_real_usd, cost_real_eur,
      cost_billed_eur, fx_usd_to_eur, applied_markup_pct, status, error_message, metadata
    ) VALUES (
      v_key, v_company, l.user_id, l.task_key, l.tier_key, l.model_used, l.used_primary,
      l.fallback_index, l.persona_key, 0, 0, 0, 0,
      -v_importo, l.fx_usd_to_eur, 0, 'refunded', p_motivo,
      jsonb_build_object('rimborso_di', l.id, 'motivo', p_motivo,
                         'rimborso_omaggio', v_free_ok, 'rimborso_portafoglio', v_paid,
                         'debito_annullato', v_annull, 'omaggio_scaduto', v_free - v_free_ok)
    ) RETURNING id INTO v_new_id;
  ELSE
    INSERT INTO public.ai_model_usage_log (
      ts, company_id, task_kind, model_requested, model_used, provider_used, fallback_hops,
      tokens_prompt, tokens_completion, tokens_total, cost_usd, ok, usd_eur_rate,
      cost_real_eur, cost_billed_eur, margin_eur, credits_deducted, error_code, error_detail,
      metadata, idempotency_key
    ) VALUES (
      now(), v_company, m.task_kind, m.model_used, m.model_used, m.provider_used, 0,
      0, 0, 0, 0, true, m.usd_eur_rate,
      0, -v_importo, -v_importo, false, 'rimborso', p_motivo,
      jsonb_build_object('rimborso_di', m.id, 'motivo', p_motivo,
                         'rimborso_omaggio', v_free_ok, 'rimborso_portafoglio', v_paid,
                         'debito_annullato', v_annull, 'omaggio_scaduto', v_free - v_free_ok,
                         'user_id', m.metadata->>'user_id'),
      v_key
    ) RETURNING id INTO v_new_id;
  END IF;

  IF v_free_ok + v_paid > 0 THEN
    SELECT COALESCE(CASE WHEN free_period_start = v_mese THEN free_balance_eur END, 0) + COALESCE(balance_eur, 0)
      INTO v_pool FROM public.ai_credits WHERE company_id = v_company;
    INSERT INTO public.ai_credit_transactions (
      company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
    ) VALUES (
      v_company, 'rimborso_ai', v_free_ok + v_paid,
      COALESCE(v_pool, 0) - (v_free_ok + v_paid), COALESCE(v_pool, 0),
      format('Rimborso AI — %s: %s', v_compito, p_motivo),
      jsonb_build_object('source', 'ai_rimborso', 'origine', v_origine, 'rimborso_di', v_rif,
                         'riga_rimborso', v_new_id, 'da_omaggio', v_free_ok, 'da_portafoglio', v_paid)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'rimborsato_eur', v_free_ok + v_paid,
    'debito_annullato_eur', v_annull, 'omaggio_scaduto_eur', v_free - v_free_ok,
    'riga_rimborso', v_new_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_rimborsa_addebito(text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rimborsa_addebito(text, text, uuid, uuid) TO service_role;

-- ───────────────────────── Cosa vede l'azienda ─────────────────────────

CREATE OR REPLACE VIEW public.consumi_ai_azienda
WITH (security_invoker = true) AS
 SELECT l.id,
    l.company_id,
    l.user_id,
    l.created_at,
    'router'::text AS origine,
    l.task_key AS compito,
    l.persona_key,
    l.model_used AS modello,
    COALESCE(l.tokens_in, 0) AS tokens_in,
    COALESCE(l.tokens_out, 0) AS tokens_out,
    COALESCE(l.cost_billed_eur, (0)::numeric) AS addebitato_eur,
    l.status AS stato,
    ((l.status = 'success'::text) AND (COALESCE(l.cost_billed_eur, (0)::numeric) > (0)::numeric)) AS addebitato,
        CASE
            WHEN ((l.status = 'skipped'::text) AND (l.task_key = 'planimetria_genera'::text)) THEN 'pagato in crediti render'::text
            WHEN (l.status = 'skipped'::text) THEN ('non addebitato: '::text || COALESCE((l.metadata ->> 'motivo'::text), (l.metadata ->> 'skip_reason'::text), 'interno'::text))
            WHEN (l.status = 'refunded'::text) THEN ('rimborso: '::text || COALESCE((l.metadata ->> 'motivo'::text), 'errore nostro'::text))
            WHEN (l.status = 'unbilled_fail_open'::text) THEN 'non addebitato: registro non raggiungibile'::text
            WHEN (l.status = ANY (ARRAY['error'::text, 'timeout'::text])) THEN 'chiamata non riuscita'::text
            WHEN (COALESCE((l.metadata ->> 'da_debito'::text)::numeric, 0) > 0) THEN 'a debito: si scala alla prossima ricarica'::text
            WHEN (l.metadata ? 'ripetizione_di'::text) THEN 'stessa richiesta ripetuta'::text
            ELSE NULL::text
        END AS nota
   FROM ai_call_ledger l
UNION ALL
 SELECT m.id,
    m.company_id,
    (NULLIF((m.metadata ->> 'user_id'::text), ''::text))::uuid AS user_id,
    m.ts AS created_at,
    'diretta'::text AS origine,
    m.task_kind AS compito,
    NULL::text AS persona_key,
    m.model_used AS modello,
    COALESCE(m.tokens_prompt, 0) AS tokens_in,
    COALESCE(m.tokens_completion, 0) AS tokens_out,
    COALESCE(m.cost_billed_eur, (0)::numeric) AS addebitato_eur,
        CASE
            WHEN m.ok THEN 'success'::text
            ELSE 'error'::text
        END AS stato,
    COALESCE(m.credits_deducted, false) AS addebitato,
        CASE
            WHEN (m.error_code = 'non_addebitato'::text) THEN ('non addebitato: '::text || COALESCE(m.error_detail, '?'::text))
            WHEN (m.error_code = 'a_debito'::text) THEN 'a debito: si scala alla prossima ricarica'::text
            WHEN (m.error_code = 'rimborso'::text) THEN ('rimborso: '::text || COALESCE(m.error_detail, 'errore nostro'::text))
            WHEN (m.error_code = 'interno_piattaforma'::text) THEN ('non addebitato: '::text || COALESCE(m.error_detail, 'costo della piattaforma'::text))
            WHEN (NOT m.ok) THEN 'chiamata non riuscita'::text
            ELSE NULL::text
        END AS nota
   FROM ai_model_usage_log m
  WHERE (m.company_id IS NOT NULL);

-- ───────────────────────── Anteprima e regole per il titolare ─────────────────────────

-- Per ogni compito: ricarico di oggi (addebitato / costo vero degli ultimi N
-- giorni) e quello della tabella, o la proposta se la riga non c'è ancora
-- (il prezzo di oggi, mai sotto 3×). Embedding a 0.
CREATE OR REPLACE FUNCTION public.ai_ricarico_anteprima(p_giorni integer DEFAULT 30)
RETURNS TABLE(compito text, strade text, chiamate bigint, costo_reale_eur numeric,
              addebitato_oggi_eur numeric, ricarico_oggi numeric, ricarico_nuovo numeric,
              fonte_nuovo text, addebitato_nuovo_eur numeric, differenza_eur numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'solo super admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH righe AS (
    SELECT 'router'::text o, l.task_key c, l.model_used mo, l.cost_real_eur cr, l.cost_billed_eur cb
      FROM public.ai_call_ledger l
     WHERE l.created_at >= now() - make_interval(days => p_giorni)
       AND l.status = 'success' AND l.cost_billed_eur > 0 AND l.cost_real_eur > 0
    UNION ALL
    SELECT 'diretta', m.task_kind, m.model_used, m.cost_real_eur, m.cost_billed_eur
      FROM public.ai_model_usage_log m
     WHERE m.ts >= now() - make_interval(days => p_giorni)
       AND m.credits_deducted AND m.cost_real_eur > 0 AND m.company_id IS NOT NULL
  ), per AS (
    SELECT r.c, string_agg(DISTINCT r.o, '+') o, count(*) n, sum(r.cr) cr, sum(r.cb) cb,
           bool_or(r.mo ILIKE '%embed%') emb
      FROM righe r GROUP BY r.c
  ), nuovo AS (
    SELECT p.*, t.moltiplicatore tm, t.regalato tr
      FROM per p LEFT JOIN public.ai_ricarico_compito t ON t.compito = p.c
  )
  SELECT x.c, x.o, x.n, round(x.cr, 4), round(x.cb, 4), round(x.cb / x.cr, 2),
         y.mn, y.fonte, round(x.cr * y.mn, 4), round(x.cr * y.mn - x.cb, 4)
    FROM nuovo x
    CROSS JOIN LATERAL (
      SELECT CASE WHEN x.emb OR COALESCE(x.tr, false) THEN 0::numeric
                  WHEN x.tm IS NOT NULL THEN GREATEST(x.tm, 3)
                  ELSE GREATEST(round(x.cb / x.cr, 2), 3) END mn,
             CASE WHEN x.emb OR COALESCE(x.tr, false) THEN 'regalato'
                  WHEN x.tm IS NOT NULL THEN 'tabella'
                  ELSE 'proposta' END fonte
    ) y
   ORDER BY x.cr DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.ai_ricarico_anteprima(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_ricarico_anteprima(integer) TO authenticated, service_role;

-- ai_regole_ricarico: la regola scritta sulla riga (compito, default, tier, override).
CREATE OR REPLACE FUNCTION public.ai_regole_ricarico(p_giorni integer DEFAULT 30)
 RETURNS TABLE(origine text, compito text, regola text, chiamate bigint, addebitate bigint, costo_reale_eur numeric, addebitato_eur numeric, ricarico_effettivo_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'solo super admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH router AS (
    SELECT 'router'::text o, l.task_key c,
           string_agg(DISTINCT CASE
                    WHEN l.status = 'refunded' THEN 'rimborso'
                    WHEN l.pricing_override_id IS NOT NULL THEN 'override azienda (ai_pricing_overrides)'
                    WHEN l.metadata->>'regola_ricarico' IN ('compito', 'default')
                      THEN 'ai_ricarico_compito: ' || (l.metadata->>'regola_ricarico') || ' ' || round(l.applied_markup_pct / 100 + 1, 2) || '×'
                    WHEN l.metadata->>'regola_ricarico' LIKE 'embedding%' OR l.metadata->>'regola_ricarico' LIKE 'regalato%'
                      THEN 'regalato'
                    ELSE 'tier ' || l.tier_key || ' (ai_pricing_tiers, ' || round(l.applied_markup_pct) || '%, pavimento min_markup_multiplier)'
               END, '; ') r,
           count(*) n, count(*) FILTER (WHERE l.cost_billed_eur > 0) na,
           sum(l.cost_real_eur) cr, sum(l.cost_billed_eur) cb
      FROM public.ai_call_ledger l
     WHERE l.created_at >= now() - make_interval(days => p_giorni)
     GROUP BY 2
  ), diretta AS (
    SELECT 'diretta'::text o, m.task_kind c,
           string_agg(DISTINCT CASE WHEN m.error_code = 'rimborso' THEN 'rimborso'
                                    ELSE 'regola: ' || COALESCE(m.metadata->>'markup_source', 'interno/non addebitato') END, '; ') r,
           count(*) n, count(*) FILTER (WHERE m.credits_deducted) na,
           sum(m.cost_real_eur) cr,
           sum(m.cost_billed_eur) FILTER (WHERE m.credits_deducted OR m.error_code IN ('rimborso', 'a_debito')) cb
      FROM public.ai_model_usage_log m
     WHERE m.ts >= now() - make_interval(days => p_giorni)
     GROUP BY 2
  )
  SELECT x.o, x.c, x.r, x.n, x.na, round(x.cr, 4), round(x.cb, 4),
         CASE WHEN COALESCE(x.cr, 0) > 0 THEN round((x.cb / x.cr - 1) * 100, 0) END
    FROM (SELECT * FROM router UNION ALL SELECT * FROM diretta) x
   ORDER BY x.cr DESC NULLS LAST;
END;
$function$;

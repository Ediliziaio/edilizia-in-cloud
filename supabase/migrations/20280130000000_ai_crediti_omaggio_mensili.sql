-- Crediti AI inclusi nel piano: due borsellini distinti.
--
--   free_balance_eur  = omaggio del mese. NON cumulabile: il primo giorno del
--                       mese si RIAZZERA alla quota del piano. Se questo mese
--                       hai 5 € e non li usi, il mese prossimo hai ancora 5 €
--                       (non 10 €).
--   balance_eur       = ricariche pagate con la carta. Cumulabili, non scadono:
--                       se ricarichi 25 € e non li spendi restano li'.
--
-- Il consumo attinge PRIMA dall'omaggio (che scade) e solo dopo dalla ricarica
-- (che resta): cosi' il cliente non perde mai i soldi che ha pagato.
--
-- La quota vive su subscription_plans, non nel codice: si cambia da SQL/UI
-- senza toccare le funzioni.

-- 1. Quota per piano ---------------------------------------------------------
alter table public.subscription_plans
  add column if not exists monthly_free_ai_eur numeric not null default 0;

comment on column public.subscription_plans.monthly_free_ai_eur is
  'Crediti AI omaggio inclusi nel canone, in euro. Si azzerano ogni mese (non cumulabili).';

update public.subscription_plans set monthly_free_ai_eur = 25 where slug = 'enterprise';
update public.subscription_plans set monthly_free_ai_eur = 10 where slug = 'pro';
update public.subscription_plans set monthly_free_ai_eur = 10 where slug = 'prod-demo-1d75d607';
update public.subscription_plans set monthly_free_ai_eur = 5  where slug in ('starter', 'offerta-clienti-marketing');
-- render-only, render-serramenti, scopri, marketing restano a 0: non includono AI.

-- 2. Il borsellino omaggio ---------------------------------------------------
alter table public.ai_credits
  add column if not exists free_balance_eur  numeric not null default 0,
  add column if not exists free_granted_eur  numeric not null default 0,
  add column if not exists free_period_start date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_credits_free_balance_nonneg'
  ) then
    alter table public.ai_credits
      add constraint ai_credits_free_balance_nonneg check (free_balance_eur >= 0);
  end if;
end $$;

comment on column public.ai_credits.free_balance_eur is
  'Omaggio del mese ancora disponibile. Si riazzera alla quota del piano ogni mese: NON cumulabile.';
comment on column public.ai_credits.free_granted_eur is
  'Quota omaggio assegnata per il mese in corso (per mostrare "3,20 di 5,00").';
comment on column public.ai_credits.balance_eur is
  'Credito ricaricato con la carta. Cumulabile, non scade.';

-- Saldo totale spendibile, cosi' i chiamanti hanno un solo campo da leggere.
alter table public.ai_credits
  add column if not exists total_available_eur numeric
  generated always as (coalesce(balance_eur, 0) + coalesce(free_balance_eur, 0)) stored;

-- 3. Rinnovo mensile (idempotente, non cumulativo) ---------------------------
create or replace function public.ensure_monthly_free_ai_credits(p_company_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month  date := date_trunc('month', now())::date;
  v_quota  numeric;
  v_free   numeric;
  v_period date;
begin
  select ac.free_balance_eur, ac.free_period_start
    into v_free, v_period
  from public.ai_credits ac
  where ac.company_id = p_company_id
  for update;

  if not found then
    insert into public.ai_credits (company_id, balance_eur)
    values (p_company_id, 0)
    on conflict (company_id) do nothing;
    v_free := 0;
    v_period := null;
  end if;

  -- Gia' rinnovato questo mese: non tocco nulla.
  if v_period is not distinct from v_month then
    return coalesce(v_free, 0);
  end if;

  select coalesce(sp.monthly_free_ai_eur, 0)
    into v_quota
  from public.companies c
  left join public.subscription_plans sp on sp.id = c.subscription_plan_id
  where c.id = p_company_id;

  v_quota := coalesce(v_quota, 0);

  -- IMPOSTA, non somma: e' qui che l'omaggio smette di accumularsi.
  update public.ai_credits
     set free_balance_eur  = v_quota,
         free_granted_eur  = v_quota,
         free_period_start = v_month,
         updated_at        = now()
   where company_id = p_company_id;

  if v_quota > 0 then
    insert into public.ai_credit_transactions (
      company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, metadata
    ) values (
      p_company_id, 'omaggio_piano', v_quota, coalesce(v_free, 0), v_quota,
      format('Crediti AI inclusi nel piano — %s', to_char(v_month, 'MM/YYYY')),
      jsonb_build_object(
        'source', 'monthly_plan_grant',
        'periodo', v_month,
        'cumulabile', false,
        'residuo_mese_precedente_perso', coalesce(v_free, 0)
      )
    );
  end if;

  return v_quota;
end;
$$;

revoke all on function public.ensure_monthly_free_ai_credits(uuid) from public;
grant execute on function public.ensure_monthly_free_ai_credits(uuid) to authenticated, service_role;

comment on function public.ensure_monthly_free_ai_credits(uuid) is
  'Rinnova l''omaggio AI del mese se scaduto. Idempotente: chiamabile a ogni richiesta AI.';

-- 4. Precheck: guarda il totale spendibile, non solo la ricarica ------------
create or replace function public.check_ai_credits_available(
  p_company_id uuid,
  p_est_cost_usd numeric default 0.001,
  p_task_kind text default 'default'::text,
  p_model_hint text default null::text
)
returns table(o_ok boolean, o_reason text, o_balance_eur numeric, o_est_cost_eur numeric)
language plpgsql
security definer
set search_path to 'public'
as $fn$
DECLARE
  v_rate      NUMERIC;
  v_markup    NUMERIC;
  v_min       NUMERIC;
  v_balance   NUMERIC;
  v_free      NUMERIC;
  v_avail     NUMERIC;
  v_blocked   BOOLEAN;
  v_est_eur   NUMERIC;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- Rinnova l'omaggio del mese se e' scaduto (non cumulabile).
  PERFORM public.ensure_monthly_free_ai_credits(p_company_id);

  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings ps WHERE ps.key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  SELECT COALESCE(NULLIF(ps.value, '')::NUMERIC, 0.05) INTO v_min
  FROM public.platform_settings ps WHERE ps.key = 'ai_min_balance_eur_to_call';
  IF v_min IS NULL THEN v_min := 0.05; END IF;

  IF p_model_hint IS NOT NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = p_task_kind
      AND pm.model_pattern IS NOT NULL
      AND p_model_hint ILIKE pm.model_pattern
      AND pm.enabled = true
    ORDER BY LENGTH(pm.model_pattern) DESC
    LIMIT 1;
  END IF;

  IF v_markup IS NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = p_task_kind AND pm.model_pattern IS NULL AND pm.enabled = true;
  END IF;

  IF v_markup IS NULL AND p_model_hint IS NOT NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = 'default'
      AND pm.model_pattern IS NOT NULL
      AND p_model_hint ILIKE pm.model_pattern
      AND pm.enabled = true
    ORDER BY LENGTH(pm.model_pattern) DESC
    LIMIT 1;
  END IF;

  IF v_markup IS NULL THEN
    SELECT pm.markup_multiplier INTO v_markup
    FROM public.ai_pricing_markup pm
    WHERE pm.task_kind = 'default' AND pm.model_pattern IS NULL AND pm.enabled = true;
  END IF;

  IF v_markup IS NULL THEN v_markup := 3.00; END IF;

  SELECT ac.balance_eur, ac.free_balance_eur, ac.calls_blocked
    INTO v_balance, v_free, v_blocked
  FROM public.ai_credits ac WHERE ac.company_id = p_company_id;

  IF v_balance IS NULL THEN v_balance := 0; v_blocked := false; END IF;
  v_avail := COALESCE(v_balance, 0) + COALESCE(v_free, 0);

  v_est_eur := COALESCE(p_est_cost_usd, 0) * v_rate * v_markup;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked'::TEXT, v_avail, v_est_eur;
  ELSIF v_avail < v_min THEN
    RETURN QUERY SELECT false, 'below_minimum'::TEXT, v_avail, v_est_eur;
  ELSIF v_avail < v_est_eur THEN
    RETURN QUERY SELECT false, 'insufficient'::TEXT, v_avail, v_est_eur;
  ELSE
    RETURN QUERY SELECT true, 'ok'::TEXT, v_avail, v_est_eur;
  END IF;
END;
$fn$;

-- 5. Consumo: prima l'omaggio (scade), poi la ricarica (resta) --------------
create or replace function public.deduct_ai_credits_with_markup(
  p_company_id uuid,
  p_task_kind text,
  p_model_used text,
  p_cost_usd_real numeric,
  p_tokens_prompt integer,
  p_tokens_completion integer,
  p_wa_message_id uuid default null::uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns table(ok boolean, reason text, cost_real_eur numeric, cost_billed_eur numeric,
              margin_eur numeric, balance_before numeric, balance_after numeric,
              markup_used numeric, usage_log_id uuid, tx_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $fn$
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
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  PERFORM public.ensure_monthly_free_ai_credits(p_company_id);

  SELECT COALESCE(NULLIF(value, '')::NUMERIC, 0.92) INTO v_rate
  FROM public.platform_settings WHERE key = 'usd_eur_rate';
  IF v_rate IS NULL THEN v_rate := 0.92; END IF;

  SELECT markup_multiplier INTO v_markup
  FROM public.ai_pricing_markup
  WHERE task_kind = p_task_kind
    AND model_pattern IS NOT NULL
    AND p_model_used ILIKE model_pattern
    AND enabled = true
  ORDER BY LENGTH(model_pattern) DESC
  LIMIT 1;
  IF v_markup IS NOT NULL THEN v_markup_source := 'task+model'; END IF;

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

  v_cost_real   := COALESCE(p_cost_usd_real, 0) * v_rate;
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
    RETURN QUERY SELECT false, 'insufficient_credits'::TEXT,
      v_cost_real, v_cost_billed, v_margin,
      v_avail, v_avail, v_markup, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Prima l'omaggio (scade a fine mese), poi la ricarica (non scade).
  v_from_free := LEAST(v_free, v_cost_billed);
  v_from_paid := v_cost_billed - v_from_free;
  v_new_avail := v_avail - v_cost_billed;

  UPDATE public.ai_credits
  SET free_balance_eur = v_free - v_from_free,
      balance_eur      = COALESCE(balance_eur, 0) - v_from_paid,
      total_spent_eur  = COALESCE(total_spent_eur, 0) + v_cost_billed,
      updated_at       = now()
  WHERE company_id = p_company_id;

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
    ) || p_metadata
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
    p_metadata || jsonb_build_object(
      'markup_source', v_markup_source,
      'da_omaggio',    v_from_free,
      'da_ricarica',   v_from_paid
    )
  )
  RETURNING id INTO v_log_id;

  -- L'avviso saldo basso guarda il totale spendibile.
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
$fn$;

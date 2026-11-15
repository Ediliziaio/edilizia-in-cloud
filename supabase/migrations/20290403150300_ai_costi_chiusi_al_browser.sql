-- Costo e margine della piattaforma chiusi al browser (revisione del 15/11/2026).
--
-- Le regole sulle righe di ai_call_ledger e ai_model_usage_log fanno vedere a
-- ogni azienda le sue righe, ma con TUTTE le colonne: cost_real_eur, margin_eur,
-- applied_markup_pct… cioè il nostro costo e il nostro ricarico. Stesso difetto
-- nelle viste security_invoker che li sommano (ai_revenue_summary, ai_usage_log,
-- company_ai_usage_month, v_ai_margin_by_model, v_ai_real_cost_per_model,
-- v_markup_simulator).
--
-- Come per i soldi dei rapportini e gli importi delle fasi (CLAUDE.md):
--   1. GRANT di SELECT per colonna ad `authenticated`, tutto tranne i costi.
--      Le scritture dal browser non servono a nessuno: si tolgono.
--   2. Le viste che mostrano costi non sono più leggibili da `authenticated`.
--   3. I pannelli admin che leggevano i costi passano da funzioni definer
--      riservate al super admin (o a chi ha can_view_platform_stats).
-- L'azienda continua a vedere il suo consumo e l'importo addebitato da
-- `consumi_ai_azienda`. Le funzioni definer e il service role non cambiano.

SET LOCAL lock_timeout = '3s';

-- ── 1. colonne ─────────────────────────────────────────────────────────────
REVOKE ALL ON public.ai_call_ledger FROM anon, authenticated;
GRANT SELECT (id, idempotency_key, company_id, user_id, task_key, tier_key, model_used,
              used_primary, fallback_index, persona_key, tokens_in, tokens_out,
              cost_billed_eur, fx_usd_to_eur, pricing_override_id, status, error_message,
              duration_ms, metadata, created_at)
  ON public.ai_call_ledger TO authenticated;

REVOKE ALL ON public.ai_model_usage_log FROM anon, authenticated;
GRANT SELECT (id, ts, company_id, task_kind, model_requested, model_used, provider_used,
              fallback_hops, tokens_prompt, tokens_completion, tokens_total, latency_ms, ok,
              error_code, error_detail, wa_message_id, metadata, usd_eur_rate, cost_billed_eur,
              credits_deducted, credit_tx_id, cost_is_estimated, idempotency_key)
  ON public.ai_model_usage_log TO authenticated;

-- ── 2. viste coi costi ─────────────────────────────────────────────────────
REVOKE ALL ON public.ai_revenue_summary FROM anon, authenticated;
REVOKE ALL ON public.ai_usage_log FROM anon, authenticated;
REVOKE ALL ON public.company_ai_usage_month FROM anon, authenticated;
REVOKE ALL ON public.v_ai_margin_by_model FROM anon, authenticated;
REVOKE ALL ON public.v_ai_real_cost_per_model FROM anon, authenticated;
REVOKE ALL ON public.v_markup_simulator FROM anon, authenticated;

-- ── 3. letture admin ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ai_puo_vedere_costi()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.admin_ha_uno_di(ARRAY['can_view_platform_stats']);
$$;
REVOKE ALL ON FUNCTION public.admin_ai_puo_vedere_costi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_puo_vedere_costi() TO authenticated, service_role;

-- AdminAiSpesaRealeCard: spesa e incasso del router per tier e compito.
CREATE OR REPLACE FUNCTION public.admin_ai_spesa_reale(p_giorni integer DEFAULT NULL)
RETURNS TABLE (tier_key text, task_key text, chiamate bigint, cost_real_eur numeric, cost_billed_eur numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.admin_ai_puo_vedere_costi() THEN
    RAISE EXCEPTION 'solo amministratori della piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT l.tier_key, l.task_key, count(*), COALESCE(sum(l.cost_real_eur), 0), COALESCE(sum(l.cost_billed_eur), 0)
      FROM public.ai_call_ledger l
     WHERE l.status = 'success'
       AND (p_giorni IS NULL OR l.created_at >= now() - make_interval(days => p_giorni))
     GROUP BY l.tier_key, l.task_key;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_ai_spesa_reale(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_spesa_reale(integer) TO authenticated, service_role;

-- AdminAiPerCompanyTable: chiamate dirette addebitate, per azienda.
CREATE OR REPLACE FUNCTION public.admin_ai_diretta_per_azienda(p_giorni integer DEFAULT 30)
RETURNS TABLE (company_id uuid, n_calls bigint, cost_real_eur numeric, cost_billed_eur numeric, margin_eur numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.admin_ai_puo_vedere_costi() THEN
    RAISE EXCEPTION 'solo amministratori della piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.company_id, count(*), COALESCE(sum(m.cost_real_eur), 0), COALESCE(sum(m.cost_billed_eur), 0), COALESCE(sum(m.margin_eur), 0)
      FROM public.ai_model_usage_log m
     WHERE m.ts >= now() - make_interval(days => COALESCE(p_giorni, 30))
       AND m.ok AND m.credits_deducted AND m.company_id IS NOT NULL
     GROUP BY m.company_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_ai_diretta_per_azienda(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_diretta_per_azienda(integer) TO authenticated, service_role;

-- AdminSettingsAIPricing: il riepilogo giornaliero (prima: la vista, aperta a tutti).
CREATE OR REPLACE FUNCTION public.admin_ai_revenue_summary(p_da date)
RETURNS SETOF public.ai_revenue_summary
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.admin_ai_puo_vedere_costi() THEN
    RAISE EXCEPTION 'solo amministratori della piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.ai_revenue_summary s WHERE s.day >= p_da ORDER BY s.day DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_ai_revenue_summary(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_revenue_summary(date) TO authenticated, service_role;

-- useAIUsageMonitor: la funzione che il pannello cerca già per prima e che non
-- c'era (ripiegava sulla vista ai_usage_log riga per riga).
CREATE OR REPLACE FUNCTION public.admin_ai_usage_aggregato(
  p_da timestamptz, p_a timestamptz, p_provider text DEFAULT NULL, p_company_id uuid DEFAULT NULL
) RETURNS TABLE (company_id uuid, provider text, model text, feature text, giorno date, richieste bigint, costo_eur numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.admin_ai_puo_vedere_costi() THEN
    RAISE EXCEPTION 'solo amministratori della piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.company_id, u.provider::text, u.model::text, u.feature::text,
           (u.created_at AT TIME ZONE 'Europe/Rome')::date, count(*), COALESCE(sum(u.cost_eur), 0)::numeric
      FROM public.ai_usage_log u
     WHERE u.created_at >= p_da AND u.created_at <= p_a
       AND (p_provider IS NULL OR u.provider = p_provider)
       AND (p_company_id IS NULL OR u.company_id = p_company_id)
     GROUP BY 1, 2, 3, 4, 5
     ORDER BY 5, 1, 2, 3, 4;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_ai_usage_aggregato(timestamptz, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_aggregato(timestamptz, timestamptz, text, uuid) TO authenticated, service_role;

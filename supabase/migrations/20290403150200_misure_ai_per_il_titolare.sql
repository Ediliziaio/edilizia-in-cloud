-- Misure AI per il titolare: lavori chiusi senza AI, costo medio, chiamate per tipo.
-- docs/ai-addebiti-censimento.md §6. Nessun prezzo cambia: si legge e basta.
--
-- 1. `lavori_ai_periodo`: un'unica fonte dei lavori automatici. Somma
--    `lavori_ai_esiti` (scritto dai flussi con registraEsitoLavoroAi) e il
--    triage delle email, che lo sapeva già da sé: `email_inbox.classificato_da`
--    vale «regola» (regole e mittente imparato) o «haiku» (AI).
-- 2. `metriche_ai_azienda` legge da lì (stessa firma, stesso controllo d'accesso).
-- 3. `ai_metriche_piattaforma(giorni)`: per il super admin, azienda per azienda
--    e in totale: chiamate, addebiti, costo reale, importo addebitato, costo
--    medio, lavori chiusi senza AI, e il costo a carico della piattaforma.

-- ── 1. fonte unica dei lavori ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lavori_ai_periodo(p_company_id uuid, p_da timestamptz)
RETURNS TABLE (company_id uuid, flusso text, esito text, chiamate_ai integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.company_id, l.flusso, l.esito, l.chiamate_ai
    FROM public.lavori_ai_esiti l
   WHERE (p_company_id IS NULL OR l.company_id = p_company_id) AND l.created_at >= p_da
  UNION ALL
  SELECT e.company_id, 'email_triage',
         CASE WHEN e.classificato_da = 'haiku' THEN 'con_ai' ELSE 'senza_ai' END,
         CASE WHEN e.classificato_da = 'haiku' THEN 1 ELSE 0 END
    FROM public.email_inbox e
   WHERE (p_company_id IS NULL OR e.company_id = p_company_id)
     AND e.received_at >= p_da
     AND e.classificato_da IS NOT NULL
     AND e.company_id IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.lavori_ai_periodo(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lavori_ai_periodo(uuid, timestamptz) TO service_role;

-- ── 2. metriche della singola azienda ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.metriche_ai_azienda(p_company_id uuid, p_giorni integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_da timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_giorni, 30), 366)));
  v_compiti jsonb;
  v_lavori jsonb;
  v_flussi jsonb;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) OR public.utente_e_cliente_esterno() THEN
    RAISE EXCEPTION 'Accesso non autorizzato a questa azienda' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.addebitato_eur DESC), '[]'::jsonb) INTO v_compiti
    FROM (
      SELECT compito, origine, count(*) AS chiamate,
             count(*) FILTER (WHERE addebitato) AS addebitate,
             round(sum(addebitato_eur), 4) AS addebitato_eur,
             round(sum(addebitato_eur) / NULLIF(count(*) FILTER (WHERE addebitato), 0), 4) AS costo_medio_eur
        FROM (
          SELECT l.task_key compito, 'router' origine, (l.status = 'success' AND l.cost_billed_eur > 0) addebitato, l.cost_billed_eur addebitato_eur
            FROM public.ai_call_ledger l WHERE l.company_id = p_company_id AND l.created_at >= v_da
          UNION ALL
          SELECT m.task_kind, 'diretta', COALESCE(m.credits_deducted, false), COALESCE(m.cost_billed_eur, 0)
            FROM public.ai_model_usage_log m WHERE m.company_id = p_company_id AND m.ts >= v_da
        ) c
       GROUP BY compito, origine
    ) t;

  SELECT jsonb_build_object(
           'totali', count(*),
           'senza_ai', count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')),
           'con_ai', count(*) FILTER (WHERE esito = 'con_ai'),
           'eccezioni', count(*) FILTER (WHERE esito = 'eccezione'),
           'pct_senza_ai', round(100.0 * count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) / NULLIF(count(*), 0), 1),
           'chiamate_ai', COALESCE(sum(chiamate_ai), 0))
    INTO v_lavori
    FROM public.lavori_ai_periodo(p_company_id, v_da);

  SELECT COALESCE(jsonb_agg(f ORDER BY f.totali DESC), '[]'::jsonb) INTO v_flussi
    FROM (
      SELECT flusso, count(*) totali,
             count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) senza_ai,
             round(100.0 * count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) / NULLIF(count(*), 0), 1) pct_senza_ai,
             COALESCE(sum(chiamate_ai), 0) chiamate_ai
        FROM public.lavori_ai_periodo(p_company_id, v_da)
       GROUP BY flusso
    ) f;

  RETURN jsonb_build_object('giorni', p_giorni, 'compiti', v_compiti, 'lavori', v_lavori, 'flussi', v_flussi);
END;
$$;
REVOKE ALL ON FUNCTION public.metriche_ai_azienda(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metriche_ai_azienda(uuid, integer) TO authenticated, service_role;

-- ── 3. la piattaforma intera, per il super admin ───────────────────────────
CREATE OR REPLACE FUNCTION public.ai_metriche_piattaforma(p_giorni integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_da timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_giorni, 30), 366)));
  v_aziende jsonb;
  v_compiti jsonb;
  v_flussi jsonb;
  v_totali jsonb;
  v_interno jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'solo super admin' USING ERRCODE = '42501';
  END IF;

  DROP TABLE IF EXISTS _consumi_ai;
  CREATE TEMP TABLE _consumi_ai ON COMMIT DROP AS
    SELECT l.company_id, l.task_key compito, 'router'::text origine,
           (l.status = 'success' AND l.cost_billed_eur > 0) addebitato,
           COALESCE(l.cost_real_eur, 0) costo_eur, COALESCE(l.cost_billed_eur, 0) addebitato_eur
      FROM public.ai_call_ledger l WHERE l.created_at >= v_da AND l.status <> 'error'
    UNION ALL
    SELECT m.company_id, m.task_kind, 'diretta', COALESCE(m.credits_deducted, false),
           COALESCE(m.cost_real_eur, m.cost_usd * 0.92, 0), COALESCE(m.cost_billed_eur, 0)
      FROM public.ai_model_usage_log m WHERE m.ts >= v_da AND m.company_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(a ORDER BY a.costo_reale_eur DESC), '[]'::jsonb) INTO v_aziende
    FROM (
      SELECT c.company_id, co.name AS azienda,
             count(*) chiamate, count(*) FILTER (WHERE c.addebitato) addebitate,
             round(sum(c.costo_eur), 4) costo_reale_eur, round(sum(c.addebitato_eur), 4) addebitato_eur,
             round(sum(c.addebitato_eur) / NULLIF(count(*) FILTER (WHERE c.addebitato), 0), 4) costo_medio_eur,
             round(sum(c.costo_eur) FILTER (WHERE NOT c.addebitato), 4) costo_non_addebitato_eur,
             (SELECT round(100.0 * count(*) FILTER (WHERE lp.esito IN ('senza_ai', 'dato_gia_presente')) / NULLIF(count(*), 0), 1)
                FROM public.lavori_ai_periodo(c.company_id, v_da) lp) pct_lavori_senza_ai
        FROM _consumi_ai c LEFT JOIN public.companies co ON co.id = c.company_id
       GROUP BY c.company_id, co.name
    ) a;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.costo_reale_eur DESC), '[]'::jsonb) INTO v_compiti
    FROM (
      SELECT compito, origine, count(*) chiamate, count(*) FILTER (WHERE addebitato) addebitate,
             round(sum(costo_eur), 4) costo_reale_eur, round(sum(addebitato_eur), 4) addebitato_eur,
             round(sum(addebitato_eur) / NULLIF(count(*) FILTER (WHERE addebitato), 0), 4) costo_medio_eur
        FROM _consumi_ai GROUP BY compito, origine
    ) t;

  SELECT COALESCE(jsonb_agg(f ORDER BY f.totali DESC), '[]'::jsonb) INTO v_flussi
    FROM (
      SELECT flusso, count(*) totali,
             count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) senza_ai,
             round(100.0 * count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) / NULLIF(count(*), 0), 1) pct_senza_ai,
             COALESCE(sum(chiamate_ai), 0) chiamate_ai
        FROM public.lavori_ai_periodo(NULL, v_da) GROUP BY flusso
    ) f;

  SELECT jsonb_build_object(
           'chiamate', count(*), 'addebitate', count(*) FILTER (WHERE addebitato),
           'costo_reale_eur', round(sum(costo_eur), 4), 'addebitato_eur', round(sum(addebitato_eur), 4),
           'costo_medio_eur', round(sum(addebitato_eur) / NULLIF(count(*) FILTER (WHERE addebitato), 0), 4),
           'pct_lavori_senza_ai', (SELECT round(100.0 * count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) / NULLIF(count(*), 0), 1)
                                     FROM public.lavori_ai_periodo(NULL, v_da)))
    INTO v_totali FROM _consumi_ai;

  -- Costi della piattaforma: senza azienda (router, diretta, registro interno).
  SELECT jsonb_build_object(
           'router_senza_azienda_usd', (SELECT round(COALESCE(sum(cost_usd), 0), 4) FROM public.ai_router_usage_log
                                         WHERE created_at >= v_da AND company_id IS NULL AND status = 'success'),
           'diretta_senza_azienda_usd', (SELECT round(COALESCE(sum(cost_usd), 0), 4) FROM public.ai_model_usage_log
                                          WHERE ts >= v_da AND company_id IS NULL),
           -- senza le righe che il router scrive anche qui (già contate sopra)
           'registro_interno_usd', (SELECT round(COALESCE(sum(cost_real_usd), 0), 4) FROM public.platform_ai_usage_log
                                     WHERE created_at >= v_da AND COALESCE(metadata->>'origine', '') <> 'ai_router'))
    INTO v_interno;

  RETURN jsonb_build_object('giorni', p_giorni, 'totali', v_totali, 'aziende', v_aziende,
                            'compiti', v_compiti, 'flussi', v_flussi, 'interno', v_interno);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metriche_piattaforma(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metriche_piattaforma(integer) TO authenticated, service_role;

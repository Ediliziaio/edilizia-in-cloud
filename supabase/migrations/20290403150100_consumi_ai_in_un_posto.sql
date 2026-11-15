-- Consumo AI in un posto solo, regola del ricarico esplicita, lavori chiusi senza AI.
-- Censimento del 15/11/2026: docs/ai-addebiti-censimento.md.
--
-- 1. `consumi_ai_azienda`: le due strade di addebito (router → ai_call_ledger,
--    chiamate dirette → ai_model_usage_log) in una vista sola, con i soli campi
--    che l'azienda deve vedere (niente costo nostro né ricarico). security_invoker:
--    valgono le regole delle due tabelle.
-- 2. La lettura di ai_model_usage_log allineata a quella di ai_call_ledger: i
--    clienti esterni del portale (ruolo customer) non leggevano il registro del
--    router ma potevano leggere quello diretto.
-- 3. `ai_regole_ricarico(giorni)`: per il super admin, da dove viene il ricarico
--    di ogni compito e quanto vale davvero (addebitato / costo). Nessun prezzo cambia.
-- 4. `lavori_ai_esiti` + `registra_esito_lavoro_ai` + `metriche_ai_azienda`:
--    quanti lavori si chiudono senza AI, costo medio, chiamate per tipo.

SET LOCAL lock_timeout = '3s';

-- ── 2. lettura del registro diretto ────────────────────────────────────────
DROP POLICY IF EXISTS usage_company_read ON public.ai_model_usage_log;
CREATE POLICY usage_company_read ON public.ai_model_usage_log
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    OR (company_id = (SELECT public.get_my_company_id())
        AND NOT (SELECT public.utente_e_cliente_esterno()))
  );

-- ── 1. vista unica dei consumi ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.consumi_ai_azienda
WITH (security_invoker = true) AS
SELECT
  l.id,
  l.company_id,
  l.user_id,
  l.created_at,
  'router'::text                       AS origine,
  l.task_key                           AS compito,
  l.persona_key,
  l.model_used                         AS modello,
  COALESCE(l.tokens_in, 0)             AS tokens_in,
  COALESCE(l.tokens_out, 0)            AS tokens_out,
  COALESCE(l.cost_billed_eur, 0)       AS addebitato_eur,
  l.status                             AS stato,
  (l.status = 'success' AND COALESCE(l.cost_billed_eur, 0) > 0) AS addebitato,
  CASE
    WHEN l.status = 'skipped' AND l.task_key = 'planimetria_genera' THEN 'pagato in crediti render'
    WHEN l.status = 'skipped' THEN 'non addebitato: ' || COALESCE(l.metadata->>'motivo', l.metadata->>'skip_reason', 'interno')
    WHEN l.status = 'unbilled_fail_open' THEN 'non addebitato: registro non raggiungibile'
    WHEN l.status IN ('error', 'timeout') THEN 'chiamata non riuscita'
    WHEN l.metadata ? 'ripetizione_di' THEN 'stessa richiesta ripetuta'
    ELSE NULL
  END                                  AS nota
FROM public.ai_call_ledger l
UNION ALL
SELECT
  m.id,
  m.company_id,
  NULLIF(m.metadata->>'user_id', '')::uuid,
  m.ts,
  'diretta'::text,
  m.task_kind,
  NULL::text,
  m.model_used,
  COALESCE(m.tokens_prompt, 0),
  COALESCE(m.tokens_completion, 0),
  COALESCE(m.cost_billed_eur, 0),
  CASE WHEN m.ok THEN 'success' ELSE 'error' END,
  COALESCE(m.credits_deducted, false),
  CASE
    WHEN m.error_code = 'non_addebitato' THEN 'non addebitato: ' || COALESCE(m.error_detail, '?')
    WHEN NOT m.ok THEN 'chiamata non riuscita'
    ELSE NULL
  END
FROM public.ai_model_usage_log m
WHERE m.company_id IS NOT NULL;

REVOKE ALL ON public.consumi_ai_azienda FROM PUBLIC, anon;
GRANT SELECT ON public.consumi_ai_azienda TO authenticated, service_role;

-- ── 3. regola del ricarico, per compito ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_regole_ricarico(p_giorni integer DEFAULT 30)
RETURNS TABLE (
  origine text, compito text, regola text, chiamate bigint, addebitate bigint,
  costo_reale_eur numeric, addebitato_eur numeric, ricarico_effettivo_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'solo super admin' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH router AS (
    SELECT 'router'::text o, l.task_key c,
           string_agg(DISTINCT CASE WHEN l.pricing_override_id IS NOT NULL
                                    THEN 'override azienda (ai_pricing_overrides)'
                                    ELSE 'tier ' || l.tier_key || ' (ai_pricing_tiers, ' || round(l.applied_markup_pct) || '%, pavimento min_markup_multiplier)'
                               END, '; ') r,
           count(*) n, count(*) FILTER (WHERE l.cost_billed_eur > 0) na,
           sum(l.cost_real_eur) cr, sum(l.cost_billed_eur) cb
      FROM public.ai_call_ledger l
     WHERE l.created_at >= now() - make_interval(days => p_giorni)
     GROUP BY 2
  ), diretta AS (
    SELECT 'diretta'::text o, m.task_kind c,
           string_agg(DISTINCT 'ai_pricing_markup: ' || COALESCE(m.metadata->>'markup_source', 'interno/non addebitato'), '; ') r,
           count(*) n, count(*) FILTER (WHERE m.credits_deducted) na,
           sum(m.cost_real_eur) cr, sum(m.cost_billed_eur) cb
      FROM public.ai_model_usage_log m
     WHERE m.ts >= now() - make_interval(days => p_giorni)
     GROUP BY 2
  )
  SELECT x.o, x.c, x.r, x.n, x.na, round(x.cr, 4), round(x.cb, 4),
         CASE WHEN COALESCE(x.cr, 0) > 0 THEN round((x.cb / x.cr - 1) * 100, 0) END
    FROM (SELECT * FROM router UNION ALL SELECT * FROM diretta) x
   ORDER BY x.cr DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_regole_ricarico(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_regole_ricarico(integer) TO authenticated, service_role;

-- ── 4. lavori chiusi con e senza AI ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lavori_ai_esiti (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  flusso       text NOT NULL,          -- es. 'fattura_classifica', 'ddt_lettura'
  chiave       text NOT NULL,          -- id del documento/lavoro (idempotenza)
  esito        text NOT NULL CHECK (esito IN ('senza_ai', 'con_ai', 'dato_gia_presente', 'eccezione')),
  chiamate_ai  integer NOT NULL DEFAULT 0 CHECK (chiamate_ai >= 0),
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, flusso, chiave)
);
CREATE INDEX IF NOT EXISTS ix_lavori_ai_esiti_company_data ON public.lavori_ai_esiti (company_id, created_at DESC);
ALTER TABLE public.lavori_ai_esiti ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lavori_ai_esiti_lettura ON public.lavori_ai_esiti;
CREATE POLICY lavori_ai_esiti_lettura ON public.lavori_ai_esiti
  FOR SELECT TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    OR (company_id = (SELECT public.get_my_company_id())
        AND NOT (SELECT public.utente_e_cliente_esterno()))
  );
REVOKE ALL ON public.lavori_ai_esiti FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lavori_ai_esiti TO authenticated;
GRANT ALL ON public.lavori_ai_esiti TO service_role;

-- Un lavoro = una riga: lo stesso documento rielaborato aggiorna la riga e
-- somma le chiamate, così il conto delle chiamate resta vero.
CREATE OR REPLACE FUNCTION public.registra_esito_lavoro_ai(
  p_company_id uuid, p_flusso text, p_chiave text, p_esito text,
  p_chiamate_ai integer DEFAULT 0, p_motivo text DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.lavori_ai_esiti (company_id, flusso, chiave, esito, chiamate_ai, motivo)
  VALUES (p_company_id, p_flusso, p_chiave, p_esito, GREATEST(COALESCE(p_chiamate_ai, 0), 0), p_motivo)
  ON CONFLICT (company_id, flusso, chiave) DO UPDATE
     SET esito = EXCLUDED.esito,
         chiamate_ai = public.lavori_ai_esiti.chiamate_ai + EXCLUDED.chiamate_ai,
         motivo = COALESCE(EXCLUDED.motivo, public.lavori_ai_esiti.motivo),
         updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.registra_esito_lavoro_ai(uuid, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registra_esito_lavoro_ai(uuid, text, text, text, integer, text) TO service_role;

-- Le metriche per il titolare: chiamate e importo per compito, costo medio,
-- lavori chiusi senza AI. Solo la propria azienda (o il super admin).
CREATE OR REPLACE FUNCTION public.metriche_ai_azienda(p_company_id uuid, p_giorni integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
    FROM public.lavori_ai_esiti WHERE company_id = p_company_id AND created_at >= v_da;

  SELECT COALESCE(jsonb_agg(f ORDER BY f.totali DESC), '[]'::jsonb) INTO v_flussi
    FROM (
      SELECT flusso, count(*) totali,
             count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) senza_ai,
             round(100.0 * count(*) FILTER (WHERE esito IN ('senza_ai', 'dato_gia_presente')) / NULLIF(count(*), 0), 1) pct_senza_ai,
             COALESCE(sum(chiamate_ai), 0) chiamate_ai
        FROM public.lavori_ai_esiti WHERE company_id = p_company_id AND created_at >= v_da
       GROUP BY flusso
    ) f;

  RETURN jsonb_build_object('giorni', p_giorni, 'compiti', v_compiti, 'lavori', v_lavori, 'flussi', v_flussi);
END;
$$;
REVOKE ALL ON FUNCTION public.metriche_ai_azienda(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.metriche_ai_azienda(uuid, integer) TO authenticated, service_role;

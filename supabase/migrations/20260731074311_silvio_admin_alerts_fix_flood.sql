-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- silvio_admin_alerts: fix del flood (89.807 alert, 100% categoria 'lead')
--
-- ROOT CAUSE (audit 2026-07-31): il detector #2 "DEMO REQUEST RECENT" di
-- silvio_admin_alerts_runner() alertava OGNI contatto marketing nuovo per via
-- di `... OR mc.contact_type = 'lead'`: lo scraper/autopilot crea migliaia di
-- contatti (tutti contact_type='lead') → 1 alert per contatto (dedup_key
-- distinto per id) → ~3.000 alert/giorno, tutti 'open', mai gestiti.
-- occurrences≈2 perché il runner (ogni 15min) ricattura ogni contatto due
-- volte nella finestra da 30 minuti.
--
-- Interventi:
--   1) Runner: il detector #2 scatta SOLO per vere demo request (source
--      ILIKE '%demo%'), come da intento del commento originale.
--   2) silvio_cleanup_old_alerts(): esteso a silvio_admin_alerts (prima
--      copriva SOLO silvio_alerts azienda): gestiti >30gg, scaduti da >7gg,
--      rete di sicurezza open >60gg.
--   3) Purge una-tantum del rumore: alert 'demo_request:%' open più vecchi
--      di 48h (operativamente morti: l'azione suggerita è "contatta entro
--      1 ora"). Restano gli ultimi 2 giorni e tutte le altre categorie.

-- ── 1) Runner: detector demo-request senza l'OR esplosivo ───────────────────
CREATE OR REPLACE FUNCTION public.silvio_admin_alerts_runner()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alerts_created INT := 0;
  v_alerts_dedup   INT := 0;
  v_rec            RECORD;
BEGIN

  -- ─────────────────────────────────────────────────────────────────────
  -- 1. PAYMENT FAILED — subscription past_due/unpaid recente
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT s.company_id, c.name AS company_name, s.id AS sub_id, s.status::text AS sub_status
      FROM public.subscriptions s
      LEFT JOIN public.companies c ON c.id = s.company_id
      WHERE s.status::text IN ('past_due', 'unpaid')
        AND s.updated_at >= now() - interval '24 hours'
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'revenue',
        'critical',
        '🚨 Pagamento fallito: ' || COALESCE(v_rec.company_name, 'Sconosciuta'),
        'Subscription ' || v_rec.sub_status || ' — verificare carta cliente',
        'payment_failed:' || v_rec.sub_id,
        jsonb_build_object('type', 'company', 'id', v_rec.company_id, 'name', v_rec.company_name),
        'Manda email recovery + check carta scaduta'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- subscriptions table non disponibile, skip
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 2. DEMO REQUEST RECENT — nuovo lead source=demo_request <30min
  --    FIX flood: SOLO source demo. L'`OR contact_type='lead'` originale
  --    alertava ogni contatto creato dallo scraper (~3k/giorno → 89k righe).
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT mc.id, mc.first_name, mc.last_name, mc.email, mc.company_name, mc.source
      FROM public.marketing_contacts mc
      WHERE mc.created_at >= now() - interval '30 minutes'
        AND mc.source ILIKE '%demo%'
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'lead',
        'warning',
        '⚠️ Demo request: ' || COALESCE(v_rec.first_name || ' ' || v_rec.last_name, v_rec.email, 'Sconosciuto'),
        COALESCE(v_rec.company_name || ' — ', '') || 'arrivato negli ultimi 30 min via ' || COALESCE(v_rec.source, 'demo'),
        'demo_request:' || v_rec.id,
        jsonb_build_object('type', 'lead', 'id', v_rec.id, 'email', v_rec.email),
        'Contatta entro 1 ora — conversion rate scende del 60% dopo'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 3. LEAD SILENT HOT — lead score >80 e non contattato da >48h
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT mc.id, mc.first_name, mc.last_name, mc.company_name, mc.email,
             COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) AS score_eff,
             mc.last_activity_at
      FROM public.marketing_contacts mc
      WHERE COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) >= 80
        AND COALESCE(mc.last_activity_at, mc.created_at) <= now() - interval '48 hours'
        AND COALESCE(mc.last_activity_at, mc.created_at) >= now() - interval '14 days'  -- evita lead vecchissimi
        AND (mc.contact_type IS NULL OR mc.contact_type IN ('lead','prospect'))
      LIMIT 50
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'lead',
        'warning',
        '🔥 Lead caldo silente: ' || COALESCE(v_rec.first_name || ' ' || v_rec.last_name, v_rec.email),
        'Score ' || v_rec.score_eff || ' · non contattato da ' ||
        ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(v_rec.last_activity_at, now()))) / 86400) || ' giorni',
        'lead_silent_hot:' || v_rec.id,
        jsonb_build_object('type', 'lead', 'id', v_rec.id, 'score', v_rec.score_eff),
        'Manda follow-up oggi — score sta degradando'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 4. CHURN WARNING — cliente paying che non si logga da >14gg
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT
        c.id AS company_id,
        c.name AS company_name,
        MAX(u.last_sign_in_at) AS last_login,
        EXTRACT(EPOCH FROM (now() - MAX(u.last_sign_in_at))) / 86400 AS days_silent
      FROM public.companies c
      JOIN public.profiles p ON p.company_id = c.id
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.subscriptions s ON s.company_id = c.id AND s.status::text = 'active'
      WHERE c.is_platform_admin_company = false
        AND s.id IS NOT NULL  -- è paying
      GROUP BY c.id, c.name
      HAVING MAX(u.last_sign_in_at) <= now() - interval '14 days'
         AND MAX(u.last_sign_in_at) IS NOT NULL
      LIMIT 30
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'churn',
        'warning',
        '⚠️ Churn risk: ' || COALESCE(v_rec.company_name, 'Sconosciuta'),
        'Nessun login da ' || ROUND(v_rec.days_silent) || ' giorni — possibile abbandono',
        'churn_warning:' || v_rec.company_id,
        jsonb_build_object('type', 'company', 'id', v_rec.company_id, 'name', v_rec.company_name, 'days_silent', v_rec.days_silent),
        'Manda email check-in proattivo + offri sessione 1:1'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 5. ERRORS 5XX SPIKE — edge function failing rate >5/15min
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT
        task_kind,
        COUNT(*) AS n_errors
      FROM public.ai_model_usage_log
      WHERE ts >= now() - interval '15 minutes'
        AND ok = false
      GROUP BY task_kind
      HAVING COUNT(*) > 5
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'product',
        'critical',
        '🔥 Errori AI spike: ' || v_rec.task_kind,
        v_rec.n_errors || ' errori in 15 min su task ' || v_rec.task_kind,
        'errors_5xx_spike:' || v_rec.task_kind,
        jsonb_build_object('type', 'task_kind', 'name', v_rec.task_kind, 'errors', v_rec.n_errors),
        'Check Supabase logs + verifica rate limit OpenRouter'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ran_at', now(),
    'alerts_processed', v_alerts_created,
    'rules_executed', 5
  );
END;
$function$;

-- ── 2) Cleanup esteso: anche silvio_admin_alerts (prima solo silvio_alerts) ──
CREATE OR REPLACE FUNCTION public.silvio_cleanup_old_alerts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v1 int := 0; v2 int := 0; v3 int := 0; v4 int := 0;
BEGIN
  -- Alert aziendali (comportamento originale invariato)
  DELETE FROM public.silvio_alerts
  WHERE status IN ('resolved', 'dismissed', 'expired')
    AND COALESCE(resolved_at, updated_at) < now() - interval '30 days';
  GET DIAGNOSTICS v1 = ROW_COUNT;

  -- Admin alerts gestiti (non-open) più vecchi di 30gg
  DELETE FROM public.silvio_admin_alerts
  WHERE status <> 'open'
    AND COALESCE(acted_at, updated_at, created_at) < now() - interval '30 days';
  GET DIAGNOSTICS v2 = ROW_COUNT;

  -- Admin alerts con expires_at passata da più di 7gg
  DELETE FROM public.silvio_admin_alerts
  WHERE expires_at IS NOT NULL
    AND expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v3 = ROW_COUNT;

  -- Rete di sicurezza: admin alerts 'open' dimenticati da più di 60gg
  DELETE FROM public.silvio_admin_alerts
  WHERE status = 'open'
    AND created_at < now() - interval '60 days';
  GET DIAGNOSTICS v4 = ROW_COUNT;

  RETURN v1 + v2 + v3 + v4;
END;
$function$;

-- ── 3) Purge una-tantum del flood demo_request (open, >48h) ─────────────────
DELETE FROM public.silvio_admin_alerts
WHERE category = 'lead'
  AND status = 'open'
  AND dedup_key LIKE 'demo_request:%'
  AND created_at < now() - interval '48 hours';

-- MP-OPS-03 — Giornale Cantiere Auto-Generato (cron 18:00 daily)
-- ════════════════════════════════════════════════════════════════════════════
-- Estende giornale_lavori esistente con flag generation_method, AI metadata,
-- aggregati origine (rapportini/foto/DDT/segnalazioni), firma PM hash,
-- archiviazione sostitutiva.
--
-- Defensive: rapportini/cantiere_photos non esistono → tools usano fallback.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Estensione giornale_lavori
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.giornale_lavori
  ADD COLUMN IF NOT EXISTS generation_method text NOT NULL DEFAULT 'manual'
    CHECK (generation_method IN ('manual','auto_ai','imported')),
  ADD COLUMN IF NOT EXISTS ai_persona_used text,
  ADD COLUMN IF NOT EXISTS ai_cost_billed_eur numeric(10,4),
  ADD COLUMN IF NOT EXISTS ai_confidence numeric(3,2),

  -- Aggregati origine (per audit + rigenerazione)
  ADD COLUMN IF NOT EXISTS source_rapportini_ids uuid[],
  ADD COLUMN IF NOT EXISTS source_foto_ids uuid[],
  ADD COLUMN IF NOT EXISTS source_ddt_ids uuid[],
  ADD COLUMN IF NOT EXISTS source_segnalazioni_ids uuid[],

  -- Firma + archiviazione
  ADD COLUMN IF NOT EXISTS pm_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pm_signature_hash text,
  ADD COLUMN IF NOT EXISTS archived_storage_path text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,

  -- Notifiche DL
  ADD COLUMN IF NOT EXISTS dl_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dl_notification_method text;

CREATE INDEX IF NOT EXISTS idx_giornale_company_date
  ON public.giornale_lavori(company_id, data_lavori DESC);
CREATE INDEX IF NOT EXISTS idx_giornale_order_date
  ON public.giornale_lavori(order_id, data_lavori DESC);
CREATE INDEX IF NOT EXISTS idx_giornale_unsigned
  ON public.giornale_lavori(generation_method, pm_signed_at)
  WHERE generation_method = 'auto_ai' AND pm_signed_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Settings company + orders
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS giornale_auto_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS giornale_auto_hour int NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS giornale_auto_notify_dl boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS giornale_auto_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dl_notification_email text,
  ADD COLUMN IF NOT EXISTS dl_notification_phone text;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) RPC: silvio_tool_genera_giornale (placeholder + idempotenza, edge fa il resto)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_genera_giornale(
  p_company_id uuid,
  p_user_id uuid,
  p_cantiere_id uuid,
  p_data date DEFAULT NULL,
  p_force_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cantiere RECORD;
  v_target_date date;
  v_existing_id uuid;
BEGIN
  v_target_date := COALESCE(p_data, CURRENT_DATE);

  SELECT id, order_code, company_id INTO v_cantiere
    FROM public.orders WHERE id = p_cantiere_id;

  IF v_cantiere IS NULL OR v_cantiere.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Cantiere non trovato per questa azienda');
  END IF;

  -- Idempotenza
  SELECT id INTO v_existing_id
    FROM public.giornale_lavori
   WHERE order_id = p_cantiere_id AND data_lavori = v_target_date
   LIMIT 1;

  IF v_existing_id IS NOT NULL AND NOT p_force_regenerate THEN
    RETURN jsonb_build_object(
      'success', true,
      'giornale_id', v_existing_id,
      'already_exists', true,
      'cantiere_code', v_cantiere.order_code,
      'data_lavori', v_target_date
    );
  END IF;

  -- Crea/aggiorna placeholder. Edge function genera-giornale-cantiere-async
  -- popolerà i campi AI + lavorazioni_eseguite + materiali_utilizzati + ecc.
  INSERT INTO public.giornale_lavori (
    company_id, order_id, data_lavori,
    generation_method, ai_persona_used,
    created_by, visibile_cliente
  ) VALUES (
    p_company_id, p_cantiere_id, v_target_date,
    'auto_ai', 'pm_cantiere',
    p_user_id, false
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_existing_id;

  IF v_existing_id IS NULL THEN
    SELECT id INTO v_existing_id
      FROM public.giornale_lavori
     WHERE order_id = p_cantiere_id AND data_lavori = v_target_date
     LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'giornale_id', v_existing_id,
    'pending', true,
    'cantiere_id', p_cantiere_id,
    'cantiere_code', v_cantiere.order_code,
    'data_lavori', v_target_date,
    'message', format('Giornale per cantiere %s del %s in elaborazione...', v_cantiere.order_code, v_target_date)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_genera_giornale(uuid, uuid, uuid, date, boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_giornale(uuid, uuid, uuid, date, boolean)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPC: silvio_tool_approva_giornale (firma PM digitale)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_approva_giornale(
  p_company_id uuid,
  p_user_id uuid,
  p_giornale_id uuid,
  p_observations text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_giornale RECORD;
  v_signature_hash text;
BEGIN
  SELECT id, company_id, order_id, data_lavori, pm_signed_at, lavorazioni_eseguite
    INTO v_giornale
    FROM public.giornale_lavori WHERE id = p_giornale_id;

  IF v_giornale IS NULL OR v_giornale.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Giornale non trovato');
  END IF;

  IF v_giornale.pm_signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Giornale già firmato', 'signed_at', v_giornale.pm_signed_at);
  END IF;

  -- Hash deterministico = sha256(giornale_id + user_id + lavorazioni + timestamp)
  v_signature_hash := encode(
    digest(
      p_giornale_id::text || p_user_id::text ||
      COALESCE(v_giornale.lavorazioni_eseguite, '') ||
      NOW()::text,
      'sha256'
    ),
    'hex'
  );

  UPDATE public.giornale_lavori
     SET pm_signed_at = NOW(),
         pm_signature_hash = v_signature_hash,
         firmato_da = p_user_id::text,
         firmato_il = NOW(),
         note = CASE
           WHEN p_observations IS NOT NULL
           THEN COALESCE(note, '') || E'\n\n[Osservazioni firma]: ' || p_observations
           ELSE note
         END
   WHERE id = p_giornale_id;

  RETURN jsonb_build_object(
    'success', true,
    'giornale_id', p_giornale_id,
    'signature_hash', v_signature_hash,
    'signed_at', NOW(),
    'message', format('Giornale del %s firmato digitalmente', v_giornale.data_lavori)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_approva_giornale(uuid, uuid, uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_approva_giornale(uuid, uuid, uuid, text)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RPC: silvio_tool_aggiorna_giornale_evento
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_aggiorna_giornale_evento(
  p_company_id uuid,
  p_user_id uuid,
  p_cantiere_id uuid,
  p_data date,
  p_evento_type text,
  p_evento_descrizione text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_giornale RECORD;
  v_event_line text;
BEGIN
  SELECT id, note, lavorazioni_eseguite, pm_signed_at INTO v_giornale
    FROM public.giornale_lavori
   WHERE order_id = p_cantiere_id AND data_lavori = p_data
   LIMIT 1;

  IF v_giornale IS NULL THEN
    RETURN jsonb_build_object('error', 'Giornale del giorno non trovato. Crealo prima.');
  END IF;

  IF v_giornale.pm_signed_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Giornale già firmato. Modifiche non consentite.');
  END IF;

  v_event_line := format('• [%s · %s] %s',
    to_char(NOW(), 'HH24:MI'),
    p_evento_type,
    p_evento_descrizione);

  UPDATE public.giornale_lavori
     SET note = COALESCE(note, '') || E'\n' || v_event_line
   WHERE id = v_giornale.id;

  RETURN jsonb_build_object(
    'success', true,
    'giornale_id', v_giornale.id,
    'event_added', v_event_line
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_aggiorna_giornale_evento(uuid, uuid, uuid, date, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_aggiorna_giornale_evento(uuid, uuid, uuid, date, text, text)
  TO service_role;

-- MP-FAT-02 + MP-FAT-03 + MP-OPS-02 + MP-OPS-03 + MP-SALES-02
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge i 14 nuovi tool al set allowed_tools delle personas appropriate.
-- Pattern: append in array unique (idempotente con jsonb operators).
-- ════════════════════════════════════════════════════════════════════════════

-- Helper inline: append tool a allowed_tools se non già presente
CREATE OR REPLACE FUNCTION public.tg_append_persona_tool(
  p_persona_key text,
  p_tool_name text
)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.ai_personas
     SET allowed_tools = allowed_tools || jsonb_build_array(p_tool_name)
   WHERE persona_key = p_persona_key
     AND NOT (allowed_tools @> jsonb_build_array(p_tool_name));
END $$;

-- ── Silvio: META — riceve TUTTI i nuovi tool ────────────────────────────────
SELECT public.tg_append_persona_tool('silvio', t)
  FROM (VALUES
    ('verifica_anagrafica_fattura'),
    ('avanza_fatt_zero_touch'),
    ('lista_fatt_zero_touch_runs'),
    ('flag_anomalia_finanziaria'),
    ('lista_anomalie_aperte'),
    ('detect_duplicate_payments'),
    ('lista_cantieri_per_briefing'),
    ('log_briefing_sent'),
    ('genera_giornale_cantiere'),
    ('approva_giornale_cantiere'),
    ('aggiorna_giornale_evento'),
    ('crea_preventivo_da_foto'),
    ('lista_preventivi_da_foto_draft')
  ) AS x(t);

-- ── Amministrazione: fatturazione zero-touch + anomalie ─────────────────────
SELECT public.tg_append_persona_tool('amministrazione', t)
  FROM (VALUES
    ('verifica_anagrafica_fattura'),
    ('lista_fatt_zero_touch_runs'),
    ('lista_anomalie_aperte'),
    ('detect_duplicate_payments')
  ) AS x(t);

-- ── CFO: anomalie + dashboard fatturazione ──────────────────────────────────
SELECT public.tg_append_persona_tool('cfo', t)
  FROM (VALUES
    ('lista_fatt_zero_touch_runs'),
    ('flag_anomalia_finanziaria'),
    ('lista_anomalie_aperte'),
    ('detect_duplicate_payments')
  ) AS x(t);

-- ── Controller: anomalie + duplicate detection ──────────────────────────────
SELECT public.tg_append_persona_tool('controller', t)
  FROM (VALUES
    ('flag_anomalia_finanziaria'),
    ('lista_anomalie_aperte'),
    ('detect_duplicate_payments')
  ) AS x(t);

-- ── Compliance: anomalie + DURC ──────────────────────────────────────────────
SELECT public.tg_append_persona_tool('compliance', t)
  FROM (VALUES
    ('flag_anomalia_finanziaria'),
    ('lista_anomalie_aperte')
  ) AS x(t);

-- ── PM Cantiere: giornale + briefing + preventivo da foto ───────────────────
SELECT public.tg_append_persona_tool('pm_cantiere', t)
  FROM (VALUES
    ('lista_cantieri_per_briefing'),
    ('genera_giornale_cantiere'),
    ('approva_giornale_cantiere'),
    ('aggiorna_giornale_evento'),
    ('crea_preventivo_da_foto'),
    ('lista_preventivi_da_foto_draft')
  ) AS x(t);

-- ── Capocantiere: giornale (no firma) + aggiorna evento ─────────────────────
SELECT public.tg_append_persona_tool('capocantiere', t)
  FROM (VALUES
    ('genera_giornale_cantiere'),
    ('aggiorna_giornale_evento')
  ) AS x(t);

-- ── Sales: preventivo da foto ───────────────────────────────────────────────
SELECT public.tg_append_persona_tool('sales', t)
  FROM (VALUES
    ('crea_preventivo_da_foto'),
    ('lista_preventivi_da_foto_draft'),
    ('verifica_anagrafica_fattura')
  ) AS x(t);

-- ── Direttore Vendite: preventivo da foto + lista draft ─────────────────────
SELECT public.tg_append_persona_tool('direttore_vendite', t)
  FROM (VALUES
    ('crea_preventivo_da_foto'),
    ('lista_preventivi_da_foto_draft')
  ) AS x(t);

-- ── Tecnico: preventivo da foto + giornale (read-only) ──────────────────────
SELECT public.tg_append_persona_tool('tecnico', t)
  FROM (VALUES
    ('crea_preventivo_da_foto'),
    ('lista_preventivi_da_foto_draft'),
    ('genera_giornale_cantiere')
  ) AS x(t);

-- ── Assistente Imprenditore: dashboard cross-feature ────────────────────────
SELECT public.tg_append_persona_tool('assistente_imprenditore', t)
  FROM (VALUES
    ('lista_fatt_zero_touch_runs'),
    ('lista_anomalie_aperte'),
    ('lista_preventivi_da_foto_draft')
  ) AS x(t);

-- Drop helper function (one-shot use)
DROP FUNCTION IF EXISTS public.tg_append_persona_tool(text, text);

-- Verifica copertura
DO $$
DECLARE
  v_silvio_tools int;
BEGIN
  SELECT jsonb_array_length(allowed_tools) INTO v_silvio_tools
    FROM public.ai_personas WHERE persona_key = 'silvio';
  RAISE NOTICE 'Silvio ora ha % tool nel registry', v_silvio_tools;
END $$;

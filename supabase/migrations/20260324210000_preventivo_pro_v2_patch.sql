-- ═══════════════════════════════════════════════════════════════
-- PREVENTIVO PRO v2 — PATCH 1
-- Aggiunge marca, modello ad article_templates (mancanti in v2 main)
-- + indice su categoria_id per le query di filtraggio del listino
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS marca  TEXT,
  ADD COLUMN IF NOT EXISTS modello TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice system fixes - Part 1: Soft-delete for documenti_fiscali
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

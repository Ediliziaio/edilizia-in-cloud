-- ============================================================================
-- 20270512 — Default IVA preventivi Serramenti → 10% (era 22%)
-- ============================================================================
-- Allinea il default DB a quello UI: per i serramenti il caso piu' comune e'
-- la ristrutturazione edilizia con IVA agevolata al 10%. Il 22% (ordinaria)
-- resta selezionabile manualmente in fase di compilazione del preventivo.
--
-- Aliquote supportate dal Select UI:
--   * 0%  — Esente / non imponibile
--   * 4%  — Prima casa (casi specifici)
--   * 10% — Ristrutturazione edilizia (DEFAULT)
--   * 22% — Ordinaria
--   * -1  — Sentinel "IVA mista" (calcolo riga-per-riga, fallback prudente 10%)
--
-- Migrazione idempotente: aggiorna solo la DEFAULT, non tocca i record esistenti.
-- I preventivi gia' creati conservano la loro aliquota originale.
-- ============================================================================

ALTER TABLE public.sr_progetti
  ALTER COLUMN iva_percentuale SET DEFAULT 10;

ALTER TABLE public.companies
  ALTER COLUMN sr_default_iva_percentuale SET DEFAULT 10;

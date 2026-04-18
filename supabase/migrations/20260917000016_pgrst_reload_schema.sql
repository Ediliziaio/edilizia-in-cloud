-- ============================================================================
-- PostgREST schema cache reload
-- ============================================================================
-- Dopo il push di migration 20260917000001..015 (13 nuove tabelle + 3 RPC +
-- estensioni JSONB), il cache di PostgREST può restare obsoleto per ~60s.
-- Questo NOTIFY forza il reload immediato così il REST endpoint vede
-- article_families, supplier_catalogs, vertical_* templates, match_* RPC
-- senza attendere l'auto-discovery.
--
-- Idempotente per design — NOTIFY non ha side-effect di stato.
-- ============================================================================

NOTIFY pgrst, 'reload schema';

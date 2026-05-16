-- v8.6.22 — Performance index per render_sessions
--
-- Audit performance: il polling client (`RenderNewV2.tsx`) fa
-- SELECT status, result_urls, error_message, processing_started_at
--   FROM render_sessions WHERE id = ?
-- Questo è già coperto dal PK index su (id).
--
-- Ma esistono query "live" (orphan detection, dashboard recent renders,
-- supervisione) tipo:
--   SELECT id FROM render_sessions
--    WHERE company_id = $1
--      AND status = 'processing'
--      AND processing_started_at < NOW() - INTERVAL '5 minutes';
--
-- Oggi questa query usa idx_render_sessions_company (su company_id)
-- e poi filtra status/processing_started_at via heap scan.
-- Con 100k+ row history su una tenant attiva diventa O(n) sulle row
-- della company anche se status='processing' è una manciata.
--
-- Aggiungiamo un index composto parziale (solo le righe attive):
-- riduce lo scope al subset minimale che ci interessa per orphan/health
-- check (~10-50 row anche su tenant grande), garantendo seek O(log n).

-- NOTA: niente CONCURRENTLY perché Supabase migrate wraps in transaction.
-- L'index sarà costruito con AccessExclusiveLock breve sulla tabella —
-- accettabile perché render_sessions ha tipicamente <100k row e il lock
-- è di pochi secondi. Se la tabella crescesse a >1M row, eseguire la
-- migration manualmente fuori transazione con CONCURRENTLY.
CREATE INDEX IF NOT EXISTS
  idx_render_sessions_company_processing_started
  ON public.render_sessions(company_id, processing_started_at)
  WHERE status IN ('processing', 'pending');

COMMENT ON INDEX public.idx_render_sessions_company_processing_started IS
  'v8.6.22 partial index for orphan detection + active renders dashboard. Only indexes processing/pending rows.';

-- ════════════════════════════════════════════════════════════════════════════
-- Milestone 11: Before/After render AI — esplicito pair_situazione_id
-- ────────────────────────────────────────────────────────────────────────────
-- Fino ad oggi l'accoppiamento prima/dopo era IMPLICITO via parsing del
-- `storage_path` (convenzione "render-session:<id>:original" ↔
-- "render-session:<id>:N"). Funziona, ma è fragile a migrazioni di
-- storage e non riflette il pairing nello schema del DB.
--
-- Aggiungiamo `pair_situazione_id` UUID NULLABLE su sr_progetti_media:
--   • Su una row di kind='render', punta alla row situazione "prima"
--     che le è coppia.
--   • NULL = nessun pair esplicito (PDF cade sul fallback session-based).
--   • ON DELETE SET NULL per non perdere il render se la situazione viene
--     eliminata (l'utente può rifare il pairing).
--
-- Backfill: per ogni render con storage_path "render-session:<sid>:<idx>",
-- linkiamo la prima situazione con storage_path "render-session:<sid>:*".
-- Operazione one-shot, idempotente, non distruttiva.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_progetti_media
  ADD COLUMN IF NOT EXISTS pair_situazione_id UUID
    REFERENCES public.sr_progetti_media(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sr_progetti_media.pair_situazione_id IS
  'Per i media kind=render, ID della situazione "prima" che gli è coppia. '
  'Usato dal PDF per generare la sezione Prima/Dopo con accoppiamenti '
  'espliciti invece del parsing implicito di storage_path. NULL = '
  'nessun pair esplicito (fallback alla session-id legacy).';

-- Backfill conservativo basato sulla convenzione session-id legacy.
-- Idempotente: WHERE pair_situazione_id IS NULL evita doppi update.
WITH render_rows AS (
  SELECT
    r.id AS render_id,
    SPLIT_PART(r.storage_path, ':', 2) AS session_id,
    r.progetto_id
  FROM public.sr_progetti_media r
  WHERE r.kind = 'render'
    AND r.pair_situazione_id IS NULL
    AND r.storage_path LIKE 'render-session:%'
),
matched AS (
  SELECT
    rr.render_id,
    (
      SELECT s.id
      FROM public.sr_progetti_media s
      WHERE s.kind = 'situazione'
        AND s.progetto_id = rr.progetto_id
        AND s.storage_path LIKE 'render-session:' || rr.session_id || ':%'
      ORDER BY s.created_at ASC
      LIMIT 1
    ) AS situazione_id
  FROM render_rows rr
)
UPDATE public.sr_progetti_media r
   SET pair_situazione_id = m.situazione_id
  FROM matched m
 WHERE r.id = m.render_id
   AND m.situazione_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

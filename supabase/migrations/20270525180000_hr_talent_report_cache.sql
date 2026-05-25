-- Extend hr_talent_reports with cached derived outputs so we don't recompute
-- mappa interiore, management tips, and per-trait narratives on every view.
--
-- All columns are nullable: if the cache is empty we recompute client-side
-- and write back on next save. The legacy report flow keeps working untouched.

BEGIN;

ALTER TABLE public.hr_talent_reports
  ADD COLUMN IF NOT EXISTS mappa_interiore JSONB,
  ADD COLUMN IF NOT EXISTS management_tips JSONB,
  ADD COLUMN IF NOT EXISTS management_closing TEXT,
  ADD COLUMN IF NOT EXISTS trait_narratives JSONB,
  ADD COLUMN IF NOT EXISTS colloquio_areas JSONB,
  ADD COLUMN IF NOT EXISTS action_plan JSONB,
  ADD COLUMN IF NOT EXISTS growth_plan JSONB,
  ADD COLUMN IF NOT EXISTS cache_version SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.hr_talent_reports.mappa_interiore IS
  'Cache MappaInterioreResult (identita, regolazione, attaccamento, difesa, integrazione + 5D scores).';
COMMENT ON COLUMN public.hr_talent_reports.management_tips IS
  'Cache management tips personalizzati: array di { testo, isPriorityOne }.';
COMMENT ON COLUMN public.hr_talent_reports.management_closing IS
  'Testo di chiusura personalizzato per il manager.';
COMMENT ON COLUMN public.hr_talent_reports.trait_narratives IS
  'Cache narrative per ognuno dei 15 tratti: { traitCode: { fascia, testo } }.';
COMMENT ON COLUMN public.hr_talent_reports.colloquio_areas IS
  'Cache aree colloquio: array di { id, area, priorita, motivazione, domande[] }.';
COMMENT ON COLUMN public.hr_talent_reports.action_plan IS
  'Cache piano d''azione: array di { priority, area, action, timeline, responsible, trigger? }.';
COMMENT ON COLUMN public.hr_talent_reports.growth_plan IS
  'Cache piano di crescita: { rootCause, hiddenResource, viciouscircles[], phases[] }.';
COMMENT ON COLUMN public.hr_talent_reports.cache_version IS
  '0 = nessun cache, 1+ = versione algoritmo. Permette invalidazione mirata su update logica.';

-- Index parziale per individuare report che vanno ricalcolati su nuova versione.
CREATE INDEX IF NOT EXISTS idx_hr_talent_reports_cache_version
  ON public.hr_talent_reports (cache_version)
  WHERE cache_version < 1;

COMMIT;

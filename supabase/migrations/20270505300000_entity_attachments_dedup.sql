-- FIX 13 (C7) Sprint AI Hardening 1
-- Anti-duplicate per entity_attachments (DDT/fatture/documenti generici).
-- Sintomo: doppio click su "Conferma allegato" o retry rete creava 2 attach
-- record per lo stesso (entity_table, entity_id, storage_path).
--
-- Strategia:
--   1) Cleanup soft-delete dei duplicati esistenti (mantieni più recente).
--   2) UNIQUE PARTIAL INDEX su (company_id, entity_table, entity_id, storage_path)
--      WHERE deleted_at IS NULL — consente upsert client-side via onConflict.

-- Step 1: marca soft-deleted i duplicati pregressi (mantieni il più recente)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, entity_table, entity_id, storage_path
           ORDER BY attached_at DESC, id DESC
         ) AS rn
    FROM public.entity_attachments
   WHERE deleted_at IS NULL
)
UPDATE public.entity_attachments e
   SET deleted_at = now(),
       deleted_by = NULL
  FROM ranked r
 WHERE e.id = r.id
   AND r.rn > 1;

-- Step 2: UNIQUE INDEX parziale per consentire onConflict
DROP INDEX IF EXISTS public.uniq_entity_attachments_dedup;
CREATE UNIQUE INDEX uniq_entity_attachments_dedup
  ON public.entity_attachments (company_id, entity_table, entity_id, storage_path)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.uniq_entity_attachments_dedup IS
  'FIX 13 (C7): anti-duplicate per upsert client-side. Consente onConflict=company_id,entity_table,entity_id,storage_path.';

-- =============================================================================
-- P1-5 — UNIQUE parziale (company_id, vertical, nome) su article_families
-- =============================================================================
-- Risolve il bug P1 "Serramenti installer: INSERT sequenziali (20 roundtrip)":
-- oltre al bulk insert, serve impedire che due click veloci sul bottone
-- "Installa catalogo serramenti" creino duplicati (race condition tra la
-- read di existingNomi e il bulk INSERT).
--
-- STRATEGIA:
--   1. Soft-delete (attivo=false) dei duplicati eccedenti mantenendo la
--      riga più vecchia attiva per ogni (company_id, vertical, nome).
--      Non cancelliamo le righe perché quote_items/article_templates
--      potrebbero referenziarle via family_id: la disattivazione è
--      reversibile e non spezza FK.
--   2. INDICE UNICO PARZIALE su `WHERE attivo = true`: garantisce
--      l'unicità solo sulle righe operative.
--
-- Idempotente: se re-applicata, il soft-delete è no-op (i duplicati
-- già disattivati non rientrano nel filtro attivo=true), e il
-- DROP INDEX/CONSTRAINT IF EXISTS copre lo stato precedente.
-- =============================================================================

-- Drop eventuale constraint/indice vecchio da tentativi precedenti.
ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_company_nome_vertical_uniq;
DROP INDEX IF EXISTS public.article_families_company_nome_vertical_uniq;

-- Step 1: soft-delete dei duplicati eccedenti. Mantiene la riga con
-- created_at più vecchio come unica attiva per ogni tripla
-- (company_id, vertical, nome). Tie-break deterministico via id ASC.
WITH dup_ranking AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY company_id, vertical, nome
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.article_families
  WHERE attivo = true
)
UPDATE public.article_families af
SET attivo = false
FROM dup_ranking dr
WHERE af.id = dr.id AND dr.rn > 1;

-- Step 2: indice unico parziale sulle righe attive. La race del doppio
-- click dell'installer catalogo → entrambi gli INSERT hanno attivo=true
-- → SQLSTATE 23505 → il bulk-insert entra nel fallback per-riga
-- gestito a livello edge function.
CREATE UNIQUE INDEX article_families_company_nome_vertical_uniq
  ON public.article_families (company_id, vertical, nome)
  WHERE attivo = true;

COMMENT ON INDEX public.article_families_company_nome_vertical_uniq IS
  'P1-5: indice unico parziale su famiglie attive. Protegge dal race double-click dell''installer. Righe inattive possono condividere nomi storici.';

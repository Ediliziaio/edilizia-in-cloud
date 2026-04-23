-- =============================================================================
-- P1-5 — UNIQUE constraint (company_id, vertical, nome) su article_families
-- =============================================================================
-- Risolve il bug P1 "Serramenti installer: INSERT sequenziali (20 roundtrip)":
-- oltre al bulk insert, serve impedire che due click veloci sul bottone
-- "Installa catalogo serramenti" creino duplicati (race condition tra la
-- read di existingNomi e il bulk INSERT).
--
-- UNIQUE (company_id, vertical, nome) → il secondo bulk in corsa solleva
-- violation 23505: il codice entra nel fallback per-riga e segnala
-- duplicati senza corrompere lo stato.
-- =============================================================================

ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_company_nome_vertical_uniq;

ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_company_nome_vertical_uniq
  UNIQUE (company_id, vertical, nome);

COMMENT ON CONSTRAINT article_families_company_nome_vertical_uniq
  ON public.article_families IS
  'P1-5: evita duplicati nomi famiglia nella stessa company+vertical quando l''installer catalogo serramenti viene invocato due volte in parallelo.';

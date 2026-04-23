-- =============================================================================
-- P1-5 — UNIQUE parziale (company_id, vertical, nome) su article_families
-- =============================================================================
-- Risolve il bug P1 "Serramenti installer: INSERT sequenziali (20 roundtrip)":
-- oltre al bulk insert, serve impedire che due click veloci sul bottone
-- "Installa catalogo serramenti" creino duplicati (race condition tra la
-- read di existingNomi e il bulk INSERT).
--
-- NOTA: in produzione esistono righe storiche duplicate (es. famiglie
-- legacy con vertical='generico' e nome='cassonetto') che non possiamo
-- rimuovere senza impatto su quote_items/article_templates collegati.
-- Per questo motivo usiamo un INDICE UNICO PARZIALE su `attivo = true`
-- invece di un vincolo UNIQUE table-level:
--   - le famiglie ATTIVE sono garantite uniche per company+vertical+nome;
--   - le righe inattive (soft-deleted) possono avere nomi storici duplicati;
--   - la race del double-click (due INSERT con attivo=true nello stesso
--     company+vertical+nome) solleva violation 23505 → l'installer
--     entra nel fallback per-riga.
--
-- Idempotente: DROP INDEX IF EXISTS + CREATE.
-- =============================================================================

-- Drop eventuale constraint vecchio (se presente da tentativi precedenti).
ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_company_nome_vertical_uniq;

-- Drop eventuale indice vecchio omonimo.
DROP INDEX IF EXISTS public.article_families_company_nome_vertical_uniq;

CREATE UNIQUE INDEX article_families_company_nome_vertical_uniq
  ON public.article_families (company_id, vertical, nome)
  WHERE attivo = true;

COMMENT ON INDEX public.article_families_company_nome_vertical_uniq IS
  'P1-5: indice unico parziale sulle famiglie attive. Protegge dal race double-click dell''installer catalogo serramenti senza richiedere cleanup dei duplicati storici inattivi (quote_items legacy potrebbero referenziarli).';

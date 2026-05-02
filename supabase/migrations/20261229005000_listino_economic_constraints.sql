-- ============================================================================
-- Listino · vincoli economici anti-dati distruttivi
-- ============================================================================
-- Protegge le nuove scritture da prezzi/costi negativi o quantità non valide.
-- I vincoli sono NOT VALID per non bloccare tenant con storico sporco: da ora
-- in avanti Postgres rifiuta nuovi insert/update non coerenti, senza migrare
-- o alterare righe già emesse in preventivi/ordini storici.
-- ============================================================================

ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_economics_non_negative;

ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_economics_non_negative
  CHECK (
    COALESCE(prezzo_base_vendita, 0) >= 0
    AND COALESCE(prezzo_base_acquisto, 0) >= 0
    AND COALESCE(markup_valore, 0) >= 0
    AND COALESCE(posa_quantita_default, 1) > 0
    AND COALESCE(manodopera_costo_acquisto, 0) >= 0
    AND COALESCE(manodopera_prezzo_vendita, 0) >= 0
  ) NOT VALID;

ALTER TABLE public.listino_griglia
  DROP CONSTRAINT IF EXISTS listino_griglia_economics_non_negative;

ALTER TABLE public.listino_griglia
  ADD CONSTRAINT listino_griglia_economics_non_negative
  CHECK (
    COALESCE(prezzo_vendita, 0) >= 0
    AND COALESCE(prezzo_acquisto, 0) >= 0
  ) NOT VALID;

COMMENT ON CONSTRAINT article_families_economics_non_negative
  ON public.article_families IS
  'Blocca nuovi valori economici negativi nel listino articoli senza toccare lo storico.';

COMMENT ON CONSTRAINT listino_griglia_economics_non_negative
  ON public.listino_griglia IS
  'Blocca nuovi prezzi/costi negativi nelle griglie listino senza toccare lo storico.';

NOTIFY pgrst, 'reload schema';

-- Numero di rate scelto per ogni preventivo dei moduli edili (06/10/2026).
--
-- Il modello (template) del modulo dice se la promo di finanziamento c'è e con che TAN
-- (`finanziamento_promo`: attivo, rate, tan_pct); il preventivo decideva solo se mostrare la rata
-- (`mostra_finanziamento`). Ora il venditore sceglie anche il NUMERO DI RATE per quel preventivo:
--   NULL  = quello del modello (`finanziamento_promo.rate`), come prima;
--   n     = scelto sul preventivo; il TAN resta quello del modello.
--
-- Colonna vuota e senza default: nessuna riga viene riscritta, nessun preventivo esistente cambia.
-- Le otto tabelle hanno poche righe e nessun permesso per singola colonna: la colonna eredita quelli
-- della tabella. Idempotente: si può rilanciare.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
    'idr_progetti', 'pav_progetti', 'pis_progetti', 'rst_progetti'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS finanziamento_rate smallint', t);
    -- Stesso stile di <tabella>_prezzo_manuale_positivo: un valore sensato o niente.
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_finanziamento_rate_valido');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (finanziamento_rate IS NULL OR finanziamento_rate BETWEEN 1 AND 360)',
      t, t || '_finanziamento_rate_valido'
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.finanziamento_rate IS %L', t,
      'Numero di rate mensili scelto per questo preventivo (rata nel PDF). NULL = quello del modello (finanziamento_promo.rate). Il TAN è sempre quello del modello.'
    );
  END LOOP;
END $$;

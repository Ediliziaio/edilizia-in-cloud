-- ════════════════════════════════════════════════════════════════════════════
-- Il prezzo del preventivo scritto a mano, anche nei moduli edili
-- ════════════════════════════════════════════════════════════════════════════
--
-- Dopo i serramenti (20280921200000_prezzo_finale_a_mano), lo stesso prezzo nei
-- preventivatori a computo: ristrutturazione, bagni, tetti, climatizzazione,
-- elettrico, termoidraulico, pavimenti, piscine. È il prezzo pieno IVA esclusa:
-- prende il posto della somma delle righe del computo, e sopra lavorano sconto
-- globale e IVA come sempre. Si scrive solo dove l'azienda ha acceso
-- preventivo_impostazioni.prezzo_finale_a_mano.
--
-- La colonna nasce su tutte e otto le tabelle insieme, prima dell'interfaccia:
-- l'autosave dei wizard rimanda tutti i campi del form, e una colonna che il
-- database non conosce farebbe fallire l'intero salvataggio. I moduli che non
-- usano ancora il campo lo leggono e lo rimandano vuoto: i loro totali restano
-- la somma delle righe, come prima.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rst_progetti', 'bgn_progetti', 'tet_progetti', 'clm_progetti',
    'ele_progetti', 'idr_progetti', 'pav_progetti', 'pis_progetti'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS prezzo_manuale numeric', t);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_prezzo_manuale_positivo');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (prezzo_manuale IS NULL OR prezzo_manuale > 0)',
      t, t || '_prezzo_manuale_positivo');
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.prezzo_manuale IS %L', t,
      'Prezzo pieno del preventivo scritto a mano, IVA esclusa: sostituisce la somma delle righe del computo; sconto globale e IVA si calcolano sopra. Null = somma delle righe.');
  END LOOP;
END $$;

COMMENT ON COLUMN public.preventivo_impostazioni.prezzo_finale_a_mano IS
  'Se true, nella fase Economia dei preventivatori si può scrivere a mano il prezzo pieno del preventivo (serramenti e moduli edili a computo).';

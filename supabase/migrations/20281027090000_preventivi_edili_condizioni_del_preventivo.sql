-- Le condizioni contrattuali del singolo preventivo (27/10/2026).
--
-- Le condizioni stavano solo nel modello dell'azienda (condizioni_legali_testo e l'interruttore
-- condizioni_legali_attivo): valevano per tutti i preventivi insieme. Chi manda il primo preventivo «solo per far
-- vedere il prezzo» non poteva toglierle, e chi doveva cambiare una clausola per un cliente doveva cambiarle a tutti.
--   · condizioni_nel_pdf  — false: questo PDF esce senza la parte contrattuale. NULL/true: come prima.
--     Vale per il PDF che si scarica e si manda per email; il PDF che va in FIRMA le ha sempre (il preventivo
--     firmato è il contratto), e l'applicazione le rimette da sé.
--   · condizioni_testo    — le condizioni riscritte per QUESTO preventivo. NULL: quelle del modello.
--     Le riscrive solo chi ha il permesso dei modelli di preventivo; l'applicazione lo controlla.
--
-- Colonne vuote e senza default: nessuna riga viene riscritta, nessun preventivo esistente cambia. Idempotente.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
    'idr_progetti', 'pav_progetti', 'pis_progetti', 'rst_progetti'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS condizioni_nel_pdf boolean', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS condizioni_testo text', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.condizioni_nel_pdf IS %L', t,
      'false = il PDF di questo preventivo esce senza condizioni contrattuali. NULL/true = come il modello. Il PDF mandato in firma le ha sempre.'
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.condizioni_testo IS %L', t,
      'Condizioni contrattuali riscritte per questo preventivo. NULL = quelle del modello dell''azienda.'
    );
  END LOOP;
END $$;

-- Il cronoprogramma del preventivo (26/10/2026).
--
-- «Quanto dura il cantiere» era scritto una volta sola nel modello dell'azienda (rst_template_pdf.cronoprogramma e
-- i suoi gemelli): le stesse fasi e le stesse durate in tutti i preventivi, anche quando il lavoro è diverso. Ora le
-- fasi si possono scrivere sul singolo preventivo, partendo da quelle del modello.
-- Forma: [{ fase, durata, descrizione }], le stesse del modello, così il PDF le disegna senza cambiare niente.
--
-- Colonna vuota e senza default: nessuna riga viene riscritta. NULL = il PDF usa il cronoprogramma del modello,
-- esattamente come prima. Idempotente: si può rilanciare.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
    'idr_progetti', 'pav_progetti', 'pis_progetti', 'rst_progetti'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cronoprogramma jsonb', t);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_cronoprogramma_valido');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (cronoprogramma IS NULL OR (jsonb_typeof(cronoprogramma) = ''array'' AND jsonb_array_length(cronoprogramma) BETWEEN 1 AND 20))',
      t, t || '_cronoprogramma_valido'
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.cronoprogramma IS %L', t,
      'Fasi e durate del cantiere per questo preventivo: [{fase, durata, descrizione}]. NULL = il PDF usa il cronoprogramma del modello.'
    );
  END LOOP;
END $$;

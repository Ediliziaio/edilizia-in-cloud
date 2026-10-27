-- Le condizioni contrattuali del singolo preventivo, anche negli altri tre preventivatori (27/10/2026).
--
-- Il 27/10 i preventivi edili hanno avuto le due scelte per preventivo: il PDF con o senza la parte
-- contrattuale, e le condizioni riscritte per quel cliente (20281027090000). Qui le prendono anche il
-- preventivo classico, i serramenti e il fotovoltaico, perché la scelta vale in tutti i modelli.
--
--   · condizioni_nel_pdf  — false: questo documento esce senza la parte contrattuale (il primo invio, quello
--     in cui si mostra il prezzo). NULL/true: come il modello dell'azienda.
--     Il documento che va in FIRMA le ha sempre: il preventivo firmato è il contratto.
--   · condizioni_testo    — le condizioni riscritte per QUESTO preventivo. NULL: quelle del modello.
--     Le riscrive solo chi ha il permesso dei modelli di preventivo; l'applicazione lo controlla.
--
-- Il preventivo classico ha già il suo interruttore per preventivo (quotes.pdf_mostra_condizioni, dallo step
-- «Documenti e PDF»): gli manca solo il testo proprio.
--
-- fv_progetti.pdf_vendita_con_condizioni dice se il documento EMESSO contiene le condizioni. Il fotovoltaico
-- non impagina al momento della firma: congela la pagina già generata. Senza questa colonna nessuno saprebbe
-- se quella pagina è la versione «senza», e si firmerebbe un contratto muto.
--
-- Colonne vuote e senza default: nessuna riga viene riscritta, nessun preventivo esistente cambia. Idempotente.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sr_progetti', 'fv_progetti'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS condizioni_nel_pdf boolean', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.condizioni_nel_pdf IS %L', t,
      'false = il documento di questo preventivo esce senza condizioni contrattuali. NULL/true = come il modello. Quello mandato in firma le ha sempre.'
    );
  END LOOP;

  FOREACH t IN ARRAY ARRAY['sr_progetti', 'fv_progetti', 'quotes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS condizioni_testo text', t);
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.condizioni_testo IS %L', t,
      'Condizioni contrattuali riscritte per questo preventivo. NULL = quelle del modello dell''azienda.'
    );
  END LOOP;
END $$;

ALTER TABLE public.fv_progetti ADD COLUMN IF NOT EXISTS pdf_vendita_con_condizioni boolean;
COMMENT ON COLUMN public.fv_progetti.pdf_vendita_con_condizioni IS
  'Il preventivo emesso (pdf_vendita_url) contiene le condizioni contrattuali. false = versione per il primo invio: non si manda in firma, va rigenerata.';

-- Le esigenze del cliente, per singolo preventivo, anche nei moduli edili.
--
-- «Cosa ti ha detto il cliente?»: freddo, muffa, bolletta alta… scelti dal venditore
-- per QUEL preventivo e raccontati nel PDF come «il tuo problema». È facoltativo:
-- colonna vuota = il PDF resta quello di sempre (l'elenco scritto nel modello PDF
-- dell'azienda, o niente).
--
-- Serramenti ha già sr_progetti.esigenze; qui la stessa colonna, con la stessa forma
-- [{"titolo": "...", "descrizione": "..."}], sugli otto moduli. Nullable, come in
-- sr_progetti: l'autosave dei wizard riscrive la riga intera e un null non deve far
-- fallire il salvataggio (chi legge tratta null e [] allo stesso modo).
--
-- Solo schema: nessuna riga viene toccata. Il default è una costante, quindi l'ALTER
-- è istantaneo (le tabelle hanno comunque 1-5 righe). lock_timeout: meglio fallire
-- che bloccare la produzione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.bgn_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.tet_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.clm_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.ele_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.idr_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.pav_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.pis_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.rst_progetti ADD COLUMN IF NOT EXISTS esigenze jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.bgn_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.tet_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.clm_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.ele_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.idr_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.pav_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.pis_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';
COMMENT ON COLUMN public.rst_progetti.esigenze IS 'Esigenze del cliente scelte per questo preventivo: [{titolo, descrizione}]. Facoltativo: vuoto = PDF standard.';

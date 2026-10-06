-- Il prodotto del listino dentro la riga del computo: foto e descrizione.
--
-- Nei preventivatori edili (bagni, tetti, climatizzazione, elettrico, termoidraulico,
-- pavimenti, piscine, ristrutturazione) chi sceglie un PRODOTTO dal listino prodotti
-- (article_families) lo ritrova nel preventivo con la sua foto e la sua descrizione:
-- a destra nell'anteprima e nel PDF del cliente. Senza foto o senza descrizione, la
-- riga resta com'è (niente segnaposto).
--
-- La riga porta una COPIA di quello che il listino diceva al momento della scelta, come
-- già fa col prezzo: un preventivo mandato o firmato non cambia se poi si ritocca il
-- listino. Per questo nessuna chiave esterna: la famiglia può essere spenta o tolta dal
-- listino (soft delete), e la riga deve restare com'era.
--   famiglia_id        da quale prodotto viene (tracciabilità, come listino_voce_id)
--   immagine_url       la foto così come stava nel listino: percorso dell'app
--                      («/templates/bagno/products/…») o link pubblico dello storage
--   descrizione_estesa la descrizione del prodotto, per il PDF e l'anteprima
--
-- Solo schema, tre colonne nulle per tabella: nessuna riga viene toccata e l'ALTER è
-- istantaneo (le tabelle hanno decine di righe). lock_timeout: meglio fallire che
-- bloccare la produzione.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.bgn_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.tet_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.clm_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.ele_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.idr_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.pav_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.pis_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS famiglia_id uuid;
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS immagine_url text;
ALTER TABLE public.rst_computo_voci ADD COLUMN IF NOT EXISTS descrizione_estesa text;

COMMENT ON COLUMN public.bgn_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.bgn_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.bgn_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.tet_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.tet_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.tet_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.clm_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.clm_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.clm_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.ele_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.ele_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.ele_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.idr_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.idr_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.idr_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.pav_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.pav_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.pav_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.pis_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.pis_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.pis_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';
COMMENT ON COLUMN public.rst_computo_voci.famiglia_id IS 'Prodotto del listino (article_families.id) da cui viene la riga. Nessuna FK: la riga è una copia al momento della scelta.';
COMMENT ON COLUMN public.rst_computo_voci.immagine_url IS 'Foto del prodotto del listino, copiata al momento della scelta (percorso dell''app o link pubblico). Vuota = niente foto.';
COMMENT ON COLUMN public.rst_computo_voci.descrizione_estesa IS 'Descrizione del prodotto del listino, copiata al momento della scelta. Vuota = niente descrizione.';

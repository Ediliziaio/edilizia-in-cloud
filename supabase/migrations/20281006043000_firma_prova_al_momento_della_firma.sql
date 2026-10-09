-- La prova della firma si fissa AL MOMENTO della firma, e il PDF firmato non lo tocca nessun utente.
--
-- 1) Due colonne su signature_requests, scritte da fea-completa-firma nell'istante della firma:
--    - documento_hash_firma: impronta SHA-256 del documento che il firmatario aveva davanti.
--      Se dopo la firma l'azienda rigenera il PDF del preventivo, il certificato non stampa
--      l'impronta del file nuovo e non timbra un documento diverso da quello firmato.
--    - clausole_approvate_testi: [{id, testo}] delle clausole approvate a parte (art. 1341 c.c.).
--      Prima il testo si rifaceva dagli id al momento di generare il certificato: se l'azienda
--      cambiava le clausole dopo la firma, il certificato mostrava il testo nuovo.
--
-- 2) La cartella firmati/ di quote-pdfs (<azienda>/firmati/<richiesta>.pdf) la scrive solo il
--    server. Le policy qp_ins/qp_upd/qp_del lasciavano cancellare e sovrascrivere il PDF firmato
--    a qualunque utente dell'azienda, che del contratto è una delle due parti. Come
--    acceptance_storage_server_only per i verbali di collaudo: una policy RESTRICTIVE che si
--    somma a quelle esistenti e non apre niente. Il service role non passa dalle policy: le
--    funzioni (fea-completa-firma, fea-pdf-firmato) continuano a scrivere e a firmare i link.
--    Nessun oggetto esiste ancora in quella cartella (verificato il 05/10/2026), quindi la
--    policy non cambia niente di ciò che c'è già.
--
-- Additiva e idempotente. lock_timeout: meglio fallire che fermare lo storage di tutti.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS documento_hash_firma TEXT,
  ADD COLUMN IF NOT EXISTS clausole_approvate_testi JSONB;

COMMENT ON COLUMN public.signature_requests.documento_hash_firma IS
  'SHA-256 del documento (PDF, o HTML del fotovoltaico) al momento della firma: fissata da fea-completa-firma, non cambia se il file viene rigenerato dopo';
COMMENT ON COLUMN public.signature_requests.clausole_approvate_testi IS
  'Testo delle clausole approvate a parte (art. 1341 c.c.) al momento della firma: [{id, testo}]';

DROP POLICY IF EXISTS firmati_solo_server ON storage.objects;
CREATE POLICY firmati_solo_server ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'quote-pdfs' OR (storage.foldername(name))[2] IS DISTINCT FROM 'firmati')
  WITH CHECK (bucket_id <> 'quote-pdfs' OR (storage.foldername(name))[2] IS DISTINCT FROM 'firmati');

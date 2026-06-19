-- Foto del bancale/lotto: URL pubblico (bucket article-images), opzionale.
-- Caricata in fase di creazione lotto (anche da fotocamera su mobile) o
-- aggiunta successivamente dalla tabella Lotti.
ALTER TABLE public.stock_lotti
  ADD COLUMN IF NOT EXISTS foto_url text;
COMMENT ON COLUMN public.stock_lotti.foto_url IS
  'URL pubblico foto del bancale/lotto (bucket article-images, path {company_id}/lotto-{id}.ext).';

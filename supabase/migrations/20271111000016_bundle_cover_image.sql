-- Aggiunge immagine di copertina ai bundle (usata nel preventivo FV).
-- L'URL viene convertito in base64 dalla edge function fv-genera-pdf
-- e embeddato nell'HTML del preventivo come pagina "Il tuo kit".

ALTER TABLE bundle_prodotti
  ADD COLUMN IF NOT EXISTS cover_image_url text;

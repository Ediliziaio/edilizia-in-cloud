-- Foto prodotto per i componenti FV e per le voci dei bundle, così compaiono
-- belle nel preventivo PDF (pagina "Componenti scelti" e pagina kit/bundle).
--
-- Additive + idempotente. NULL ⇒ il PDF usa il fallback esistente (macro-categoria).

-- Componenti FV (catalogo): il PDF già legge articolo.immagine_url → finora era
-- sempre NULL perché la colonna non esisteva. Ora caricabile da ComponentiFv.
ALTER TABLE public.articoli_native
  ADD COLUMN IF NOT EXISTS immagine_url text;

COMMENT ON COLUMN public.articoli_native.immagine_url IS
  'Foto del componente FV (pannello/inverter/accumulo), mostrata nella pagina Componenti del preventivo PDF.';

-- Voci dei bundle/kit: foto del singolo prodotto del kit, mostrata nella pagina
-- bundle del preventivo FV.
ALTER TABLE public.bundle_voci
  ADD COLUMN IF NOT EXISTS immagine_url text;

COMMENT ON COLUMN public.bundle_voci.immagine_url IS
  'Foto del prodotto della voce bundle, mostrata nella pagina kit del preventivo PDF.';

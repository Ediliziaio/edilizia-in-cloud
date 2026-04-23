-- MP-preventivi-v2: foto macrocategorie listino.
-- Consente di caricare un'immagine per categoria (Finestra, Persiana, ecc.)
-- visibile nel CategoryGrid del Preventivatore Unificato.

ALTER TABLE public.listino_categorie
  ADD COLUMN IF NOT EXISTS immagine_url TEXT;

COMMENT ON COLUMN public.listino_categorie.immagine_url IS
  'URL immagine macrocategoria (storage bucket article-images o CDN). NULL = nessuna foto, si usa icona.';

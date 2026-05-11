-- Aggiunge colonna immagine_url a listino_macrocategorie.
-- File caricato nel bucket `article-images` sotto path
-- `<company_id>/macros/<macro_id>.<ext>` (stesso bucket di article_families
-- per evitare un nuovo set di policies RLS).
-- Idempotente.

ALTER TABLE public.listino_macrocategorie
  ADD COLUMN IF NOT EXISTS immagine_url TEXT;

COMMENT ON COLUMN public.listino_macrocategorie.immagine_url IS
  'URL pubblico della foto rappresentativa della macrocategoria. Path nel '
  'bucket article-images: <company_id>/macros/<macro_id>.<ext>. NULL = '
  'nessuna immagine, UI usa fallback colore/icona Folder.';

NOTIFY pgrst, 'reload schema';

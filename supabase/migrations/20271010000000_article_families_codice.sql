-- Codice articolo (SKU) per il listino prodotti (article_families).
-- Campo opzionale e user-managed: identifica l'articolo con un codice breve
-- ricercabile oltre al nome (listino, picker commesse, magazzino).
--
-- NESSUN vincolo UNIQUE: i salvataggi non devono mai essere bloccati da un
-- codice duplicato (l'utente edile gestisce i codici a mano e può avere
-- temporanei collisioni durante la compilazione). La ricerca resta utile
-- anche con eventuali duplicati.

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS codice text;

-- Indice company-scoped per lookup/ordinamento per codice (solo righe valorizzate).
CREATE INDEX IF NOT EXISTS idx_article_families_codice
  ON public.article_families (company_id, codice)
  WHERE codice IS NOT NULL;

COMMENT ON COLUMN public.article_families.codice IS
  'Codice articolo / SKU opzionale. Ricercabile in listino, picker commesse e magazzino. Nessun vincolo di unicità.';

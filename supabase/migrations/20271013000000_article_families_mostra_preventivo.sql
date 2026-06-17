-- Flag visibilità nel preventivatore, indipendente da `attivo`: consente di
-- tenere un prodotto nel listino/magazzino senza proporlo nei preventivi.
-- Default true → i prodotti esistenti restano visibili come oggi.
-- (Gli articoli importati dal vecchio gestionale vengono settati a false.)
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS mostra_preventivo boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.article_families.mostra_preventivo IS
  'Se false, il prodotto non compare nel selettore articoli del preventivatore (resta nel listino/magazzino).';

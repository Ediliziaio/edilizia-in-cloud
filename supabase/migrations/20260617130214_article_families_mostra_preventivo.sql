-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Flag visibilità nel preventivatore (indipendente da `attivo`): permette di
-- tenere un prodotto nel listino/magazzino ma NON proporlo nei preventivi.
-- Default true: i prodotti esistenti restano visibili come oggi.
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS mostra_preventivo boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.article_families.mostra_preventivo IS
  'Se false, il prodotto non compare nel selettore articoli del preventivatore (resta nel listino/magazzino).';

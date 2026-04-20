-- ============================================================================
-- Preventivatore Unificato — Sprint A, Step 3 (masterprompt §4.3)
-- ----------------------------------------------------------------------------
-- Aggiunge il flag `posa_linked` a `article_families` e `article_templates`.
-- Quando il flag è TRUE (default), la riga posa/montaggio auto-generata dal
-- dialog di aggiunta voce resta LEGATA alla riga prodotto:
--   · DELETE cascade   → cancellare il prodotto cancella la posa
--   · QUANTITY sync    → cambiare qty del prodotto ricalcola la qty posa
-- Quando il flag è FALSE, posa e prodotto restano righe indipendenti: la
-- posa viene creata ma non referenzia il prodotto. Il commerciale può
-- cancellarle separatamente.
--
-- Nota: la colonna `quote_items.parent_item_id` esiste già in schema (vedi
-- types.ts riga 22186). La migration si limita a creare l'index parziale se
-- mancante.
-- ============================================================================

-- 1. Flag a livello famiglia
ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS posa_linked BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.article_families.posa_linked IS
  'Se true, la riga posa auto-generata resta legata alla riga prodotto: '
  'cancellare il prodotto cancella anche la posa, cambiare qty ricalcola '
  'la qty posa.';

-- 2. Flag a livello articolo singolo
ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS posa_linked BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.article_templates.posa_linked IS
  'Se true, la riga montaggio auto-generata resta legata alla riga prodotto.';

-- 3. Index parziale su quote_items.parent_item_id (la colonna esiste già).
--    Parziale perché la maggior parte delle righe NON ha parent e non
--    vogliamo bloat sull'index.
CREATE INDEX IF NOT EXISTS idx_quote_items_parent
  ON public.quote_items(parent_item_id)
  WHERE parent_item_id IS NOT NULL;

COMMENT ON INDEX public.idx_quote_items_parent IS
  'Lookup righe figlie di un quote_item (posa/montaggio/smaltimento legati '
  'al prodotto). Serve per DELETE cascade manuale + sync qty lato client.';

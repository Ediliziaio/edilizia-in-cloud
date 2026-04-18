-- Preventivatore Verticalizzato Serramentisti — Addendum P2-04
--
-- Estende quote_items per persistere la configurazione del wizard serramentista
-- (famiglia scelta + selezioni assi). Senza questi campi, al salvataggio del
-- preventivo venivano perse le informazioni "quale famiglia e quali varianti
-- ha scelto l'utente", impedendo successive modifiche coerenti e il recall AI
-- della configurazione esatta.
--
-- Contratto:
--   - family_id NULL → riga non legata a una famiglia (legacy: prodotto, tariffa,
--     posa, sconto, nota, ecc.). È il default e preserva le righe esistenti.
--   - family_id NOT NULL → riga "istanza famiglia". In questo caso axis_selections
--     contiene un JSONB { [axisCode]: axisValueId } con le scelte per ogni asse.
--   - article_template_id e family_id sono MUTUALMENTE ESCLUSIVI (un prodotto
--     è o un articolo specifico o un'istanza di famiglia configurata, non
--     entrambi).
--
-- Idempotente (ADD COLUMN IF NOT EXISTS, constraint in DO block).

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS family_id UUID
    REFERENCES public.article_families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS axis_selections JSONB;

-- CHECK mutua esclusione: se family_id è valorizzato, article_template_id DEVE
-- essere NULL (una riga non può essere "entrambi"). Le righe legacy con
-- article_template_id e family_id NULL restano valide. Righe completamente
-- scollegate (es. nota/sconto) sono valide (entrambi NULL).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quote_items_family_or_article_exclusive'
      AND conrelid = 'public.quote_items'::regclass
  ) THEN
    ALTER TABLE public.quote_items
      ADD CONSTRAINT quote_items_family_or_article_exclusive
      CHECK (family_id IS NULL OR article_template_id IS NULL);
  END IF;
END $$;

-- Indice di supporto per lookup rapido "tutti gli items di una famiglia"
-- (usato in analytics / report future). Parziale per risparmiare spazio:
-- solo le righe con family_id valorizzato.
CREATE INDEX IF NOT EXISTS idx_quote_items_family_id
  ON public.quote_items(family_id)
  WHERE family_id IS NOT NULL;

COMMENT ON COLUMN public.quote_items.family_id IS
  'Addendum P2-04: riferimento article_families se la riga è istanza di una famiglia configurata via wizard serramentista.';
COMMENT ON COLUMN public.quote_items.axis_selections IS
  'Addendum P2-04: JSONB { [axisCode]: axisValueId } con le scelte per ogni asse della famiglia. Popolato SOLO quando family_id NOT NULL.';

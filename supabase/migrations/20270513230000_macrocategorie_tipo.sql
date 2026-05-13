-- ════════════════════════════════════════════════════════════════════════════
-- listino_macrocategorie.categoria_tipo — distinzione principale vs accessorio
-- ────────────────────────────────────────────────────────────────────────────
-- USER REQUEST
-- "Come facciamo a far capire al listino prodotti che determinate macrocategorie
--  sono accessori?"
--
-- MODELLO
-- Aggiunge una colonna enum sulla macrocategoria che ne specifica il ruolo:
--   • 'principale'  = prodotto principale del verticale (es. Infissi per
--     Serramenti, Sanitari per Bagno). DEFAULT per retrocompat: TUTTE le
--     macro esistenti vengono marcate 'principale'.
--   • 'accessorio'  = accessorio collegato al principale (es. Tapparelle,
--     Cassonetti, Zanzariere, Persiane per Serramenti). Filtrate fuori dal
--     ListinoPickerDialog principale e mostrate nella sezione "Accessori e
--     complementi" del preventivo.
--
-- IMPATTO
-- ListinoPickerDialog (preventivo Serramenti): mostra solo 'principale'
-- AccessoriSection (CopyMisureDialog + Aggiungi da listino): mostra solo 'accessorio'
-- MacroCategorieManager: nuovo radio "Tipo macrocategoria" nel form.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listino_macrocategorie
  ADD COLUMN IF NOT EXISTS categoria_tipo TEXT
    DEFAULT 'principale'
    CHECK (categoria_tipo IN ('principale', 'accessorio'));

-- Backfill esplicito (anche se DEFAULT lo gestisce su nuovi insert): garantisce
-- che righe esistenti pre-migration abbiano il valore coerente.
UPDATE public.listino_macrocategorie
SET categoria_tipo = 'principale'
WHERE categoria_tipo IS NULL;

-- NOT NULL dopo il backfill
ALTER TABLE public.listino_macrocategorie
  ALTER COLUMN categoria_tipo SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listino_macro_tipo
  ON public.listino_macrocategorie (company_id, categoria_tipo)
  WHERE attivo = true;

COMMENT ON COLUMN public.listino_macrocategorie.categoria_tipo IS
  'Ruolo della macrocategoria nel catalogo: '
  '"principale" = prodotto principale del verticale (es. Infissi). '
  '"accessorio" = accessorio collegato (es. Tapparelle, Cassonetti). '
  'Il preventivatore filtra il ListinoPickerDialog principale su "principale" e '
  'la sezione "Accessori e complementi" su "accessorio".';

NOTIFY pgrst, 'reload schema';

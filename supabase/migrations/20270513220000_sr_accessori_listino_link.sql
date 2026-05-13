-- ════════════════════════════════════════════════════════════════════════════
-- sr_accessori: collegamento al listino prodotti
-- ────────────────────────────────────────────────────────────────────────────
-- FEEDBACK CLIENTE
-- "Gli accessori si devono collegare ai prodotti messi nel listino prodotti,
--  cioè io avrò la macrocategoria tapparelle (dove avrò le varie tapparelle
--  con i vari prezzi) idem zanzariere, idem cassonetti ecc.
--  Quando ti dicevo che posso copiare le dimensioni: i prodotti che hanno
--  altezza e larghezza, poi magari ho prodotti che lavorano a prezzo quindi
--  copio la quantità ecc."
--
-- MODELLO
-- Ogni riga sr_accessori opzionalmente referenzia un article_families del
-- listino (macrocategorie tipo Tapparelle / Zanzariere / Cassonetti / ...
-- distinte dalla macro "Infissi" che è per i serramenti).
-- Quando family_id è valorizzato:
--   • il calcolo prezzo segue la griglia + variabili del listino
--   • le misure (larghezza/altezza) si copiano dal serramento sorgente
--     se family.modalita_prezzo_base in ('griglia','mq')
--   • la quantita si copia se modalita_prezzo_base = 'pz'
-- Quando family_id è NULL: riga free-form (legacy, backward compat).
--
-- COLONNE
--   family_id              FK → article_families (ON DELETE SET NULL)
--   valori_assi            JSONB snapshot scelte variabili (axisCode → valueId)
--   modalita_prezzo        TEXT snapshot della modalita al momento del pick
--                          (preserva il preventivo se l'articolo viene cambiato)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sr_accessori_progetto
  ADD COLUMN IF NOT EXISTS family_id UUID
    REFERENCES public.article_families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valori_assi JSONB,
  ADD COLUMN IF NOT EXISTS modalita_prezzo TEXT
    CHECK (modalita_prezzo IS NULL OR modalita_prezzo IN ('pz','mq','griglia','misura_libera'));

CREATE INDEX IF NOT EXISTS idx_sr_accessori_family
  ON public.sr_accessori_progetto (family_id) WHERE family_id IS NOT NULL;

COMMENT ON COLUMN public.sr_accessori_progetto.family_id IS
  'FK opzionale a article_families del listino. NULL = accessorio free-form (legacy).';
COMMENT ON COLUMN public.sr_accessori_progetto.valori_assi IS
  'Snapshot {axisCode: valueId} delle variabili scelte al momento del pick. '
  'Garantisce stabilità del preventivo anche se il listino viene modificato dopo.';
COMMENT ON COLUMN public.sr_accessori_progetto.modalita_prezzo IS
  'Snapshot modalita_prezzo_base del listino al momento del pick. '
  'Usato dal frontend per decidere cosa copiare in "Copia da serramenti": '
  'larghezza+altezza per griglia/mq, solo quantita per pz.';

NOTIFY pgrst, 'reload schema';

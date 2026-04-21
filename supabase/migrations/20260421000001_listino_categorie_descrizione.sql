-- ============================================================================
-- HOTFIX · listino_categorie — colonne mancanti per MacroCategorieManager
-- ============================================================================
-- Bug osservato:
--   Toast "Could not find the 'descrizione' column of 'listino_categorie'
--   in the schema cache" al click su "Salva" nella Nuova categoria.
--
-- Root cause:
--   La tabella listino_categorie è stata creata in 20260324200001_preventivo_
--   pro_v2_part1.sql con le sole colonne (id, company_id, nome, colore, icona,
--   margine_target_percentuale, sort_order, created_at, UNIQUE(company_id,
--   nome)). L'hook useListinoCategorie (introdotto con la gerarchia 3-livelli
--   in 20260502000001) seleziona invece anche `descrizione` e `updated_at`
--   che non esistono.
--
-- Fix:
--   1. ADD COLUMN descrizione TEXT (nullable, retrocompat).
--   2. ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now() + trigger BEFORE UPDATE
--      per tenerla allineata automaticamente.
--   3. NOTIFY pgrst 'reload schema' così PostgREST invalida il cache senza
--      dover aspettare il polling periodico. Senza questo, il client continua
--      a ricevere l'errore per ~60s anche dopo la migration applicata.
--
-- Tutte le operazioni sono idempotenti (ADD COLUMN IF NOT EXISTS / CREATE OR
-- REPLACE FUNCTION / DROP TRIGGER IF EXISTS).
-- ============================================================================

ALTER TABLE public.listino_categorie
  ADD COLUMN IF NOT EXISTS descrizione TEXT;

ALTER TABLE public.listino_categorie
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.listino_categorie.descrizione IS
  'Descrizione opzionale mostrata nella UI di gestione catalogo.';
COMMENT ON COLUMN public.listino_categorie.updated_at IS
  'Aggiornato automaticamente dal trigger trg_listino_categorie_updated_at.';

-- Trigger updated_at (stesso pattern usato per listino_macrocategorie)
CREATE OR REPLACE FUNCTION public.set_listino_categorie_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listino_categorie_updated_at ON public.listino_categorie;
CREATE TRIGGER trg_listino_categorie_updated_at
  BEFORE UPDATE ON public.listino_categorie
  FOR EACH ROW EXECUTE FUNCTION public.set_listino_categorie_updated_at();

-- Force PostgREST schema cache reload (evita errore "column not found in
-- schema cache" fino al prossimo polling window)
NOTIFY pgrst, 'reload schema';

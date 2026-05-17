-- ============================================================================
-- v8.6.42 — Rimuove il tipo 'cantiere' da `sedi.tipo`.
--
-- Razionale: i cantieri sono già un'entità separata (tabella `orders`,
-- ognuno con `order_code`, lavorazione, timeline, ecc.). Avere "cantiere"
-- come *tipo di sede* era ridondante e confondeva l'UX: l'admin azienda
-- non capiva quando registrare un cantiere come sede vs come ordine.
--
-- Strategia di safety:
--   1. UPDATE preventivo: tutti i record esistenti con tipo='cantiere'
--      vengono downgrade a 'altro' (no perdita dati, no FK rotte).
--   2. Drop del CHECK constraint corrente.
--   3. Add del nuovo CHECK senza 'cantiere'.
--
-- Idempotente: usa DO blocks che testano l'esistenza del constraint prima
-- di droppare. Sicuro su re-run.
-- ============================================================================

-- 1. Downgrade record esistenti
UPDATE public.sedi SET tipo = 'altro' WHERE tipo = 'cantiere';

-- 2. Drop vecchio CHECK constraint (nome derivato da create_sedi_system.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sedi_tipo_check'
      AND conrelid = 'public.sedi'::regclass
  ) THEN
    ALTER TABLE public.sedi DROP CONSTRAINT sedi_tipo_check;
  END IF;
END $$;

-- 3. Re-add CHECK senza 'cantiere'
ALTER TABLE public.sedi
  ADD CONSTRAINT sedi_tipo_check
  CHECK (tipo IN ('showroom', 'magazzino', 'ufficio', 'altro'));

-- ============================================================================
-- Nota: i record `cespiti.sede_tipo` (se la colonna esiste con un check
-- separato) NON sono toccati qui — gestiti dalla migration originale dei
-- cespiti. Se necessario, una migration analoga su quella tabella.
-- ============================================================================

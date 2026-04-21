-- ============================================================================
-- One-shot data migration · "Finestra a Wasistas" pricing config
-- ============================================================================
-- Richiesta utente esplicita: configurare la famiglia "Finestra a Wasistas"
-- con la pricing policy del fornitore reale:
--
--   Flusso economico:
--     prezzo_lordo_listino × (1 - 0.50) × (1 - 0.03) × (1 + 1.00) = vendita
--     ↳ sconto fornitore 50% + 3% cascata → acquisto netto
--     ↳ markup 100% sull'acquisto netto → prezzo vendita cliente
--
--   Esempio: lordo €1000
--     €1000 × 0.50 = €500.00
--     €500.00 × 0.97 = €485.00   ← acquisto netto
--     €485.00 × 2.00 = €970.00   ← prezzo vendita cliente
--
-- Idempotente: match per nome ILIKE, ri-applicabile senza effetti collaterali.
-- Se la famiglia non esiste nel DB (ambienti senza dati demo), UPDATE = no-op.
-- ============================================================================

-- 1) Config famiglia
UPDATE public.article_families
SET
  prezzo_base_mode   = 'acquisto_markup',
  markup_tipo        = 'percentuale',
  markup_valore      = 100,
  sconto_fornitore_1 = 50,
  sconto_fornitore_2 = 3,
  updated_at         = now()
WHERE nome ILIKE '%wasistas%'
  AND deleted_at IS NULL;

-- 2) Ricalcolo celle grid esistenti (se ci sono) in modo che la vendita
--    rifletta subito la nuova policy senza dover ri-salvare dal client.
--    Formula: vendita = acquisto_lordo × 0.50 × 0.97 × 2.00
UPDATE public.listino_griglia g
SET    prezzo_vendita = ROUND(g.prezzo_acquisto * 0.50 * 0.97 * 2.00, 4)
FROM   public.article_families f
WHERE  g.family_id = f.id
  AND  f.nome ILIKE '%wasistas%'
  AND  f.deleted_at IS NULL
  AND  g.prezzo_acquisto IS NOT NULL
  AND  g.prezzo_acquisto > 0;

-- 3) Cache prezzo_base_vendita (fallback quando grid assente)
--    Se prezzo_base_acquisto è valorizzato lo trattiamo come lordo.
UPDATE public.article_families
SET prezzo_base_vendita = ROUND(prezzo_base_acquisto * 0.50 * 0.97 * 2.00, 4)
WHERE nome ILIKE '%wasistas%'
  AND deleted_at IS NULL
  AND prezzo_base_acquisto IS NOT NULL
  AND prezzo_base_acquisto > 0;

-- 4) Log diagnostico: quante famiglie toccate
DO $$
DECLARE
  n_fam  integer;
  n_cell integer;
BEGIN
  SELECT COUNT(*) INTO n_fam
    FROM public.article_families
   WHERE nome ILIKE '%wasistas%'
     AND deleted_at IS NULL;

  SELECT COUNT(*) INTO n_cell
    FROM public.listino_griglia g
    JOIN public.article_families f ON g.family_id = f.id
   WHERE f.nome ILIKE '%wasistas%'
     AND f.deleted_at IS NULL
     AND g.prezzo_acquisto > 0;

  RAISE NOTICE 'Finestra a Wasistas: % famiglie configurate, % celle grid ricalcolate', n_fam, n_cell;
END;
$$;

NOTIFY pgrst, 'reload schema';

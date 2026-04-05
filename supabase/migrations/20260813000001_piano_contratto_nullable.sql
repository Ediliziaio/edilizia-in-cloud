-- Rende contratto_id opzionale su piani_manutenzione.
-- Un piano puo' esistere senza contratto a pagamento
-- (es. garanzia inclusa, manutenzione periodica gratuita).

ALTER TABLE public.piani_manutenzione
  ALTER COLUMN contratto_id DROP NOT NULL;

-- Aggiorna index per gestire NULL correttamente
DROP INDEX IF EXISTS idx_piani_contratto;

CREATE INDEX idx_piani_contratto
  ON public.piani_manutenzione(contratto_id)
  WHERE contratto_id IS NOT NULL;

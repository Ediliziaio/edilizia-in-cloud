-- Il registro delle ritenute di garanzia impara il lato ATTIVO
--
-- La tabella nasceva solo per i subappalti (contratto_id + sal_id): le
-- trattenute che NOI facciamo ai sub. Il manuale (capp. 29 e pagg. 73-74)
-- chiede l'altra meta', quella che pesa di piu': le ritenute che il
-- COMMITTENTE trattiene a noi sui SAL — soldi gia' maturati, parcheggiati
-- per mesi, che tornano solo se il rapporto finisce bene. Senza registro,
-- nessuno li va a riprendere.
--
-- Quattro colonne, additive e retrocompatibili (le righe esistenti restano
-- "passiva"): la commessa attiva, la direzione, la controparte leggibile,
-- e il flag fideiussione — la mossa del manuale: polizza al posto della
-- trattenuta, stessa garanzia al committente, soldi in cassa a te.

ALTER TABLE public.ritenute_garanzia
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS direzione text NOT NULL DEFAULT 'passiva',
  ADD COLUMN IF NOT EXISTS controparte text,
  ADD COLUMN IF NOT EXISTS fideiussione boolean NOT NULL DEFAULT false;

-- contratto_id era NOT NULL (la tabella nasceva sub-only): per il lato
-- attivo si allenta, e la coerenza passa a un CHECK direzionale — una
-- passiva ha il contratto sub, una attiva ha la commessa.
ALTER TABLE public.ritenute_garanzia ALTER COLUMN contratto_id DROP NOT NULL;
ALTER TABLE public.ritenute_garanzia ALTER COLUMN sal_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ritenute_garanzia_direzione_check'
  ) THEN
    ALTER TABLE public.ritenute_garanzia
      ADD CONSTRAINT ritenute_garanzia_direzione_check
      CHECK (direzione IN ('attiva', 'passiva'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ritenute_garanzia_riferimento_check'
  ) THEN
    ALTER TABLE public.ritenute_garanzia
      ADD CONSTRAINT ritenute_garanzia_riferimento_check
      CHECK (
        (direzione = 'passiva' AND contratto_id IS NOT NULL)
        OR (direzione = 'attiva' AND order_id IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.ritenute_garanzia.direzione IS
  'attiva = il committente la trattiene a noi (soldi nostri parcheggiati); passiva = noi la tratteniamo al subappaltatore.';
COMMENT ON COLUMN public.ritenute_garanzia.fideiussione IS
  'true = sostituita da polizza fideiussoria: la garanzia resta, i soldi tornano in cassa.';

CREATE INDEX IF NOT EXISTS idx_ritenute_garanzia_order ON public.ritenute_garanzia(order_id) WHERE order_id IS NOT NULL;

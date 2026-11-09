-- Una ritenuta al subappaltatore può vivere sulla sola commessa: il contratto
-- non sempre è stato caricato. Basta uno dei due.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.ritenute_garanzia
  DROP CONSTRAINT IF EXISTS ritenute_garanzia_riferimento_check;

ALTER TABLE public.ritenute_garanzia
  ADD CONSTRAINT ritenute_garanzia_riferimento_check
  CHECK (
    (direzione = 'passiva' AND (contratto_id IS NOT NULL OR order_id IS NOT NULL))
    OR (direzione = 'attiva' AND order_id IS NOT NULL)
  );

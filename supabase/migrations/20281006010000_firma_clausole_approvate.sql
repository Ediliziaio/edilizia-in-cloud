-- Seconda firma (art. 1341 c.c.) per ogni firmatario di un contratto, non solo i privati:
-- si registra QUALI clausole sono state approvate e QUANDO. Prima restava solo
-- b2c_clausole, valorizzata per i privati. Additiva, idempotente, istantanea.
ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS clausole_approvate TEXT[],
  ADD COLUMN IF NOT EXISTS clausole_approvate_ts TIMESTAMPTZ;

COMMENT ON COLUMN public.signature_requests.clausole_approvate IS
  'Id delle clausole approvate a parte (art. 1341 c.c.) da chi ha firmato, privato o azienda';

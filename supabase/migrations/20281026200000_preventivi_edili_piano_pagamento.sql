-- Il piano di pagamento del preventivo (26/10/2026).
--
-- «Come paga il cliente» era una frase scritta una volta sola nel modello dell'azienda (payment_terms_text):
-- uguale per tutti i preventivi, senza importi, e un'azienda che non l'aveva scritta mandava preventivi senza
-- pagamenti (visto su Dimora Torino il 26/10). Ora il piano si decide sul singolo preventivo, in due modi:
--   · «rate» — le rate ai momenti del lavoro (firma, inizio, fine lavori…);
--   · «sal»  — le rate agli stati avanzamento lavori (SAL 1, SAL 2…), come nei lavori lunghi.
-- Forma: { modo, righe: [{ nome, percent, evento, numero }], note }. Le righe sono le stesse dei modelli di
-- pagamento delle commesse, così un preventivo accettato diventa una commessa con quelle rate.
-- Il piano si COPIA sul preventivo: il modello dell'azienda può cambiare, il preventivo già mandato no.
--
-- Colonna vuota e senza default: nessuna riga viene riscritta, nessun preventivo esistente cambia (senza piano
-- il PDF continua a usare il testo del modello, come prima). Idempotente: si può rilanciare.
SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bgn_progetti', 'tet_progetti', 'clm_progetti', 'ele_progetti',
    'idr_progetti', 'pav_progetti', 'pis_progetti', 'rst_progetti'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS piano_pagamento jsonb', t);
    -- Un oggetto con delle righe, o niente: mai un numero o una stringa al posto del piano.
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_piano_pagamento_valido');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (piano_pagamento IS NULL OR (jsonb_typeof(piano_pagamento) = ''object'' AND jsonb_typeof(piano_pagamento->''righe'') = ''array'' AND jsonb_array_length(piano_pagamento->''righe'') BETWEEN 1 AND 12))',
      t, t || '_piano_pagamento_valido'
    );
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.piano_pagamento IS %L', t,
      'Piano di pagamento del preventivo: { modo: rate|sal, righe: [{nome, percent, evento, numero}], note }. NULL = nessun piano, il PDF usa il testo del modello (payment_terms_text).'
    );
  END LOOP;
END $$;

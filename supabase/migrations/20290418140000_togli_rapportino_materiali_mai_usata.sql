-- Ondata 0 del piano acquisti e magazzino (docs/piano-acquisti-magazzino-potente.md):
-- `rapportino_materiali` (20260810000002) non è mai stata usata. 0 righe al 17/11/2026,
-- nessuna funzione, vista, trigger o chiave esterna che la legga, nessun punto del codice
-- che la scriva: i materiali dei rapportini stanno in `campo_rapportini.materiali_usati`.
-- Uno schema che racconta funzioni che non esistono confonde chi lo legge.
--
-- Si toglie SOLO se è ancora vuota: se nel frattempo qualcuno ci ha scritto, la migrazione
-- non fa niente e lo dice. Le altre tabelle vuote del piano restano: sono lette da funzioni
-- (Silvio, contabilità delle rimanenze, riconciliazione DDT, rincari) e vanno riempite.
DO $$
BEGIN
  IF to_regclass('public.rapportino_materiali') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rapportino_materiali) THEN
    RAISE NOTICE 'rapportino_materiali ha delle righe: non la tolgo';
    RETURN;
  END IF;
  SET LOCAL lock_timeout = '3s';
  DROP TABLE public.rapportino_materiali;
END $$;

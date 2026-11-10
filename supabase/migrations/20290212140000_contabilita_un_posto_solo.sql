-- La contabilità in un posto solo (10/11/2026, docs/piano-contabilita-un-posto-solo.md).
--
--   1. companies.contabilita_generale_attiva: la partita doppia è per chi tiene la contabilità in
--      casa. Spenta, la voce non compare nel menu. Si accende per chi ha già il piano dei conti.
--   2. contabilita_genera_automatica(): ogni 15 minuti (pg_cron, solo SQL) registra quello che
--      manca per le aziende accese, nell'esercizio in corso e in quello prima finché non è chiuso.
--      È la stessa generazione del pulsante: solo il nuovo, mai gli esercizi chiusi. L'esito
--      resta in contabilita_esercizi; un'azienda in errore non ferma le altre.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contabilita_generale_attiva boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.companies.contabilita_generale_attiva IS 'Contabilità generale (partita doppia) tenuta in casa: mostra la voce nel menu e accende le scritture automatiche.';

-- Chi ha già il piano dei conti l'ha già scelta.
UPDATE public.companies c SET contabilita_generale_attiva = true
 WHERE NOT c.contabilita_generale_attiva
   AND EXISTS (SELECT 1 FROM public.contabilita_conti k WHERE k.company_id = c.id);

ALTER TABLE public.contabilita_esercizi
  ADD COLUMN IF NOT EXISTS generato_il timestamptz,
  ADD COLUMN IF NOT EXISTS generato_esito jsonb;

CREATE OR REPLACE FUNCTION public.contabilita_genera_automatica()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '600s' AS $$
DECLARE
  a record; v_anno int; v_oggi int := extract(year FROM (now() AT TIME ZONE 'Europe/Rome'))::int;
  v_esito jsonb; v_fatte int := 0; v_errori int := 0;
BEGIN
  -- La generazione ammette il service role: è il cron, non un utente.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  FOR a IN
    SELECT c.id FROM public.companies c
     WHERE c.contabilita_generale_attiva AND c.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM public.contabilita_conti k WHERE k.company_id = c.id)
  LOOP
    FOREACH v_anno IN ARRAY ARRAY[v_oggi - 1, v_oggi] LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.contabilita_esercizi e
                             WHERE e.company_id = a.id AND e.anno = v_anno AND e.chiuso_il IS NOT NULL);
      BEGIN
        v_esito := public.contabilita_genera_da_documenti(a.id, v_anno);
        v_fatte := v_fatte + 1;
      EXCEPTION WHEN others THEN
        v_esito := jsonb_build_object('errore', SQLERRM);
        v_errori := v_errori + 1;
      END;
      INSERT INTO public.contabilita_esercizi (company_id, anno, generato_il, generato_esito, aggiornato_il)
      VALUES (a.id, v_anno, now(), v_esito, now())
      ON CONFLICT (company_id, anno) DO UPDATE SET generato_il = now(), generato_esito = EXCLUDED.generato_esito, aggiornato_il = now();
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('esercizi', v_fatte, 'errori', v_errori);
END $$;
REVOKE ALL ON FUNCTION public.contabilita_genera_automatica() FROM PUBLIC, anon, authenticated;

-- Ogni 15 minuti, sfasato rispetto ai cron allo scoccare del quarto d'ora.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'contabilita-genera-automatica') THEN
    PERFORM cron.unschedule('contabilita-genera-automatica');
  END IF;
  PERFORM cron.schedule('contabilita-genera-automatica', '7,22,37,52 * * * *', 'select public.contabilita_genera_automatica()');
END $$;

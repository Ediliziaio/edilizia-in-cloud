-- Accessi multi-azienda attivi e non scaduti — i controlli d'accesso delle RPC
-- (25/09/2026). Seguito di 20280925010007.
--
-- ai_assert_company_access (la guardia delle RPC dell'AI), get_customer_context
-- e hr_update_richiesta_stato facevano passare chi aveva una riga qualsiasi in
-- multi_company_access. Stesso criterio di user_can_access_company:
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())
--
-- Restano come sono, apposta: ruolo_principale_utente (dice il ruolo di una
-- persona in un'azienda, non decide chi entra) e request_quote_approval (sceglie
-- a quali amministratori mandare l'avviso).

SET LOCAL lock_timeout = '3s';

-- Il corpo si prende dal database e si cambia solo il pezzo indicato, che deve
-- comparire una volta sola: una funzione cambiata nel frattempo fa fallire la
-- migrazione invece di essere sovrascritta. Rilanciabile: se il pezzo nuovo c'è
-- già, la funzione si salta. CREATE OR REPLACE tiene proprietario e permessi.
DO $migrazione$
DECLARE
  r record;
  def text;
  n int;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.ai_assert_company_access(uuid)',
       E'    WHERE mca.user_id = auth.uid()\n      AND mca.company_id = p_company_id\n  ) THEN',
       E'    WHERE mca.user_id = auth.uid()\n      AND mca.company_id = p_company_id\n      AND mca.status = ''active''\n      AND (mca.expires_at IS NULL OR mca.expires_at > now())\n  ) THEN'),
      ('public.get_customer_context(uuid)',
       E'    OR EXISTS (SELECT 1 FROM public.multi_company_access WHERE user_id = auth.uid() AND company_id = p_company_id)\n',
       E'    OR EXISTS (SELECT 1 FROM public.multi_company_access WHERE user_id = auth.uid() AND company_id = p_company_id\n                 AND status = ''active'' AND (expires_at IS NULL OR expires_at > now()))\n'),
      ('public.hr_update_richiesta_stato(uuid,text,text)',
       E'        SELECT company_id FROM public.multi_company_access WHERE user_id = v_actor\n',
       E'        SELECT company_id FROM public.multi_company_access WHERE user_id = v_actor\n          AND status = ''active'' AND (expires_at IS NULL OR expires_at > now())\n')
    ) AS s(funzione, vecchio, nuovo)
  LOOP
    def := pg_get_functiondef(r.funzione::regprocedure);
    IF strpos(def, r.nuovo) > 0 THEN
      CONTINUE;
    END IF;
    n := (length(def) - length(replace(def, r.vecchio, ''))) / length(r.vecchio);
    IF n <> 1 THEN
      RAISE EXCEPTION '%: il pezzo da cambiare compare % volte invece di una', r.funzione, n;
    END IF;
    EXECUTE replace(def, r.vecchio, r.nuovo);
  END LOOP;
END
$migrazione$;

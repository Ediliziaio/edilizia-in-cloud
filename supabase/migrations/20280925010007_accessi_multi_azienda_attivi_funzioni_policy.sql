-- Accessi multi-azienda attivi e non scaduti — le funzioni dentro le policy
-- (25/09/2026). Seguito di 20280925010001…010006.
--
-- can_access_render_company (14 policy dei render) e conversazioni_puo_accedere
-- (5 policy di messaggi e statistiche social) facevano entrare con una riga
-- qualsiasi in multi_company_access. can_access_company_people,
-- can_manage_company_people e can_view_company_people guardavano lo stato ma non
-- la scadenza: con un accesso scaduto un admin vedeva ancora i profili e i
-- permessi dell'azienda (provato: 382 profili). Stesso criterio di
-- user_can_access_company:
--   status = 'active' AND (expires_at IS NULL OR expires_at > now())

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
      ('public.can_access_render_company(uuid)',
       E'        WHERE mca.user_id = auth.uid()\n          AND mca.company_id = p_company_id\n      )',
       E'        WHERE mca.user_id = auth.uid()\n          AND mca.company_id = p_company_id\n          AND mca.status = ''active''\n          AND (mca.expires_at IS NULL OR mca.expires_at > now())\n      )'),
      ('public.conversazioni_puo_accedere(uuid)',
       E'      WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id\n',
       E'      WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id\n        AND mca.status = ''active''\n        AND (mca.expires_at IS NULL OR mca.expires_at > now())\n'),
      ('public.can_access_company_people(uuid)',
       E'        AND mca.status = ''active''\n    ),',
       E'        AND mca.status = ''active''\n        AND (mca.expires_at IS NULL OR mca.expires_at > now())\n    ),'),
      ('public.can_manage_company_people(uuid)',
       E'        AND mca.status = ''active''\n    ),',
       E'        AND mca.status = ''active''\n        AND (mca.expires_at IS NULL OR mca.expires_at > now())\n    ),'),
      ('public.can_view_company_people(uuid)',
       E'        AND mca.status = ''active''\n        AND (\n',
       E'        AND mca.status = ''active''\n        AND (mca.expires_at IS NULL OR mca.expires_at > now())\n        AND (\n')
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

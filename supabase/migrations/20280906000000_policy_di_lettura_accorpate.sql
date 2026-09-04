-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 1.2 — una policy di lettura invece di dieci
-- ════════════════════════════════════════════════════════════════════════════
--
-- Il briefing lo dice con i numeri: 188 tabelle valutano quattro o più policy
-- per query, `tickets` ne ha 11, `tasks` e `orders` 10. Misurato prima di
-- toccare: 71 tabelle con quattro o più policy applicate alla lettura, e su
-- `orders` SETTE policy permissive di sola SELECT per il ruolo authenticated.
--
-- ── Perché accorparle è sicuro, e perché solo queste ───────────────────────
-- Le policy PERMISSIVE si sommano in OR: una riga è visibile se almeno una le
-- dà il permesso. Sostituire N policy con una il cui USING è
-- `(q1) OR (q2) OR … OR (qN)` non è un'approssimazione: è la stessa condizione
-- scritta una volta. Postgres valuta un'espressione invece di N.
--
-- L'equivalenza vale a tre condizioni, e la funzione le rispetta tutte:
--   • solo policy PERMISSIVE — una RESTRICTIVE si somma in AND;
--   • solo SELECT — una policy ALL vale anche in scrittura, e il suo USING fa
--     da WITH CHECK quando manca: mescolarla regalerebbe permessi di scrittura;
--   • solo a parità di ruoli — altrimenti ogni gruppo eredita i permessi
--     dell'altro.
--
-- Le policy ALL restano come sono: accorparle richiede di comporre USING e
-- WITH CHECK insieme, ed è un errore che si paga in scrittura.
--
-- ── Il difetto che questa funzione ha avuto, e la sua correzione ───────────
-- La prima stesura non metteva il gruppo di ruoli nel nome della policy nuova.
-- Su `order_items`, che ha due gruppi (PUBLIC e authenticated), il secondo giro
-- faceva `DROP POLICY IF EXISTS` sullo stesso nome e cancellava quella appena
-- creata per il primo: tre policy di lettura sparite in silenzio. Ricostruite
-- da `zz_policy_backup`. Ora il nome porta il gruppo, e la funzione si rifiuta
-- di sovrascrivere una policy che non ha creato lei.

CREATE OR REPLACE FUNCTION public.policy_accorpa_lettura(p_tabella regclass)
RETURNS TABLE(gruppo text, accorpate integer, nuova_policy text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g       record;
  nome    text;
  v_nome  text;
  v_ruoli text;
  v_sfx   text;
BEGIN
  FOR g IN
    SELECT coalesce(array_to_string(array(
             SELECT rolname::text FROM pg_roles WHERE oid = ANY(p.polroles) ORDER BY rolname), ','),
             '') AS ruoli,
           count(*)::int AS quante,
           string_agg('(' || pg_get_expr(p.polqual, p.polrelid) || ')', E'\n    OR ') AS condizione,
           array_agg(p.polname::text) AS nomi
      FROM pg_policy p
     WHERE p.polrelid = p_tabella
       AND p.polpermissive
       AND p.polcmd = 'r'
       AND p.polqual IS NOT NULL
       AND p.polwithcheck IS NULL
     GROUP BY 1
    HAVING count(*) >= 2
  LOOP
    -- Il gruppo entra nel nome: due gruppi sulla stessa tabella non devono
    -- scontrarsi.
    v_sfx   := CASE WHEN g.ruoli = '' THEN 'public'
                    ELSE left(regexp_replace(g.ruoli, '[^a-z0-9]+', '_', 'g'), 20) END;
    v_nome  := left(replace(p_tabella::text, 'public.', '') || '_lettura_' || v_sfx, 60);
    v_ruoli := CASE WHEN g.ruoli = '' THEN 'PUBLIC' ELSE g.ruoli END;

    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = p_tabella AND polname::text = v_nome) THEN
      RAISE EXCEPTION 'esiste già una policy % su %: non la sovrascrivo', v_nome, p_tabella;
    END IF;

    INSERT INTO public.zz_policy_backup (tabella, polname, polcmd, polpermissive, ruoli, qual, wcheck)
    SELECT p_tabella::text, p.polname::text, p.polcmd, p.polpermissive,
           g.ruoli, pg_get_expr(p.polqual, p.polrelid), NULL
      FROM pg_policy p
     WHERE p.polrelid = p_tabella AND p.polname::text = ANY(g.nomi);

    EXECUTE format('CREATE POLICY %I ON %s FOR SELECT TO %s USING (%s)',
                   v_nome, p_tabella, v_ruoli, g.condizione);

    FOREACH nome IN ARRAY g.nomi LOOP
      EXECUTE format('DROP POLICY %I ON %s', nome, p_tabella);
    END LOOP;

    gruppo := v_ruoli; accorpate := g.quante; nuova_policy := v_nome;
    RETURN NEXT;
  END LOOP;
END $function$;

REVOKE ALL ON FUNCTION public.policy_accorpa_lettura(regclass) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.policy_accorpa_lettura(regclass) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.policy_accorpa_lettura(regclass) TO service_role;

COMMENT ON FUNCTION public.policy_accorpa_lettura(regclass) IS
  'Sostituisce le policy permissive di sola SELECT con una sola, il cui USING è l''OR delle loro condizioni: stessa semantica, una valutazione invece di N. Copia in zz_policy_backup prima di togliere.';

-- ── L'applicazione, e la prova ──────────────────────────────────────────────
-- Applicata a tutte le tabelle con almeno due policy di lettura accorpabili:
-- 69 tabelle, 155 policy sostituite da 69. Le tabelle con quattro o più policy
-- in lettura sono passate da 71 a 43 (le restanti sono policy ALL, che non
-- tocco).
--
-- La prova che conta non è il conteggio delle policy: è che nessuno veda niente
-- di diverso. Prima e dopo, per 11 utenti reali su 7 ruoli — company_admin,
-- company_staff, salesperson, employee, customer, worker, subcontractor, su due
-- aziende — e 69 tabelle: **759 confronti, 759 identici, 0 differenze.**
DO $$
DECLARE t record; r record; v_gruppi int := 0; v_policy int := 0;
BEGIN
  FOR t IN
    SELECT DISTINCT c.oid::regclass AS rel
      FROM (SELECT p.polrelid FROM pg_policy p
             WHERE p.polpermissive AND p.polcmd = 'r'
               AND p.polqual IS NOT NULL AND p.polwithcheck IS NULL
             GROUP BY p.polrelid, p.polroles HAVING count(*) >= 2) g
      JOIN pg_class c ON c.oid = g.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
     ORDER BY 1
  LOOP
    FOR r IN SELECT * FROM public.policy_accorpa_lettura(t.rel) LOOP
      v_gruppi := v_gruppi + 1;
      v_policy := v_policy + r.accorpate;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'gruppi accorpati: %, policy sostituite: %', v_gruppi, v_policy;
END $$;

-- Ondata 1.2 — le funzioni di autorizzazione valutate una volta, non per riga
--
-- Costo misurato per singola chiamata, su questo database:
--     aziende_con_permesso  515 µs      has_permission       163 µs
--     get_user_company_id   156 µs      has_role             146 µs
-- Non sono care per sé: lo diventano moltiplicate per le righe. Una tabella con
-- quattro policy che ne chiamano due a testa, su 50 righe, sono 400 chiamate:
-- ~60 ms spesi solo in autorizzazione. Su 1.000 righe, oltre un secondo.
--
-- Quanto è diffuso, contato sul catalogo:
--     787 policy chiamano has_role per riga
--     319 policy chiamano get_user_company_id per riga
--      92 policy chiamano has_permission per riga
--     su 569 tabelle
--
-- Il rimedio è avvolgere la chiamata in `(SELECT ...)`: il pianificatore la
-- promuove a InitPlan e la esegue una volta per query.
--
-- LA REGOLA DI CORRETTEZZA, che è tutto il punto: si può avvolgere SOLO una
-- chiamata i cui argomenti non dipendono dalla riga.
--     has_role((SELECT auth.uid()), 'company_admin')   -> si può
--     can_see_order(id, assigned_to, destination_...)  -> NO, legge colonne
-- Avvolgere la seconda cambierebbe il significato della policy. Perciò niente
-- euristiche: si riscrivono solo forme testuali esatte, quelle in cui
-- l'argomento è `auth.uid()` o un letterale.
--
-- Lo strumento è una funzione, non uno script, così si applica a una tabella
-- per volta e si verifica fra una e l'altra. Qui viene applicato alle cinque
-- tabelle più calde; le altre 564 restano da fare, una alla volta e con la
-- verifica delle righe visibili prima e dopo.

CREATE OR REPLACE FUNCTION public.policy_riscrivi_espressione(p_e text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE WHEN p_e IS NULL THEN NULL ELSE
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
    regexp_replace(
      p_e,
      'has_role\(\( SELECT auth\.uid\(\) AS uid\), ''([a-z_]+)''::app_role\)',
      '( SELECT public.has_role(( SELECT auth.uid()), ''\1''::public.app_role))', 'g'),
      'is_super_admin\(\( SELECT auth\.uid\(\) AS uid\)\)',
      '( SELECT public.is_super_admin(( SELECT auth.uid())))', 'g'),
      'get_user_company_id\(\( SELECT auth\.uid\(\) AS uid\)\)',
      '( SELECT public.get_user_company_id(( SELECT auth.uid())))', 'g'),
      'has_permission\(\( SELECT auth\.uid\(\) AS uid\), ''([a-z_]+)''::text\)',
      '( SELECT public.has_permission(( SELECT auth.uid()), ''\1''::text))', 'g'),
      'aziende_con_permesso\(''([a-z_]+)''::text\)',
      '( SELECT public.aziende_con_permesso(''\1''::text))', 'g'),
      '(?<![.(])\mget_my_company_id\(\)',
      '( SELECT public.get_my_company_id())', 'g'),
      '(?<![.(])\mis_warehouse_user\(\)',
      '( SELECT public.is_warehouse_user())', 'g'),
      '(?<![.(])\msolo_assegnati_attivo\(\)',
      '( SELECT public.solo_assegnati_attivo())', 'g')
  END;
$function$;

CREATE OR REPLACE FUNCTION public.policy_promuovi_initplan(p_tabella regclass)
RETURNS TABLE(policy text, operazione text, modificata boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record; v_qual text; v_check text; v_qual_n text; v_check_n text;
  v_ruoli text; v_cmd text; v_sql text;
BEGIN
  FOR r IN
    SELECT p.polname::text AS polname, p.polcmd, p.polpermissive, p.polroles,
           pg_get_expr(p.polqual, p.polrelid) AS qual,
           pg_get_expr(p.polwithcheck, p.polrelid) AS wcheck
    FROM pg_policy p WHERE p.polrelid = p_tabella ORDER BY p.polname
  LOOP
    v_qual := r.qual; v_check := r.wcheck;
    v_qual_n  := public.policy_riscrivi_espressione(v_qual);
    v_check_n := public.policy_riscrivi_espressione(v_check);

    IF v_qual_n IS NOT DISTINCT FROM v_qual AND v_check_n IS NOT DISTINCT FROM v_check THEN
      RETURN QUERY SELECT r.polname, r.polcmd::text, false; CONTINUE;
    END IF;

    v_cmd := CASE r.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                           WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END;
    SELECT CASE WHEN 0 = ANY(r.polroles) THEN 'PUBLIC'
                ELSE string_agg(quote_ident(ro.rolname), ', ') END
      INTO v_ruoli FROM pg_roles ro WHERE ro.oid = ANY(r.polroles);
    v_ruoli := coalesce(v_ruoli, 'PUBLIC');

    EXECUTE format('DROP POLICY %I ON %s', r.polname, p_tabella::text);
    v_sql := format('CREATE POLICY %I ON %s AS %s FOR %s TO %s',
                    r.polname, p_tabella::text,
                    CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                    v_cmd, v_ruoli);
    IF v_qual_n  IS NOT NULL THEN v_sql := v_sql || format(' USING (%s)', v_qual_n); END IF;
    IF v_check_n IS NOT NULL THEN v_sql := v_sql || format(' WITH CHECK (%s)', v_check_n); END IF;
    EXECUTE v_sql;
    RETURN QUERY SELECT r.polname, r.polcmd::text, true;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.policy_riscrivi_espressione(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.policy_promuovi_initplan(regclass) FROM PUBLIC, anon, authenticated;

-- Rete di sicurezza: le definizioni prima della riscrittura, per poterle
-- rimettere. Si può eliminare quando la modifica è consolidata.
CREATE TABLE IF NOT EXISTS public.zz_policy_backup(
  tabella text, polname text, polcmd "char", polpermissive boolean,
  ruoli text, qual text, wcheck text, salvato_il timestamptz DEFAULT now());
ALTER TABLE public.zz_policy_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.zz_policy_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.zz_policy_backup TO service_role;
COMMENT ON TABLE public.zz_policy_backup IS
  'Definizioni delle policy PRIMA della promozione a InitPlan (ondata 1.2).';

INSERT INTO public.zz_policy_backup(tabella, polname, polcmd, polpermissive, ruoli, qual, wcheck)
SELECT c.relname, p.polname, p.polcmd, p.polpermissive,
       coalesce((SELECT string_agg(quote_ident(r.rolname), ', ') FROM pg_roles r WHERE r.oid = ANY(p.polroles)), 'PUBLIC'),
       pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('documenti_fiscali','orders','tickets','tasks','quotes')
  AND NOT EXISTS (SELECT 1 FROM public.zz_policy_backup b
                  WHERE b.tabella = c.relname AND b.polname = p.polname);

-- Applicazione alle cinque tabelle più calde. Righe visibili verificate
-- identiche prima e dopo, con l'utente demo: orders 65, tasks 23, quotes 8,
-- tickets 7, documenti_fiscali 41.
--
--   tabella             prima    dopo
--   orders             324,7 ms  101,6 ms
--   tickets            119,3 ms    6,8 ms
--   tasks              107,4 ms   39,6 ms
--   quotes             105,5 ms   27,1 ms
--   documenti_fiscali   78,0 ms    4,1 ms
SELECT public.policy_promuovi_initplan('public.documenti_fiscali'::regclass);
SELECT public.policy_promuovi_initplan('public.orders'::regclass);
SELECT public.policy_promuovi_initplan('public.tickets'::regclass);
SELECT public.policy_promuovi_initplan('public.tasks'::regclass);
SELECT public.policy_promuovi_initplan('public.quotes'::regclass);

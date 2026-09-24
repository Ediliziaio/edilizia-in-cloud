-- Costruttore di dashboard: l'azienda effettiva (vista cliente, multi-azienda)
-- invece di quella del profilo, che per il super admin è NULL. Le policy delle
-- tabelle seguono già get_my_company_id (20280924220000), ma l'app passa da
-- queste RPC SECURITY DEFINER, che rispondevano «No company context».
--
-- In ogni funzione cambia una riga sola:
--   v_company_id := public.get_user_company_id(<utente>);
-- diventa
--   v_company_id := CASE WHEN public.utente_bloccato() THEN NULL ELSE public.get_my_company_id() END;
-- get_user_company_id restituiva NULL anche all'utente bloccato, e dentro una
-- SECURITY DEFINER la RESTRICTIVE sul blocco non vale: col CASE il bloccato
-- riceve lo stesso errore di prima.
--
-- get_metric è compresa: resolve_dashboard e l'anteprima dell'editor la
-- chiamano per ogni widget. Permessi invariati (chi modifica, metriche con ruolo).
--
-- get_metric è lunga 28.000 caratteri: la riga si cambia sulla definizione
-- viva, come in 20280921110000, e la migrazione si può rilanciare.

SET LOCAL lock_timeout = '3s';

DO $$
DECLARE
  v_funzioni constant text[] := ARRAY[
    'get_metric', 'list_dashboards', 'get_dashboard', 'resolve_dashboard', 'save_dashboard',
    'clone_template_to_company', 'list_company_role_dashboards', 'set_company_role_dashboard'
  ];
  v_riga constant text := 'v_company_id := public\.get_user_company_id\((v_user_id|auth\.uid\(\))\);';
  v_nome text;
  v_def text;
  v_trovate int;
BEGIN
  FOREACH v_nome IN ARRAY v_funzioni LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_nome;
    IF v_def IS NULL THEN
      RAISE EXCEPTION '% non trovata', v_nome;
    END IF;
    -- Già fatto: la migrazione si può rilanciare.
    CONTINUE WHEN position('public.get_my_company_id() END;' in v_def) > 0;

    SELECT count(*) INTO v_trovate FROM regexp_matches(v_def, v_riga, 'g');
    IF v_trovate <> 1 THEN
      RAISE EXCEPTION '%: la riga dell''azienda c''è % volte, attesa 1', v_nome, v_trovate;
    END IF;

    EXECUTE regexp_replace(v_def, '( *)' || v_riga,
      E'\\1-- Azienda effettiva (vista cliente, multi-azienda); il blocco lo guardava get_user_company_id\n'
      || E'\\1v_company_id := CASE WHEN public.utente_bloccato() THEN NULL ELSE public.get_my_company_id() END;');
  END LOOP;
END
$$;

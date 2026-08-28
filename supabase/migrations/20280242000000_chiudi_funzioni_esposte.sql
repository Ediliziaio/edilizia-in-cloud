-- Cinque funzioni SECURITY DEFINER erano eseguibili da chiunque, anche senza
-- login, e nessuna di loro ha un chiamante legittimo lato client: girano da
-- pg_cron (che e' superuser) o non le chiama piu' nessuno. Il permesso a
-- anon/authenticated era quindi superficie d'attacco pura.
--
-- La piu' grave e' check_and_update_login_attempt: incrementa i tentativi
-- falliti sul profilo e arriva a scrivere locked_until. Chiunque conoscesse
-- l'UUID di un utente poteva chiamarla in loop con p_success = false e
-- bloccargli l'accesso, senza mai provare una password. In piu' distingue
-- "user_not_found" dagli altri esiti, quindi diceva anche quali UUID esistono.

REVOKE EXECUTE ON FUNCTION public.check_and_update_login_attempt(uuid, boolean, inet)
  FROM anon, authenticated, PUBLIC;

-- Girano da cron ogni 15 minuti. Esposte, un anonimo poteva riempire di
-- avvisi la bacheca del superadmin a comando.
REVOKE EXECUTE ON FUNCTION public.silvio_admin_alerts_runner()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cron_health_check()
  FROM anon, authenticated, PUBLIC;

-- Nessun chiamante: ne' frontend, ne' edge, ne' cron. Scadono trial e
-- calcolano provvigioni: due scritture che non devono partire da fuori.
REVOKE EXECUTE ON FUNCTION public.auto_expire_trials()
  FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_sublevel_commissions(integer, integer)
  FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';

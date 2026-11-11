-- Foundation recovered read-only from the operational schema (11 November 2026).
-- No operational rows are copied; this repairs reconstruction only.
CREATE SEQUENCE IF NOT EXISTS public.cron_http_failures_id_seq;
CREATE TABLE IF NOT EXISTS public.cron_http_failures (
 "id" bigint DEFAULT nextval('cron_http_failures_id_seq'::regclass) NOT NULL,
 "request_id" bigint NOT NULL,
 "status_code" integer NOT NULL,
 "contenuto" text,
 "rilevato_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "cron_http_failures_pkey" PRIMARY KEY (id),
 CONSTRAINT "cron_http_failures_request_id_key" UNIQUE (request_id)
);
ALTER SEQUENCE public.cron_http_failures_id_seq OWNED BY public.cron_http_failures.id;
ALTER TABLE public.cron_http_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_http_failures FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cron_http_failures TO authenticated;
GRANT ALL ON public.cron_http_failures TO service_role;
DROP POLICY IF EXISTS cron_failures_super_admin ON public.cron_http_failures;
CREATE POLICY cron_failures_super_admin ON public.cron_http_failures FOR SELECT TO authenticated USING ((SELECT public.is_super_admin((SELECT auth.uid()))));
CREATE OR REPLACE FUNCTION public.cron_health_check()
 RETURNS TABLE(nuovi_guasti integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nuovi int := 0; f record;
begin
  -- pg_net conserva le risposte poche ore: finestra ampia, cadenza stretta.
  with candidati as (
    select r.id, r.status_code, left(coalesce(r.content,''), 500) as contenuto
    from net._http_response r
    where r.status_code >= 400
      and r.created > now() - interval '2 hours'
  ), inseriti as (
    insert into cron_http_failures (request_id, status_code, contenuto)
    select id, status_code, contenuto from candidati
    on conflict (request_id) do nothing
    returning 1
  )
  select count(*) into v_nuovi from inseriti;

  -- Rumore: se qualcosa è rotto, deve arrivare nella campanella dei super_admin.
  if v_nuovi > 0 then
    for f in
      SELECT d.user_id, d.company_id FROM public.destinatari_allarmi_piattaforma() d
    loop
      insert into notifications (company_id, user_id, type, title, body, action_url)
      values (f.company_id, f.user_id, 'cron_failure',
              v_nuovi || ' chiamata/e cron fallita/e',
              'Uno o più cron hanno ricevuto una risposta 4xx/5xx nelle ultime 2 ore. '
              || 'Dettaglio in cron_http_failures. Attenzione: pg_cron li segna comunque "succeeded".',
              '/admin');
    end loop;
  end if;

  return query select v_nuovi;
end;
$function$;

REVOKE ALL ON FUNCTION public.cron_health_check() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cron_health_check() TO service_role;


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

DO $optional_revoke$ BEGIN IF to_regprocedure('public.check_and_update_login_attempt(uuid, boolean, inet)') IS NOT NULL THEN
REVOKE EXECUTE ON FUNCTION public.check_and_update_login_attempt(uuid, boolean, inet)
  FROM anon, authenticated, PUBLIC;
END IF;END $optional_revoke$;

-- Girano da cron ogni 15 minuti. Esposte, un anonimo poteva riempire di
-- avvisi la bacheca del superadmin a comando.
REVOKE EXECUTE ON FUNCTION public.silvio_admin_alerts_runner()
  FROM anon, authenticated, PUBLIC;
DO $optional_cron_revoke$ BEGIN IF to_regprocedure('public.cron_health_check()') IS NOT NULL THEN
REVOKE EXECUTE ON FUNCTION public.cron_health_check()
  FROM anon, authenticated, PUBLIC;
END IF;END $optional_cron_revoke$;

-- Nessun chiamante: ne' frontend, ne' edge, ne' cron. Scadono trial e
-- calcolano provvigioni: due scritture che non devono partire da fuori.
REVOKE EXECUTE ON FUNCTION public.auto_expire_trials()
  FROM anon, authenticated, PUBLIC;
DO $optional_revoke$ BEGIN IF to_regprocedure('public.calculate_sublevel_commissions(integer, integer)') IS NOT NULL THEN
REVOKE EXECUTE ON FUNCTION public.calculate_sublevel_commissions(integer, integer)
  FROM anon, authenticated, PUBLIC;
END IF;END $optional_revoke$;

NOTIFY pgrst, 'reload schema';

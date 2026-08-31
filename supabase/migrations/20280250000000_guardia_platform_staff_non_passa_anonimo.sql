-- La guardia introdotta da 20280230000000_rpc_admin_gate.sql chiudeva le RPC di
-- piattaforma all'utente azienda loggato, ma le lasciava aperte a CHIUNQUE non
-- fosse loggato affatto. Il colpevole e' una riga sola:
--
--     OR p_user_id IS NULL
--
-- p_user_id vale auth.uid(), che e' NULL per le chiamate anonime. L'intenzione
-- era far passare il contesto interno (cron/trigger), ma l'anonimo che arriva
-- dall'API ha auth.uid() NULL esattamente come il cron: la guardia falliva
-- APERTA proprio sul caso che doveva fermare.
--
-- Provato in prod prima del fix, con la sola chiave pubblica del bundle JS e
-- nessun login:
--   get_top_companies_by_email  -> nome azienda + speso + saldo di tutte
--   get_company_health_data     -> ordini, utenti, attivita' per azienda
--   get_company_last_access     -> ultimo accesso di ogni azienda
--   get_platform_email_stats    -> totali email e ricavi di piattaforma
--   get_plan_company_counts     -> quante aziende per piano
-- Sono 17 RPC esposte ad anon, 4 delle quali scrivono (commissioni, tier
-- referral, conversioni referral).
--
-- Il fix distingue i tre contesti invece di dedurli dall'assenza di utente,
-- ed e' lo stesso criterio gia' usato da is_silvio_superadmin: senza utente si
-- passa SOLO se si e' service_role, mai per il semplice fatto di non averlo.
--   1. service_role  -> edge function: passa.
--   2. richiesta API -> serve un utente con ruolo di piattaforma. L'anonimo
--                       non ce l'ha e ora prende 42501.
--   3. nessun JWT    -> cron/trigger/psql interni: passano.
-- Verificato che nessun job in cron.job chiama queste funzioni, quindi il
-- ramo 3 non copre nulla di attivo oggi: e' solo prudenza.
--
-- Le 20 funzioni che si appoggiano alla guardia non vengono toccate: il fix e'
-- tutto qui dentro. Le 3 policy RLS che la usano (mrr_snapshots,
-- openwa_campagne, openwa_campagna_destinatari) sono gia' ristrette al ruolo
-- authenticated, quindi non cambiano comportamento.

CREATE OR REPLACE FUNCTION public.is_platform_staff(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- 1. service_role: le edge function chiamano cosi'.
    WHEN COALESCE(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
      OR COALESCE(current_setting('role', true), '') = 'service_role'
      THEN true

    -- 2. Richiesta che arriva dall'API (anon o authenticated): serve davvero
    --    un utente, e quell'utente deve avere un ruolo di piattaforma.
    WHEN current_setting('request.jwt.claims', true) IS NOT NULL
      THEN p_user_id IS NOT NULL
       AND EXISTS (
             SELECT 1 FROM public.user_roles
             WHERE user_id = p_user_id
               AND role IN ('super_admin','platform_manager','platform_sales',
                            'platform_support','platform_marketing','platform_implementation')
           )

    -- 3. Nessuna richiesta API in corso: cron/trigger/psql interni.
    ELSE true
  END;
$function$;

COMMENT ON FUNCTION public.is_platform_staff(uuid) IS
  'true per super_admin/platform_*, per il service_role e per il contesto interno senza JWT. Le chiamate anonime dall''API NON passano: prima passavano perche'' auth.uid() e'' NULL anche per loro.';

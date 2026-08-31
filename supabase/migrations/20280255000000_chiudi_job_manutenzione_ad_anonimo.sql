-- Ultimo gruppo dell'audit: i job di manutenzione. Non prendono parametri di
-- targeting, quindi non servivano a rubare dati, ma un anonimo poteva
-- innescarli a piacere. Fra questi purge_cestino_preventivi e
-- cleanup_cestino_* CANCELLANO in modo definitivo, mentre
-- create_task_due_notifications e ops_canarino_raccogli generano notifiche:
-- chiamati in loop erano un vettore di disturbo e di perdita dati.
--
-- Verificato nel repo: nessuno di questi e' chiamato dal frontend. Girano da
-- cron (contesto postgres) o da edge function in service_role, quindi la revoca
-- a PUBLIC/anon non tocca nulla di funzionante — confermato dopo l'applicazione:
-- anon riceve 42501, la stessa funzione via service_role continua a rispondere.
--
-- Stato dopo questa migrazione: le funzioni SECURITY DEFINER che SCRIVONO ed
-- erano chiamabili da un anonimo senza guardia passano da 63 a 1, e quell'una
-- e' submit_public_reputation_review, pubblica per progetto e con la sua
-- validazione interna sul link della campagna.
DO $do$
DECLARE
  v_nomi text[] := ARRAY[
    'purge_cestino_preventivi','cleanup_cestino_documenti','cleanup_cestino_article_families',
    'silvio_cleanup_old_uploads','fea_expire_stale_requests','decay_marketing_lead_scores',
    'create_task_due_notifications','ops_canarino_raccogli','check_new_table_rls',
    'silvio_promote_due_reminders','cleanup_rate_limits','cleanup_notifiche_cooldown',
    'silvio_decision_log_expire_old','cleanup_old_accountant_signup_attempts',
    'cleanup_old_referral_signup_attempts','kb_external_source_mark_error',
    'kb_external_source_mark_unchanged','mark_entity_embedded','silvio_kb_track_citation'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname = ANY(v_nomi)
       AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$do$;

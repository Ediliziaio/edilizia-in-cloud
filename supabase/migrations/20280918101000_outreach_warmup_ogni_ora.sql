-- Warm-up spalmato sulla giornata (16/09/2026).
--
-- Il titolare vuole che una casella non mandi mai due email nello stesso
-- minuto. Il warm-up partiva tutto alle 8:15 UTC: ogni casella mandava le sue
-- 2-8 email di riscaldamento a pochi secondi l'una dall'altra. Ora
-- outreach-warmup gira una volta all'ora, dalle 6:13 alle 15:13 UTC, e in ogni
-- giro una casella manda al massimo un'email (coppieDelGiro in
-- _shared/outreach-warmup.ts). Minuto 13: tra due giri del dispatcher (8, 18…).
--
-- Si cambia solo l'orario: il comando del job, con il segreto letto dal Vault,
-- resta quello di prima.

DO $$
DECLARE
  v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'outreach-warmup';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_id, schedule := '13 6-15 * * 1-5');
  END IF;
END $$;

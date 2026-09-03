-- Ondata 5.3 — mettere le sentinelle in calendario e riaccendere il recovery

-- Ogni quarto d'ora, sfasata rispetto a cron-health-check-15min (che gira a
-- */15) per non pestarsi i piedi.
SELECT cron.unschedule('sentinelle-effetti-cron')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sentinelle-effetti-cron');

SELECT cron.schedule('sentinelle-effetti-cron', '12-59/15 * * * *',
                     $$SELECT public.sentinelle_effetti_cron()$$);

-- whatsapp-ai-recovery (jobid 38): riacceso.
--
-- Era spento con una nota nel codice della funzione stessa: «il cron
-- whatsapp-ai-recovery (jobid 38) è disabilitato — riabilitare dopo il deploy
-- di questo fix». Il fix è stato deployato tre commit fa. Prima di riaccendere
-- ho controllato cosa avrebbe fatto: whatsapp_messages non ha nessun messaggio
-- in processing_status='received', quindi non c'è un arretrato da riprendere e
-- nessuna conversazione vecchia viene risvegliata. Da qui in avanti fa il suo
-- mestiere: riprendere i messaggi rimasti fermi più di tre minuti.
--
-- cron.alter_job e non un UPDATE su cron.job: la tabella non è scrivibile dal
-- ruolo delle migrazioni.
SELECT cron.alter_job(jobid, active := true) FROM cron.job WHERE jobname = 'whatsapp-ai-recovery';

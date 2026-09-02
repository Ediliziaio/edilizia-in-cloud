-- Outlook Calendar: sincronizzazione automatica ogni 15 minuti.
-- Google la aveva (google-calendar-sync-every-15min), Outlook no: si aggiornava
-- solo premendo "Sincronizza". Stesso comando del job Google (Bearer anon +
-- {"action":"cron-full-sync"}), cambia solo la funzione chiamata; sfasato di
-- 7 minuti rispetto a Google per non partire nello stesso istante.
select cron.schedule(
  'outlook-calendar-sync-every-15min',
  '11-59/15 * * * *',
  replace((select command from cron.job where jobname = 'google-calendar-sync-every-15min'),
          'google-calendar-sync', 'outlook-calendar-sync')
) where not exists (select 1 from cron.job where jobname = 'outlook-calendar-sync-every-15min');

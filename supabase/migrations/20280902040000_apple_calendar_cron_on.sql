-- Apple Calendar: il job di sync esisteva ma era SPENTO e mai partito.
-- Senza, Apple avrebbe avuto lo stesso difetto appena tolto a Outlook:
-- calendario aggiornato solo a mano. Con zero connessioni non fa nulla.
select cron.alter_job((select jobid from cron.job where jobname = 'apple-calendar-sync-every-10min'), active := true);

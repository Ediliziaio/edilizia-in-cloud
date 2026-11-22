-- Il ritiro Enable Banking (20261027131446) precede una vecchia migrazione
-- che ricrea lo stesso cron (20271004000000). Il monitor Render era rimosso
-- dal repo in 20281105160000, ma l'unschedule riguardava solo i job inattivi.
-- In produzione entrambi sono già assenti. Chiude lo storico anche su un
-- database ricostruito, senza toccare dati bancari, render o i motori correnti.
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$
declare j record;
begin
  for j in select jobid from cron.job where
    (jobname='bank-eb-nightly-sync' and command ~ '/functions/v1/bank-eb-cron([^a-zA-Z0-9_-]|$)')
    or (jobname='render-economics-monitor-hourly' and command ~ '/functions/v1/render-economics-monitor([^a-zA-Z0-9_-]|$)')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

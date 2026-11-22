-- La funzione legacy non è presente tra le edge e in produzione il job è già
-- rimosso. Lo storico SQL, però, lo ricrea durante un ripristino da zero.
-- Non abbandonare mai un lavoro: se compaiono flussi o code attivi, fermare il
-- riallineamento per una migrazione esplicita verso il motore corrente.
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='process-internal-automation-queue'
    and command ~ '/functions/v1/process-internal-automation([^a-zA-Z0-9_-]|$)'
  loop
    if exists(select 1 from public.internal_automation_flows where status='published')
       or exists(select 1 from public.internal_automation_queue where status in ('pending','processing','running')) then
      raise exception 'Automazioni legacy con lavoro presente: occorre prima trasferire i flussi';
    end if;
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

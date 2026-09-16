-- L'aggiornamento notturno delle liste si è fermato il 16/09/2026 alle 04:22 UTC
-- («canceling statement due to statement timeout»). Il server annulla ogni
-- istruzione oltre i 2 minuti (statement_timeout = 120000 nel file di
-- configurazione), e con le 16 liste dei flussi cold aggiunte il 15/09 il giro
-- dura di più: il 15/09 ci aveva messo 51 secondi.
--
-- Senza l'aggiornamento i contatti nuovi non entrano nelle liste, e quindi
-- nemmeno nei flussi. Il job si dà 15 minuti; di notte non c'è nessuno.
do $$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'liste-automatiche-nightly';
  if v_id is not null then
    perform cron.alter_job(job_id := v_id,
      command := 'set statement_timeout = ''15min''; select public.sincronizza_tutte_le_liste();');
  end if;
end
$$;

-- Ogni notte, dopo l'aggiornamento delle liste (04:20 UTC, fino a 15 minuti),
-- chi è entrato in una lista collegata a un flusso cold viene iscritto con
-- outreach_arruola_liste: i flussi contengono sempre tutti i contatti delle loro
-- liste, senza ondate a mano. Richiesta del titolare del 16/09/2026 per
-- ThermoDMR («sistemalo una volta per tutte»), valida per i tre brand.
-- Un giro senza nuovi dura circa 7 secondi; al massimo 3.000 iscrizioni a notte.
do $$
declare
  v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'outreach-arruola-liste';
  if v_id is null then
    perform cron.schedule('outreach-arruola-liste', '45 4 * * *',
      'select public.outreach_arruola_liste(null, 3000);');
  else
    perform cron.alter_job(job_id := v_id, schedule := '45 4 * * *',
      command := 'select public.outreach_arruola_liste(null, 3000);');
  end if;
end
$$;

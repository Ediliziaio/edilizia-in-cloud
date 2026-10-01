-- STAGED, INACTIVE. Deploy check-scheduled-triggers with appointment_triggers_only
-- support BEFORE enabling this job. Never speed up the legacy daily reminders.
-- Credentials are reused inside PostgreSQL and never copied into source or output.
do $cadence$
declare command_text text; replacement text; job_id bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron unavailable: appointment cadence requires deployment setup'; return;
  end if;
  select command into command_text from cron.job where jobname='check-scheduled-triggers-daily';
  if command_text is null then raise exception 'Existing authenticated scheduler job not found'; end if;
  replacement := regexp_replace(command_text, $pattern$body\s*:=\s*'\{\}'\s*::\s*jsonb$pattern$,
    $body$body := '{"mode":"appointment_triggers_only"}'::jsonb$body$, 'i');
  if replacement = command_text then raise exception 'Scheduler command changed: inspect body before staging the frequent job'; end if;
  -- Existing staged/activated jobs must not be silently disabled on a rerun.
  if exists(select 1 from cron.job where jobname='automation-appointment-triggers') then return; end if;
  job_id := cron.schedule('automation-appointment-triggers','*/5 * * * *',replacement);
  perform cron.alter_job(job_id, active := false);
end $cadence$;

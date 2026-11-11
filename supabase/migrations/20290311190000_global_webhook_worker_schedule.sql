-- Deploy dispatch-global-webhooks before applying this schedule.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function private.wake_global_webhooks() returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare secret text;request_id bigint;
begin
 -- Idle tenants produce no edge calls, and no historical events are replayed.
 if not exists(select 1 from public.webhooks w where w.is_active and w.paused_at is null and (
  ('task.overdue'=any(w.events) and exists(select 1 from public.tasks t where t.company_id=w.company_id and t.due_date<(now() at time zone 'Europe/Rome')::date and t.status not in ('completed','done','cancelled','canceled','completato','completata','annullato','annullata','cancellato') and not exists(select 1 from public.webhook_deliveries d where d.webhook_id=w.id and d.dedupe_key='task.overdue:'||t.id::text||':'||t.due_date::text)))
  or exists(select 1 from public.webhook_deliveries d where d.webhook_id=w.id and d.delivery_source='global' and d.status in ('pending','retrying') and d.next_attempt_at<=now() and (d.lease_until is null or d.lease_until<now())))) then return null;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='cron_secret';
 if nullif(secret,'') is null then raise exception 'Segreto del cron webhook non configurato';end if;
 select net.http_post(url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/dispatch-global-webhooks',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function private.wake_global_webhooks() from public,anon,authenticated,service_role;
select cron.schedule('dispatch-global-webhooks','* * * * *','select private.wake_global_webhooks();');

-- Ogni messaggio di un'azienda in Assistenza avvisa il team (prima non partiva nessuna email).
-- Destinatario degli avvisi interni di piattaforma: notificheotm@gmail.com.
insert into public.platform_settings (key, value)
values ('internal_alert_email', 'notificheotm@gmail.com')
on conflict (key) do update set value = excluded.value;

create or replace function public.notifica_messaggio_assistenza()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sender_role is distinct from 'super_admin' then
    perform net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/support-message-notify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)),
      body := jsonb_build_object('message_id', new.id),
      timeout_milliseconds := 5000);
  end if;
  return new;
exception when others then
  return new; -- l'avviso non deve mai bloccare l'invio del messaggio
end $$;

drop trigger if exists on_support_message_notify on public.support_messages;
create trigger on_support_message_notify
after insert on public.support_messages
for each row execute function public.notifica_messaggio_assistenza();

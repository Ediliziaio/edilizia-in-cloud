-- Calendari esterni: le chiamate del database alle edge function arrivano.
--
-- google_calendar_sveglia e calendario_esterno_sveglia chiamavano
-- google-calendar-sync / apple-calendar-sync con il solo x-cron-secret. Le due
-- funzioni hanno verify_jwt attivo: il gateway risponde 401
-- «Missing authorization header» prima ancora che il codice legga il segreto
-- (verificato il 16/09/2026). Effetto: annullare o cancellare un appuntamento
-- non toglieva l'evento da Google/Apple, e la coda delle pose non partiva.
--
-- Si aggiunge l'header Authorization con la chiave anon dal Vault (pubblica:
-- serve solo a superare il gateway; il permesso vero resta il x-cron-secret),
-- come fa già il job apple-calendar-sync-every-10min.
--
-- calendario_esterno_sveglia era eseguibile da authenticated: un utente poteva
-- chiedere la cancellazione di un evento esterno di qualunque azienda passando
-- appointmentId/googleEventId a piacere. La chiamano solo funzioni SECURITY
-- DEFINER (notify_google_calendar_sync), che non hanno bisogno del permesso.

set local lock_timeout = '3s';

create or replace function public.calendario_esterno_sveglia(p_funzione text, p_action text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  v_anon text;
begin
  if p_funzione not in ('google-calendar-sync', 'apple-calendar-sync') then return; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
   where name = 'silvio_internal_cron_secret' limit 1;
  select decrypted_secret into v_anon from vault.decrypted_secrets
   where name = 'supabase_anon_key' limit 1;
  if v_secret is null or v_anon is null then return; end if;
  perform net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/' || p_funzione,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-cron-secret', v_secret
    ),
    body := jsonb_build_object('action', p_action) || coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 8000
  );
exception when others then
  raise notice 'calendario_esterno_sveglia: %', sqlerrm;
end
$$;

create or replace function public.google_calendar_sveglia(p_action text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.calendario_esterno_sveglia('google-calendar-sync', p_action, p_body);
end
$$;

revoke all on function public.calendario_esterno_sveglia(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.google_calendar_sveglia(text, jsonb) from public, anon, authenticated;
grant execute on function public.calendario_esterno_sveglia(text, text, jsonb) to service_role;
grant execute on function public.google_calendar_sveglia(text, jsonb) to service_role;

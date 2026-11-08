-- Il backup di ogni notte (8 novembre 2026). La copia della domenica resta 90 giorni, quelle degli altri giorni 14.
-- Chi è stato fatto prima dell'11/11 tiene la regola con cui è nato (90 giorni), e l'ultima copia di un'azienda
-- attiva non si tocca mai: «ultima» guarda la data nel nome, così un'azienda ferma conserva l'ultimo giro.
create or replace function public.admin_backup_scaduti(p_limite integer default 1000)
returns setof text
language sql
stable
security definer
set search_path to 'public', 'storage'
as $function$
  with copie as (
    select o.name, o.created_at,
           split_part(o.name, '/', 1) as azienda,
           substring(o.name from '^[0-9a-f-]{36}/(\d{4}-\d{2}-\d{2})')::date as giorno,
           o.name ~ '-pre-delete\.json$' as pre_delete
      from storage.objects o
     where o.bucket_id = 'company-exports'
       and o.name ~ '^[0-9a-f-]{36}/\d{4}-\d{2}-\d{2}(-backup\.json|-pre-delete\.json|/.+)$'
  ), ultima as (
    select azienda, max(giorno) as giorno
      from copie
     where not pre_delete and created_at >= now() - interval '90 days'
     group by azienda
  )
  select c.name
    from copie c
    left join ultima u on u.azienda = c.azienda
   where c.created_at < now() - case
           when c.pre_delete or extract(dow from c.giorno) = 0 or c.giorno < date '2026-11-11' then interval '90 days'
           else interval '14 days'
         end
     and (
       not exists (select 1 from public.companies a where a.id::text = c.azienda)
       or u.giorno > c.giorno
     )
   order by c.created_at
   limit greatest(1, least(coalesce(p_limite, 1000), 5000));
$function$;

revoke all on function public.admin_backup_scaduti(integer) from public, anon, authenticated;
grant execute on function public.admin_backup_scaduti(integer) to service_role;

-- Dal lunedì al sabato; la domenica c'è già company-backup-settimanale. Parte dall'11/11, a compressione dei
-- vecchi file finita. La funzione risponde a pg_net entro 5 secondi e finisce il lavoro in sottofondo.
select cron.schedule(
  'company-backup-notturno',
  '30 2 * * 1-6',
  $job$
  select net.http_post(
    url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/company-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'silvio_internal_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  where now() >= timestamptz '2026-11-11 00:00:00+00';
  $job$
);

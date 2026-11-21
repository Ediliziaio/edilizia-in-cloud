-- Il ripristino accetta gli indici giornalieri e quelli delle singole generazioni.
do $$
declare
  v_definizione text := pg_get_functiondef('public.admin_ripristino_prova_apri(uuid,text,text[],integer,bigint)'::regprocedure);
  v_precedente constant text := '/[0-9]{4}-[0-9]{2}-[0-9]{2}/indice[.]json$';
  v_nuovo constant text := '/[0-9]{4}-[0-9]{2}-[0-9]{2}(-[0-9]{9}-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12})?/indice[.]json$';
begin
  if position(v_nuovo in v_definizione) > 0 then return; end if;
  if position(v_precedente in v_definizione) = 0 then
    raise exception 'Il controllo del percorso in admin_ripristino_prova_apri è cambiato.';
  end if;
  execute replace(v_definizione, v_precedente, v_nuovo);
end
$$;

create or replace function public.admin_backup_scaduti(p_limite integer default 1000)
returns table (percorso text)
language sql stable security definer set search_path = ''
as $$
  with copie as (
    select o.name, o.created_at,
           split_part(o.name, '/', 1) as azienda,
           substring(o.name from '^[0-9a-f-]{36}/(\d{4}-\d{2}-\d{2})')::date as giorno,
           split_part(o.name, '/', 2) as cartella,
           o.name ~ '-pre-delete\.json$' as pre_delete,
           o.name ~ '^[^/]+/\d{4}-\d{2}-\d{2}-\d{9}-[0-9a-f-]{36}/' as generazione
      from storage.objects o
     where o.bucket_id = 'company-exports'
       and o.name ~ '^[0-9a-f-]{36}/\d{4}-\d{2}-\d{2}(-backup\.json|(-[0-9a-f-]{36})?-pre-delete\.json|(-\d{9}-[0-9a-f-]{36})?/.+)$'
  ), indici as (
    select azienda, cartella, giorno, created_at
      from copie where name ~ '/indice\.json$' or name ~ '-backup\.json$'
  ), ultima as (
    select azienda, max(giorno) as giorno
      from indici where created_at >= now() - interval '90 days' group by azienda
  )
  select c.name
    from copie c
    left join ultima u on u.azienda = c.azienda
    left join indici i on i.azienda = c.azienda and i.cartella = c.cartella
   where c.created_at < now() - case
           when c.generazione and i.cartella is null then interval '14 days'
           when c.pre_delete or extract(dow from c.giorno) = 0 or c.giorno < date '2026-11-11' then interval '90 days'
           else interval '14 days'
         end
     and (
       (c.generazione and i.cartella is null)
       or not exists (select 1 from public.companies a where a.id::text = c.azienda)
       or u.giorno > c.giorno
     )
     and not (c.pre_delete and exists (
       select 1 from public.companies a where a.deleted_at is not null and a.deletion_export_path = c.name
     ))
   -- L'indice deve sparire per ultimo: a lotti, la generazione conserva
   -- la classificazione e la scadenza originarie finché ha dei file.
   order by (c.name ~ '/indice\.json$'), c.created_at
   limit greatest(1, least(coalesce(p_limite, 1000), 5000));
$$;

create or replace function public.ops_backup_mancanti(p_giorni integer default 8)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'azienda', x.name,
           'ultimo_backup', x.ultimo::date,
           'giorni_senza', case when x.ultimo is null then null else current_date - x.ultimo::date end,
           'nota', case when x.ultimo is null then 'mai salvata' else 'l''ultima copia è vecchia' end
         ) order by x.ultimo nulls first), '[]'::jsonb)
    from (
      select c.name,
             (select max(o.created_at) from storage.objects o
               where o.bucket_id = 'company-exports' and o.name like c.id::text || '/%'
                 and o.name ~ '^[^/]+/\d{4}-\d{2}-\d{2}(-backup\.json|(-\d{9}-[0-9a-f-]{36})?/indice\.json)$') as ultimo
        from public.companies c
       where c.deleted_at is null and c.created_at < now() - make_interval(days => greatest(p_giorni, 1))
    ) x where x.ultimo is null or x.ultimo < now() - make_interval(days => greatest(p_giorni, 1));
$$;

-- La compressione cambia solo la codifica dei blocchi già scritti.
do $$
declare
  v_definizione text := pg_get_functiondef('public.admin_backup_da_comprimere(bigint,uuid)'::regprocedure);
  v_precedente constant text := '|/[^/]+/\d+\.json)';
  v_nuovo constant text := '|(-\d{9}-[0-9a-f-]{36})?/[^/]+/\d+(-[0-9a-f-]{36})?\.json)';
begin
  if position(v_nuovo in v_definizione) > 0 then return; end if;
  if position(v_precedente in v_definizione) = 0 then
    raise exception 'Il filtro dei blocchi in admin_backup_da_comprimere è cambiato.';
  end if;
  execute replace(v_definizione, v_precedente, v_nuovo);
end
$$;

revoke all on function public.admin_backup_scaduti(integer), public.ops_backup_mancanti(integer) from public, anon, authenticated;
grant execute on function public.admin_backup_scaduti(integer), public.ops_backup_mancanti(integer) to service_role;

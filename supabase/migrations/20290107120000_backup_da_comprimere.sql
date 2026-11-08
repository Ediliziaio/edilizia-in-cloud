-- I backup si comprimono dopo essere stati scritti, a piccoli lotti (08/11/2026).
-- Questa funzione dice quali file: i blocchi e i dump unici ancora in JSON, dai più vecchi, fino a un peso per
-- giro. Restano fuori indice.json e azienda.json (leggeri, e li legge la scheda), le copie pre-delete, e i file
-- dell'ultima ora: un backup in corso non si tocca.

create or replace function public.admin_backup_da_comprimere(p_byte_massimi bigint, p_azienda uuid default null)
returns table (percorso text, peso bigint)
language sql
stable
security definer
set search_path to ''
as $function$
  with candidati as (
    select o.name, (o.metadata->>'size')::bigint as peso, o.created_at
      from storage.objects o
     where o.bucket_id = 'company-exports'
       and o.metadata->>'mimetype' = 'application/json'
       and o.name ~ '^[0-9a-f-]{36}/\d{4}-\d{2}-\d{2}(-backup\.json|/[^/]+/\d+\.json)$'
       and o.created_at < now() - interval '1 hour'
       and (o.metadata->>'size')::bigint <= 31457280
       and (p_azienda is null or split_part(o.name, '/', 1) = p_azienda::text)
     order by o.created_at, o.name
     limit 500
  ), progressivi as (
    select c.*, sum(c.peso) over (order by c.created_at, c.name) as somma from candidati c
  )
  select p.name, p.peso
    from progressivi p
   where p.somma - p.peso < greatest(p_byte_massimi, 1)
   order by p.created_at, p.name;
$function$;

revoke all on function public.admin_backup_da_comprimere(bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_backup_da_comprimere(bigint, uuid) to service_role;

-- Ricostruito il 30/10/2026 dal SQL registrato in schema_migrations: la
-- migrazione era stata applicata in produzione senza il suo file, e il
-- controllo Supabase Preview si fermava. Testo identico a quello applicato.

create or replace function public.admin_backup_scaduti(p_limite integer default 1000)
returns setof text
language sql
stable
security definer
set search_path = public, storage
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'company-exports'
     and o.created_at < now() - interval '90 days'
     and o.name ~ '^[0-9a-f-]{36}/\d{4}-\d{2}-\d{2}(-backup\.json|-pre-delete\.json|/.+)$'
     and (
       not exists (select 1 from public.companies c where c.id::text = split_part(o.name, '/', 1))
       or exists (
         select 1 from storage.objects n
          where n.bucket_id = 'company-exports'
            and split_part(n.name, '/', 1) = split_part(o.name, '/', 1)
            and n.name ~ '^[0-9a-f-]{36}/\d{4}-\d{2}-\d{2}(-backup\.json|/.+)$'
            and n.created_at >= now() - interval '90 days')
     )
   order by o.created_at
   limit greatest(1, least(coalesce(p_limite, 1000), 5000));
$$;
revoke all on function public.admin_backup_scaduti(integer) from public, anon, authenticated;
grant execute on function public.admin_backup_scaduti(integer) to service_role;

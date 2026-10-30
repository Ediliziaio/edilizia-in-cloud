-- Ricostruito il 30/10/2026 dal SQL registrato in schema_migrations: la
-- migrazione era stata applicata in produzione senza il suo file, e il
-- controllo Supabase Preview si fermava. Testo identico a quello applicato.

set local lock_timeout = '3s';

do $guardia$
declare
  v_testo text;
begin
  select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    into v_testo
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'hr_doc_storage_admin';
  if not found then
    raise exception 'Policy storage.objects «hr_doc_storage_admin» non trovata: la migrazione va rivista';
  end if;
  if v_testo !~ 'company_staff' and v_testo !~ 'can_view_persone' then
    raise exception 'Policy storage.objects «hr_doc_storage_admin» cambiata dopo il censimento: la migrazione va rivista';
  end if;
  if not exists (
    select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'hr_doc_storage_self_read'
  ) then
    raise exception 'Manca «hr_doc_storage_self_read»: il lavoratore non aprirebbe più i propri documenti';
  end if;
end
$guardia$;

drop policy if exists hr_doc_storage_admin on storage.objects;
create policy hr_doc_storage_admin on storage.objects
  for all to authenticated
  using (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[1] = ((select public.get_my_company_id()))::text
    and (
      (select public.e_amministratore_di((select public.get_my_company_id())))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_permission_for_company((select auth.uid()), 'can_view_persone', (select public.get_my_company_id())))
    )
  )
  with check (
    bucket_id = 'hr-documenti'
    and (storage.foldername(name))[1] = ((select public.get_my_company_id()))::text
    and (
      (select public.e_amministratore_di((select public.get_my_company_id())))
      or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
      or (select public.has_permission_for_company((select auth.uid()), 'can_view_persone', (select public.get_my_company_id())))
    )
  );

do $verifica$
declare
  v_testo text;
begin
  select coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '#' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
    into v_testo
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'hr_doc_storage_admin';
  if v_testo ~ 'company_staff'
     or v_testo !~ 'has_permission_for_company'
     or v_testo !~ 'can_view_persone'
     or v_testo !~ 'e_amministratore_di'
     or v_testo !~ 'super_admin' then
    raise exception 'hr_doc_storage_admin non è come previsto: %', v_testo;
  end if;
end
$verifica$;

-- Ricostruita il 30/10/2026 dallo SQL registrato in supabase_migrations.schema_migrations
-- (statements): la migrazione era applicata in produzione ma il file non c'era in nessuna
-- cartella. Lo staff legge i PDF delle bozze email estratti (email_attachments_bozza_read).
set local lock_timeout = '3s';

do $guardia$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'email_documento_estratto' and column_name = 'pdf_storage_path'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'email_documento_estratto' and column_name = 'pdf_storage_bucket'
  ) then
    raise exception 'email_documento_estratto senza pdf_storage_bucket/pdf_storage_path: la migrazione va rivista';
  end if;
  if not exists (
    select 1 from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'email_attachments_owner_read'
  ) then
    raise exception 'Manca «email_attachments_owner_read» su storage.objects: il bucket non è più quello censito';
  end if;
end
$guardia$;

create index if not exists idx_email_doc_estratto_pdf_path
  on public.email_documento_estratto (pdf_storage_path)
  where pdf_storage_path is not null;

drop policy if exists email_attachments_bozza_read on storage.objects;
create policy email_attachments_bozza_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'email-attachments'
    and exists (
      select 1
        from public.email_documento_estratto d
       where d.pdf_storage_bucket = 'email-attachments'
         and d.pdf_storage_path = storage.objects.name
    )
  );

do $verifica$
declare
  v_testo text;
  v_cmd "char";
begin
  select coalesce(pg_get_expr(p.polqual, p.polrelid), ''), p.polcmd
    into v_testo, v_cmd
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'storage' and c.relname = 'objects' and p.polname = 'email_attachments_bozza_read';
  if not found then
    raise exception 'email_attachments_bozza_read non è stata creata';
  end if;
  if v_cmd <> 'r' then
    raise exception 'email_attachments_bozza_read deve essere di sola lettura (SELECT), non %', v_cmd;
  end if;
  if v_testo !~ 'email-attachments' or v_testo !~ 'email_documento_estratto' or v_testo !~ 'pdf_storage_path' then
    raise exception 'email_attachments_bozza_read non è come prevista: %', v_testo;
  end if;
  if (select count(*) from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'storage' and c.relname = 'objects'
         and p.polname in ('email_attachments_owner_read', 'email_attachments_owner_write', 'email_attachments_owner_delete')) <> 3 then
    raise exception 'Le tre policy owner del bucket email-attachments dovevano restare';
  end if;
end
$verifica$;

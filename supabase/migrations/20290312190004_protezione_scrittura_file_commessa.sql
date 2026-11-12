-- Local draft: object writes require the same edit and classification rights as metadata.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function private.office_attachment_file_write_allowed(p_bucket text,p_path text)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare a record; found_reference boolean:=false; order_key text; company_key text; target_order uuid; c uuid;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then return false;end if;
 if p_bucket not in ('order-attachments','order-variation-documents') then return false;end if;
 for a in select x.order_id,x.access_scope from public.order_attachments x where
  x.file_url=case when p_bucket='order-variation-documents' then p_bucket||'/'||p_path else p_path end or
  (p_bucket='order-attachments' and x.thumb_path=p_path)
 loop
  found_reference:=true;
  c:=public.get_order_company_id(a.order_id);
  if not coalesce(private.office_attachment_allowed(a.order_id,a.access_scope),false)
    or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',c),false)
    or public.utente_sola_lettura(c) then return false;end if;
 end loop;
 if found_reference then return true;end if;
 -- Upload precedes metadata creation. Only a visible, editable order path is valid.
 if p_bucket='order-variation-documents' then
  company_key:=split_part(p_path,'/',1);order_key:=split_part(p_path,'/',2);
 else order_key:=split_part(p_path,'/',case when split_part(p_path,'/',1)='orders' then 2 else 1 end);end if;
 if order_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false;end if;
 target_order:=order_key::uuid;c:=public.get_order_company_id(target_order);
 if c is null or (company_key is not null and company_key<>c::text) then return false;end if;
 return coalesce(private.office_visible_order(target_order),false)
  and coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',c),false)
  and not public.utente_sola_lettura(c);
end $$;
revoke all on function private.office_attachment_file_write_allowed(text,text) from public,anon;
grant execute on function private.office_attachment_file_write_allowed(text,text) to authenticated;
drop policy if exists office_attachment_file_insert on storage.objects;
create policy office_attachment_file_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id not in ('order-attachments','order-variation-documents') or private.office_attachment_file_write_allowed(bucket_id,name));
drop policy if exists office_attachment_file_update on storage.objects;
create policy office_attachment_file_update on storage.objects as restrictive for update to authenticated using(bucket_id not in ('order-attachments','order-variation-documents') or private.office_attachment_file_write_allowed(bucket_id,name)) with check(bucket_id not in ('order-attachments','order-variation-documents') or private.office_attachment_file_write_allowed(bucket_id,name));
drop policy if exists office_attachment_file_delete on storage.objects;
create policy office_attachment_file_delete on storage.objects as restrictive for delete to authenticated using(bucket_id not in ('order-attachments','order-variation-documents') or private.office_attachment_file_write_allowed(bucket_id,name));
notify pgrst,'reload schema';

-- File degli acquisti salvati sotto l'azienda nel bucket order-attachments.
--
-- La regola RESTRICTIVE dello storage (office_attachment_file_insert / _read /
-- _update / _delete, migrazione 20290314000003_uffici_commesse_crm_separati)
-- ammette solo file registrati in order_attachments o percorsi che iniziano
-- con l'id di una commessa. Due flussi salvano invece sotto l'azienda e dal
-- browser erano rifiutati:
--   - «Controllo documento fornitore» (offerta / conferma d'ordine):
--     <azienda>/controlli-fornitore/<impronta>-originale.<ext>, caricato dal
--     browser e riletto dalla edge verify-purchase-order col token dell'utente.
--     Ultimo file riuscito: 11/11/2026.
--   - Offerta allegata a una RDO: <azienda>/rdo/<richiesta>/<ts>-<nome>.
--     Nessun file è mai stato salvato.
-- Il controllo non ha una commessa (un ordine d'acquisto può non averla), e i
-- file non sono allegati di commessa: non vanno in order_attachments.
--
-- Chi può: stessa regola della edge e della tabella controlli_documento_fornitore.
--   scrivere — accesso all'azienda, non in sola lettura, e acquisti
--              (can_manage_purchasing) o modifica commesse (can_edit_orders);
--   leggere  — accesso all'azienda e uno fra acquisti, modifica commesse,
--              vede commesse (can_view_orders).
-- Clienti esterni e utenti bloccati restano fuori (lo controllano già le due
-- funzioni chiamanti).

create or replace function private.file_acquisti_azienda(p_path text, p_scrittura boolean)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  primo text := split_part(p_path, '/', 1);
  cartella text := split_part(p_path, '/', 2);
  az uuid;
  utente uuid := auth.uid();
begin
  if utente is null or p_path is null or position('..' in p_path) > 0 then return false; end if;
  if cartella not in ('controlli-fornitore', 'rdo') or split_part(p_path, '/', 3) = '' then return false; end if;
  if primo !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  az := primo::uuid;
  if not coalesce(public.user_can_access_company(az), false) then return false; end if;
  if cartella = 'rdo' and not exists (
    select 1 from public.supplier_rfqs r
     where r.id::text = split_part(p_path, '/', 3) and r.company_id = az
  ) then return false; end if;
  if p_scrittura then
    return not coalesce(public.utente_sola_lettura(az), false)
      and (coalesce(public.has_permission_for_company(utente, 'can_manage_purchasing', az), false)
        or coalesce(public.has_permission_for_company(utente, 'can_edit_orders', az), false));
  end if;
  return coalesce(public.has_permission_for_company(utente, 'can_manage_purchasing', az), false)
      or coalesce(public.has_permission_for_company(utente, 'can_edit_orders', az), false)
      or coalesce(public.has_permission_for_company(utente, 'can_view_orders', az), false);
end
$function$;

revoke all on function private.file_acquisti_azienda(text, boolean) from public, anon, authenticated;

-- Scrittura: il ramo nuovo si prova solo quando il file non è registrato in
-- order_attachments (se lo è, decide la commessa come prima).
create or replace function private.office_attachment_file_write_allowed(p_bucket text, p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
 -- File degli acquisti sotto l'azienda (controlli documento, offerte RDO).
 if p_bucket='order-attachments' and split_part(p_path,'/',2) in ('controlli-fornitore','rdo') then
  return private.file_acquisti_azienda(p_path,true);
 end if;
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
end $function$;

-- Lettura: come prima per i file registrati; in più i file degli acquisti
-- sotto l'azienda, che una riga in order_attachments non l'hanno.
create or replace function private.office_attachment_file_allowed(p_bucket text, p_path text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$select auth.uid() is not null and not public.utente_bloccato() and ((exists(
 select 1 from public.order_attachments a where
 (a.file_url=case when p_bucket='order-variation-documents' then p_bucket||'/'||p_path else p_path end or (p_bucket='order-attachments' and a.thumb_path=p_path))
 and private.office_attachment_allowed(a.order_id,a.access_scope) and (not public.utente_e_cliente_esterno() or a.visible_to_customer))
 and not exists(select 1 from public.order_attachments a where
 (a.file_url=case when p_bucket='order-variation-documents' then p_bucket||'/'||p_path else p_path end or (p_bucket='order-attachments' and a.thumb_path=p_path))
 and (not private.office_attachment_allowed(a.order_id,a.access_scope) or (public.utente_e_cliente_esterno() and not a.visible_to_customer))))
 or (p_bucket='order-attachments' and split_part(p_path,'/',2) in ('controlli-fornitore','rdo')
  and not public.utente_e_cliente_esterno()
  and private.file_acquisti_azienda(p_path,false)))$function$;

revoke all on function private.office_attachment_file_write_allowed(text, text) from public, anon;
revoke all on function private.office_attachment_file_allowed(text, text) from public, anon;
grant execute on function private.office_attachment_file_write_allowed(text, text) to authenticated;
grant execute on function private.office_attachment_file_allowed(text, text) to authenticated;

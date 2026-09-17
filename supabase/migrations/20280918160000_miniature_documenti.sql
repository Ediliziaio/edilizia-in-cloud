-- Miniature dei documenti create al caricamento (dal browser di chi carica) e
-- salvate accanto al file: la griglia le mostra senza scaricare foto intere né
-- usare la conversione immagini a pagamento del server. Cliccando, il file si
-- scarica.

alter table public.order_attachments add column if not exists thumb_path text;
alter table public.customer_documents add column if not exists thumb_path text;

-- La RPC dei documenti del cliente nella commessa restituisce anche la miniatura.
drop function if exists public.documenti_cliente_della_commessa(uuid);
create function public.documenti_cliente_della_commessa(p_order_id uuid)
returns table (
  id uuid,
  document_type text,
  file_name text,
  file_path text,
  file_type text,
  file_size bigint,
  created_at timestamptz,
  thumb_path text
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
  v_customer uuid;
begin
  select o.company_id, o.customer_id into v_company, v_customer
    from public.orders o where o.id = p_order_id;

  if v_company is null
     or not public.user_can_access_company(v_company)
     or not (select public.has_permission((select auth.uid()), 'can_view_orders')) then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;

  if v_customer is null then
    return;
  end if;

  return query
    select d.id, d.document_type, d.file_name, d.file_path, d.file_type, d.file_size::bigint, d.created_at, d.thumb_path
      from public.customer_documents d
     where d.company_id = v_company
       and d.customer_id = v_customer
       and d.document_type in ('identity', 'fiscal_code', 'other')
     order by d.document_type, d.created_at;
end;
$$;
revoke all on function public.documenti_cliente_della_commessa(uuid) from public, anon;
grant execute on function public.documenti_cliente_della_commessa(uuid) to authenticated;

-- La divisione pubblica tutte le bolle insieme e conserva il PDF originale.
create or replace function public.ddt_whatsapp_dividi_pdf(p_id uuid, p_lease uuid, p_figli jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  originale public.ddt_document_jobs%rowtype;
  parte jsonb;
  figlio uuid;
  trovato uuid;
  figli uuid[] := '{}';
  percorso text;
begin
  select * into originale from public.ddt_document_jobs
   where id = p_id and lease_id = p_lease and lease_until > clock_timestamp()
     and source = 'whatsapp' and status = 'processing' and ddt_id is null
   for update;
  if not found then
    return false;
  end if;
  if jsonb_array_length(originale.files) <> 1 or originale.files->0->>'mime' is distinct from 'application/pdf'
    or p_figli is null or jsonb_typeof(p_figli) <> 'array' or jsonb_array_length(p_figli) not between 2 and 120 then
    raise exception 'Divisione del PDF non valida' using errcode = '22023';
  end if;
  for parte in select value from jsonb_array_elements(p_figli) loop
    figlio := (parte->>'id')::uuid;
    percorso := originale.company_id::text || '/' || coalesce(originale.created_by::text, 'null') || '/' || figlio::text || '/1-originale.pdf';
    if figlio is null or figlio = p_id or parte->>'file_hash' is null
      or parte->>'file_hash' !~ '^[0-9a-f]{64}$' or parte->>'sha256' is null
      or parte->>'sha256' !~ '^[0-9a-f]{64}$'
      or coalesce((parte->>'size')::bigint, 0) not between 1 and 18874368
      or not exists (select 1 from storage.objects where bucket_id = 'ddt-documenti' and name = percorso) then
      raise exception 'Copia della bolla incompleta' using errcode = '22023';
    end if;
    insert into public.ddt_document_jobs (
      id, company_id, created_by, employee_id, order_id, warehouse_id, destinazione, whatsapp_voice_message_id,
      source, source_key, file_hash, files
    ) values (
      figlio, originale.company_id, originale.created_by, originale.employee_id, originale.order_id,
      originale.warehouse_id, originale.destinazione, originale.whatsapp_voice_message_id, 'whatsapp',
      originale.source_key, parte->>'file_hash',
      jsonb_build_array(jsonb_build_object(
        'path', percorso, 'bucket', 'ddt-documenti', 'mime', 'application/pdf',
        'name', left(coalesce(parte->>'name', 'Bolla.pdf'), 160), 'size', (parte->>'size')::bigint,
        'sha256', parte->>'sha256', 'origine_pdf', p_id
      ))
    ) on conflict (company_id, file_hash) do nothing
    returning id into trovato;
    if trovato is null then
      select id into strict trovato from public.ddt_document_jobs
       where company_id = originale.company_id and file_hash = parte->>'file_hash';
    end if;
    if trovato = p_id then
      raise exception 'Il PDF originale non può essere una parte' using errcode = '22023';
    end if;
    if not (trovato = any(figli)) then
      figli := array_append(figli, trovato);
    end if;
  end loop;
  update public.ddt_document_jobs
     set status = 'split', split_ids = figli, lease_id = null, lease_until = null,
         result = null, last_error = null, updated_at = now()
   where id = p_id;
  return true;
end
$$;

revoke all on function public.ddt_whatsapp_dividi_pdf(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ddt_whatsapp_dividi_pdf(uuid, uuid, jsonb) to service_role;

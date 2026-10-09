-- One transaction replaces extracted rows and publishes their source/checks.
-- Service-only, SECURITY INVOKER: the Edge Function must authenticate the user
-- and require company access BEFORE this RPC. No new public bypass of RLS.
create or replace function public.computo_salva_estrazione_atomica(
  p_upload_id uuid, p_company_id uuid, p_rows jsonb,
  p_result jsonb, p_method text, p_confidence numeric
) returns jsonb
language plpgsql security invoker
set search_path = public, pg_temp
set statement_timeout = '20s'
as $$
declare
  v_upload public.computo_uploads%rowtype;
  v_count integer;
begin
  if p_company_id is null or p_upload_id is null
    or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 10000
    or jsonb_typeof(p_result) is distinct from 'object'
    or p_method is null or p_method not in ('pdf_text','pdf_vision','xlsx_parse','xpwe_parse')
    or p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'Dati estrazione non validi';
  end if;

  select * into v_upload from public.computo_uploads
    where id = p_upload_id and company_id = p_company_id for update;
  if not found then raise exception 'Computo non disponibile in questa azienda'; end if;
  if v_upload.quote_id is not null or v_upload.extraction_status in ('completed','generating') then
    raise exception 'Computo gia utilizzato: non sovrascrivere il preventivo';
  end if;
  if exists (select 1 from public.quote_items qi
    join public.computo_voci_estratte cv on cv.id = qi.computo_voce_id
    where cv.computo_upload_id = p_upload_id) then
    raise exception 'Voci gia utilizzate in un preventivo: non sovrascrivere';
  end if;
  if exists (select 1 from public.computo_voci_estratte
    where computo_upload_id = p_upload_id and is_modified is true) then
    raise exception 'Computo gia modificato: non sovrascrivere la revisione';
  end if;

  -- Delete/insert/status change roll back together on ANY malformed row.
  delete from public.computo_voci_estratte
    where computo_upload_id = p_upload_id and company_id = p_company_id;
  insert into public.computo_voci_estratte (
    computo_upload_id, company_id, capitolo_numero, capitolo_nome,
    codice_voce, codice_prezzario, descrizione_breve, descrizione_estesa,
    unita_misura, quantita, prezzo_unitario_computo, importo_computo,
    confidence, warnings, ai_notes, ordine, is_included
  ) select p_upload_id, p_company_id, r.capitolo_numero, r.capitolo_nome,
    r.codice_voce, r.codice_prezzario, r.descrizione_breve, r.descrizione_estesa,
    r.unita_misura, r.quantita, r.prezzo_unitario_computo, r.importo_computo,
    r.confidence, r.warnings, r.ai_notes, r.ordine, true
  from jsonb_to_recordset(p_rows) as r (
    capitolo_numero integer, capitolo_nome text, codice_voce text, codice_prezzario text,
    descrizione_breve text, descrizione_estesa text, unita_misura text,
    quantita numeric(14,4), prezzo_unitario_computo numeric(12,4), importo_computo numeric(14,2),
    confidence numeric(4,3), warnings text[], ai_notes text, ordine integer
  );
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_rows) then raise exception 'Salvataggio incompleto'; end if;

  update public.computo_uploads set
    extraction_status = 'review', extraction_method = p_method,
    raw_extracted_json = p_result, extraction_confidence = p_confidence,
    extraction_completed_at = now(), extraction_error = null,
    oggetto_lavori = nullif(p_result->'metadata'->>'oggetto_lavori', ''),
    committente = nullif(p_result->'metadata'->>'committente', ''),
    progettista = nullif(p_result->'metadata'->>'progettista', ''),
    data_computo = nullif(p_result->'metadata'->>'data_computo', '')::date,
    updated_at = now()
  where id = p_upload_id and company_id = p_company_id;
  return jsonb_build_object('upload_id', p_upload_id, 'saved_count', v_count);
end;
$$;
revoke all on function public.computo_salva_estrazione_atomica(uuid,uuid,jsonb,jsonb,text,numeric) from public, anon, authenticated;
grant execute on function public.computo_salva_estrazione_atomica(uuid,uuid,jsonb,jsonb,text,numeric) to service_role;

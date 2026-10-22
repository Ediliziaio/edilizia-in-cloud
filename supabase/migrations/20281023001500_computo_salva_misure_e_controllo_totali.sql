-- ════════════════════════════════════════════════════════════════════════════
-- Computo di commessa: il salvataggio atomico dell'estrazione porta anche
-- gerarchia, righe di misura e controllo dei totali
-- ════════════════════════════════════════════════════════════════════════════
-- `computo-ai-extract` ora legge il PDF di PriMus e l'XPWE senza AI e manda,
-- per ogni voce, numero d'ordine, codice tariffa, super-categoria › categoria ›
-- sotto-categoria, sicurezza / detrazione / a corpo e le righe di misura
-- (`misure`, array). Nel risultato manda anche `controllo_totali` (voci lette,
-- totale calcolato, oneri della sicurezza, differenze per voce e capitolo).
--
-- Stessa firma e stesse garanzie di prima (tutto o niente, mai sopra un
-- preventivo già fatto o una revisione modificata). In più:
--   - le colonne nuove di computo_voci_estratte (20281022231000);
--   - le righe di misura in computo_voci_misure, legate alla voce per «ordine»;
--   - su computo_uploads: totale_dichiarato, totale_calcolato, controllo_totali,
--     oneri_sicurezza, prezzari (solo se il risultato li porta);
--   - un computo «contrattuale» non si sovrascrive.
-- Una edge function vecchia che non manda i campi nuovi continua a funzionare
-- (campi assenti = null / false / nessuna misura).
--
-- Nessuna riga scritta dalla migrazione: sostituisce solo la funzione. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.computo_salva_estrazione_atomica(
  p_upload_id uuid, p_company_id uuid, p_rows jsonb, p_result jsonb, p_method text, p_confidence numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '20s'
AS $function$
declare
  v_upload public.computo_uploads%rowtype;
  v_count integer;
  v_misure integer;
  v_controllo jsonb := case when jsonb_typeof(p_result->'controllo_totali') = 'object' then p_result->'controllo_totali' end;
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
  if v_upload.stato = 'contrattuale' then
    raise exception 'Computo contrattuale: non si sovrascrive';
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
  -- Le righe di misura delle voci cancellate se ne vanno con loro (ON DELETE CASCADE).
  delete from public.computo_voci_estratte
    where computo_upload_id = p_upload_id and company_id = p_company_id;
  insert into public.computo_voci_estratte (
    computo_upload_id, company_id, capitolo_numero, capitolo_nome,
    codice_voce, codice_prezzario, descrizione_breve, descrizione_estesa,
    unita_misura, quantita, prezzo_unitario_computo, importo_computo,
    confidence, warnings, ai_notes, ordine, is_included,
    numero_ordine, codice_tariffa, super_categoria, categoria, sotto_categoria,
    is_sicurezza, is_detrazione, a_corpo
  ) select p_upload_id, p_company_id, r.capitolo_numero, r.capitolo_nome,
    r.codice_voce, r.codice_prezzario, r.descrizione_breve, r.descrizione_estesa,
    r.unita_misura, r.quantita, r.prezzo_unitario_computo, r.importo_computo,
    r.confidence, r.warnings, r.ai_notes, r.ordine, true,
    nullif(r.numero_ordine, ''), nullif(r.codice_tariffa, ''), nullif(r.super_categoria, ''),
    nullif(r.categoria, ''), nullif(r.sotto_categoria, ''),
    coalesce(r.is_sicurezza, false), coalesce(r.is_detrazione, false), coalesce(r.a_corpo, false)
  from jsonb_to_recordset(p_rows) as r (
    capitolo_numero integer, capitolo_nome text, codice_voce text, codice_prezzario text,
    descrizione_breve text, descrizione_estesa text, unita_misura text,
    quantita numeric(14,4), prezzo_unitario_computo numeric(12,4), importo_computo numeric(14,2),
    confidence numeric(4,3), warnings text[], ai_notes text, ordine integer,
    numero_ordine text, codice_tariffa text, super_categoria text, categoria text, sotto_categoria text,
    is_sicurezza boolean, is_detrazione boolean, a_corpo boolean
  );
  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_rows) then raise exception 'Salvataggio incompleto'; end if;
  if (select count(distinct (r->>'ordine')) from jsonb_array_elements(p_rows) r) <> v_count then
    raise exception 'Ordine delle voci ripetuto: le misure non saprebbero a che voce andare';
  end if;

  -- Righe di misura (libretto): legate alla voce attraverso «ordine».
  insert into public.computo_voci_misure (
    company_id, voce_id, ordine, descrizione, parti_uguali, lunghezza, larghezza, altezza_peso, quantita, formula
  ) select p_company_id, v.id, m.ord::integer,
    nullif(m.val->>'descrizione', ''),
    case when jsonb_typeof(m.val->'parti_uguali') = 'number' then (m.val->>'parti_uguali')::numeric end,
    case when jsonb_typeof(m.val->'lunghezza') = 'number' then (m.val->>'lunghezza')::numeric end,
    case when jsonb_typeof(m.val->'larghezza') = 'number' then (m.val->>'larghezza')::numeric end,
    case when jsonb_typeof(m.val->'altezza_peso') = 'number' then (m.val->>'altezza_peso')::numeric end,
    case when jsonb_typeof(m.val->'quantita') = 'number' then (m.val->>'quantita')::numeric end,
    nullif(m.val->>'formula', '')
  from jsonb_array_elements(p_rows) as r(riga)
  join public.computo_voci_estratte v
    on v.computo_upload_id = p_upload_id and v.company_id = p_company_id and v.ordine = (r.riga->>'ordine')::integer
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.riga->'misure') = 'array' then r.riga->'misure' else '[]'::jsonb end
  ) with ordinality as m(val, ord)
  where jsonb_typeof(m.val) = 'object';
  get diagnostics v_misure = row_count;

  update public.computo_uploads set
    extraction_status = 'review', extraction_method = p_method,
    raw_extracted_json = p_result, extraction_confidence = p_confidence,
    extraction_completed_at = now(), extraction_error = null,
    oggetto_lavori = nullif(p_result->'metadata'->>'oggetto_lavori', ''),
    committente = nullif(p_result->'metadata'->>'committente', ''),
    progettista = nullif(p_result->'metadata'->>'progettista', ''),
    data_computo = nullif(p_result->'metadata'->>'data_computo', '')::date,
    totale_dichiarato = case when jsonb_typeof(p_result->'metadata'->'totale_computo') = 'number'
      then (p_result->'metadata'->>'totale_computo')::numeric else totale_dichiarato end,
    totale_calcolato = case when jsonb_typeof(v_controllo->'totale_calcolato') = 'number'
      then (v_controllo->>'totale_calcolato')::numeric else totale_calcolato end,
    oneri_sicurezza = case when jsonb_typeof(v_controllo->'oneri_sicurezza') = 'number'
      then (v_controllo->>'oneri_sicurezza')::numeric else oneri_sicurezza end,
    controllo_totali = coalesce(v_controllo, controllo_totali),
    prezzari = case when jsonb_typeof(p_result->'prezzari') = 'array' and jsonb_array_length(p_result->'prezzari') > 0
      then array(select jsonb_array_elements_text(p_result->'prezzari')) else prezzari end,
    updated_at = now()
  where id = p_upload_id and company_id = p_company_id;
  return jsonb_build_object('upload_id', p_upload_id, 'saved_count', v_count, 'misure_count', v_misure);
end;
$function$;

-- Resta del solo service role (la chiama la edge function).
REVOKE ALL ON FUNCTION public.computo_salva_estrazione_atomica(uuid, uuid, jsonb, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.computo_salva_estrazione_atomica(uuid, uuid, jsonb, jsonb, text, numeric) TO service_role;

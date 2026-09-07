-- Applicata in produzione il 7 settembre 2026 via MCP.
--
-- Numero e documento nascono nella stessa transazione, e i tipi non gestiti
-- vengono rifiutati PRIMA di toccare il contatore. Vedi 20280907100600 per il
-- perche'.
--
-- `jsonb_populate_record` su un record nullo lascia a NULL le colonne che il
-- payload non nomina, e un NULL esplicito non fa scattare il default della
-- colonna: per questo `id`, `created_at` e le colonne con default si riempiono
-- a mano qui sotto.
--
-- Provata su dati veri in transazione annullata:
--   tentativo con «parcella»  -> rifiutato, contatore fermo a 37
--   fattura valida            -> contatore 38, documento FT-2026-0038 scritto
create or replace function public.documento_crea(p_company_id uuid, p_dati jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tipo    text;
  v_anno    integer := extract(year from now())::integer;
  v_numero  text;
  v_prog    integer;
  v_riga    public.documenti_fiscali%rowtype;
  v_id      uuid;
  c_ammessi text[] := array['fattura','fattura_pa','nota_credito','nota_debito',
                            'autofattura','fattura_riepilogativa','proforma',
                            'preventivo','ddt'];
begin
  if public.user_can_access_company(p_company_id) is not true then
    raise exception 'Accesso negato' using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'documento_crea: serve un utente autenticato' using errcode = '42501';
  end if;

  v_tipo := nullif(btrim(p_dati->>'tipo'), '');
  if v_tipo is null then
    raise exception 'Manca il tipo di documento' using errcode = '22023';
  end if;

  -- Prima di tutto, e soprattutto prima del contatore.
  if not (v_tipo = any (c_ammessi)) then
    raise exception 'Il tipo di documento "%" non e'' ancora gestito. Tipi disponibili: %.',
      v_tipo, array_to_string(c_ammessi, ', ')
      using errcode = '22023';
  end if;

  v_numero := public.genera_numero_documento_native(p_company_id, v_tipo, v_anno);
  v_prog := coalesce(nullif(regexp_replace(v_numero, '^.*-', ''), '')::integer, 1);

  v_riga := jsonb_populate_record(
    null::public.documenti_fiscali,
    p_dati
      || jsonb_build_object(
           'company_id', p_company_id,
           'numero', v_numero,
           'numero_progressivo', v_prog,
           'anno', v_anno,
           'tipo', v_tipo,
           'stato', coalesce(nullif(p_dati->>'stato',''), 'bozza'))
      - 'id' - 'created_at' - 'updated_at' - 'version' - 'deleted_at'
  );

  v_riga.id            := gen_random_uuid();
  v_riga.created_at    := now();
  v_riga.updated_at    := now();
  v_riga.version       := 1;
  v_riga.deleted_at    := null;
  v_riga.data_emissione := coalesce(v_riga.data_emissione, current_date);
  v_riga.cliente_snapshot := coalesce(v_riga.cliente_snapshot, '{}'::jsonb);
  v_riga.righe            := coalesce(v_riga.righe, '[]'::jsonb);
  v_riga.riepilogo_iva    := coalesce(v_riga.riepilogo_iva, '[]'::jsonb);
  v_riga.subtotale          := coalesce(v_riga.subtotale, 0);
  v_riga.imponibile_totale  := coalesce(v_riga.imponibile_totale, 0);
  v_riga.iva_totale         := coalesce(v_riga.iva_totale, 0);
  v_riga.totale_documento   := coalesce(v_riga.totale_documento, 0);
  v_riga.totale_da_pagare   := coalesce(v_riga.totale_da_pagare, 0);

  insert into public.documenti_fiscali select v_riga.* returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'numero_progressivo', v_prog);
end;
$function$;

revoke all on function public.documento_crea(uuid, jsonb) from public, anon;
grant execute on function public.documento_crea(uuid, jsonb) to authenticated, service_role;

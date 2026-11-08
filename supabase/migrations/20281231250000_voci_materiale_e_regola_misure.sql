-- Fase 2, seconda metà (08/11/2026).
--  1. Le voci dei computi edili con un materiale diventano anche righe da ordinare: si propongono
--     quelle col costo materiali, la marca o il prodotto, e nell'anteprima si correggono.
--  2. La regola dell'azienda per tipo di lavoro: misure del preventivo definitive, o serve il sopralluogo.
--     Un sopralluogo collegato e segnato definitivo vale su tutto e si aggancia alla commessa.
-- Solo una colonna facoltativa e funzioni: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.company_fasi_settings add column if not exists misure_regola jsonb;
comment on column public.company_fasi_settings.misure_regola is
  'Per tipo di lavoro: sopralluogo (si ordina dopo il rilievo) o definitive (valgono le misure del preventivo). Vuoto = regola di partenza.';

create or replace function public.misure_regola_azienda(p_azienda uuid, p_chiave text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  tipo text := case p_chiave when 'sr' then 'serramenti' when 'bagni' then 'bagno' when 'tetti' then 'tetto'
    when 'rst' then 'ristrutturazione' when 'pav' then 'pavimenti' when 'pis' then 'piscine'
    when 'clm' then 'impianti' when 'ele' then 'impianti' when 'idr' then 'impianti' when 'fv' then 'fotovoltaico' end;
  scelta text;
begin
  select s.misure_regola->>tipo into scelta from public.company_fasi_settings s where s.company_id = p_azienda;
  return coalesce(scelta, case when tipo in ('serramenti', 'bagno') then 'sopralluogo' else 'definitive' end);
end $$;
revoke all on function public.misure_regola_azienda(uuid, text) from public, anon, authenticated;
grant execute on function public.misure_regola_azienda(uuid, text) to service_role;

do $migrazione$
declare
  def text;
  chiave_sql constant text := 'public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text)';
  procedure_replace text;
  function_replace text;
begin
  -- già applicata: la funzione ha il parametro nuovo
  if to_regprocedure('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])') is null then
    def := pg_get_functiondef(chiave_sql::regprocedure);

    function_replace := 'p_impronta text DEFAULT NULL::text)';
    if position(function_replace in def) = 0 then raise exception 'testata non trovata'; end if;
    def := replace(def, function_replace, 'p_impronta text DEFAULT NULL::text, p_voci_materiale uuid[] DEFAULT NULL::uuid[])');

    function_replace := 'voce jsonb; voce_pos integer;';
    if position(function_replace in def) = 0 then raise exception 'dichiarazioni non trovate'; end if;
    def := replace(def, function_replace, 'definitivo uuid; stato_misura text; voci_scelte jsonb := ''[]''; proposta boolean; misura_voce jsonb; unita_voce text;
  voce jsonb; voce_pos integer;');

    function_replace := E'  if chiave = ''fv'' then\n    aliquota := coalesce((q->>''iva_aliquota'')';
    if position(function_replace in def) = 0 then raise exception 'inizio non trovato'; end if;
    def := replace(def, function_replace, E'  select s.id into definitivo from public.surveys s
   where s.company_id = azienda and s.deleted_at is null and s.ruolo_misure = ''definitivo''
     and (s.id = nullif(q->>''sopralluogo_id'','''')::uuid
          or s.opportunity_id = nullif(coalesce(q->>''opportunita_id'', q->>''opportunita_crm_id''),'''')::uuid)
   order by s.created_at desc limit 1;
  stato_misura := case when definitivo is not null or public.misure_regola_azienda(azienda, chiave) = ''definitive''
    then ''confermato'' else ''da_rilevare'' end;

' || function_replace);

    function_replace := E'''measure_status'',''da_rilevare'',';
    if position(function_replace in def) = 0 then raise exception 'stato serramenti non trovato'; end if;
    def := replace(def, function_replace, E'''measure_status'',stato_misura,');

    function_replace := E'''measure_status'',case when misure is not null then ''da_rilevare'' end,';
    if position(function_replace in def) = 0 then raise exception 'stato accessori non trovato'; end if;
    def := replace(def, function_replace, E'''measure_status'',case when misure is not null then stato_misura end,');

    function_replace := E'      somma_voci:=somma_voci+coalesce((r->>''importo'')::numeric,0);\n';
    if position(function_replace in def) = 0 then raise exception 'voci non trovate'; end if;
    def := replace(def, function_replace, function_replace || E'      proposta := coalesce((r->>''costo_materiali'')::numeric,0) > 0
        or nullif(r->>''marca'','''') is not null or nullif(r->>''modello'','''') is not null or nullif(r->>''famiglia_id'','''') is not null;
      voci_scelte := voci_scelte || jsonb_build_array(jsonb_build_object(''id'', r->>''id'', ''nome'', left(coalesce(nullif(r->>''descrizione'',''''),''Voce''),120),
        ''quantita'', quantita, ''unita'', r->>''unita_misura'', ''proposta'', proposta));
      if (p_voci_materiale is null and proposta) or (r->>''id'')::uuid = any(coalesce(p_voci_materiale, ''{}''::uuid[])) then
        unita_voce := lower(btrim(coalesce(r->>''unita_misura'','''')));
        misura_voce := case when jsonb_typeof(r->''misure'') = ''array'' and jsonb_array_length(r->''misure'') > 0
          then nullif(jsonb_strip_nulls((r->''misure''->0) - ''descrizione'' - ''parti''), ''{}''::jsonb) end;
        materiali := materiali || jsonb_build_array(jsonb_build_object(
          ''name'', left(coalesce(nullif(r->>''descrizione'',''''),''Materiale''),120),
          ''description'', nullif(concat_ws('' · '', nullif(trim(concat_ws('' '',r->>''marca'',r->>''modello'')),''''), nullif(r->>''capitolo_nome'',''''), nullif(r->>''descrizione_estesa'','''')),''''),
          ''quantity'', quantita, ''unita_misura'', nullif(r->>''unita_misura'',''''),
          ''unit_price'', 0, ''purchase_price'', 0, ''standard_cost'', greatest(coalesce((r->>''costo_materiali'')::numeric,0),0),
          ''status'', ''da_ordinare'', ''position'', jsonb_array_length(materiali), ''vat_rate'', aliquota,
          ''family_id'', (select f.id from public.article_families f where f.id = nullif(r->>''famiglia_id'','''')::uuid),
          ''riferimento'', nullif(btrim(r->>''ambiente''),''''),
          ''misure_preventivo'', misura_voce,
          ''measure_status'', case when misura_voce is not null or unita_voce in (''mq'',''m2'',''m²'',''ml'',''m'') then stato_misura end));
      end if;
');

    function_replace := E'''contratto'',contratto);';
    if position(function_replace in def) = 0 then raise exception 'esito non trovato'; end if;
    def := replace(def, function_replace, E'''contratto'',contratto,''voci_materiale'',voci_scelte);');

    function_replace := E'  update public.orders set created_by=auth.uid(),';
    if position(function_replace in def) = 0 then raise exception 'testata commessa non trovata'; end if;
    def := replace(def, function_replace, E'  update public.order_items oi
     set misure_da_ordinare = oi.misure_preventivo, survey_id = coalesce(definitivo, oi.survey_id)
   where oi.order_id = ordine and oi.measure_status = ''confermato'' and oi.misure_preventivo is not null;
  if definitivo is not null then
    update public.surveys set order_id = ordine where id = definitivo and order_id is null;
  end if;
' || function_replace);

    drop function public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text);
    execute def;
    revoke all on function public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[]) from public, anon;
    grant execute on function public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[]) to authenticated, service_role;
  end if;

  def := pg_get_functiondef('public.fasi_impostazioni_salva(uuid, jsonb)'::regprocedure);
  if position('misure_regola' in def) = 0 then
    function_replace := E'  if p_valori ? ''tipi_lavoro'' then';
    if position(function_replace in def) = 0 then raise exception 'impostazioni non trovate'; end if;
    def := replace(def, function_replace, E'  if p_valori ? ''misure_regola'' then
    if jsonb_typeof(p_valori->''misure_regola'') = ''null'' then
      update public.company_fasi_settings set misure_regola = null, updated_at = now() where company_id = p_company_id;
    elsif jsonb_typeof(p_valori->''misure_regola'') is distinct from ''object''
       or exists (select 1 from jsonb_each_text(p_valori->''misure_regola'') e
                   where e.key <> all (v_tipi_ammessi) or e.value not in (''sopralluogo'', ''definitive'')) then
      raise exception ''Scelta non valida.'' using errcode = ''22023'';
    else
      update public.company_fasi_settings set misure_regola = p_valori->''misure_regola'', updated_at = now() where company_id = p_company_id;
    end if;
  end if;
' || function_replace);
    execute def;
  end if;
end $migrazione$;

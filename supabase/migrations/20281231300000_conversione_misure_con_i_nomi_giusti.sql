-- La conversione scriveva le misure come larghezza/altezza, il sopralluogo le legge come
-- larghezza_mm/altezza_mm: lo scarto non si calcolava. Le voci degli edili portavano i metri.
-- Ora nomi giusti e millimetri; a mq, ml, m la misura è la quantità. Trovato dalla prova dell'8/11/2026.
-- Solo la funzione: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
do $migrazione$
declare
  def text;
  p text;
begin
  def := pg_get_functiondef('public.converti_modulo_commessa_atomic(text, uuid, boolean, boolean, text, uuid[])'::regprocedure);
  if position('misura_forma' in def) = 0 then
    p := E'''larghezza'',(r->>''larghezza_mm'')::numeric,''altezza'',(r->>''altezza_mm'')::numeric';
    if position(p in def) = 0 then raise exception 'misure serramenti non trovate'; end if;
    def := replace(def, p, E'''larghezza_mm'',(r->>''larghezza_mm'')::numeric,''altezza_mm'',(r->>''altezza_mm'')::numeric');

    p := E'''measure_status'',stato_misura,';
    if position(p in def) = 0 then raise exception 'stato serramenti non trovato'; end if;
    def := replace(def, p, p || E'\n        ''misura_forma'',''LxH'',');

    p := E'''measure_status'',case when misure is not null then stato_misura end,';
    if position(p in def) = 0 then raise exception 'stato accessori non trovato'; end if;
    def := replace(def, p, p || E'\n        ''misura_forma'',case when misure is not null then ''LxH'' end,');

    p := E'misura_voce := case when jsonb_typeof(r->''misure'') = ''array'' and jsonb_array_length(r->''misure'') > 0
          then nullif(jsonb_strip_nulls((r->''misure''->0) - ''descrizione'' - ''parti''), ''{}''::jsonb) end;';
    if position(p in def) = 0 then raise exception 'misura voce non trovata'; end if;
    def := replace(def, p, E'misura_voce := case when unita_voce in (''mq'',''m2'',''m²'',''ml'',''m'') then jsonb_build_object(''quantita'', quantita)
          when jsonb_typeof(r->''misure'') = ''array'' and jsonb_array_length(r->''misure'') = 1 then nullif(jsonb_strip_nulls(jsonb_build_object(
            ''larghezza_mm'', round((r->''misure''->0->>''larghezza'')::numeric * 1000),
            ''altezza_mm'', round(coalesce(r->''misure''->0->>''altezza'', r->''misure''->0->>''lunghezza'')::numeric * 1000))), ''{}''::jsonb) end;');

    p := E'''measure_status'', case when misura_voce is not null';
    if position(p in def) = 0 then raise exception 'stato voce non trovato'; end if;
    def := replace(def, p, E'''misura_forma'', case when unita_voce in (''mq'',''m2'',''m²'') then ''mq'' when unita_voce = ''ml'' then ''ml'' when unita_voce = ''m'' then ''m'' when misura_voce is not null then ''LxH'' end,\n          ' || p);

    p := E'riferimento = nullif(m.value->>''riferimento'','''')';
    if position(p in def) = 0 then raise exception 'scrittura non trovata'; end if;
    def := replace(def, p, p || E', misura_forma = nullif(m.value->>''misura_forma'','''')');
    execute def;
  end if;
end $migrazione$;

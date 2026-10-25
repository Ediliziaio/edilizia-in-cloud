-- ════════════════════════════════════════════════════════════════════════════
-- Computo dei preventivatori edili: il salvataggio diventa una sola transazione
-- ════════════════════════════════════════════════════════════════════════════
-- Gli otto preventivatori edili (Bagni, Climatizzazione, Elettrico, Pavimenti,
-- Piscine, Ristrutturazione, Termoidraulico, Tetti) salvavano il computo con TRE
-- richieste separate dal browser: inserire le righe nuove, cancellare le vecchie
-- a lotti, aggiornare i totali del progetto. Un guasto in mezzo lasciava il
-- computo doppio (il commento nel codice lo ammetteva: «al peggio resta doppio
-- fino al salvataggio dopo»), e due salvataggi da schede o dispositivi diversi si
-- sovrapponevano (la coda in memoria vale solo dentro una scheda).
--
-- Qui una funzione sola per tutti e otto, tutto o niente:
--   computo_salva_atomico(prefisso, progetto, righe, totali)
--     1. blocca il progetto (FOR UPDATE): due salvataggi si mettono in fila, anche
--        fra schede e dispositivi diversi;
--     2. cancella le righe del progetto e inserisce quelle nuove;
--     3. aggiorna totale_imponibile e totale del progetto.
-- Se qualunque passo fallisce, niente cambia: il computo resta quello di prima.
--
-- SECURITY INVOKER: valgono le regole di accesso (RLS) e i trigger di sempre, come
-- se il browser facesse le stesse operazioni. Non c'è niente di nuovo da fidarsi.
-- L'azienda e il progetto delle righe si impongono qui, non si leggono dal client.
-- I prefissi ammessi sono otto, scritti nella funzione: nessuna tabella arbitraria.
-- Come prima, le righe nuove hanno id nuovi (id e created_at del client si ignorano).
--
-- Solo schema: nessuna riga esistente viene toccata. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.computo_salva_atomico(
  p_prefisso text,
  p_progetto_id uuid,
  p_righe jsonb,
  p_totali jsonb
) RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_righe_tab text;
  v_prog_tab text;
  v_azienda uuid;
  v_imponibile numeric;
  v_totale numeric;
  v_righe jsonb;
  v_colonne text;
  v_n integer;
  v_resto integer;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  if p_prefisso is null or p_prefisso not in ('bgn', 'clm', 'ele', 'pav', 'pis', 'rst', 'idr', 'tet') then
    raise exception 'Computo sconosciuto: %', coalesce(p_prefisso, '(vuoto)') using errcode = '22023';
  end if;
  if p_progetto_id is null then
    raise exception 'Progetto mancante' using errcode = '22023';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then
    raise exception 'Righe non valide: serve un elenco' using errcode = '22023';
  end if;
  if jsonb_array_length(p_righe) > 5000 then
    raise exception 'Troppe righe in un solo computo (massimo 5000)' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_righe) e where jsonb_typeof(e) <> 'object') then
    raise exception 'Righe non valide: ogni riga deve essere un oggetto' using errcode = '22023';
  end if;
  if p_totali is null or jsonb_typeof(p_totali) <> 'object' then
    raise exception 'Totali non validi' using errcode = '22023';
  end if;
  begin
    v_imponibile := (p_totali ->> 'totale_imponibile')::numeric;
    v_totale := (p_totali ->> 'totale')::numeric;
  exception when others then
    raise exception 'Totali non numerici' using errcode = '22023';
  end;
  if v_imponibile is null or v_totale is null then
    raise exception 'Totali mancanti' using errcode = '22023';
  end if;

  v_righe_tab := p_prefisso || '_computo_voci';
  v_prog_tab := p_prefisso || '_progetti';

  -- Il progetto si legge con le regole di accesso di chi chiama: se non lo vede,
  -- non esiste. Si blocca fino alla fine della transazione.
  execute format('select company_id from public.%I where id = $1 for update', v_prog_tab)
    into v_azienda using p_progetto_id;
  if v_azienda is null then
    raise exception 'Progetto non trovato o non accessibile' using errcode = '42501';
  end if;

  -- Righe nuove: azienda e progetto imposti qui; id e created_at del client no.
  select coalesce(jsonb_agg((e - 'id' - 'created_at')
           || jsonb_build_object('company_id', v_azienda, 'progetto_id', p_progetto_id)), '[]'::jsonb)
    into v_righe
    from jsonb_array_elements(p_righe) e;

  -- Fuori le righe di prima.
  execute format('delete from public.%I where progetto_id = $1 and company_id = $2', v_righe_tab)
    using p_progetto_id, v_azienda;
  -- Una delete che le regole di accesso filtrano non dà errore: si controlla.
  execute format('select count(*) from public.%I where progetto_id = $1 and company_id = $2', v_righe_tab)
    into v_resto using p_progetto_id, v_azienda;
  if v_resto <> 0 then
    raise exception 'Righe precedenti non cancellabili: salvataggio annullato' using errcode = '42501';
  end if;

  -- Dentro quelle nuove. Le colonne sono quelle presenti nelle righe, come per
  -- l'inserimento multiplo di PostgREST: una colonna che non esiste dà errore.
  select string_agg(distinct quote_ident(k), ', ')
    into v_colonne
    from jsonb_array_elements(v_righe) e, jsonb_object_keys(e) k;
  v_n := jsonb_array_length(v_righe);
  if v_n > 0 then
    execute format(
      'insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
      v_righe_tab, v_colonne, v_colonne, v_righe_tab)
      using v_righe;
    get diagnostics v_resto = row_count;
    if v_resto <> v_n then
      raise exception 'Righe inserite % su %: salvataggio annullato', v_resto, v_n using errcode = '42501';
    end if;
  end if;

  -- Totali del progetto.
  execute format(
    'update public.%I set totale_imponibile = $1, totale = $2, updated_at = now() where id = $3 and company_id = $4',
    v_prog_tab)
    using v_imponibile, v_totale, p_progetto_id, v_azienda;
  get diagnostics v_resto = row_count;
  if v_resto <> 1 then
    raise exception 'Totali del progetto non aggiornati: salvataggio annullato' using errcode = '42501';
  end if;

  return jsonb_build_object('righe', v_n, 'totale_imponibile', v_imponibile, 'totale', v_totale);
end;
$function$;

COMMENT ON FUNCTION public.computo_salva_atomico(text, uuid, jsonb, jsonb) IS
  'Salva il computo di un preventivatore edile (bgn, clm, ele, pav, pis, rst, idr, tet) in una transazione: righe, totali, blocco del progetto. SECURITY INVOKER: valgono RLS e trigger di sempre.';

REVOKE ALL ON FUNCTION public.computo_salva_atomico(text, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.computo_salva_atomico(text, uuid, jsonb, jsonb) TO authenticated, service_role;

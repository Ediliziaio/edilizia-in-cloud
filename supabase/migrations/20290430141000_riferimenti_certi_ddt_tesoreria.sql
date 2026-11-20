-- Le prove esplicite limitano i candidati prima del confronto degli importi.
-- Le bozze DDT riportano l'esito del collegamento e la conferma verifica il fornitore.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.email_ddt_carico add column if not exists avviso_ordine text;

create or replace function private.tes_riferimenti_fattura(p_causale text)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct riferimento order by riferimento), array[]::text[])
    from regexp_matches(coalesce(p_causale, ''),
      $re$\m(?:fattur[ae]|fatt|ft)\M[\s.:#-]*(?:n(?:um(?:ero)?|r)?[.°º]?\s*[:#]?\s*)?((?:(?:[a-z]{1,8}[-/]|(?:ft|fpr|fv)\s+))?[0-9][a-z0-9./-]*(?:\s*(?:[,;+&]|\med?\M)\s*(?:(?:[a-z]{1,8}[-/]|(?:ft|fpr|fv)\s+))?[0-9][a-z0-9./-]*)*)$re$, 'gi') m
    cross join lateral regexp_split_to_table(m[1], $re$\s*(?:[,;+&]|\med?\M)\s*$re$, 'i') t(token)
    cross join lateral (select upper(regexp_replace(btrim(t.token), '[.]+$', '')) riferimento) r;
$$;

create or replace function private.tes_riferimento_fattura_coincide(p_riferimento text, p_numero text, p_anno integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(r.chiave = d.chiave
    and (r.serie is null or d.serie is null or r.serie = d.serie)
    and (r.anno is null or coalesce(d.anno, p_anno) = r.anno), false)
  from public.acquisti_numero_documento(p_riferimento) r
  cross join public.acquisti_numero_documento(p_numero) d;
$$;

revoke all on function private.tes_riferimenti_fattura(text),
  private.tes_riferimento_fattura_coincide(text,text,integer) from public, anon, authenticated;

create or replace function pg_temp.tes_inserisci_riferimenti(p_def text, p_prima text, p_dopo text)
returns text language plpgsql as $$
begin
  if position(p_prima in p_def) = 0 then
    raise exception 'Il punto di applicazione della precedenza dei riferimenti è cambiato: %', left(p_prima, 100);
  end if;
  return replace(p_def, p_prima, p_dopo);
end $$;

do $patch$
declare
  d text := pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
begin
  if position('R-RIFERIMENTO-FATTURA' in d)>0 then return; end if;
  d := pg_temp.tes_inserisci_riferimenti(d, 'BEGIN' || chr(10) || ' SELECT * INTO t FROM public.bank_transactions',
    ' rif_fatture text[]; riferita text[];' || chr(10) || 'BEGIN' || chr(10) || ' SELECT * INTO t FROM public.bank_transactions');
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$causale:=concat_ws(' ',t.description,t.reference);$old$,
    $new$causale:=concat_ws(' ',t.description,t.reference);
 rif_fatture:=private.tes_riferimenti_fattura(causale);$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$  c:=jsonb_build_object('tipo',rec.tipo,'id',rec.id,'titolo',rec.titolo,'controparte',party,'chiave_soggetto',chiave,'residuo',CASE WHEN rec.nc THEN -rec.residuo ELSE rec.residuo END,
   'nc',rec.nc,'forza',forza,'motivi',motivi,'conflitti',conf,'data',rec.scad);$old$,
    $new$  riferita := array(select r from unnest(rif_fatture) r where not rec.nc
    and rec.tipo <> 'rata' and private.tes_riferimento_fattura_coincide(r, rec.numero, rec.anno));
  c:=jsonb_build_object('tipo',rec.tipo,'id',rec.id,'titolo',rec.titolo,'controparte',party,'chiave_soggetto',chiave,'residuo',CASE WHEN rec.nc THEN -rec.residuo ELSE rec.residuo END,
   'nc',rec.nc,'forza',forza,'motivi',motivi,'conflitti',conf,'data',rec.scad,'riferimenti',riferita);$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$   IF abs(rec.residuo-amt)<=greatest(diff_max,0.005) THEN confl:=confl||jsonb_build_array(c); END IF;$old$,
    $new$   IF cardinality(riferita)>0 OR abs(rec.residuo-amt)<=greatest(diff_max,0.005) THEN confl:=confl||jsonb_build_array(c); END IF;$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$ -- La causale cita una fattura dello stesso cliente già segnata pagata senza movimento$old$,
    $new$ IF cardinality(rif_fatture)>0 THEN
  SELECT coalesce(jsonb_agg(x),'[]') INTO cands FROM jsonb_array_elements(cands) x
  WHERE jsonb_array_length(x->'riferimenti')>0;
  SELECT coalesce(jsonb_agg(x),'[]') INTO confl FROM jsonb_array_elements(confl) x
  WHERE jsonb_array_length(x->'riferimenti')>0 OR jsonb_array_length(cands)=0;
 END IF;

 -- La causale cita una fattura dello stesso cliente già segnata pagata senza movimento$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$IF cred AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte') THEN$old$,
    $new$IF cred AND cardinality(rif_fatture)<=1
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte') THEN$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$     AND length(private.tes_numero_nucleo(d.numero))>=2 AND strpos(causale,private.tes_numero_nucleo(d.numero))>0$old$,
    $new$     AND (cardinality(rif_fatture)=0 OR private.tes_riferimento_fattura_coincide(rif_fatture[1],d.numero,
       coalesce(nullif(to_jsonb(d)->>'anno','')::int,extract(year FROM nullif(to_jsonb(d)->>'data_emissione','')::date)::int)))
     AND length(private.tes_numero_nucleo(d.numero))>=2 AND strpos(causale,private.tes_numero_nucleo(d.numero))>0$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$IF NOT cred AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte' AND abs((x->>'residuo')::numeric-amt)<0.005) THEN$old$,
    $new$IF NOT cred AND cardinality(rif_fatture)<=1
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte' AND abs((x->>'residuo')::numeric-amt)<0.005) THEN$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$     AND f.fornitore_id=ANY(forn_ids)
     AND (NOT EXISTS(SELECT 1 FROM public.rate_fornitori r WHERE r.fattura_ricevuta_id=f.id AND r.stato NOT IN('pagata','stornata'))$old$,
    $new$     AND f.fornitore_id=ANY(forn_ids)
     AND (cardinality(rif_fatture)=0 OR private.tes_riferimento_fattura_coincide(rif_fatture[1],f.numero_fattura,extract(year FROM f.data_fattura)::int))
     AND (NOT EXISTS(SELECT 1 FROM public.rate_fornitori r WHERE r.fattura_ricevuta_id=f.id AND r.stato NOT IN('pagata','stornata'))$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$ -- 1. Documento unico con l'importo esatto$old$,
    $new$ -- Un riferimento assente o discordante lascia il movimento da verificare.
 IF cardinality(rif_fatture)>0 AND (
   EXISTS(SELECT 1 FROM unnest(rif_fatture) r WHERE NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->'riferimenti' ? r))
   OR jsonb_array_length(confl)>0
 ) THEN
   RETURN jsonb_build_object('esito',CASE WHEN jsonb_array_length(confl)>0 THEN 'conflitto' ELSE 'da_gestire' END,
     'natura','documento','regola','R-RIFERIMENTO-FATTURA','versione',1,'candidati','[]'::jsonb,
     'motivi',jsonb_build_array('La causale cita '||array_to_string(rif_fatture,', ')),
     'conflitti',coalesce((SELECT jsonb_agg(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','motivi',x->'conflitti'))
       FROM jsonb_array_elements(confl) x),'[]'::jsonb),
     'mancanti',jsonb_build_array('Verifica le fatture citate, la controparte e il residuo.'),
     'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;

 -- 1. Documento unico con l'importo esatto$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$IF jsonb_array_length(forti)>0 OR jsonb_array_length(medie)>0 THEN$old$,
    $new$IF cardinality(rif_fatture)<=1 AND (jsonb_array_length(forti)>0 OR jsonb_array_length(medie)>0) THEN$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$WHEN jsonb_array_length(forti)=1 AND jsonb_array_length(confl)=0 THEN 'automatico'$old$,
    $new$WHEN jsonb_array_length(forti)=1 AND jsonb_array_length(confl)=0 AND (
      cardinality(rif_fatture)=0 OR (SELECT count(*) FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte')=1
    ) THEN 'automatico'$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$    IF (SELECT count(*) FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0)<2 THEN CONTINUE; END IF;$old$,
    $new$    IF (SELECT count(*) FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0)<2 THEN CONTINUE; END IF;
    IF cardinality(rif_fatture)>1 AND EXISTS(SELECT 1 FROM unnest(rif_fatture) r WHERE NOT EXISTS(
      SELECT 1 FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0 AND items->b->'riferimenti' ? r
    )) THEN CONTINUE; END IF;$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$ -- 3. Differenza fino alla soglia dell'azienda$old$,
    $new$ IF out IS NULL AND cardinality(rif_fatture)>1 THEN
   RETURN jsonb_build_object('esito','da_gestire','natura','cumulativo','regola','R-RIFERIMENTO-FATTURA','versione',1,
     'candidati','[]'::jsonb,'motivi',jsonb_build_array('La causale cita più fatture'),
     'conflitti','[]'::jsonb,'mancanti',jsonb_build_array('Verifica le quote delle fatture citate: i residui non quadrano con il movimento.'),
     'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;

 -- 3. Differenza fino alla soglia dell'azienda$new$);
  execute d;
end $patch$;

-- La ricerca esplicita nel pop-up può mostrare anche altri documenti da verificare.
-- Le proposte iniziali e la selezione in blocco usano gli esiti dello stesso motore.
do $patch$
declare
  d text := pg_get_functiondef('public.bank_proposte_movimento(uuid,uuid,text)'::regprocedure);
begin
  if position('tes_riferimenti_fattura' in d)>0 then return; end if;
  d := pg_temp.tes_inserisci_riferimenti(d, 'remaining numeric;',
    'remaining numeric; rif_fatture text[]; analisi jsonb; proposta jsonb; citata boolean;');
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$ FOR c IN SELECT value FROM jsonb_array_elements(public.bank_candidati_movimento(p_company,p_tx,p_search,false)) LOOP$old$,
    $new$ rif_fatture:=private.tes_riferimenti_fattura(concat_ws(' ',t.description,t.reference));
 IF cardinality(rif_fatture)>0 THEN analisi:=private.tes_classifica(p_company,p_tx); END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(public.bank_candidati_movimento(p_company,p_tx,p_search,false)) LOOP
  proposta:=NULL;
  IF analisi IS NOT NULL THEN
   SELECT p INTO proposta FROM jsonb_array_elements(analisi->'candidati') p
    WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(p->'righe') r WHERE r->>'id'=c->>'id' AND r->>'tipo'=c->>'tipo')
    LIMIT 1;
   IF proposta IS NULL AND btrim(coalesce(p_search,''))='' THEN CONTINUE; END IF;
  END IF;$new$);
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$  result:=result||jsonb_build_array(c||jsonb_build_object('motivi',why,'incongruenze',warnings,'punteggio',least(score,100),'forte',exact_amount AND jsonb_array_length(warnings)=0 AND ((party_ok AND number_ok) OR (iban_ok AND (party_ok OR number_ok))),'data',docdate,'controparte',party));$old$,
    $new$  citata:=proposta IS NOT NULL;
  IF citata THEN
   why:=coalesce(proposta->'motivi',why);
   score:=100;
  ELSIF analisi IS NOT NULL THEN
   warnings:=warnings||to_jsonb('Il documento non corrisponde ai riferimenti riconosciuti nella causale.'::text);
  END IF;
  result:=result||jsonb_build_array(c||jsonb_build_object('motivi',why,'incongruenze',warnings,'punteggio',least(score,100),
    'forte',exact_amount AND jsonb_array_length(warnings)=0 AND
      CASE WHEN analisi IS NOT NULL THEN citata AND analisi->>'esito'='automatico'
           ELSE (party_ok AND number_ok) OR (iban_ok AND (party_ok OR number_ok)) END,
    'data',docdate,'controparte',party));$new$);
  execute d;
end $patch$;

do $patch$
declare
  d text := pg_get_functiondef('public.conferma_carico_ddt(uuid,uuid)'::regprocedure);
begin
  if position('Verifica il fornitore e rigenera la bozza del carico' in d)>0 then return; end if;
  d := pg_temp.tes_inserisci_riferimenti(d,
    $old$     where po.id = v_c.purchase_order_id and po.company_id = v_c.company_id;
    if not found then
      return jsonb_build_object('ok', false, 'errore', 'Ordine collegato non trovato in questa azienda.');$old$,
    $new$     where po.id = v_c.purchase_order_id and po.company_id = v_c.company_id
       and po.supplier_id = v_c.fornitore_match_id and po.status in ('inviato','confermato','parziale','ricevuto');
    if not found then
      return jsonb_build_object('ok', false, 'errore', 'Ordine non compatibile con il carico. Verifica il fornitore e rigenera la bozza del carico.');$new$);
  execute d;
end $patch$;

notify pgrst, 'reload schema';

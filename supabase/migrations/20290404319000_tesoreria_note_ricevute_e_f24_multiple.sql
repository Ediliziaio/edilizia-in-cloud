-- Tesoreria, lotto 5 (15/11/2026).
-- * Note di credito RICEVUTE non ancora collegate (fatture_ricevute TD04/passive_credit_note senza
--   riga in note_credito_storni) entrano fra i candidati delle uscite, solo come quota negativa in
--   una compensazione dello stesso fornitore: «fattura 1.000 − nota 200 = bonifico 800» →
--   proposta R-NC. Non si confermano da sole: la nota si collega con nota_credito_collega (che
--   riduce la rata), poi il bonifico salda il residuo. Una volta collegata, la nota esce dai
--   candidati e la scadenza ha già il residuo giusto: niente doppio sconto.
-- * F24 su più scadenze fiscali: se nessuna scadenza ha l'importo esatto, la combinazione di
--   scadenze fiscali aperte (fino a 8, entro 20 giorni) che lo somma → proposta; più combinazioni →
--   scelta. Le componenti restano separate (una riga per scadenza), mai su una commessa.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

DO $do$
DECLARE src text; pairs text[][]; a text; b text;
BEGIN
 SELECT prosrc INTO src FROM pg_proc WHERE oid='private.tes_classifica(uuid,uuid)'::regprocedure;
 -- Rilanciata a mano non deve applicare due volte le sostituzioni: se c'è già il testo nuovo, non fa niente.
 IF position('nota_ricevuta' IN src)>0 THEN RETURN; END IF;
 pairs:=ARRAY[
  -- nota di credito ricevuta fra i candidati delle uscite
  ARRAY[$a$  UNION ALL
  SELECT 'rata',i.id,$a$,$b$  UNION ALL
  SELECT 'nota_ricevuta',n.id,concat_ws(' ','Nota di credito',n.numero_fattura),n.numero_fattura,extract(year FROM n.data_fattura)::int,
   coalesce(f.name,n.cedente_ragione_sociale),private.tes_iban(to_jsonb(f)->>'iban'),n.fornitore_id,round(abs(coalesce(n.totale_documento,0)),2),n.data_fattura,true
  FROM public.fatture_ricevute n LEFT JOIN public.suppliers f ON f.id=n.fornitore_id AND f.company_id=n.company_id
  WHERE NOT cred AND n.company_id=p_company AND n.tipo_documento IN('TD04','passive_credit_note') AND abs(coalesce(n.totale_documento,0))>0.005
   AND coalesce(n.stato,'') NOT IN('annullata','scartata','rifiutata','eliminata')
   AND NOT EXISTS(SELECT 1 FROM public.note_credito_storni z WHERE z.company_id=p_company AND z.nota_id=n.id)
  UNION ALL
  SELECT 'rata',i.id,$b$],
  -- F24 su più scadenze fiscali
  ARRAY[$a$  RETURN jsonb_build_object('esito',CASE jsonb_array_length(legs) WHEN 0 THEN 'da_gestire' WHEN 1 THEN 'automatico' ELSE 'scelta' END,
   'natura','f24',$a$,$b$  IF jsonb_array_length(legs)=0 THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','scadenza','id',s.id,'titolo',s.description,'controparte','Erario / enti','residuo',round(s.amount-coalesce(s.paid_amount,0),2),'quota',round(s.amount-coalesce(s.paid_amount,0),2),'commesse','[]'::jsonb) ORDER BY s.due_date,s.id),'[]')
   INTO items FROM (SELECT s.* FROM public.scadenze s
    WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
     AND (to_jsonb(s)->>'tipo'='scadenza_fiscale' OR private.tes_norm(s.description)~'\m(f24|iva|ritenute|inps|tributi|imposte)\M')
     AND s.amount-coalesce(s.paid_amount,0)>0.005 AND (s.due_date IS NULL OR abs(s.due_date-t.booking_date)<=20)
    ORDER BY s.due_date,s.id LIMIT 8) s;
   m:=jsonb_array_length(items); combos:='[]';
   IF m>=2 THEN
    FOR mask IN 3..(1<<m)-1 LOOP
     IF (SELECT count(*) FROM generate_series(0,m-1) bb WHERE mask&(1<<bb)<>0)<2 THEN CONTINUE; END IF;
     SELECT sum((items->bb->>'residuo')::numeric) INTO somma FROM generate_series(0,m-1) bb WHERE mask&(1<<bb)<>0;
     IF abs(somma-amt)<0.005 THEN
      SELECT jsonb_agg(items->bb ORDER BY bb) INTO righe FROM generate_series(0,m-1) bb WHERE mask&(1<<bb)<>0;
      combos:=combos||jsonb_build_array(jsonb_build_object('chiave','f24:'||md5(righe::text),'forza','media',
       'motivi',jsonb_build_array(format('Somma esatta di %s scadenze fiscali aperte',jsonb_array_length(righe))),'conflitti','[]'::jsonb,'righe',righe));
      EXIT WHEN jsonb_array_length(combos)>3;
     END IF;
    END LOOP;
   END IF;
   IF jsonb_array_length(combos)>0 THEN
    RETURN jsonb_build_object('esito',CASE WHEN jsonb_array_length(combos)=1 THEN 'proposta' ELSE 'scelta' END,
     'natura','f24','regola','R-F24','versione',1,'motivi',jsonb_build_array('Causale di delega F24 o di un ente')||(combos->0->'motivi'),'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,
     'candidati',combos,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,'nota','Un F24 non è un costo di commessa: ogni componente chiude la sua scadenza');
   END IF;
  END IF;
  RETURN jsonb_build_object('esito',CASE jsonb_array_length(legs) WHEN 0 THEN 'da_gestire' WHEN 1 THEN 'automatico' ELSE 'scelta' END,
   'natura','f24',$b$]
 ];
 FOR i IN 1..array_length(pairs,1) LOOP
  a:=pairs[i][1]; b:=pairs[i][2];
  IF (length(src)-length(replace(src,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'sostituzione % non trovata una sola volta',i; END IF;
  src:=replace(src,a,b);
 END LOOP;
 EXECUTE 'CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid,p_tx uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='''' AS '||quote_literal(src);
END $do$;
REVOKE ALL ON FUNCTION private.tes_classifica(uuid,uuid) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';

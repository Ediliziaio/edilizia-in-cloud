-- Tesoreria, regole v1 corrette sui dati veri (15/11/2026, anteprima su 181 movimenti):
-- * le date nella causale («del 26 05 2026») non sono numeri di fattura;
-- * una banca o un circuito al posto del pagante non identifica nessuno e non è un «pagante diverso»;
-- * un conflitto conta solo su un candidato con l'importo compatibile (±1 €): un numero uguale su una
--   fattura di tutt'altro importo non è un indizio, né a favore né contro;
-- * «da gestire» dice sempre perché: partite della stessa controparte, nessuna partita, acquisto con carta.
-- Nessun esito era ancora registrato: la versione della regola resta 1.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION private.tes_numero_in_causale(p_causale text,p_num text,p_anno int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE w text[]; i int; n int; core text; prev text; nxt text; prefisso boolean; anni int[]; esito text:='no';
BEGIN
 IF p_num IS NULL OR p_num='' THEN RETURN 'no'; END IF;
 -- Le date («26/05/2026», «26 05 2026», «26-05-26») non sono numeri di documento.
 w:=regexp_split_to_array(btrim(regexp_replace(' '||private.tes_norm(p_causale)||' ',' [0-3]?[0-9] [01]?[0-9] (19|20)?[0-9]{2} ',' data ','g')),' ');
 n:=coalesce(array_length(w,1),0);
 FOR i IN 1..n LOOP
  core:=substring(w[i] FROM '^(?:ft|fatt|fattura|fatture|n|nr|num|rif|doc)?0*([0-9]+)$');
  IF core IS NULL OR core<>p_num THEN CONTINUE; END IF;
  prev:=CASE WHEN i>1 THEN w[i-1] END; nxt:=CASE WHEN i<n THEN w[i+1] END;
  prefisso:=w[i]!~'^[0-9]+$' OR coalesce(prev,'') IN('ft','fatt','fattura','fatture','n','nr','num','rif','doc','numero');
  anni:=ARRAY(SELECT x::int FROM unnest(ARRAY[prev,nxt,CASE WHEN i>2 THEN w[i-2] END,CASE WHEN i<n-1 THEN w[i+2] END]) x WHERE x~'^(19|20)[0-9]{2}$');
  IF length(p_num)<=2 AND NOT prefisso AND coalesce(array_length(anni,1),0)=0 THEN CONTINUE; END IF;
  IF p_anno IS NOT NULL AND p_anno=ANY(anni) THEN RETURN 'anno'; END IF;
  IF coalesce(array_length(anni,1),0)>0 AND p_anno IS NOT NULL THEN esito:=CASE WHEN esito='si' THEN 'si' ELSE 'anno_diverso' END;
  ELSE esito:='si'; END IF;
 END LOOP;
 RETURN esito;
END $$;

CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 t public.bank_transactions; amt numeric; impegnato numeric; resto numeric; cred boolean;
 tx_iban text; tx_nome text; tx_chiave text; causale text; ncaus text;
 cands jsonb:='[]'; confl jsonb:='[]'; c jsonb; rec record; pend record;
 num text; nnum text; subj text; motivi jsonb; conf jsonb; forza text; chiave text; party text; iban_doc text; verified boolean;
 own_accounts text[]; legs jsonb; ex jsonb; forti jsonb; medie jsonb; deboli jsonb;
 grp record; items jsonb; k int; m int; mask int; somma numeric; combo jsonb; combos jsonb; hasnc boolean;
 out jsonb; righe jsonb; diff numeric; intermediario boolean:=false; n_soggetto int;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile' USING ERRCODE='P0002'; END IF;
 amt:=abs(t.amount); cred:=t.transaction_type='credit';
 tx_iban:=private.tes_iban(CASE WHEN cred THEN t.debtor_iban ELSE t.creditor_iban END);
 IF tx_iban IS NULL THEN tx_iban:=private.tes_iban(to_jsonb(t)->>'counterparty_iban'); END IF;
 tx_nome:=coalesce(nullif(CASE WHEN cred THEN t.debtor_name ELSE t.creditor_name END,''),nullif(to_jsonb(t)->>'counterparty_name',''));
 tx_chiave:=private.tes_chiave_nome(tx_nome);
 -- Una banca o un circuito di pagamento al posto del pagante non identifica nessuno.
 IF private.tes_norm(tx_nome)~'\m(banca|bank|banco|bancaria|poste|qonto|unicredit|intesa|bnl|bper|credem|fineco|mediolanum|paypal|stripe|satispay|nexi|sumup|revolut|n26)\M' THEN
  intermediario:=true; tx_chiave:='';
 END IF;
 causale:=concat_ws(' ',t.description,t.reference); ncaus:=private.tes_norm(concat_ws(' ',causale,tx_nome));

 -- Esclusioni
 IF coalesce(t.status,'booked')<>'booked' THEN
  RETURN jsonb_build_object('esito','da_gestire','natura','sconosciuta','regola','R-ESCLUSO','versione',1,'motivi','[]'::jsonb,'conflitti','[]'::jsonb,
   'mancanti',jsonb_build_array('Il movimento non è ancora contabilizzato dalla banca'),'candidati','[]'::jsonb,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;
 IF coalesce(t.currency,'EUR')<>'EUR' THEN
  RETURN jsonb_build_object('esito','da_gestire','natura','sconosciuta','regola','R-ESCLUSO','versione',1,'motivi','[]'::jsonb,'conflitti','[]'::jsonb,
   'mancanti',jsonb_build_array('Valuta diversa dall''euro: serve il cambio applicato dalla banca'),'candidati','[]'::jsonb,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;
 SELECT coalesce(sum(abs(matched_amount)),0) INTO impegnato FROM public.bank_reconciliations WHERE company_id=p_company AND transaction_id=p_tx AND unmatched_at IS NULL;
 resto:=round(amt-impegnato,2);
 IF resto<=0.005 THEN
  RETURN jsonb_build_object('esito','automatico','natura','gia_riconciliato','regola','R-CHIUSO','versione',1,'motivi',jsonb_build_array('Movimento già interamente collegato'),
   'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,'candidati','[]'::jsonb,'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
 END IF;
 amt:=resto;

 -- R-GIRO: l'IBAN della controparte è un altro conto della stessa azienda.
 own_accounts:=ARRAY(SELECT private.tes_iban(to_jsonb(a)->>'iban') FROM public.bank_accounts a WHERE a.company_id=p_company AND a.id IS DISTINCT FROM t.account_id AND private.tes_iban(to_jsonb(a)->>'iban') IS NOT NULL);
 IF (tx_iban IS NOT NULL AND tx_iban=ANY(own_accounts)) OR ncaus~'\m(giroconto|giro conto|trasferimento tra conti|girofondi)\M' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','movimento','id',o.id,'titolo',concat_ws(' · ',to_char(o.booking_date,'DD/MM/YYYY'),left(o.description,60)),'controparte',NULL,'residuo',abs(o.amount),'quota',amt,'commesse','[]'::jsonb) ORDER BY abs(o.booking_date-t.booking_date),o.id),'[]')
  INTO legs FROM public.bank_transactions o
  WHERE o.company_id=p_company AND o.id<>t.id AND o.account_id IS DISTINCT FROM t.account_id AND o.transaction_type<>t.transaction_type
   AND abs(abs(o.amount)-abs(t.amount))<0.005 AND abs(o.booking_date-t.booking_date)<=5
   AND (tx_iban IS NULL OR o.account_id IN(SELECT a.id FROM public.bank_accounts a WHERE a.company_id=p_company AND private.tes_iban(to_jsonb(a)->>'iban')=tx_iban));
  RETURN jsonb_build_object('esito',CASE jsonb_array_length(legs) WHEN 0 THEN 'proposta' WHEN 1 THEN CASE WHEN tx_iban IS NOT NULL THEN 'automatico' ELSE 'proposta' END ELSE 'scelta' END,
   'natura','giroconto','regola','R-GIRO','versione',1,
   'motivi',CASE WHEN tx_iban IS NOT NULL AND tx_iban=ANY(own_accounts) THEN jsonb_build_array('IBAN della controparte = un altro conto dell''azienda') ELSE jsonb_build_array('Causale di giroconto') END,
   'conflitti','[]'::jsonb,
   'mancanti',CASE WHEN jsonb_array_length(legs)=0 THEN jsonb_build_array('Il movimento opposto sull''altro conto (entro 5 giorni) non è ancora importato') ELSE '[]'::jsonb END,
   'candidati',(SELECT coalesce(jsonb_agg(jsonb_build_object('chiave','giro:'||(l->>'id'),'forza',CASE WHEN tx_iban IS NOT NULL THEN 'forte' ELSE 'media' END,'motivi',jsonb_build_array('Stesso importo, segno opposto, altro conto dell''azienda'),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))),'[]') FROM jsonb_array_elements(legs) l),
   'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,
   'nota','Un giroconto non è un costo né un ricavo');
 END IF;

 -- R-STORNO: parola di storno e un movimento opposto dello stesso importo e della stessa controparte.
 IF ncaus~'\m(storno|stornato|rimborso|reso|retrocessione|restituzione|restituito|insoluto|richiamo|revoca)\M' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','movimento','id',o.id,'titolo',concat_ws(' · ',to_char(o.booking_date,'DD/MM/YYYY'),left(o.description,60)),'controparte',coalesce(o.debtor_name,o.creditor_name),'residuo',abs(o.amount),'quota',amt,'commesse','[]'::jsonb) ORDER BY o.booking_date DESC,o.id),'[]')
  INTO legs FROM public.bank_transactions o
  WHERE o.company_id=p_company AND o.id<>t.id AND o.transaction_type<>t.transaction_type AND abs(abs(o.amount)-amt)<0.005
   AND o.booking_date BETWEEN t.booking_date-60 AND t.booking_date
   AND ((tx_iban IS NOT NULL AND tx_iban IN(private.tes_iban(o.debtor_iban),private.tes_iban(o.creditor_iban)))
     OR (length(tx_chiave)>=5 AND tx_chiave IN(private.tes_chiave_nome(o.debtor_name),private.tes_chiave_nome(o.creditor_name))));
  IF jsonb_array_length(legs)>0 THEN
   RETURN jsonb_build_object('esito',CASE WHEN jsonb_array_length(legs)=1 THEN 'proposta' ELSE 'scelta' END,'natura','storno','regola','R-STORNO','versione',1,
    'motivi',jsonb_build_array('Causale di storno o rimborso','Movimento opposto dello stesso importo e della stessa controparte negli ultimi 60 giorni'),
    'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','storno:'||(l->>'id'),'forza','media','motivi',jsonb_build_array('Storno del movimento del '||(l->>'titolo')),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))) FROM jsonb_array_elements(legs) l),
    'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,
    'nota','Lo storno riapre la partita del movimento originario: nessun ricavo o costo nuovo');
  END IF;
 END IF;

 -- R-F24: deleghe di pagamento; si collegano alle scadenze fiscali, mai a una commessa.
 IF NOT cred AND ncaus~'\m(f24|f 24|delega|deleghe|agenzia entrate|agenzia delle entrate|inps|inail|tributi|i24)\M' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('tipo','scadenza','id',s.id,'titolo',s.description,'controparte','Erario / enti','residuo',s.amount-coalesce(s.paid_amount,0),'quota',amt,'commesse','[]'::jsonb) ORDER BY abs(s.due_date-t.booking_date),s.id),'[]')
  INTO legs FROM public.scadenze s
  WHERE s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
   AND (to_jsonb(s)->>'tipo'='scadenza_fiscale' OR private.tes_norm(s.description)~'\m(f24|iva|ritenute|inps|tributi|imposte)\M')
   AND abs(s.amount-coalesce(s.paid_amount,0)-amt)<0.005 AND (s.due_date IS NULL OR abs(s.due_date-t.booking_date)<=20)
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL AND old.scadenza_id=s.id);
  RETURN jsonb_build_object('esito',CASE jsonb_array_length(legs) WHEN 0 THEN 'da_gestire' WHEN 1 THEN 'automatico' ELSE 'scelta' END,
   'natura','f24','regola','R-F24','versione',1,'motivi',jsonb_build_array('Causale di delega F24 o di un ente'),'conflitti','[]'::jsonb,
   'mancanti',CASE WHEN jsonb_array_length(legs)=0 THEN jsonb_build_array('Una scadenza fiscale (F24) con lo stesso importo entro 20 giorni: senza, le componenti del modello non sono note') ELSE '[]'::jsonb END,
   'candidati',(SELECT coalesce(jsonb_agg(jsonb_build_object('chiave','f24:'||(l->>'id'),'forza','forte','motivi',jsonb_build_array('Scadenza fiscale con lo stesso importo'),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))),'[]') FROM jsonb_array_elements(legs) l),
   'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,'nota','Un F24 non è un costo di commessa');
 END IF;

 -- Candidati documentali
 FOR rec IN
  SELECT 'documento' tipo,d.id,d.numero titolo,d.numero numero,coalesce(nullif(to_jsonb(d)->>'anno','')::int,extract(year FROM nullif(to_jsonb(d)->>'data_emissione','')::date)::int) anno,
   coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),nullif(concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome'),'')) party,
   private.tes_iban(coalesce(d.cliente_snapshot->>'iban',d.cliente_snapshot->>'iban_bancario')) iban, NULL::uuid supplier_id,
   round(d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0),2) residuo, d.data_scadenza scad, (d.tipo='nota_credito') nc
  FROM public.documenti_fiscali_elenco_operativo d
  WHERE cred AND d.company_id=p_company AND d.deleted_at IS NULL
   AND d.stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata')
   AND d.tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','fattura_riepilogativa','nota_debito','nota_credito')
   AND d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0)>0.005
  UNION ALL
  SELECT 'scadenza',s.id,s.description,coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),s.description),
   extract(year FROM nullif(to_jsonb(cc)->>'documento_data','')::date)::int,
   f.name,private.tes_iban(to_jsonb(f)->>'iban'),s.supplier_id,round(s.amount-coalesce(s.paid_amount,0),2),s.due_date,false
  FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
   LEFT JOIN public.company_costs cc ON cc.id=s.cost_id AND cc.company_id=s.company_id
  WHERE NOT cred AND s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
   AND coalesce(to_jsonb(s)->>'tipo','')<>'scadenza_fiscale' AND s.amount-coalesce(s.paid_amount,0)>0.005
  UNION ALL
  SELECT 'rata',i.id,concat_ws(' · ',o.order_code,i.label),NULL,NULL,coalesce(nullif(o.client_company,''),nullif(o.client_name,'')),NULL,NULL,round(i.amount,2),i.expected_date,false
  FROM public.order_installments i JOIN public.orders o ON o.id=i.order_id AND o.company_id=p_company AND o.deleted_at IS NULL
  WHERE cred AND NOT coalesce(i.is_paid,false) AND i.invoice_id IS NULL AND i.documento_fiscale_id IS NULL AND coalesce(i.amount,0)>0.005
 LOOP
  -- Abbinamenti annullati in passato non si ripropongono.
  IF EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL
     AND (rec.id IN(old.invoice_id,old.documento_id,old.scadenza_id) OR to_jsonb(old)->'payment_source'->>'documento_id'=rec.id::text OR to_jsonb(old)->'payment_source'->>'scadenza_id'=rec.id::text)) THEN
   CONTINUE;
  END IF;
  motivi:='[]'; conf:='[]'; subj:=NULL; party:=rec.party; chiave:=private.tes_chiave_nome(party);
  -- Identità
  verified:=false;
  IF tx_iban IS NOT NULL AND rec.supplier_id IS NOT NULL THEN
   verified:=EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id=rec.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban);
   IF NOT verified AND EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id<>rec.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban) THEN
    conf:=conf||to_jsonb('IBAN verificato di un altro fornitore'::text);
   END IF;
  END IF;
  IF verified THEN subj:='iban_verificato'; motivi:=motivi||to_jsonb('IBAN verificato della controparte'::text);
  ELSIF tx_iban IS NOT NULL AND rec.iban IS NOT NULL AND tx_iban=rec.iban THEN subj:='iban'; motivi:=motivi||to_jsonb('IBAN in anagrafica uguale'::text);
  ELSIF length(chiave)>=4 AND ((length(tx_chiave)>=4 AND (strpos(tx_chiave,chiave)>0 OR strpos(chiave,tx_chiave)>0)) OR (length(chiave)>=6 AND strpos(replace(ncaus,' ',''),chiave)>0)) THEN
   subj:='nome'; motivi:=motivi||to_jsonb('Controparte corrispondente'::text);
  END IF;
  -- Numero con anno e soggetto
  nnum:=CASE WHEN rec.numero IS NOT NULL THEN private.tes_numero_in_causale(causale,private.tes_numero_nucleo(rec.numero),rec.anno) ELSE 'no' END;
  IF nnum='anno_diverso' THEN conf:=conf||to_jsonb(format('Il numero %s compare con un anno diverso da %s',rec.numero,rec.anno)); END IF;
  IF nnum IN('si','anno') THEN
   motivi:=motivi||to_jsonb(CASE WHEN nnum='anno' THEN 'Numero e anno del documento nella causale' ELSE 'Numero del documento nella causale' END);
   -- Il numero vale insieme al soggetto: un pagante diverso serve un rapporto documentato.
   IF subj IS NULL AND length(tx_chiave)>=4 AND length(chiave)>=4 THEN
    IF EXISTS(SELECT 1 FROM public.tesoreria_paganti_autorizzati pa WHERE pa.company_id=p_company AND pa.revocato_at IS NULL
        AND (private.tes_chiave_nome(pa.soggetto_nome)=chiave OR pa.soggetto_id=rec.supplier_id)
        AND (private.tes_chiave_nome(pa.pagante_nome)=tx_chiave OR private.tes_iban(pa.pagante_iban)=tx_iban)) THEN
     subj:='terzo_documentato'; motivi:=motivi||to_jsonb('Pagante terzo con rapporto documentato'::text);
    ELSE
     conf:=conf||to_jsonb(format('Il pagante «%s» non è l''intestatario «%s» e non c''è un rapporto documentato',tx_nome,coalesce(party,'?')));
    END IF;
   END IF;
  END IF;
  -- Data
  IF rec.scad IS NOT NULL AND t.booking_date IS NOT NULL AND abs(t.booking_date-rec.scad)<=30 THEN motivi:=motivi||to_jsonb('Data entro 30 giorni dalla scadenza'::text); END IF;
  forza:=CASE WHEN subj IN('iban_verificato','terzo_documentato') OR (nnum IN('si','anno') AND subj IS NOT NULL) THEN 'forte'
              WHEN subj IS NOT NULL OR (nnum IN('si','anno') AND length(private.tes_numero_nucleo(rec.numero))>=3) THEN 'media' ELSE 'debole' END;
  c:=jsonb_build_object('tipo',rec.tipo,'id',rec.id,'titolo',rec.titolo,'controparte',party,'chiave_soggetto',chiave,'residuo',CASE WHEN rec.nc THEN -rec.residuo ELSE rec.residuo END,
   'nc',rec.nc,'forza',forza,'motivi',motivi,'conflitti',conf,'data',rec.scad);
  -- Un conflitto conta solo su un candidato che, per importo, potrebbe essere questo pagamento.
  IF jsonb_array_length(conf)>0 THEN
   IF abs(rec.residuo-amt)<=1.00 THEN confl:=confl||jsonb_build_array(c); END IF;
  ELSE cands:=cands||jsonb_build_array(c); END IF;
 END LOOP;

 -- 1. Documento unico con l'importo esatto (le note di credito non si pagano da sole).
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO forti FROM jsonb_array_elements(cands) x WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND abs((x->>'residuo')::numeric-amt)<0.005 AND x->>'forza'='forte';
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO medie FROM jsonb_array_elements(cands) x WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND abs((x->>'residuo')::numeric-amt)<0.005 AND x->>'forza'='media';
 IF jsonb_array_length(forti)>0 OR jsonb_array_length(medie)>0 THEN
  ex:=CASE WHEN jsonb_array_length(forti)>0 THEN forti ELSE medie END;
  out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)>1 THEN 'scelta' WHEN jsonb_array_length(forti)=1 THEN 'automatico' ELSE 'proposta' END,
   'natura','documento','regola','R-DOC','versione',1,'differenza',0);
  out:=out||jsonb_build_object('candidati',(SELECT jsonb_agg(jsonb_build_object('chiave',(x->>'tipo')||':'||(x->>'id'),'forza',x->>'forza','motivi',(x->'motivi')||to_jsonb('Importo uguale al residuo'::text),'conflitti','[]'::jsonb,
    'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',amt)))) FROM jsonb_array_elements(ex) x));
 END IF;

 -- 2. Cumulativo (con eventuali note di credito): partite dello stesso soggetto che sommano esattamente.
 IF out IS NULL THEN
  combos:='[]';
  FOR grp IN SELECT x->>'chiave_soggetto' k,jsonb_agg(x ORDER BY x->>'data' NULLS LAST,x->>'id') its FROM jsonb_array_elements(cands) x
             WHERE x->>'forza' IN('forte','media') AND length(coalesce(x->>'chiave_soggetto',''))>=4 AND x->>'tipo'<>'rata' GROUP BY 1 LOOP
   items:=grp.its; m:=least(jsonb_array_length(items),8);
   IF m<2 THEN CONTINUE; END IF;
   FOR mask IN 3..(1<<m)-1 LOOP
    IF (SELECT count(*) FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0)<2 THEN CONTINUE; END IF;
    SELECT sum((items->b->>'residuo')::numeric),bool_or((items->b->>'nc')::boolean) INTO somma,hasnc FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0;
    IF abs(somma-amt)<0.005 AND (SELECT count(*) FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0 AND NOT (items->b->>'nc')::boolean)>=1 THEN
     SELECT jsonb_agg(jsonb_build_object('tipo',items->b->>'tipo','id',items->b->>'id','titolo',items->b->>'titolo','controparte',items->b->>'controparte','residuo',(items->b->>'residuo')::numeric,'quota',(items->b->>'residuo')::numeric) ORDER BY b) INTO righe
     FROM generate_series(0,m-1) b WHERE mask&(1<<b)<>0;
     combos:=combos||jsonb_build_array(jsonb_build_object('chiave','cumulo:'||md5(righe::text),'forza','media','nc',hasnc,
      'motivi',jsonb_build_array('Stesso soggetto',format('Somma esatta di %s partite aperte',jsonb_array_length(righe)))||CASE WHEN hasnc THEN jsonb_build_array('Compensata con nota di credito') ELSE '[]'::jsonb END,
      'conflitti','[]'::jsonb,'righe',righe));
     EXIT WHEN jsonb_array_length(combos)>3;
    END IF;
   END LOOP;
  END LOOP;
  IF jsonb_array_length(combos)>0 THEN
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(combos)=1 THEN 'proposta' ELSE 'scelta' END,
    'natura',CASE WHEN (SELECT bool_or((x->>'nc')::boolean) FROM jsonb_array_elements(combos) x) THEN 'compensazione_nc' ELSE 'cumulativo' END,
    'regola',CASE WHEN (SELECT bool_or((x->>'nc')::boolean) FROM jsonb_array_elements(combos) x) THEN 'R-NC' ELSE 'R-CUMULO' END,'versione',1,'differenza',0,
    'candidati',(SELECT jsonb_agg(x-'nc') FROM jsonb_array_elements(combos) x));
  END IF;
 END IF;

 -- 3. Differenza fino a 1 € (commissione o arrotondamento), soggetto certo.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND x->>'forza' IN('forte','media') AND abs((x->>'residuo')::numeric-amt) BETWEEN 0.005 AND 1.00;
  IF jsonb_array_length(ex)>0 THEN
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,'natura','differenza','regola','R-DIFF','versione',1,
    'differenza',round((ex->0->>'residuo')::numeric-amt,2),
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','diff:'||(x->>'id'),'forza',x->>'forza','motivi',(x->'motivi')||to_jsonb(format('Differenza di %s € da classificare (commissione o arrotondamento)',round(abs((x->>'residuo')::numeric-amt),2))),'conflitti','[]'::jsonb,
     'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',least(amt,(x->>'residuo')::numeric)))))
     FROM jsonb_array_elements(ex) x));
  END IF;
 END IF;

 -- 4. Acconto prima della fattura: rata della commessa del cliente, non ancora fatturata.
 IF out IS NULL AND cred THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE x->>'tipo'='rata' AND x->>'forza' IN('forte','media') AND abs((x->>'residuo')::numeric-amt)<0.005;
  IF jsonb_array_length(ex)>0 THEN
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,'natura','acconto','regola','R-ACCONTO','versione',1,'differenza',0,
    'nota','L''acconto si collega alla rata: quando arriva la fattura della rata il denaro è già contato',
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','rata:'||(x->>'id'),'forza','media','motivi',(x->'motivi')||to_jsonb('Rata della commessa non ancora fatturata, stesso importo'::text),'conflitti','[]'::jsonb,
     'righe',jsonb_build_array(jsonb_build_object('tipo','rata','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',amt)))) FROM jsonb_array_elements(ex) x));
  END IF;
 END IF;

 -- 5. Parziale o eccedente su un documento del soggetto certo.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND (x->>'forza'='forte' OR (x->>'forza'='media' AND x->'motivi' @> '["Controparte corrispondente"]'::jsonb) OR (x->>'forza'='media' AND (x->'motivi')::text LIKE '%IBAN%'));
  -- un parziale ha senso su un solo documento; se ce ne sono più, prima quelli col numero in causale
  IF jsonb_array_length(ex)>1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(ex) x WHERE (x->'motivi')::text LIKE '%Numero%') THEN
   SELECT jsonb_agg(x) INTO ex FROM jsonb_array_elements(ex) x WHERE (x->'motivi')::text LIKE '%Numero%';
  END IF;
  IF jsonb_array_length(ex)>0 THEN
   diff:=CASE WHEN jsonb_array_length(ex)=1 THEN greatest(round(amt-(ex->0->>'residuo')::numeric,2),0) ELSE 0 END;
   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,
    'natura',CASE WHEN jsonb_array_length(ex)=1 AND amt>(ex->0->>'residuo')::numeric THEN 'eccedenza' ELSE 'parziale' END,
    'regola','R-PARZIALE','versione',1,'differenza',diff,
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','parz:'||(x->>'id'),'forza',x->>'forza',
      'motivi',(x->'motivi')||to_jsonb(CASE WHEN amt<(x->>'residuo')::numeric THEN format('Pagamento parziale: resteranno %s €',round((x->>'residuo')::numeric-amt,2)) ELSE format('Il movimento supera il residuo di %s €: il resto va qualificato (acconto o eccedenza), non è un ricavo',round(amt-(x->>'residuo')::numeric,2)) END),
      'conflitti','[]'::jsonb,
      'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',least(amt,(x->>'residuo')::numeric)))))
     FROM jsonb_array_elements(ex) x));
  END IF;
 END IF;

 -- Conflitti senza alternative valide: blocco.
 IF out IS NULL AND jsonb_array_length(confl)>0 THEN
  out:=jsonb_build_object('esito','conflitto','natura','documento','regola','R-CONFLITTO','versione',1,'differenza',0,'candidati','[]'::jsonb);
 END IF;

 -- Spese bancarie e resto.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('chiave',(x->>'tipo')||':'||(x->>'id'),'forza','debole','motivi',jsonb_build_array('Solo l''importo coincide'),'conflitti','[]'::jsonb,
    'righe',jsonb_build_array(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','controparte',x->>'controparte','residuo',(x->>'residuo')::numeric,'quota',amt)))),'[]')
  INTO deboli FROM jsonb_array_elements(cands) x WHERE x->>'forza'='debole' AND NOT (x->>'nc')::boolean AND abs((x->>'residuo')::numeric-amt)<0.005;
  SELECT count(*) INTO n_soggetto FROM jsonb_array_elements(cands) x WHERE x->>'forza' IN('forte','media');
  out:=jsonb_build_object('esito','da_gestire','regola','R-NESSUNO','versione',1,'differenza',0,'candidati',deboli,
   'natura',CASE WHEN ncaus~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'spesa_bancaria'
                 WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') THEN 'spesa_carta'
                 ELSE 'sconosciuta' END,
   'mancanti',(SELECT coalesce(jsonb_agg(v),'[]') FROM unnest(ARRAY[
     CASE WHEN tx_nome IS NULL AND tx_iban IS NULL THEN 'Nome e IBAN della controparte (la banca non li ha comunicati)' END,
     CASE WHEN jsonb_array_length(deboli)>0 THEN 'Il soggetto o il numero del documento: coincide solo l''importo' END,
     CASE WHEN n_soggetto>0 THEN format('%s partite aperte della stessa controparte, nessuna con questo importo né una somma esatta',n_soggetto) END,
     CASE WHEN n_soggetto=0 AND jsonb_array_length(deboli)=0 AND tx_nome IS NOT NULL AND NOT intermediario THEN format('Nessuna partita aperta di «%s»: il documento non è ancora registrato?',tx_nome) END,
     CASE WHEN intermediario THEN 'La banca ha comunicato un intermediario, non il pagante: serve il riferimento del documento' END,
     CASE WHEN ncaus~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'Spesa bancaria: si registra come movimento senza fattura' END,
     CASE WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') AND NOT ncaus~'\m(commissioni|commissione|canone|fx)\M' THEN 'Acquisto con carta: serve la ricevuta o la fattura del negozio' END]) v WHERE v IS NOT NULL));
 END IF;

 -- Commesse dalle righe del primo candidato; motivi e conflitti a livello di esito.
 righe:='[]'; k:=0;
 IF jsonb_array_length(coalesce(out->'candidati','[]'))>0 THEN
  FOR c IN SELECT value FROM jsonb_array_elements(out->'candidati'->0->'righe') LOOP
   ex:=private.tes_commesse_riga(p_company,c->>'tipo',(c->>'id')::uuid,(c->>'quota')::numeric);
   IF jsonb_typeof(ex)='object' THEN k:=1; ex:='[]'; END IF;
   righe:=righe||ex;
  END LOOP;
  out:=jsonb_set(out,'{candidati}',(SELECT jsonb_agg(jsonb_set(cd,'{righe}',(SELECT jsonb_agg(r||jsonb_build_object('commesse',CASE WHEN jsonb_typeof(z)='array' THEN z ELSE '[]'::jsonb END,'ripartizione_da_completare',jsonb_typeof(z)='object'))
     FROM jsonb_array_elements(cd->'righe') r CROSS JOIN LATERAL (SELECT private.tes_commesse_riga(p_company,r->>'tipo',(r->>'id')::uuid,(r->>'quota')::numeric) z) zz))) FROM jsonb_array_elements(out->'candidati') cd));
 END IF;
 out:=out||jsonb_build_object(
  'commesse',(SELECT coalesce(jsonb_agg(jsonb_build_object('order_id',o,'quota',q) ORDER BY o),'[]') FROM (SELECT x->>'order_id' o,round(sum((x->>'quota')::numeric),2) q FROM jsonb_array_elements(righe) x GROUP BY 1) g),
  'ripartizione_da_completare',k=1,
  'motivi',coalesce(out->'candidati'->0->'motivi','[]'::jsonb),
  'conflitti',coalesce((SELECT jsonb_agg(jsonb_build_object('tipo',x->>'tipo','id',x->>'id','titolo',x->>'titolo','motivi',x->'conflitti')) FROM jsonb_array_elements(confl) x),'[]'::jsonb),
  'mancanti',coalesce(out->'mancanti','[]'::jsonb));
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION private.tes_classifica(uuid,uuid) FROM PUBLIC,anon,authenticated;

NOTIFY pgrst,'reload schema';

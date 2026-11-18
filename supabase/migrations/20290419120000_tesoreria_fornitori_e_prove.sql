-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: i pagamenti ai fornitori trovano la loro fattura, e un movimento
-- può essere la prova di un pagamento già registrato
-- ════════════════════════════════════════════════════════════════════════════
-- Collaudo su Impresa Vulcano (18/11/2026). Prima: 0 uscite su 409 potevano
-- trovare un documento, perché private.tes_classifica guardava solo le
-- `scadenze` in uscita (10, nessuna di un fornitore). I debiti veri stanno in
-- `rate_fornitori` (fatture contabilizzate) e `fatture_ricevute` (le altre).
--
-- 1. Candidati nuovi per le uscite: `rata_fornitore` (rata aperta) e `ricevuta`
--    (fattura da pagare senza rate). Il numero del fornitore si riconosce anche
--    con la serie in coda («saldo fattura n.42/001» = 42/001): il nucleo prendeva
--    «001». Conferma: la rata (o la fattura) si segna pagata alla data del
--    movimento, come dal pannello delle rate; il costo si allinea dai trigger.
--    Nessuna riga di prima nota: Vulcano la tiene importata, e va lasciata com'è.
--    Solo rate o fatture intere: un parziale al fornitore resta da fare a mano.
-- 2. Prove: una fattura già segnata pagata senza banca (442 emesse su Vulcano;
--    molte ricevute segnate pagate da chi le smista, con la data vera del
--    bonifico) si collega al movimento come prova, senza toccare importi.
--    Emesse: natura gia_incassata, ora con il candidato `prova_fattura`.
--    Ricevute: natura gia_pagata, `prova_ricevuta`, se fornitore e importo
--    coincidono e la data di pagamento è entro 3 giorni (o c'è il numero).
-- 3. «DISPOSIZIONE a favore di FORNITORE … SALDO FATTURA … Spese: 0,50 EUR»
--    finiva fra le spese bancarie per la parola «Spese» (21 uscite, 56.000 €).
--    Rate di mutuo/prestito/leasing → finanziamento; anticipi su fatture →
--    anticipo_fatture.
-- 4. Scollegare un incasso su una fattura importata da XML lo toglieva due volte
--    (trigger su invoice_payments + bank_reverse_imported): una fattura incassata
--    a metà tornava a zero. Ora per l'XML si ricalcola solo lo stato.
--
-- Le colonne di bank_reconciliations le aggiunge 20290419115000. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.tes_numero_intero_in_causale(p_causale text, p_numero text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 -- 18/11/2026: il numero intero, serie compresa, come sequenza di parole della causale («n 42 001»).
 -- Un numero di una o due cifre vale solo dopo «n», «nr», «fattura» o «fatt»: altrimenti è un giorno.
 WITH x AS (SELECT private.tes_norm(p_numero) n, ' '||private.tes_norm(p_causale)||' ' c)
 SELECT CASE WHEN x.n !~ '[0-9]' OR length(replace(x.n,' ',''))<1 THEN false
             WHEN x.n ~ '^[0-9]{1,2}$' THEN x.c ~ ('\m(n|nr|num|fattura|fatt|ft)\s+'||x.n||'\M')
             ELSE strpos(x.c,' '||x.n||' ')>0 END
 FROM x
$function$;

CREATE OR REPLACE FUNCTION private.tes_soggetto_in_causale(p_nome text, p_ncaus text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 -- 18/11/2026: il fornitore (o il cliente) nominato nella causale normalizzata.
 WITH k AS (SELECT private.tes_chiave_nome(p_nome) k)
 SELECT coalesce(
   (length(k.k)>=6 AND strpos(replace(coalesce(p_ncaus,''),' ',''),k.k)>0)
   OR (length(k.k) BETWEEN 3 AND 5 AND strpos(' '||coalesce(p_ncaus,'')||' ',' '||k.k||' ')>0)
   OR private.tes_parole_nome_in_causale(p_nome,p_ncaus),false)
 FROM k
$function$;

REVOKE ALL ON FUNCTION private.tes_numero_intero_in_causale(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tes_soggetto_in_causale(text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid, p_tx uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 t public.bank_transactions; amt numeric; impegnato numeric; resto numeric; cred boolean;
 tx_iban text; tx_nome text; tx_chiave text; causale text; ncaus text;
 cands jsonb:='[]'; confl jsonb:='[]'; c jsonb; rec record; pend record;
 num text; nnum text; subj text; motivi jsonb; conf jsonb; forza text; chiave text; party text; iban_doc text; verified boolean;
 own_accounts text[]; legs jsonb; ex jsonb; forti jsonb; medie jsonb; deboli jsonb;
 grp record; items jsonb; k int; m int; mask int; somma numeric; combo jsonb; combos jsonb; hasnc boolean;
 out jsonb; righe jsonb; diff numeric; intermediario boolean:=false; n_soggetto int; chiave_cli text; cod_ordini jsonb:='{}'; forn_ids uuid[]:='{}'; cod jsonb; ord_ids uuid[]; diff_max numeric:=private.soglia_banca_differenza(p_company);
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile' USING ERRCODE='P0002'; END IF;
 amt:=abs(t.amount); cred:=t.transaction_type='credit';
 tx_iban:=coalesce(private.tes_iban(CASE WHEN cred THEN t.debtor_iban ELSE t.creditor_iban END),private.tes_iban(to_jsonb(t)->>'counterparty_iban'));
 tx_nome:=coalesce(nullif(CASE WHEN cred THEN t.debtor_name ELSE t.creditor_name END,''),nullif(to_jsonb(t)->>'counterparty_name',''));
 tx_chiave:=private.tes_chiave_nome(tx_nome);
 -- Una banca o un circuito di pagamento al posto del pagante non identifica nessuno.
 IF private.tes_norm(tx_nome)~'^(banca|banco) |\m(bank|bancaria|poste italiane|bancoposta|qonto|unicredit|intesa sanpaolo|bnl|bper|credem|fineco|mediolanum|paypal|stripe|satispay|nexi|sumup|revolut|n26)\M' THEN
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
   AND o.chiuso_senza_documento IS NULL AND coalesce(o.reconciliation_status,'pending') NOT IN('reconciled','ignored')
   AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations x WHERE x.company_id=p_company AND x.transaction_id=o.id AND x.unmatched_at IS NULL)
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
  IF jsonb_array_length(legs)=0 THEN
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
   'natura','f24','regola','R-F24','versione',1,'motivi',jsonb_build_array('Causale di delega F24 o di un ente'),'conflitti','[]'::jsonb,
   'mancanti',CASE WHEN jsonb_array_length(legs)=0 THEN jsonb_build_array('Una scadenza fiscale (F24) con lo stesso importo entro 20 giorni: senza, le componenti del modello non sono note') ELSE '[]'::jsonb END,
   'candidati',(SELECT coalesce(jsonb_agg(jsonb_build_object('chiave','f24:'||(l->>'id'),'forza','forte','motivi',jsonb_build_array('Scadenza fiscale con lo stesso importo'),'conflitti','[]'::jsonb,'righe',jsonb_build_array(l))),'[]') FROM jsonb_array_elements(legs) l),
   'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,'nota','Un F24 non è un costo di commessa');
 END IF;

 -- Codici del committente nella causale (R-CODICE, 16/11/2026): solo per gli incassi.
 IF cred THEN cod_ordini:=private.tes_codici_in_causale(p_company,causale); END IF;
 -- Fornitori nominati nella causale (18/11/2026): una volta per movimento, non fattura per fattura.
 IF NOT cred THEN forn_ids:=ARRAY(SELECT s.id FROM public.suppliers s WHERE s.company_id=p_company AND private.tes_soggetto_in_causale(s.name,ncaus)); END IF;

 -- Candidati documentali
 FOR rec IN
  SELECT CASE WHEN coalesce(to_jsonb(d)->>'origine','nativa')='nativa' THEN 'documento' ELSE 'invoice' END tipo,d.id,d.numero titolo,d.numero numero,coalesce(nullif(to_jsonb(d)->>'anno','')::int,extract(year FROM nullif(to_jsonb(d)->>'data_emissione','')::date)::int) anno,
   coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),nullif(concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome'),'')) party,
   private.tes_iban(coalesce(d.cliente_snapshot->>'iban',d.cliente_snapshot->>'iban_bancario')) iban, NULL::uuid supplier_id,
   round(d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0),2) residuo, d.data_scadenza scad, (d.tipo='nota_credito') nc, nullif(to_jsonb(d)->>'data_emissione','')::date emissione
  FROM public.documenti_fiscali_elenco_operativo d
  WHERE cred AND d.company_id=p_company AND d.deleted_at IS NULL
   AND d.stato IN('emessa','inviata_sdi','consegnata','accettata','scaduta','parzialmente_pagata')
   AND d.tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','fattura_riepilogativa','nota_debito','nota_credito')
   AND d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0)>0.005
  UNION ALL
  SELECT 'scadenza',s.id,s.description,coalesce(nullif(to_jsonb(cc)->>'documento_riferimento',''),s.description),
   extract(year FROM nullif(to_jsonb(cc)->>'documento_data','')::date)::int,
   f.name,private.tes_iban(to_jsonb(f)->>'iban'),s.supplier_id,round(s.amount-coalesce(s.paid_amount,0),2),s.due_date,false,nullif(to_jsonb(cc)->>'documento_data','')::date
  FROM public.scadenze s LEFT JOIN public.suppliers f ON f.id=s.supplier_id AND f.company_id=s.company_id
   LEFT JOIN public.company_costs cc ON cc.id=s.cost_id AND cc.company_id=s.company_id
  WHERE NOT cred AND s.company_id=p_company AND s.direction='uscita' AND s.status IN('da_pagare','parziale') AND coalesce(s.is_previsionale,false)=false
   AND coalesce(to_jsonb(s)->>'tipo','')<>'scadenza_fiscale' AND s.amount-coalesce(s.paid_amount,0)>0.005
  UNION ALL
  SELECT 'nota_ricevuta',n.id,concat_ws(' ','Nota di credito',n.numero_fattura),n.numero_fattura,extract(year FROM n.data_fattura)::int,
   coalesce(f.name,n.cedente_ragione_sociale),private.tes_iban(to_jsonb(f)->>'iban'),n.fornitore_id,round(abs(coalesce(n.totale_documento,0)),2),n.data_fattura,true,n.data_fattura
  FROM public.fatture_ricevute n LEFT JOIN public.suppliers f ON f.id=n.fornitore_id AND f.company_id=n.company_id
  WHERE NOT cred AND n.company_id=p_company AND n.tipo_documento IN('TD04','passive_credit_note') AND abs(coalesce(n.totale_documento,0))>0.005
   AND coalesce(n.stato,'') NOT IN('annullata','scartata','rifiutata','eliminata')
   AND NOT EXISTS(SELECT 1 FROM public.note_credito_storni z WHERE z.company_id=p_company AND z.nota_id=n.id)
  UNION ALL
  -- Rate dei fornitori (18/11/2026): il debito vero di chi contabilizza le fatture ricevute. Prima
  -- il motore guardava solo le scadenze in uscita e su Vulcano nessun pagamento ai fornitori poteva
  -- trovare il suo documento (0 su 409 uscite). Solo le rate di fornitori nominati nella causale o
  -- con lo stesso importo: le altre non possono essere questo pagamento.
  SELECT 'rata_fornitore',r.id,concat_ws(' · ','Fattura '||coalesce(f.numero_fattura,nullif(cc.documento_riferimento,''),cc.name),
     CASE WHEN (SELECT count(*) FROM public.rate_fornitori r2 WHERE r2.company_cost_id=r.company_cost_id)>1 THEN 'rata '||r.numero END),
   coalesce(f.numero_fattura,nullif(cc.documento_riferimento,'')),extract(year FROM coalesce(f.data_fattura,cc.documento_data))::int,
   coalesce(s.name,f.cedente_ragione_sociale),private.tes_iban(coalesce(nullif(r.iban,''),to_jsonb(s)->>'iban')),s.id,round(r.importo,2),r.scadenza,false,
   coalesce(f.data_fattura,cc.documento_data)
  FROM public.rate_fornitori r JOIN public.company_costs cc ON cc.id=r.company_cost_id AND cc.company_id=r.company_id
   LEFT JOIN public.fatture_ricevute f ON f.id=r.fattura_ricevuta_id AND f.company_id=r.company_id
   LEFT JOIN public.suppliers s ON s.id=coalesce(cc.supplier_id,f.fornitore_id) AND s.company_id=r.company_id
  WHERE NOT cred AND r.company_id=p_company AND r.stato NOT IN('pagata','stornata') AND coalesce(r.importo,0)>0.005
   AND NOT EXISTS(SELECT 1 FROM public.scadenze x WHERE x.company_id=p_company AND x.cost_id=r.company_cost_id AND x.direction='uscita' AND x.status IN('da_pagare','parziale'))
   AND (abs(r.importo-amt)<0.005 OR s.id=ANY(forn_ids))
  UNION ALL
  -- Fatture ricevute da pagare senza rate (non ancora contabilizzate, o contabilizzate senza piano).
  SELECT 'ricevuta',f.id,concat_ws(' · ','Fattura '||f.numero_fattura,to_char(f.data_fattura,'DD/MM/YYYY')),f.numero_fattura,extract(year FROM f.data_fattura)::int,
   coalesce(s.name,f.cedente_ragione_sociale),private.tes_iban(to_jsonb(s)->>'iban'),s.id,round(coalesce(f.netto_a_pagare,f.totale_documento),2),NULL::date,false,f.data_fattura
  FROM public.fatture_ricevute f LEFT JOIN public.suppliers s ON s.id=f.fornitore_id AND s.company_id=f.company_id
  WHERE NOT cred AND f.company_id=p_company AND f.pagata_il IS NULL AND coalesce(f.tipo_documento,'') NOT IN('TD04','passive_credit_note')
   AND coalesce(f.stato,'') NOT IN('annullata','scartata','rifiutata','eliminata') AND coalesce(f.netto_a_pagare,f.totale_documento,0)>0.005
   AND NOT EXISTS(SELECT 1 FROM public.rate_fornitori r WHERE r.fattura_ricevuta_id=f.id)
   AND (f.company_cost_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.scadenze x WHERE x.company_id=p_company AND x.cost_id=f.company_cost_id AND x.direction='uscita' AND x.status IN('da_pagare','parziale')))
   AND (abs(coalesce(f.netto_a_pagare,f.totale_documento)-amt)<0.005 OR s.id=ANY(forn_ids))
  UNION ALL
  SELECT 'rata',i.id,concat_ws(' · ',o.order_code,i.label),NULL,NULL,coalesce(nullif(o.client_company,''),nullif(o.client_name,'')),NULL,NULL,round(i.amount,2),i.expected_date,false,NULL::date
  FROM public.order_installments i JOIN public.orders o ON o.id=i.order_id AND o.company_id=p_company AND o.deleted_at IS NULL
  WHERE cred AND NOT coalesce(i.is_paid,false) AND i.invoice_id IS NULL AND i.documento_fiscale_id IS NULL AND coalesce(i.amount,0)>0.005
 LOOP
  -- Abbinamenti annullati in passato non si ripropongono.
  IF EXISTS(SELECT 1 FROM public.bank_reconciliations old WHERE old.company_id=p_company AND old.transaction_id=t.id AND old.unmatched_at IS NOT NULL
     AND (rec.id IN(old.invoice_id,old.documento_id,old.scadenza_id,old.fattura_ricevuta_id,old.rata_fornitore_id) OR to_jsonb(old)->'payment_source'->>'documento_id'=rec.id::text OR to_jsonb(old)->'payment_source'->>'scadenza_id'=rec.id::text)) THEN
   CONTINUE;
  END IF;
  -- Un incasso non paga una fattura emessa dopo (18/11/2026): un bonifico di settembre non è il
  -- saldo né l'acconto di una fattura del 31/10. Su Vulcano proponeva parziali ed eccedenze su
  -- fatture successive, quando il bonifico era di una fattura già segnata pagata. Una settimana di
  -- margine per chi emette la fattura appena arriva il bonifico.
  IF ((cred AND rec.tipo IN('documento','invoice')) OR rec.tipo IN('rata_fornitore','ricevuta')) AND rec.emissione IS NOT NULL AND t.booking_date IS NOT NULL
     AND rec.emissione>t.booking_date+7 THEN
   CONTINUE;
  END IF;
  motivi:='[]'; conf:='[]'; subj:=NULL; party:=rec.party; chiave:=private.tes_chiave_nome(party);
  -- Identità
  verified:=false;
  IF tx_iban IS NOT NULL AND rec.tipo IN('documento','invoice') THEN
   SELECT public.partner_tax_key(coalesce(nullif(d.cliente_snapshot->>'partita_iva',''),nullif(d.cliente_snapshot->>'codice_fiscale','')))
     INTO chiave_cli FROM public.documenti_fiscali_elenco_operativo d WHERE d.id=rec.id AND d.company_id=p_company;
   IF length(coalesce(chiave_cli,''))>=8 THEN
    verified:=EXISTS(SELECT 1 FROM public.tesoreria_iban_verificati v WHERE v.company_id=p_company AND v.chiave_fiscale=chiave_cli AND v.iban=tx_iban AND v.revocato_at IS NULL);
    IF NOT verified AND EXISTS(SELECT 1 FROM public.tesoreria_iban_verificati v WHERE v.company_id=p_company AND v.chiave_fiscale<>chiave_cli AND v.iban=tx_iban AND v.revocato_at IS NULL) THEN
     conf:=conf||to_jsonb('IBAN verificato di un altro cliente'::text);
    END IF;
   END IF;
  END IF;
  IF tx_iban IS NOT NULL AND rec.supplier_id IS NOT NULL THEN
   verified:=EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id=rec.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban);
   IF NOT verified AND EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=p_company AND v.fornitore_id<>rec.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban) THEN
    conf:=conf||to_jsonb('IBAN verificato di un altro fornitore'::text);
   END IF;
  END IF;
  IF verified THEN subj:='iban_verificato'; motivi:=motivi||to_jsonb('IBAN verificato della controparte'::text);
  ELSIF tx_iban IS NOT NULL AND rec.iban IS NOT NULL AND tx_iban=rec.iban THEN subj:='iban'; motivi:=motivi||to_jsonb('IBAN in anagrafica uguale'::text);
  ELSIF length(chiave)>=4 AND ((length(tx_chiave)>=4 AND (strpos(tx_chiave,chiave)>0 OR strpos(chiave,tx_chiave)>0)) OR (length(chiave)>=6 AND strpos(replace(ncaus,' ',''),chiave)>0) OR private.tes_parole_nome_in_causale(party,ncaus)) THEN
   subj:='nome'; motivi:=motivi||to_jsonb('Controparte corrispondente'::text);
  END IF;
  -- Numero con anno e soggetto
  nnum:=CASE WHEN rec.numero IS NOT NULL THEN private.tes_numero_in_causale(causale,private.tes_numero_nucleo(rec.numero),rec.anno) ELSE 'no' END;
  -- 18/11/2026: i fornitori mettono la serie in coda («42/001», «330/001»): il nucleo prendeva la serie.
  IF nnum='no' AND rec.tipo IN('rata_fornitore','ricevuta') AND private.tes_numero_intero_in_causale(causale,rec.numero) THEN nnum:='si'; END IF;
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
     conf:=conf||to_jsonb(CASE WHEN cred THEN format('Il pagante «%s» non è l''intestatario «%s» e non c''è un rapporto documentato',tx_nome,party)
                               ELSE format('Il beneficiario «%s» non è il fornitore «%s» e non c''è un rapporto documentato',tx_nome,party) END);
    END IF;
   END IF;
  END IF;
  -- Codice del committente: la commessa del candidato ha un codice che è nella causale.
  cod:=NULL;
  IF cod_ordini<>'{}'::jsonb THEN
   ord_ids:=private.tes_ordini_riga(p_company,rec.tipo,rec.id);
   SELECT cod_ordini->(o::text) INTO cod FROM unnest(ord_ids) o WHERE cod_ordini ? (o::text) LIMIT 1;
   IF cod IS NOT NULL THEN
    motivi:=motivi||to_jsonb(format('Codice del committente «%s» nella causale (commessa %s)',cod->>'codice',cod->>'commessa'));
   END IF;
  END IF;
  -- Data
  IF rec.scad IS NOT NULL AND t.booking_date IS NOT NULL AND abs(t.booking_date-rec.scad)<=30 THEN motivi:=motivi||to_jsonb('Data entro 30 giorni dalla scadenza'::text); END IF;
  forza:=CASE WHEN subj IN('iban_verificato','terzo_documentato') OR (nnum IN('si','anno') AND subj IS NOT NULL) OR (cod IS NOT NULL AND subj IS NOT NULL) THEN 'forte'
              WHEN subj IS NOT NULL OR cod IS NOT NULL OR (nnum IN('si','anno') AND length(private.tes_numero_nucleo(rec.numero))>=3) THEN 'media' ELSE 'debole' END;
  c:=jsonb_build_object('tipo',rec.tipo,'id',rec.id,'titolo',rec.titolo,'controparte',party,'chiave_soggetto',chiave,'residuo',CASE WHEN rec.nc THEN -rec.residuo ELSE rec.residuo END,
   'nc',rec.nc,'forza',forza,'motivi',motivi,'conflitti',conf,'data',rec.scad);
  -- Un conflitto conta solo su un candidato che, per importo, potrebbe essere questo pagamento.
  IF jsonb_array_length(conf)>0 THEN
   IF abs(rec.residuo-amt)<=greatest(diff_max,0.005) THEN confl:=confl||jsonb_build_array(c); END IF;
  ELSE cands:=cands||jsonb_build_array(c); END IF;
 END LOOP;

 -- La causale cita una fattura dello stesso cliente già segnata pagata senza movimento (18/11/2026).
 -- Su Vulcano 442 fatture risultano pagate senza banca (importate pagate, foglio «Incassi»): il
 -- bonifico «SALDO FATT. N. 1/170» di Colombo finiva proposto come eccedenza della 1/117. Se il
 -- bonifico dice quale fattura paga e quella è già chiusa, non si propone nient'altro: lo si dice.
 IF cred AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte') THEN
  SELECT d.id, d.numero, round(d.totale_da_pagare,2) tot INTO pend
    FROM public.documenti_fiscali_elenco_operativo d
   WHERE d.company_id=p_company AND d.deleted_at IS NULL
     AND d.tipo IN('fattura','fattura_pa','parcella','fattura_accompagnatoria','fattura_riepilogativa','nota_debito')
     AND d.totale_da_pagare>0.005 AND d.totale_da_pagare-coalesce(d.importo_pagato,0)-coalesce(d.stornato,0)<=0.005
     AND amt<=d.totale_da_pagare+greatest(diff_max,0.005)
     AND (t.booking_date IS NULL OR nullif(to_jsonb(d)->>'data_emissione','')::date IS NULL
          OR nullif(to_jsonb(d)->>'data_emissione','')::date<=t.booking_date+7)
     AND length(private.tes_numero_nucleo(d.numero))>=2 AND strpos(causale,private.tes_numero_nucleo(d.numero))>0
     AND private.tes_numero_in_causale(causale,private.tes_numero_nucleo(d.numero),
          coalesce(nullif(to_jsonb(d)->>'anno','')::int,extract(year FROM nullif(to_jsonb(d)->>'data_emissione','')::date)::int)) IN('si','anno')
     AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.unmatched_at IS NULL AND d.id IN(r.invoice_id,r.documento_id))
     AND EXISTS(SELECT 1 FROM (SELECT coalesce(nullif(d.cliente_snapshot->>'ragione_sociale',''),nullif(d.cliente_snapshot->>'company_name',''),
                  nullif(concat_ws(' ',d.cliente_snapshot->>'nome',d.cliente_snapshot->>'cognome'),'')) nome) z
                WHERE length(private.tes_chiave_nome(z.nome))>=4
                  AND ((length(tx_chiave)>=4 AND (strpos(tx_chiave,private.tes_chiave_nome(z.nome))>0 OR strpos(private.tes_chiave_nome(z.nome),tx_chiave)>0))
                       OR (length(private.tes_chiave_nome(z.nome))>=6 AND strpos(replace(ncaus,' ',''),private.tes_chiave_nome(z.nome))>0)
                       OR private.tes_parole_nome_in_causale(z.nome,ncaus)))
   ORDER BY abs(d.totale_da_pagare-amt), d.id LIMIT 1;
  IF pend.id IS NOT NULL THEN
   -- 18/11/2026: il movimento è la prova di un incasso già registrato. Si collega senza toccare la
   -- fattura; da solo solo se l'importo è quello della fattura.
   RETURN jsonb_build_object('esito',CASE WHEN abs(pend.tot-amt)<=greatest(diff_max,0.005) THEN 'automatico' ELSE 'proposta' END,
    'natura','gia_incassata','regola','R-GIA-INCASSATA','versione',2,
    'motivi',jsonb_build_array(format('La causale cita la fattura %s dello stesso cliente',pend.numero),'La fattura risulta già pagata, senza movimento di banca'),
    'conflitti','[]'::jsonb,
    'mancanti','[]'::jsonb,
    'candidati',jsonb_build_array(jsonb_build_object('chiave','prova:'||pend.id,'forza','forte',
      'motivi',jsonb_build_array(format('La causale cita la fattura %s dello stesso cliente',pend.numero),'Si collega come prova del pagamento: la fattura non cambia'),
      'conflitti','[]'::jsonb,
      'righe',jsonb_build_array(jsonb_build_object('tipo','prova_fattura','id',pend.id,'titolo','Fattura '||pend.numero||' (già pagata)','controparte',NULL,'residuo',0,'quota',amt,'commesse','[]'::jsonb)))),
    'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false,
    'documento_gia_pagato',jsonb_build_object('id',pend.id,'numero',pend.numero,'totale',pend.tot));
  END IF;
 END IF;

 -- Fattura del fornitore già segnata pagata senza movimento (18/11/2026). In Vulcano chi smista le
 -- ricevute segna «pagata il» con la data vera del bonifico: stesso fornitore, stesso importo e
 -- data entro 3 giorni (o il numero in causale) bastano a dire che questo è quel pagamento. Il
 -- leasing che addebita 1.987,44 € ogni mese si distingue solo così.
 IF NOT cred AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(cands) x WHERE x->>'forza'='forte' AND abs((x->>'residuo')::numeric-amt)<0.005) THEN
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.dd,z.id),'[]') INTO ex FROM (
   SELECT f.id, f.numero_fattura num, coalesce(s.name,f.cedente_ragione_sociale) nome, f.pagata_il, abs(f.pagata_il-t.booking_date) dd,
    (private.tes_numero_intero_in_causale(causale,f.numero_fattura)
     OR private.tes_numero_in_causale(causale,private.tes_numero_nucleo(f.numero_fattura),extract(year FROM f.data_fattura)::int) IN('si','anno')) numero_ok,
    -- segnata pagata ma con la rata ancora aperta: si chiude la rata, non basta la prova
    (SELECT r.id FROM public.rate_fornitori r WHERE r.fattura_ricevuta_id=f.id AND r.stato NOT IN('pagata','stornata') AND abs(r.importo-amt)<0.005 ORDER BY r.scadenza,r.id LIMIT 1) rata_id
   FROM public.fatture_ricevute f LEFT JOIN public.suppliers s ON s.id=f.fornitore_id AND s.company_id=f.company_id
   WHERE f.company_id=p_company AND f.pagata_il IS NOT NULL AND coalesce(f.tipo_documento,'') NOT IN('TD04','passive_credit_note')
     AND coalesce(f.stato,'') NOT IN('annullata','scartata','rifiutata','eliminata')
     AND abs(coalesce(f.netto_a_pagare,f.totale_documento,0)-amt)<0.005
     AND (t.booking_date IS NULL OR f.data_fattura IS NULL OR f.data_fattura<=t.booking_date+7)
     AND f.fornitore_id=ANY(forn_ids)
     AND (NOT EXISTS(SELECT 1 FROM public.rate_fornitori r WHERE r.fattura_ricevuta_id=f.id AND r.stato NOT IN('pagata','stornata'))
          OR EXISTS(SELECT 1 FROM public.rate_fornitori r WHERE r.fattura_ricevuta_id=f.id AND r.stato NOT IN('pagata','stornata') AND abs(r.importo-amt)<0.005))
     AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations r WHERE r.company_id=p_company AND r.unmatched_at IS NULL AND r.fattura_ricevuta_id=f.id)
     AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations o WHERE o.company_id=p_company AND o.transaction_id=t.id AND o.unmatched_at IS NOT NULL AND o.fattura_ricevuta_id=f.id)
  ) z WHERE z.dd<=3 OR z.numero_ok;
  IF jsonb_array_length(ex)>1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(ex) x WHERE (x->>'numero_ok')::boolean AND (x->>'dd')::int<=3) THEN
   SELECT jsonb_agg(x) INTO ex FROM jsonb_array_elements(ex) x WHERE (x->>'numero_ok')::boolean AND (x->>'dd')::int<=3;
  END IF;
  IF jsonb_array_length(ex)>0 THEN
   RETURN jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'automatico' ELSE 'scelta' END,
    'natura','gia_pagata','regola','R-GIA-PAGATA','versione',1,
    'motivi',jsonb_build_array('Fattura del fornitore già segnata pagata, senza movimento di banca'),
    'conflitti','[]'::jsonb,'mancanti','[]'::jsonb,
    'candidati',(SELECT jsonb_agg(jsonb_build_object('chiave','prova:'||(x->>'id'),'forza','forte',
       'motivi',jsonb_build_array('Fornitore corrispondente','Importo uguale',
          CASE WHEN (x->>'dd')::int<=3 THEN format('Segnata pagata il %s',to_char((x->>'pagata_il')::date,'DD/MM/YYYY')) ELSE 'Numero della fattura nella causale' END),
       'conflitti','[]'::jsonb,
       'righe',jsonb_build_array(CASE WHEN x->>'rata_id' IS NOT NULL
          THEN jsonb_build_object('tipo','rata_fornitore','id',x->>'rata_id','titolo','Fattura '||(x->>'num')||' (segnata pagata, rata ancora aperta)','controparte',x->>'nome','residuo',amt,'quota',amt,'commesse','[]'::jsonb)
          ELSE jsonb_build_object('tipo','prova_ricevuta','id',x->>'id','titolo','Fattura '||(x->>'num')||' (già pagata)','controparte',x->>'nome','residuo',0,'quota',amt,'commesse','[]'::jsonb) END)))
     FROM jsonb_array_elements(ex) x),
    'commesse','[]'::jsonb,'differenza',0,'ripartizione_da_completare',false);
  END IF;
 END IF;

 -- 1. Documento unico con l'importo esatto (le note di credito non si pagano da sole).
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO forti FROM jsonb_array_elements(cands) x WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND abs((x->>'residuo')::numeric-amt)<0.005 AND x->>'forza'='forte';
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO medie FROM jsonb_array_elements(cands) x WHERE NOT (x->>'nc')::boolean AND x->>'tipo'<>'rata' AND abs((x->>'residuo')::numeric-amt)<0.005 AND x->>'forza'='media';
 IF jsonb_array_length(forti)>0 OR jsonb_array_length(medie)>0 THEN
  ex:=CASE WHEN jsonb_array_length(forti)>0 THEN forti ELSE medie END;
  out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)>1 THEN 'scelta' WHEN jsonb_array_length(forti)=1 AND jsonb_array_length(confl)=0 THEN 'automatico' ELSE 'proposta' END,
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

 -- 3. Differenza fino alla soglia dell'azienda (default 1 €: commissione o arrotondamento), soggetto certo.
 IF out IS NULL THEN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') INTO ex FROM jsonb_array_elements(cands) x
  WHERE NOT (x->>'nc')::boolean AND x->>'tipo' NOT IN('rata','rata_fornitore','ricevuta') AND x->>'forza' IN('forte','media') AND abs((x->>'residuo')::numeric-amt) BETWEEN 0.005 AND diff_max;
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
  WHERE NOT (x->>'nc')::boolean AND x->>'tipo' NOT IN('rata','rata_fornitore','ricevuta') AND (x->>'forza'='forte' OR (x->>'forza'='media' AND x->'motivi' @> '["Controparte corrispondente"]'::jsonb) OR (x->>'forza'='media' AND (x->'motivi')::text LIKE '%IBAN%') OR (x->>'forza'='media' AND (x->'motivi')::text LIKE '%Codice del committente%'));
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
   'natura',CASE WHEN NOT cred AND ncaus~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M' THEN 'finanziamento'
                 WHEN ncaus~'\m(anticipo su|anticipi su|rientro anticipo|rimborso anticipo|ft anticipate)\M' THEN 'anticipo_fatture'
                 WHEN regexp_replace(ncaus,'\mspese \d+ \d+ eur\M','','g')~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'spesa_bancaria'
                 WHEN NOT cred AND tx_iban IS NULL AND tx_nome IS NOT NULL AND (btrim(coalesce(t.description,''))='' OR ncaus~'\m(pos|carta|card)\M') THEN 'spesa_carta'
                 ELSE 'sconosciuta' END,
   'mancanti',(SELECT coalesce(jsonb_agg(v),'[]') FROM unnest(ARRAY[
     CASE WHEN tx_nome IS NULL AND tx_iban IS NULL THEN 'Nome e IBAN della controparte (la banca non li ha comunicati)' END,
     CASE WHEN jsonb_array_length(deboli)>0 THEN 'Il soggetto o il numero del documento: coincide solo l''importo' END,
     CASE WHEN n_soggetto>0 THEN format('%s partite aperte della stessa controparte, nessuna con questo importo né una somma esatta',n_soggetto) END,
     CASE WHEN n_soggetto=0 AND jsonb_array_length(deboli)=0 AND tx_nome IS NOT NULL AND NOT intermediario THEN format('Nessuna partita aperta di «%s»: il documento non è ancora registrato?',tx_nome) END,
     CASE WHEN cod_ordini<>'{}'::jsonb THEN (SELECT format('Nella causale c''è il codice «%s» della commessa %s, ma quella commessa non ha fatture o rate aperte con questo importo',cx.valore_cod->>'codice',cx.valore_cod->>'commessa') FROM jsonb_each(cod_ordini) cx(chiave_cod,valore_cod) ORDER BY cx.chiave_cod LIMIT 1) END,
     CASE WHEN intermediario THEN 'La banca ha comunicato un intermediario, non il pagante: serve il riferimento del documento' END,
     CASE WHEN NOT cred AND ncaus~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M' THEN 'Rata di un finanziamento: quota capitale e interessi, non una fattura' END,
     CASE WHEN ncaus~'\m(anticipo su|anticipi su|rientro anticipo|rimborso anticipo|ft anticipate)\M' THEN 'Anticipo su fatture: è un finanziamento della banca, non l''incasso del cliente' END,
     CASE WHEN NOT (NOT cred AND ncaus~'\m(rata mutuo|rata prestito|mutuo|prestito|leasing)\M')
           AND regexp_replace(ncaus,'\mspese \d+ \d+ eur\M','','g')~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta|fx)\M' THEN 'Spesa bancaria: si registra come movimento senza fattura' END,
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
END $function$;

CREATE OR REPLACE FUNCTION public.riconcilia_movimento_su_documenti(p_transazione uuid, p_righe jsonb, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.bank_transactions;
  r record; d record; i record; s public.scadenze;
  v_company uuid; v_abbinato numeric; v_resto numeric; v_somma numeric; v_residuo numeric;
  v_data date; v_mov uuid; v_scad uuid; v_rec uuid; v_pn uuid; v_esito jsonb;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_esterne jsonb := '[]'::jsonb;
  v_conta int := 0;
  v_segnata boolean; v_costo_segnato boolean;
BEGIN
 PERFORM public.richiedi_riconciliazione_banca((SELECT company_id FROM public.bank_transactions WHERE id=p_transazione));
  SELECT company_id INTO v_company FROM public.bank_transactions WHERE id = p_transazione;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR public.user_can_access_company(v_company) IS NOT TRUE
     OR public.utente_sola_lettura(v_company) THEN
    RAISE EXCEPTION 'Riconciliazione non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF p_righe IS NULL OR jsonb_typeof(p_righe) <> 'array' OR jsonb_array_length(p_righe) = 0 THEN
    RAISE EXCEPTION 'Scegli almeno un documento.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_righe) > 100 THEN
    RAISE EXCEPTION 'Troppi documenti in una volta: al massimo 100.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_company::text, 2810));
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_transazione FOR UPDATE;

  IF t.transaction_type = 'credit' AND NOT public.puo_incassare_fatture(v_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare incassi.' USING ERRCODE = '42501';
  END IF;
  IF t.transaction_type = 'debit' AND NOT public.puo_gestire_scadenze(v_company) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare pagamenti.' USING ERRCODE = '42501';
  END IF;
  IF t.transaction_type NOT IN ('credit', 'debit') OR coalesce(t.currency, 'EUR') <> 'EUR' THEN
    RAISE EXCEPTION 'Questo movimento non si può ripartire.' USING ERRCODE = '22023';
  END IF;
  IF t.reconciliation_status = 'ignored'
     OR t.linked_invoice_id IS NOT NULL OR t.linked_installment_id IS NOT NULL
     OR t.linked_scadenza_id IS NOT NULL OR t.linked_cost_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.bank_reconciliations x
                 WHERE x.transaction_id = t.id AND x.unmatched_at IS NULL AND NOT x.ripartita) THEN
    RAISE EXCEPTION 'Questo movimento bancario è già abbinato.' USING ERRCODE = '23505';
  END IF;

  SELECT coalesce(sum(matched_amount), 0) INTO v_abbinato
    FROM public.bank_reconciliations
   WHERE transaction_id = t.id AND unmatched_at IS NULL AND ripartita;
  IF v_abbinato = 0 AND EXISTS (SELECT 1 FROM public.prima_nota_entries WHERE bank_transaction_id = t.id) THEN
    RAISE EXCEPTION 'Questo movimento bancario è già abbinato.' USING ERRCODE = '23505';
  END IF;
  v_resto := round(abs(t.amount) - v_abbinato, 2);
  v_data := coalesce(t.booking_date, (now() AT TIME ZONE 'Europe/Rome')::date);

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric)
     WHERE x.id IS NULL OR x.importo IS NULL OR x.importo <= 0 OR x.importo <> round(x.importo, 2)
        OR x.tipo IS NULL
        OR (t.transaction_type = 'credit' AND x.tipo NOT IN ('documento', 'invoice', 'prova_fattura'))
        OR (t.transaction_type = 'debit' AND x.tipo NOT IN ('scadenza', 'rata_fornitore', 'ricevuta', 'prova_ricevuta'))) THEN
    RAISE EXCEPTION 'Righe non valide: controlla documenti e importi.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric)
     GROUP BY x.tipo, x.id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Lo stesso documento compare due volte.' USING ERRCODE = '22023';
  END IF;
  SELECT sum(x.importo) INTO v_somma
    FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric);
  IF v_somma > v_resto THEN
    RAISE EXCEPTION 'Stai abbinando % € ma sul movimento restano % €.', v_somma, v_resto USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT x.tipo, x.id, x.importo
      FROM jsonb_to_recordset(p_righe) AS x(tipo text, id uuid, importo numeric)
     ORDER BY x.tipo, x.id
  LOOP
    v_conta := v_conta + 1;

    IF r.tipo = 'documento' THEN
      SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato INTO d
        FROM public.documenti_fiscali WHERE id = r.id AND deleted_at IS NULL FOR UPDATE;
      IF NOT FOUND OR d.company_id <> v_company THEN
        RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF d.stato IN ('bozza', 'annullata', 'stornata', 'in_invio') THEN
        RAISE EXCEPTION 'La fattura n. % adesso non si può incassare (stato: %).', d.numero, d.stato USING ERRCODE = '22023';
      END IF;
      v_residuo := round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0)
                         - public.documento_stornato_totale(d.id), 2);
      IF r.importo > v_residuo THEN
        RAISE EXCEPTION 'Sulla fattura n. % restano % €: non puoi abbinarne %.', d.numero, v_residuo, r.importo USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.transaction_id = t.id AND x.documento_id = d.id AND x.unmatched_at IS NULL) THEN
        RAISE EXCEPTION 'La fattura n. % è già su questo movimento.', d.numero USING ERRCODE = '23505';
      END IF;
      v_mov := public.registra_incasso_atomico(
        v_company, d.id, r.importo, 'bonifico', v_data,
        left(coalesce(nullif(btrim(t.description), ''), 'Bonifico'), 140),
        '[BANCA:' || t.id::text || ']');
      UPDATE public.prima_nota_entries SET bank_transaction_id = t.id WHERE movimento_id = v_mov;
      SELECT id INTO v_scad FROM public.scadenze
       WHERE company_id = v_company AND notes LIKE '%[DOC:' || d.id::text || ']%' AND status <> 'annullata'
       LIMIT 1;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, scadenza_id, movimento_id, matched_amount,
        match_type, matched_at, matched_by, notes, ripartita)
      VALUES (v_company, t.id, v_scad, v_mov, r.importo, 'manual', now(), auth.uid(),
        'Fattura n. ' || d.numero || coalesce(' · ' || v_nota, ''), true);

    ELSIF r.tipo = 'invoice' THEN
      SELECT id, company_id, invoice_number, status, total, paid_amount, external_provider, deleted_at INTO i
        FROM public.invoices WHERE id = r.id FOR UPDATE;
      IF NOT FOUND OR i.company_id <> v_company OR i.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF i.status NOT IN ('issued', 'sent', 'delivered', 'overdue') THEN
        RAISE EXCEPTION 'La fattura n. % adesso non si può incassare (stato: %).', i.invoice_number, i.status USING ERRCODE = '22023';
      END IF;
      v_residuo := round(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 2);
      IF r.importo > v_residuo THEN
        RAISE EXCEPTION 'Sulla fattura n. % restano % €: non puoi abbinarne %.', i.invoice_number, v_residuo, r.importo USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.transaction_id = t.id AND x.invoice_id = i.id AND x.unmatched_at IS NULL) THEN
        RAISE EXCEPTION 'La fattura n. % è già su questo movimento.', i.invoice_number USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, invoice_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita)
      VALUES (v_company, t.id, i.id, r.importo, 'manual', now(), auth.uid(), v_nota, true)
      RETURNING id INTO v_rec;
      INSERT INTO public.invoice_payments (invoice_id, company_id, amount, payment_date, payment_method, reference, notes)
      VALUES (i.id, v_company, r.importo, v_data, 'bonifico', 'recon:' || v_rec::text, 'Riconciliazione bancaria (ripartita)');
      IF i.external_provider IS NOT NULL THEN
        v_esterne := v_esterne || jsonb_build_object(
          'invoice_id', i.id, 'numero', i.invoice_number, 'importo', r.importo, 'provider', i.external_provider,
          'saldata', r.importo >= v_residuo - 0.005);
      END IF;

    ELSIF r.tipo = 'prova_fattura' THEN
      -- 18/11/2026: fattura già segnata pagata senza banca. Il movimento ne è la prova: la fattura,
      -- lo scadenzario e i pagamenti non cambiano.
      SELECT x.id, x.company_id, x.numero,
             round(x.totale_da_pagare - coalesce(x.importo_pagato, 0) - coalesce(x.stornato, 0), 2) AS residuo
        INTO d FROM public.documenti_fiscali_elenco_operativo x WHERE x.id = r.id AND x.deleted_at IS NULL;
      IF NOT FOUND OR d.company_id <> v_company THEN
        RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF d.residuo > 0.005 THEN
        RAISE EXCEPTION 'La fattura n. % non risulta pagata: va incassata, non collegata come prova.', d.numero USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.company_id = v_company AND x.unmatched_at IS NULL AND r.id IN (x.invoice_id, x.documento_id)) THEN
        RAISE EXCEPTION 'La fattura n. % ha già un movimento di banca collegato.', d.numero USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, invoice_id, documento_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita, payment_source)
      VALUES (v_company, t.id,
        CASE WHEN EXISTS (SELECT 1 FROM public.invoices WHERE id = r.id AND company_id = v_company) THEN r.id END,
        CASE WHEN EXISTS (SELECT 1 FROM public.documenti_fiscali WHERE id = r.id AND company_id = v_company) THEN r.id END,
        r.importo, 'manual', now(), auth.uid(),
        '[PROVA] Fattura n. ' || d.numero || ' già segnata pagata' || coalesce(' · ' || v_nota, ''), true,
        jsonb_build_object('tipo', 'prova', 'documento_id', r.id));

    ELSIF r.tipo = 'prova_ricevuta' THEN
      SELECT f.id, f.company_id, f.numero_fattura AS numero, f.pagata_il INTO d
        FROM public.fatture_ricevute f WHERE f.id = r.id FOR UPDATE;
      IF NOT FOUND OR d.company_id <> v_company THEN
        RAISE EXCEPTION 'Fattura del fornitore non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF d.pagata_il IS NULL THEN
        RAISE EXCEPTION 'La fattura n. % del fornitore non risulta pagata: va pagata, non collegata come prova.', d.numero USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.company_id = v_company AND x.unmatched_at IS NULL AND x.fattura_ricevuta_id = r.id) THEN
        RAISE EXCEPTION 'La fattura n. % del fornitore ha già un movimento di banca collegato.', d.numero USING ERRCODE = '23505';
      END IF;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, fattura_ricevuta_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita, payment_source)
      VALUES (v_company, t.id, r.id, r.importo, 'manual', now(), auth.uid(),
        '[PROVA] Fattura fornitore n. ' || d.numero || ' già segnata pagata' || coalesce(' · ' || v_nota, ''), true,
        jsonb_build_object('tipo', 'prova', 'fattura_ricevuta_id', r.id));

    ELSIF r.tipo = 'rata_fornitore' THEN
      -- 18/11/2026: la rata si segna pagata come dal pannello delle rate (il costo si allinea da sé).
      -- Nessuna riga di prima nota: Vulcano la tiene importata e non va toccata.
      SELECT rf.id, rf.company_id, rf.stato, rf.importo, rf.fattura_ricevuta_id, rf.numero INTO d
        FROM public.rate_fornitori rf WHERE rf.id = r.id FOR UPDATE;
      IF NOT FOUND OR d.company_id <> v_company THEN
        RAISE EXCEPTION 'Rata del fornitore non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF d.stato IN ('pagata', 'stornata') THEN
        RAISE EXCEPTION 'Questa rata del fornitore è già chiusa (stato: %).', d.stato USING ERRCODE = '22023';
      END IF;
      IF abs(coalesce(d.importo, 0) - r.importo) > 0.005 THEN
        RAISE EXCEPTION 'La rata è di % €: un pagamento parziale al fornitore si registra dalla fattura.', d.importo USING ERRCODE = '22023';
      END IF;
      UPDATE public.rate_fornitori SET stato = 'pagata', pagata_il = v_data WHERE id = d.id;
      v_segnata := false;
      IF d.fattura_ricevuta_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM public.rate_fornitori x WHERE x.fattura_ricevuta_id = d.fattura_ricevuta_id AND x.stato NOT IN ('pagata', 'stornata')) THEN
        UPDATE public.fatture_ricevute SET pagata_il = v_data, pagamento_segnato_da = auth.uid(), pagamento_segnato_at = now()
         WHERE id = d.fattura_ricevuta_id AND company_id = v_company AND pagata_il IS NULL;
        v_segnata := FOUND;
      END IF;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, rata_fornitore_id, fattura_ricevuta_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita, payment_source)
      VALUES (v_company, t.id, d.id, d.fattura_ricevuta_id, r.importo, 'manual', now(), auth.uid(),
        'Rata fornitore n. ' || d.numero || coalesce(' · ' || v_nota, ''), true,
        jsonb_build_object('tipo', 'rata_fornitore', 'rata_id', d.id, 'fattura_ricevuta_id', d.fattura_ricevuta_id, 'fattura_segnata', v_segnata));

    ELSIF r.tipo = 'ricevuta' THEN
      SELECT f.id, f.company_id, f.numero_fattura AS numero, f.pagata_il, f.company_cost_id,
             round(coalesce(f.netto_a_pagare, f.totale_documento), 2) AS imp INTO d
        FROM public.fatture_ricevute f WHERE f.id = r.id FOR UPDATE;
      IF NOT FOUND OR d.company_id <> v_company THEN
        RAISE EXCEPTION 'Fattura del fornitore non trovata' USING ERRCODE = 'P0002';
      END IF;
      IF d.pagata_il IS NOT NULL THEN
        RAISE EXCEPTION 'La fattura n. % del fornitore è già segnata pagata: collegala come prova.', d.numero USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.rate_fornitori x WHERE x.fattura_ricevuta_id = d.id) THEN
        RAISE EXCEPTION 'La fattura n. % ha un piano di rate: collega la rata.', d.numero USING ERRCODE = '22023';
      END IF;
      IF abs(coalesce(d.imp, 0) - r.importo) > 0.005 THEN
        RAISE EXCEPTION 'La fattura n. % è di % €: un pagamento parziale al fornitore si registra dalla fattura.', d.numero, d.imp USING ERRCODE = '22023';
      END IF;
      UPDATE public.fatture_ricevute SET pagata_il = v_data, pagamento_segnato_da = auth.uid(), pagamento_segnato_at = now()
       WHERE id = d.id;
      v_costo_segnato := false;
      IF d.company_cost_id IS NOT NULL THEN
        UPDATE public.company_costs SET is_paid = true, paid_date = v_data, updated_at = now()
         WHERE id = d.company_cost_id AND company_id = v_company AND NOT coalesce(is_paid, false);
        v_costo_segnato := FOUND;
      END IF;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, fattura_ricevuta_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita, payment_source)
      VALUES (v_company, t.id, d.id, r.importo, 'manual', now(), auth.uid(),
        'Fattura fornitore n. ' || d.numero || coalesce(' · ' || v_nota, ''), true,
        jsonb_build_object('tipo', 'ricevuta', 'fattura_ricevuta_id', d.id, 'costo_segnato', v_costo_segnato));

    ELSE
      SELECT * INTO s FROM public.scadenze WHERE id = r.id AND company_id = v_company FOR UPDATE;
      IF s.id IS NULL OR s.direction <> 'uscita' OR s.status = 'annullata' THEN
        RAISE EXCEPTION 'Scadenza non compatibile con questa uscita.' USING ERRCODE = '22023';
      END IF;
      v_residuo := round(coalesce(s.amount, 0) - coalesce(s.paid_amount, 0), 2);
      IF r.importo > v_residuo THEN
        RAISE EXCEPTION 'Su «%» restano % €: non puoi abbinarne %.', s.description, v_residuo, r.importo USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.bank_reconciliations x
                  WHERE x.transaction_id = t.id AND x.scadenza_id = s.id AND x.unmatched_at IS NULL) THEN
        RAISE EXCEPTION 'Questa scadenza è già su questo movimento.' USING ERRCODE = '23505';
      END IF;
      v_esito := public.mark_scadenza_paid_con_richiesta(
        s.id, r.importo, 'bonifico', v_data, NULL, 'banca',
        md5(t.id::text || ':' || s.id::text)::uuid)::jsonb;
      IF v_esito ? 'error' THEN RAISE EXCEPTION '%', v_esito ->> 'error'; END IF;
      v_pn := (v_esito ->> 'prima_nota_entry_id')::uuid;
      IF v_pn IS NULL THEN RAISE EXCEPTION 'Pagamento non registrato'; END IF;
      UPDATE public.prima_nota_entries SET bank_transaction_id = t.id WHERE id = v_pn AND company_id = v_company;
      INSERT INTO public.bank_reconciliations (
        company_id, transaction_id, scadenza_id, matched_amount, match_type, matched_at, matched_by, notes, ripartita)
      VALUES (v_company, t.id, s.id, r.importo, 'manual', now(), auth.uid(), '[PAGAMENTO_UNICO] ' || v_pn::text, true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'righe', v_conta,
    'abbinato', round(v_abbinato + v_somma, 2),
    'resto', round(v_resto - v_somma, 2),
    'esterne', v_esterne);
END $function$;

CREATE OR REPLACE FUNCTION public.scollega_riga_ripartita(p_riconciliazione uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rc public.bank_reconciliations;
  v_provider text;
BEGIN
 PERFORM public.richiedi_riconciliazione_banca((SELECT company_id FROM public.bank_reconciliations WHERE id=p_riconciliazione));
  SELECT * INTO rc FROM public.bank_reconciliations WHERE id = p_riconciliazione;
  IF rc.id IS NULL THEN
    RAISE EXCEPTION 'Riconciliazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR public.user_can_access_company(rc.company_id) IS NOT TRUE
     OR public.utente_sola_lettura(rc.company_id) THEN
    RAISE EXCEPTION 'Riconciliazione non autorizzata' USING ERRCODE = '42501';
  END IF;
  IF rc.prima_nota_id IS NOT NULL THEN RETURN public.bank_scollega_pagamento(rc.id); END IF;
  IF NOT rc.ripartita THEN
    RAISE EXCEPTION 'Questa riconciliazione non è ripartita.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(rc.company_id::text, 2810));
  PERFORM 1 FROM public.bank_transactions WHERE id = rc.transaction_id FOR UPDATE;
  SELECT * INTO rc FROM public.bank_reconciliations WHERE id = p_riconciliazione FOR UPDATE;
  IF rc.unmatched_at IS NOT NULL THEN
    RETURN jsonb_build_object('gia_scollegata', true);
  END IF;

  -- 18/11/2026: prove di pagamenti già registrati e pagamenti ai fornitori dalla banca.
  IF rc.payment_source->>'tipo' IN ('prova', 'rata_fornitore', 'ricevuta') THEN
    IF rc.payment_source->>'tipo' <> 'prova' AND NOT public.puo_gestire_scadenze(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare i pagamenti.' USING ERRCODE = '42501';
    END IF;
    IF rc.payment_source->>'tipo' = 'rata_fornitore' THEN
      UPDATE public.rate_fornitori SET stato = 'da_pagare'
       WHERE id = rc.rata_fornitore_id AND company_id = rc.company_id AND stato = 'pagata';
      IF coalesce((rc.payment_source->>'fattura_segnata')::boolean, false) THEN
        UPDATE public.fatture_ricevute SET pagata_il = NULL, pagamento_segnato_da = NULL, pagamento_segnato_at = NULL
         WHERE id = rc.fattura_ricevuta_id AND company_id = rc.company_id;
      END IF;
    ELSIF rc.payment_source->>'tipo' = 'ricevuta' THEN
      IF coalesce((rc.payment_source->>'costo_segnato')::boolean, false) THEN
        UPDATE public.company_costs SET is_paid = false, paid_date = NULL, updated_at = now()
         WHERE id = (SELECT f.company_cost_id FROM public.fatture_ricevute f WHERE f.id = rc.fattura_ricevuta_id)
           AND company_id = rc.company_id;
      END IF;
      UPDATE public.fatture_ricevute SET pagata_il = NULL, pagamento_segnato_da = NULL, pagamento_segnato_at = NULL
       WHERE id = rc.fattura_ricevuta_id AND company_id = rc.company_id;
    END IF;
    UPDATE public.bank_reconciliations SET unmatched_at = now(), unmatch_reason = 'Riga scollegata' WHERE id = rc.id;
    RETURN jsonb_build_object('tipo', rc.payment_source->>'tipo');
  END IF;

  IF rc.movimento_id IS NOT NULL THEN
    IF NOT public.puo_incassare_fatture(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare gli incassi.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.storna_incasso_atomico(rc.company_id, rc.movimento_id);
    RETURN jsonb_build_object('tipo', 'documento');
  END IF;

  IF rc.invoice_id IS NOT NULL THEN
    IF NOT public.puo_incassare_fatture(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare gli incassi.' USING ERRCODE = '42501';
    END IF;
    SELECT external_provider INTO v_provider FROM public.invoices WHERE id = rc.invoice_id FOR UPDATE;
    DELETE FROM public.invoice_payments WHERE invoice_id = rc.invoice_id AND reference = 'recon:' || rc.id::text;
    PERFORM private.bank_reverse_imported(rc.id);
    UPDATE public.bank_reconciliations SET unmatched_at = now(), unmatch_reason = 'Riga scollegata' WHERE id = rc.id;
    RETURN jsonb_build_object('tipo', 'invoice', 'invoice_id', rc.invoice_id, 'importo', rc.matched_amount, 'provider', v_provider, 'allinea', EXISTS(SELECT 1 FROM private.bank_imported_allocations a WHERE a.reconciliation_id=rc.id));
  END IF;

  IF NOT public.puo_gestire_scadenze(rc.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di modificare i pagamenti.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.prima_nota_entries SET bank_transaction_id = NULL
   WHERE company_id = rc.company_id AND bank_transaction_id = rc.transaction_id
     AND id = nullif(substr(coalesce(rc.notes, ''), length('[PAGAMENTO_UNICO] ') + 1), '')::uuid;
  UPDATE public.bank_reconciliations SET unmatched_at = now(), unmatch_reason = 'Riga scollegata' WHERE id = rc.id;
  RETURN jsonb_build_object('tipo', 'scadenza');
END $function$;

CREATE OR REPLACE FUNCTION private.bank_reverse_imported(p_reconciliation uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE a private.bank_imported_allocations;
BEGIN
 SELECT * INTO a FROM private.bank_imported_allocations WHERE reconciliation_id=p_reconciliation FOR UPDATE;
 IF NOT FOUND OR a.reversed_at IS NOT NULL THEN RETURN;END IF;
 PERFORM private.bank_operativa_access(a.company_id,true);
 IF (SELECT i.external_provider FROM public.invoices i WHERE i.id=a.invoice_id AND i.company_id=a.company_id)='xml_import' THEN
  -- 18/11/2026: per l'XML la quota l'ha già tolta il trigger quando la riga di invoice_payments è
  -- stata cancellata: un secondo «- quota» azzerava una fattura incassata a metà.
  UPDATE public.invoices SET status=CASE WHEN coalesce(paid_amount,0)>=total-0.004 THEN 'paid' ELSE 'issued' END
   WHERE id=a.invoice_id AND company_id=a.company_id AND status NOT IN('cancelled','credited','draft');
 ELSE
  UPDATE public.invoices SET paid_amount=greatest(0,coalesce(paid_amount,0)-a.amount),status='issued' WHERE id=a.invoice_id AND company_id=a.company_id;
 END IF;
 UPDATE private.bank_imported_allocations SET reversed_at=now() WHERE reconciliation_id=p_reconciliation;
END $function$;

CREATE OR REPLACE FUNCTION private.tes_conferma_una(p_company uuid, p_tx uuid, p_nature text[], p_modo text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE res jsonb; cd jsonb; righe jsonb:='[]'; r jsonb; somma numeric; t public.bank_transactions; out jsonb; leg uuid; traccia jsonb:='[]'; riga jsonb;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile'; END IF;
 IF t.chiuso_senza_documento IS NOT NULL THEN RETURN NULL; END IF;  -- p.es. l'altra gamba di un giroconto appena chiuso
 IF EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=p_tx AND e.scartato_at IS NOT NULL) THEN RETURN NULL; END IF;
 res:=private.tes_classifica(p_company,p_tx);
 IF res->>'esito'<>'automatico' OR NOT (res->>'natura'=ANY(p_nature)) OR jsonb_array_length(res->'candidati')<>1 THEN RETURN NULL; END IF;
 cd:=res->'candidati'->0;
 -- 2. nessun conflitto, né sul candidato né su altri candidati dello stesso movimento
 IF cd->>'forza'<>'forte' OR jsonb_array_length(cd->'conflitti')>0 OR jsonb_array_length(coalesce(res->'conflitti','[]'::jsonb))>0 THEN RETURN NULL; END IF;
 -- 1. un candidato scartato da una persona non si conferma mai, anche se lo scarto è stato superato
 IF EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=p_tx AND (cd->>'chiave')=ANY(coalesce(e.scartato_chiavi,'{}'))) THEN RETURN NULL; END IF;
 SELECT sum((x->>'quota')::numeric) INTO somma FROM jsonb_array_elements(cd->'righe') x;
 IF (res->>'natura'='documento' AND t.transaction_type='debit') OR res->>'natura' IN('gia_pagata','gia_incassata') THEN
  -- 18/11/2026: rate e fatture dei fornitori; prove di pagamenti già registrati.
  FOR r IN SELECT value FROM jsonb_array_elements(cd->'righe') LOOP
   IF r->>'tipo' NOT IN('rata_fornitore','ricevuta','prova_ricevuta','prova_fattura') THEN RETURN NULL; END IF;
   righe:=righe||jsonb_build_array(jsonb_build_object('tipo',r->>'tipo','id',r->>'id','importo',round((r->>'quota')::numeric,2)));
  END LOOP;
  out:=public.bank_conferma_ripartizione(p_company,p_tx,righe,CASE WHEN p_modo='clic' THEN 'Conferma con un clic · ' ELSE 'Conferma automatica · ' END||(res->>'regola')||'/v'||(res->>'versione'));
  IF (out->>'resto')::numeric>0.005 THEN RAISE EXCEPTION 'La conferma lascerebbe un resto: non è un caso automatico'; END IF;
 ELSIF res->>'natura'='documento' THEN
  IF NOT t.transaction_type='credit' THEN RETURN NULL; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(cd->'righe') LOOP
   -- nativa → 'documento'; importata da un gestionale esterno → 'invoice' (poi il write-back)
   IF r->>'tipo' NOT IN('documento','invoice') THEN RETURN NULL; END IF;
   IF EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=(r->>'id')::uuid AND d.company_id=p_company) THEN
    righe:=righe||jsonb_build_array(jsonb_build_object('tipo','documento','id',r->>'id','importo',round((r->>'quota')::numeric,2)));
   ELSIF EXISTS(SELECT 1 FROM public.invoices iv WHERE iv.id=(r->>'id')::uuid AND iv.company_id=p_company AND iv.deleted_at IS NULL) THEN
    righe:=righe||jsonb_build_array(jsonb_build_object('tipo','invoice','id',r->>'id','importo',round((r->>'quota')::numeric,2)));
   ELSE RETURN NULL;
   END IF;
  END LOOP;
  out:=public.bank_conferma_ripartizione(p_company,p_tx,righe,CASE WHEN p_modo='clic' THEN 'Conferma con un clic · ' ELSE 'Conferma automatica · ' END||(res->>'regola')||'/v'||(res->>'versione'));
  IF (out->>'resto')::numeric>0.005 THEN RAISE EXCEPTION 'La conferma lascerebbe un resto: non è un caso automatico'; END IF;
  -- Fatture importate: residuo locale e registro delle quote come nella conferma in lotto; il
  -- gestionale esterno si allinea dopo, col valore assoluto del server (idempotente).
  out:=private.bank_record_imported(p_company,p_tx,out);
 ELSIF res->>'natura'='giroconto' THEN
  leg:=(cd->'righe'->0->>'id')::uuid;
  PERFORM 1 FROM public.bank_transactions WHERE id=leg AND company_id=p_company FOR UPDATE;
  PERFORM public.chiudi_movimento_senza_fattura(p_tx,'nessun_costo','Giroconto','Giroconto con il movimento '||leg::text);
  IF EXISTS(SELECT 1 FROM public.bank_transactions WHERE id=leg AND chiuso_senza_documento IS NULL) THEN
   PERFORM public.chiudi_movimento_senza_fattura(leg,'nessun_costo','Giroconto','Giroconto con il movimento '||p_tx::text);
  END IF;
  out:=jsonb_build_object('giroconto_con',leg);
 ELSE RETURN NULL;
 END IF;
 -- Traccia comune dei collegamenti (acquisti_collegamenti): solo DOPO la conferma vera, così il
 -- popup comune non mostra mai un «collegato» senza il pagamento registrato. Se chi conferma non
 -- può scrivere nella traccia (permesso acquisti), la conferma resta valida e lo si annota.
 FOR riga IN SELECT value FROM jsonb_array_elements(cd->'righe') WHERE value->>'tipo' NOT IN('rata_fornitore','ricevuta','prova_ricevuta','prova_fattura') LOOP
  BEGIN
   traccia:=traccia||jsonb_build_array(jsonb_build_object('id',public.acquisti_collegamento_registra(
     p_company,'movimento_banca',p_tx,NULL,
     CASE WHEN res->>'natura'='giroconto' THEN 'movimento_banca'
          WHEN EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=(riga->>'id')::uuid AND d.company_id=p_company) THEN 'documento_fiscale'
          ELSE 'fattura_emessa' END,(riga->>'id')::uuid,NULL,
     'tesoreria:'||(res->>'regola'),CASE WHEN p_modo='clic' THEN 'manuale' ELSE 'automatico' END,
     private.tes_prove_comuni(cd->'motivi'),jsonb_build_array(jsonb_build_object('regola',res->>'regola','natura',res->>'natura')),
     NULL,NULL,(riga->>'quota')::numeric,(res->>'versione')::int,false,NULL)));
  EXCEPTION WHEN OTHERS THEN
   traccia:=traccia||jsonb_build_array(jsonb_build_object('non_registrato',SQLERRM));
  END;
 END LOOP;
 -- now() è l'inizio di questa transazione: si marcano solo le quote appena create.
 UPDATE public.bank_reconciliations SET match_type=CASE WHEN p_modo='clic' THEN 'manual' ELSE 'auto' END WHERE transaction_id=p_tx AND company_id=p_company AND unmatched_at IS NULL AND matched_at=now();
 INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
 VALUES(p_company,p_tx,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,md5(res::text),jsonb_build_object('conferma',out,'righe',cd->'righe','motivi',cd->'motivi','traccia',traccia),CASE WHEN p_modo='clic' THEN 'confermato_clic' ELSE 'confermato_auto' END,auth.uid())
 ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
 RETURN jsonb_build_object('transaction_id',p_tx,'natura',res->>'natura','importo',somma)
  ||CASE WHEN jsonb_array_length(coalesce(out->'esterne','[]'::jsonb))>0 THEN jsonb_build_object('esterne',out->'esterne') ELSE '{}'::jsonb END;
END $function$;

CREATE OR REPLACE FUNCTION public.tesoreria_conferma_automatica(p_company uuid, p_limite integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE servizio boolean:=coalesce(auth.role(),'')='service_role'; chi uuid; r record; esito jsonb; confermati jsonb:='[]'; errori jsonb:='[]';
 old_claims text; old_sub text; old_role text; n int:=0;
BEGIN
 IF NOT servizio THEN PERFORM private.bank_operativa_access(p_company,true); END IF;
 IF NOT coalesce(public.azienda_collegamento_automatico(p_company),false) THEN
  RETURN jsonb_build_object('attiva',false,'motivo','Collegamento automatico spento: gli esiti «unico e verificato» restano proposte da confermare con un clic','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END IF;
 chi:=CASE WHEN servizio THEN (SELECT c.titolare_user_id FROM public.companies c WHERE c.id=p_company) ELSE auth.uid() END;
 IF chi IS NULL THEN
  RETURN jsonb_build_object('attiva',true,'fermata','L''azienda non ha un titolare indicato: le conferme automatiche aspettano chi apre la tesoreria','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 old_claims:=current_setting('request.jwt.claims',true); old_sub:=current_setting('request.jwt.claim.sub',true); old_role:=current_setting('request.jwt.claim.role',true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',chi,'role','authenticated')::text,true);
 PERFORM set_config('request.jwt.claim.sub',chi::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 BEGIN
  PERFORM private.bank_operativa_access(p_company,true);
 EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
  RETURN jsonb_build_object('attiva',true,'fermata','Il titolare non ha il permesso di riconciliare i movimenti: conferme sospese','confermati','[]'::jsonb,'errori','[]'::jsonb);
 END;
 FOR r IN SELECT e.transaction_id FROM public.tesoreria_esiti e JOIN public.bank_transactions t ON t.id=e.transaction_id
   WHERE e.company_id=p_company AND e.esito='automatico' AND e.natura IN('documento','giroconto','gia_pagata','gia_incassata') AND e.scartato_at IS NULL
    AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion')
   ORDER BY t.booking_date,t.id LIMIT least(greatest(coalesce(p_limite,50),1),200)
 LOOP
  n:=n+1;
  BEGIN
   esito:=private.tes_conferma_una(p_company,r.transaction_id,ARRAY['documento','giroconto','gia_pagata','gia_incassata']);
   IF esito IS NOT NULL THEN confermati:=confermati||jsonb_build_array(esito); END IF;
  EXCEPTION WHEN OTHERS THEN
   errori:=errori||jsonb_build_array(jsonb_build_object('transaction_id',r.transaction_id,'errore',SQLERRM));
   INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
   SELECT p_company,e.transaction_id,e.esito,e.natura,e.regola,e.versione,e.impronta,jsonb_build_object('errore',SQLERRM),'errore_auto',chi
   FROM public.tesoreria_esiti e WHERE e.transaction_id=r.transaction_id
   ON CONFLICT(transaction_id,impronta,evento) DO UPDATE SET il=now(),risultato=EXCLUDED.risultato;
  END;
 END LOOP;
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(old_sub,''),true); PERFORM set_config('request.jwt.claim.role',coalesce(old_role,''),true);
 RETURN jsonb_build_object('attiva',true,'per_conto_di',chi,'esaminati',n,'confermati',confermati,'errori',errori);
END $function$;

CREATE OR REPLACE FUNCTION public.tesoreria_conferma_esito(p_company uuid, p_tx uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE esito jsonb;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 esito:=private.tes_conferma_una(p_company,p_tx,ARRAY['documento','giroconto','gia_pagata','gia_incassata'],'clic');
 IF esito IS NULL THEN RAISE EXCEPTION 'Il movimento non ha più un esito «unico e verificato»: aprilo e collegalo a mano' USING ERRCODE='P0002'; END IF;
 RETURN esito;
END $function$;

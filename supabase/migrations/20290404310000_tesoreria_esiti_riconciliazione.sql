-- Tesoreria: esiti della riconciliazione costruiti su regole esplicite (area C, 15/11/2026).
-- Vedi docs/automazioni-tesoreria-cdg.md. Nessun pagamento, costo o stato bancario viene
-- scritto qui: il motore classifica, la conferma resta bank_conferma_ripartizione / lotto.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

-- ─── Normalizzazione ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.tes_norm(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT btrim(regexp_replace(regexp_replace(lower(translate(coalesce(p,''),
  'ÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜàáâãäèéêëìíîïòóôõöùúûüÇçÑñ','AAAAAEEEEIIIIOOOOOUUUUaaaaaeeeeiiiiooooouuuuCcNn')),
  '[^a-z0-9]+',' ','g'),'\s+',' ','g'))
$$;

-- Chiave del nome: senza forma societaria e senza spazi («Rossi S.r.l.» = «ROSSI SRL» = «rossi»).
CREATE OR REPLACE FUNCTION private.tes_chiave_nome(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT replace(regexp_replace(' '||private.tes_norm(p)||' ',
  ' (s r l s|s r l|srls|srl|s p a|spa|s n c|snc|s a s|sas|s a p a|sapa|s s|scarl|soc coop|coop|societa|unipersonale|ditta individuale|ditta) ',' ','g'),' ','')
$$;

CREATE OR REPLACE FUNCTION private.tes_iban(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN length(x)>=15 THEN x END FROM (SELECT upper(regexp_replace(coalesce(p,''),'[^A-Za-z0-9]','','g')) x) s
$$;

-- Numero «nucleo» di un documento: l'ultimo gruppo di cifre che non è un anno, senza zeri davanti.
-- «FT-2026-0034» → 34, «DEMO-FT/2026/050» → 50, «12/2026» → 12, «2026/12» → 12.
CREATE OR REPLACE FUNCTION private.tes_numero_nucleo(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE g text[]; i int; v text;
BEGIN
 g:=ARRAY(SELECT m[1] FROM regexp_matches(coalesce(p,''),'([0-9]+)','g') m);
 IF coalesce(array_length(g,1),0)=0 THEN RETURN NULL; END IF;
 FOR i IN REVERSE array_length(g,1)..1 LOOP
  v:=ltrim(g[i],'0');
  IF NOT (g[i]~'^(19|20)[0-9]{2}$' AND array_length(g,1)>1) AND v<>'' THEN RETURN v; END IF;
 END LOOP;
 RETURN NULL;
END $$;

-- Il numero del documento compare nella causale? 'anno' = con l'anno giusto accanto,
-- 'si' = senza anno accanto, 'anno_diverso' = accanto c'è un altro anno, 'no'.
-- Un numero corto (1-2 cifre) vale solo con «ft/fatt/fattura/n/nr/rif/doc» davanti o l'anno accanto.
CREATE OR REPLACE FUNCTION private.tes_numero_in_causale(p_causale text,p_num text,p_anno int) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE w text[]; i int; n int; core text; prev text; nxt text; prefisso boolean; anni int[]; esito text:='no';
BEGIN
 IF p_num IS NULL OR p_num='' THEN RETURN 'no'; END IF;
 w:=regexp_split_to_array(private.tes_norm(p_causale),' ');
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
REVOKE ALL ON FUNCTION private.tes_norm(text),private.tes_chiave_nome(text),private.tes_iban(text),private.tes_numero_nucleo(text),private.tes_numero_in_causale(text,text,int) FROM PUBLIC,anon,authenticated;

-- ─── Rapporti documentati pagante ↔ intestatario ─────────────────────────────────────
-- Un pagamento fatto da un terzo vale solo se il rapporto è scritto, con la prova.
-- Un singolo pagamento non crea mai il rapporto.
CREATE TABLE IF NOT EXISTS public.tesoreria_paganti_autorizzati(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 soggetto_nome text NOT NULL,
 soggetto_id uuid,
 pagante_nome text,
 pagante_iban text,
 prova text NOT NULL CHECK (length(btrim(prova))>=3),
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 revocato_at timestamptz,
 CHECK (pagante_nome IS NOT NULL OR pagante_iban IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS tesoreria_paganti_autorizzati_company ON public.tesoreria_paganti_autorizzati(company_id);
ALTER TABLE public.tesoreria_paganti_autorizzati ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_paganti_autorizzati FROM PUBLIC,anon,authenticated;

-- ─── Esiti ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tesoreria_esiti(
 transaction_id uuid PRIMARY KEY REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 esito text NOT NULL CHECK (esito IN('automatico','proposta','scelta','conflitto','da_gestire')),
 natura text NOT NULL,
 regola text NOT NULL,
 versione int NOT NULL,
 risultato jsonb NOT NULL,
 impronta text NOT NULL,
 calcolato_at timestamptz NOT NULL DEFAULT now(),
 scartato_at timestamptz,
 scartato_da uuid,
 scartato_motivo text
);
CREATE INDEX IF NOT EXISTS tesoreria_esiti_company ON public.tesoreria_esiti(company_id,esito);
ALTER TABLE public.tesoreria_esiti ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_esiti FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.tesoreria_esiti_storia(
 id bigserial PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 transaction_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
 esito text NOT NULL, natura text NOT NULL, regola text NOT NULL, versione int NOT NULL,
 impronta text NOT NULL, risultato jsonb NOT NULL,
 evento text NOT NULL DEFAULT 'calcolo',
 da uuid, il timestamptz NOT NULL DEFAULT now(),
 UNIQUE (transaction_id,impronta,evento)
);
CREATE INDEX IF NOT EXISTS tesoreria_esiti_storia_tx ON public.tesoreria_esiti_storia(transaction_id,il);
ALTER TABLE public.tesoreria_esiti_storia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_esiti_storia FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.tesoreria_esiti_storia_id_seq FROM PUBLIC,anon,authenticated;

-- Regola e prove di ogni quota confermata: le copia il trigger dalla proposta in vigore.
ALTER TABLE public.bank_reconciliations ADD COLUMN IF NOT EXISTS regola text;
ALTER TABLE public.bank_reconciliations ADD COLUMN IF NOT EXISTS prove jsonb;

-- ─── Commesse di una riga: dalle allocazioni delle partite ───────────────────────────
-- Restituisce [{order_id, quota}] e, se il documento ha più commesse senza quote, null
-- con il segnale 'da_completare'.
CREATE OR REPLACE FUNCTION private.tes_commesse_riga(p_company uuid,p_tipo text,p_id uuid,p_quota numeric) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; tot numeric; n int; o uuid; c uuid; alloc jsonb;
BEGIN
 IF p_tipo='documento' THEN
  SELECT count(*),sum(coalesce(importo_associato,0)) INTO n,tot FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id;
  IF n=1 THEN
   SELECT jsonb_build_array(jsonb_build_object('order_id',ordine_id,'quota',round(p_quota,2))) INTO r FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id;
   RETURN r;
  ELSIF n>1 THEN
   IF coalesce(tot,0)<=0 OR EXISTS(SELECT 1 FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id AND coalesce(importo_associato,0)<=0) THEN
    RETURN jsonb_build_object('da_completare',true);
   END IF;
   SELECT jsonb_agg(jsonb_build_object('order_id',ordine_id,'quota',round(p_quota*importo_associato/tot,2)) ORDER BY ordine_id) INTO r
   FROM public.fattura_ordine WHERE company_id=p_company AND fattura_id=p_id;
   RETURN r;
  END IF;
  SELECT ordine_id INTO o FROM public.documenti_fiscali_elenco_operativo WHERE id=p_id AND company_id=p_company;
 ELSIF p_tipo='scadenza' THEN
  SELECT order_id,cost_id INTO o,c FROM public.scadenze WHERE id=p_id AND company_id=p_company;
  IF o IS NULL AND c IS NOT NULL THEN
   SELECT order_id,allocations INTO o,alloc FROM public.company_costs WHERE id=c AND company_id=p_company;
   IF o IS NULL AND jsonb_typeof(alloc)='array' AND jsonb_array_length(alloc)>0 THEN
    SELECT jsonb_agg(jsonb_build_object('order_id',(a->>'order_id')::uuid,'quota',round(p_quota*(a->>'pct')::numeric/100,2)) ORDER BY a->>'order_id') INTO r
    FROM jsonb_array_elements(alloc) a WHERE a->>'order_id'~'^[0-9a-fA-F-]{36}$' AND a->>'pct'~'^[0-9]+(\.[0-9]+)?$';
    RETURN coalesce(r,'[]');
   END IF;
  END IF;
 ELSIF p_tipo='rata' THEN
  SELECT i.order_id INTO o FROM public.order_installments i JOIN public.orders x ON x.id=i.order_id AND x.company_id=p_company WHERE i.id=p_id;
 END IF;
 RETURN CASE WHEN o IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('order_id',o,'quota',round(p_quota,2))) END;
END $$;
REVOKE ALL ON FUNCTION private.tes_commesse_riga(uuid,text,uuid,numeric) FROM PUBLIC,anon,authenticated;

-- ─── Il motore ──────────────────────────────────────────────────────────────────────
-- Regola versione 1. Ordine: esclusioni → giroconto → storno → F24 → documenti
-- (unico, cumulativo/nota di credito, differenza, parziale, eccedenza, acconto) → spese
-- bancarie → da gestire. Un conflitto su un dato essenziale toglie il candidato: non lo
-- compensa nessun altro indizio.
CREATE OR REPLACE FUNCTION private.tes_classifica(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 t public.bank_transactions; amt numeric; impegnato numeric; resto numeric; cred boolean;
 tx_iban text; tx_nome text; tx_chiave text; causale text; ncaus text;
 cands jsonb:='[]'; confl jsonb:='[]'; c jsonb; rec record; pend record;
 num text; nnum text; subj text; motivi jsonb; conf jsonb; forza text; chiave text; party text; iban_doc text; verified boolean;
 own_accounts text[]; legs jsonb; ex jsonb; forti jsonb; medie jsonb; deboli jsonb;
 grp record; items jsonb; k int; m int; mask int; somma numeric; combo jsonb; combos jsonb; hasnc boolean;
 out jsonb; righe jsonb; diff numeric;
BEGIN
 SELECT * INTO t FROM public.bank_transactions WHERE id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non disponibile' USING ERRCODE='P0002'; END IF;
 amt:=abs(t.amount); cred:=t.transaction_type='credit';
 tx_iban:=private.tes_iban(CASE WHEN cred THEN t.debtor_iban ELSE t.creditor_iban END);
 IF tx_iban IS NULL THEN tx_iban:=private.tes_iban(to_jsonb(t)->>'counterparty_iban'); END IF;
 tx_nome:=coalesce(nullif(CASE WHEN cred THEN t.debtor_name ELSE t.creditor_name END,''),nullif(to_jsonb(t)->>'counterparty_name',''));
 tx_chiave:=private.tes_chiave_nome(tx_nome);
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
  IF jsonb_array_length(conf)>0 THEN confl:=confl||jsonb_build_array(c); ELSE cands:=cands||jsonb_build_array(c); END IF;
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
  out:=jsonb_build_object('esito','da_gestire','regola','R-NESSUNO','versione',1,'differenza',0,'candidati',deboli,
   'natura',CASE WHEN ncaus~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta)\M' THEN 'spesa_bancaria' ELSE 'sconosciuta' END,
   'mancanti',(SELECT coalesce(jsonb_agg(v),'[]') FROM unnest(ARRAY[
     CASE WHEN tx_nome IS NULL AND tx_iban IS NULL THEN 'Nome e IBAN della controparte (la banca non li ha comunicati)' END,
     CASE WHEN jsonb_array_length(deboli)>0 THEN 'Il soggetto o il numero del documento: coincide solo l''importo' END,
     CASE WHEN jsonb_array_length(cands)=0 AND jsonb_array_length(confl)=0 THEN 'Nessuna partita aperta corrispondente: documento non ancora registrato?' END,
     CASE WHEN ncaus~'\m(commissioni|commissione|canone|spese|bollo|interessi|competenze|imposta)\M' THEN 'Spesa bancaria: si registra come movimento senza fattura' END]) v WHERE v IS NOT NULL));
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

-- Lettura senza scrivere (anteprima del singolo movimento).
CREATE OR REPLACE FUNCTION public.tesoreria_classifica_movimento(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,false); END IF;
 RETURN private.tes_classifica(p_company,p_tx);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_classifica_movimento(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_classifica_movimento(uuid,uuid) TO authenticated,service_role;

-- Classifica e registra a lotti. Idempotente: stesso risultato = nessuna nuova riga di storia.
-- p_anteprima=true non scrive niente e restituisce cosa cambierebbe.
CREATE OR REPLACE FUNCTION public.tesoreria_classifica_movimenti(p_company uuid,p_limite int DEFAULT 100,p_anteprima boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; res jsonb; imp text; prev public.tesoreria_esiti; conteggi jsonb:='{}'; cambiati int:=0; esempi jsonb:='[]'; n int:=0;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,NOT p_anteprima); END IF;
 PERFORM set_config('lock_timeout','3s',true); PERFORM set_config('statement_timeout','60s',true);
 IF NOT p_anteprima THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text,3101)); END IF;
 FOR r IN SELECT t.id FROM public.bank_transactions t LEFT JOIN public.tesoreria_esiti e ON e.transaction_id=t.id
   WHERE t.company_id=p_company AND t.chiuso_senza_documento IS NULL AND coalesce(t.reconciliation_status,'pending') IN('pending','suggestion','parziale')
   ORDER BY e.calcolato_at ASC NULLS FIRST,t.booking_date DESC,t.id LIMIT least(greatest(coalesce(p_limite,100),1),500)
 LOOP
  n:=n+1;
  res:=private.tes_classifica(p_company,r.id);
  imp:=md5(res::text);
  conteggi:=jsonb_set(conteggi,ARRAY[res->>'esito'],to_jsonb(coalesce((conteggi->>(res->>'esito'))::int,0)+1));
  SELECT * INTO prev FROM public.tesoreria_esiti WHERE transaction_id=r.id;
  IF prev.impronta IS DISTINCT FROM imp THEN
   cambiati:=cambiati+1;
   IF jsonb_array_length(esempi)<10 THEN esempi:=esempi||jsonb_build_array(jsonb_build_object('transaction_id',r.id,'prima',prev.esito,'dopo',res->>'esito','natura',res->>'natura')); END IF;
   IF NOT p_anteprima THEN
    INSERT INTO public.tesoreria_esiti(transaction_id,company_id,esito,natura,regola,versione,risultato,impronta,calcolato_at)
    VALUES(r.id,p_company,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,res,imp,now())
    ON CONFLICT(transaction_id) DO UPDATE SET esito=EXCLUDED.esito,natura=EXCLUDED.natura,regola=EXCLUDED.regola,versione=EXCLUDED.versione,
      risultato=EXCLUDED.risultato,impronta=EXCLUDED.impronta,calcolato_at=now(),scartato_at=NULL,scartato_da=NULL,scartato_motivo=NULL;
    INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,da)
    VALUES(p_company,r.id,res->>'esito',res->>'natura',res->>'regola',(res->>'versione')::int,imp,res,auth.uid())
    ON CONFLICT(transaction_id,impronta,evento) DO NOTHING;
   END IF;
  ELSIF NOT p_anteprima THEN
   UPDATE public.tesoreria_esiti SET calcolato_at=now() WHERE transaction_id=r.id;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('analizzati',n,'cambiati',cambiati,'per_esito',conteggi,'anteprima',p_anteprima,'esempi',esempi);
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_classifica_movimenti(uuid,int,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_classifica_movimenti(uuid,int,boolean) TO authenticated,service_role;

-- Lettura per le schermate: esito registrato del movimento (o null) + storia.
CREATE OR REPLACE FUNCTION public.tesoreria_esito_movimento(p_company uuid,p_tx uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.tesoreria_esiti;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN PERFORM private.bank_operativa_access(p_company,false); END IF;
 SELECT * INTO e FROM public.tesoreria_esiti WHERE transaction_id=p_tx AND company_id=p_company;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN e.risultato||jsonb_build_object('calcolato_at',e.calcolato_at,'scartato_at',e.scartato_at,'scartato_motivo',e.scartato_motivo,
  'storia',(SELECT coalesce(jsonb_agg(jsonb_build_object('il',s.il,'evento',s.evento,'esito',s.esito,'natura',s.natura,'regola',s.regola,'versione',s.versione,'da',s.da) ORDER BY s.il DESC,s.id DESC),'[]')
            FROM public.tesoreria_esiti_storia s WHERE s.transaction_id=p_tx AND s.company_id=p_company));
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_esito_movimento(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_esito_movimento(uuid,uuid) TO authenticated,service_role;

-- Scartare una proposta: resta scritto chi, quando e perché.
CREATE OR REPLACE FUNCTION public.tesoreria_scarta_esito(p_company uuid,p_tx uuid,p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.tesoreria_esiti;
BEGIN
 PERFORM private.bank_operativa_access(p_company,true);
 IF length(btrim(coalesce(p_motivo,'')))<3 THEN RAISE EXCEPTION 'Scrivi perché la proposta non è giusta' USING ERRCODE='22023'; END IF;
 UPDATE public.tesoreria_esiti SET scartato_at=now(),scartato_da=auth.uid(),scartato_motivo=left(btrim(p_motivo),500)
 WHERE transaction_id=p_tx AND company_id=p_company AND scartato_at IS NULL RETURNING * INTO e;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposta non più disponibile: ricarica il movimento' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.tesoreria_esiti_storia(company_id,transaction_id,esito,natura,regola,versione,impronta,risultato,evento,da)
 VALUES(p_company,p_tx,e.esito,e.natura,e.regola,e.versione,e.impronta,jsonb_build_object('motivo',e.scartato_motivo),'scartato',auth.uid())
 ON CONFLICT(transaction_id,impronta,evento) DO UPDATE SET il=now(),da=EXCLUDED.da,risultato=EXCLUDED.risultato;
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_scarta_esito(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_scarta_esito(uuid,uuid,text) TO authenticated;

-- Ogni quota confermata eredita regola e prove dalla proposta in vigore, se la contiene.
CREATE OR REPLACE FUNCTION private.tes_quota_eredita_prove() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.tesoreria_esiti; cd jsonb; target text;
BEGIN
 IF NEW.regola IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO e FROM public.tesoreria_esiti WHERE transaction_id=NEW.transaction_id AND company_id=NEW.company_id AND scartato_at IS NULL;
 IF NOT FOUND THEN NEW.regola:='manuale'; RETURN NEW; END IF;
 target:=coalesce(NEW.documento_id,NEW.scadenza_id,NEW.invoice_id)::text;
 SELECT x INTO cd FROM jsonb_array_elements(e.risultato->'candidati') x WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(x->'righe') r WHERE r->>'id'=target) LIMIT 1;
 IF cd IS NULL THEN NEW.regola:='manuale'; RETURN NEW; END IF;
 NEW.regola:=(e.regola||'/v'||e.versione);
 NEW.prove:=jsonb_build_object('esito',e.esito,'natura',e.natura,'forza',cd->>'forza','motivi',cd->'motivi','impronta',e.impronta,'calcolato_at',e.calcolato_at);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tes_quota_eredita_prove() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tes_quota_eredita_prove ON public.bank_reconciliations;
CREATE TRIGGER tes_quota_eredita_prove BEFORE INSERT ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION private.tes_quota_eredita_prove();

-- ─── Un movimento che chiude un debito già registrato non crea un costo nuovo ─────────
-- chiudi_movimento_senza_fattura scrive il costo con la nota «[BANCA:<id>]»: se una scadenza
-- aperta dello stesso fornitore (o con l'IBAN del fornitore) ha lo stesso importo, il costo
-- c'è già. Si collega la scadenza; se la proposta è sbagliata la si scarta, e allora passa.
CREATE OR REPLACE FUNCTION private.tes_spesa_da_banca_non_doppia() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE txid uuid; t public.bank_transactions; s record; tx_iban text;
BEGIN
 IF NOT coalesce(NEW.senza_fattura,false) OR coalesce(NEW.notes,'')!~'^\[BANCA:[0-9a-fA-F-]{36}\]' THEN RETURN NEW; END IF;
 txid:=substring(NEW.notes FROM '^\[BANCA:([0-9a-fA-F-]{36})\]')::uuid;
 SELECT * INTO t FROM public.bank_transactions WHERE id=txid AND company_id=NEW.company_id;
 IF NOT FOUND OR to_jsonb(t)->>'proposta_rifiutata_at' IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.tesoreria_esiti e WHERE e.transaction_id=txid AND e.scartato_at IS NOT NULL) THEN RETURN NEW; END IF;
 tx_iban:=private.tes_iban(t.creditor_iban);
 SELECT sc.id,sc.description,round(sc.amount-coalesce(sc.paid_amount,0),2) residuo INTO s
 FROM public.scadenze sc LEFT JOIN public.suppliers f ON f.id=sc.supplier_id AND f.company_id=sc.company_id
 WHERE sc.company_id=NEW.company_id AND sc.direction='uscita' AND sc.status IN('da_pagare','parziale') AND coalesce(sc.is_previsionale,false)=false
  AND abs(sc.amount-coalesce(sc.paid_amount,0)-abs(t.amount))<0.005
  AND ((NEW.supplier_id IS NOT NULL AND sc.supplier_id=NEW.supplier_id)
    OR (tx_iban IS NOT NULL AND (private.tes_iban(to_jsonb(f)->>'iban')=tx_iban
        OR EXISTS(SELECT 1 FROM public.fornitori_iban_storico v WHERE v.company_id=NEW.company_id AND v.fornitore_id=sc.supplier_id AND v.confermato AND private.tes_iban(v.iban)=tx_iban))))
 ORDER BY sc.due_date NULLS LAST,sc.id LIMIT 1;
 IF FOUND THEN
  RAISE EXCEPTION 'Questa uscita salda un debito già registrato («%», % €): collegala alla scadenza invece di registrare una spesa nuova, così il costo non si conta due volte. Se non è quel debito, scarta la proposta e riprova.',s.description,s.residuo
   USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tes_spesa_da_banca_non_doppia() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tes_spesa_da_banca_non_doppia ON public.company_costs;
CREATE TRIGGER tes_spesa_da_banca_non_doppia BEFORE INSERT ON public.company_costs FOR EACH ROW EXECUTE FUNCTION private.tes_spesa_da_banca_non_doppia();

-- ─── La fattura sostituisce la previsione ────────────────────────────────────────────
-- Regola: la scadenza reale riduce la previsione collegata del proprio importo (mai sotto il
-- già pagato); se la copre tutta, la previsione si annulla. Il collegamento resta, e si annulla.
CREATE TABLE IF NOT EXISTS public.scadenze_sostituzioni(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 previsione_id uuid NOT NULL REFERENCES public.scadenze(id) ON DELETE CASCADE,
 reale_id uuid NOT NULL REFERENCES public.scadenze(id) ON DELETE CASCADE,
 importo_previsto_prima numeric NOT NULL,
 stato_prima text NOT NULL,
 importo_coperto numeric NOT NULL,
 regola text NOT NULL,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 annullato_at timestamptz,
 annullato_da uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS scadenze_sostituzioni_attiva ON public.scadenze_sostituzioni(previsione_id,reale_id) WHERE annullato_at IS NULL;
CREATE INDEX IF NOT EXISTS scadenze_sostituzioni_company ON public.scadenze_sostituzioni(company_id);
ALTER TABLE public.scadenze_sostituzioni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scadenze_sostituzioni FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.tes_sostituisci_previsione(p_company uuid,p_previsione uuid,p_reale uuid,p_regola text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pv public.scadenze; re public.scadenze; coperto numeric; nuovo numeric; sid uuid;
BEGIN
 SELECT * INTO pv FROM public.scadenze WHERE id=p_previsione AND company_id=p_company FOR UPDATE;
 SELECT * INTO re FROM public.scadenze WHERE id=p_reale AND company_id=p_company FOR UPDATE;
 IF pv.id IS NULL OR re.id IS NULL THEN RAISE EXCEPTION 'Scadenza non disponibile in questa azienda' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(pv.is_previsionale,false) OR coalesce(re.is_previsionale,false) THEN RAISE EXCEPTION 'Serve una previsione e una scadenza reale' USING ERRCODE='22023'; END IF;
 IF pv.direction IS DISTINCT FROM re.direction THEN RAISE EXCEPTION 'Previsione e scadenza vanno nella stessa direzione' USING ERRCODE='22023'; END IF;
 SELECT id INTO sid FROM public.scadenze_sostituzioni WHERE previsione_id=p_previsione AND reale_id=p_reale AND annullato_at IS NULL;
 IF sid IS NOT NULL THEN RETURN jsonb_build_object('id',sid,'gia_fatto',true); END IF;   -- retry
 IF pv.status NOT IN('da_pagare','parziale') THEN RAISE EXCEPTION 'La previsione non è più aperta' USING ERRCODE='22023'; END IF;
 coperto:=least(re.amount,pv.amount-coalesce(pv.paid_amount,0));
 nuovo:=pv.amount-coperto;
 INSERT INTO public.scadenze_sostituzioni(company_id,previsione_id,reale_id,importo_previsto_prima,stato_prima,importo_coperto,regola,created_by)
 VALUES(p_company,p_previsione,p_reale,pv.amount,pv.status,coperto,p_regola,auth.uid()) RETURNING id INTO sid;
 UPDATE public.scadenze SET amount=nuovo,
  status=CASE WHEN nuovo-coalesce(paid_amount,0)<=0.005 THEN CASE WHEN coalesce(paid_amount,0)>0 THEN 'pagata' ELSE 'annullata' END ELSE status END,
  notes=concat_ws(E'\n',nullif(notes,''),format('[SOSTITUITA_DA:%s] %s € coperti dalla scadenza reale',p_reale,coperto))
 WHERE id=p_previsione;
 RETURN jsonb_build_object('id',sid,'coperto',coperto,'residuo_previsione',nuovo);
END $$;
REVOKE ALL ON FUNCTION private.tes_sostituisci_previsione(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tesoreria_sostituisci_previsione(p_company uuid,p_previsione uuid,p_reale uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND (public.utente_sola_lettura(p_company) OR NOT coalesce(public.puo_gestire_scadenze(p_company),false)) THEN
  RAISE EXCEPTION 'Operazione non autorizzata' USING ERRCODE='42501';
 END IF;
 RETURN private.tes_sostituisci_previsione(p_company,p_previsione,p_reale,'manuale');
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_sostituisci_previsione(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_sostituisci_previsione(uuid,uuid,uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.tesoreria_annulla_sostituzione(p_company uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.scadenze_sostituzioni;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' AND (public.utente_sola_lettura(p_company) OR NOT coalesce(public.puo_gestire_scadenze(p_company),false)) THEN
  RAISE EXCEPTION 'Operazione non autorizzata' USING ERRCODE='42501';
 END IF;
 UPDATE public.scadenze_sostituzioni SET annullato_at=now(),annullato_da=auth.uid() WHERE id=p_id AND company_id=p_company AND annullato_at IS NULL RETURNING * INTO x;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sostituzione non trovata o già annullata' USING ERRCODE='P0002'; END IF;
 UPDATE public.scadenze SET amount=amount+x.importo_coperto,
  status=CASE WHEN status IN('annullata','pagata') THEN x.stato_prima ELSE status END,
  notes=concat_ws(E'\n',nullif(notes,''),format('[SOSTITUZIONE_ANNULLATA:%s]',x.reale_id))
 WHERE id=x.previsione_id AND company_id=p_company;
END $$;
REVOKE ALL ON FUNCTION public.tesoreria_annulla_sostituzione(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_annulla_sostituzione(uuid,uuid) TO authenticated,service_role;

-- Automatico solo se il collegamento è univoco: stessa azienda, direzione, fornitore e commessa,
-- una sola previsione aperta. Più previsioni → nessuna scelta automatica (lo segnala il controllo).
CREATE OR REPLACE FUNCTION private.tes_previsione_da_reale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids uuid[];
BEGIN
 IF coalesce(NEW.is_previsionale,false) OR NEW.supplier_id IS NULL OR NEW.status NOT IN('da_pagare','parziale','pagata') THEN RETURN NULL; END IF;
 ids:=ARRAY(SELECT p.id FROM public.scadenze p WHERE p.company_id=NEW.company_id AND coalesce(p.is_previsionale,false) AND p.status IN('da_pagare','parziale')
  AND p.direction=NEW.direction AND p.supplier_id=NEW.supplier_id AND p.order_id IS NOT DISTINCT FROM NEW.order_id LIMIT 2);
 IF array_length(ids,1)=1 THEN PERFORM private.tes_sostituisci_previsione(NEW.company_id,ids[1],NEW.id,'R-PREVISIONE/v1'); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.tes_previsione_da_reale() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tes_previsione_da_reale ON public.scadenze;
CREATE TRIGGER tes_previsione_da_reale AFTER INSERT ON public.scadenze FOR EACH ROW EXECUTE FUNCTION private.tes_previsione_da_reale();

-- ─── Controllo dei doppi conteggi ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cdg_controllo_doppi(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE out jsonb:='[]';
BEGIN
 IF coalesce(auth.role(),'')<>'service_role'
    AND NOT coalesce(public.has_permission_for_company(auth.uid(),'can_view_controllo_gestione',p_company),false)
    AND NOT coalesce(public.has_permission_for_company(auth.uid(),'can_view_tesoreria',p_company),false) THEN
  RAISE EXCEPTION 'Non hai il permesso di vedere questi controlli' USING ERRCODE='42501';
 END IF;
 -- 1. Quote di un movimento oltre il suo importo
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','movimento_oltre_importo','ids',jsonb_build_array(t.id),'importo',round(q.s-abs(t.amount),2),
   'descrizione',format('Movimento del %s: collegati %s € su %s €',to_char(t.booking_date,'DD/MM/YYYY'),round(q.s,2),abs(t.amount)),'cosa_fare','Scollegare la quota in più'))
  FROM public.bank_transactions t JOIN (SELECT transaction_id,sum(abs(matched_amount)) s FROM public.bank_reconciliations WHERE company_id=p_company AND unmatched_at IS NULL GROUP BY 1) q ON q.transaction_id=t.id
  WHERE t.company_id=p_company AND q.s>abs(t.amount)+0.005),'[]');
 -- 2. Incassi oltre il totale della fattura emessa
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','documento_oltre_totale','ids',jsonb_build_array(d.id),'importo',round(d.importo_pagato-d.totale_da_pagare,2),
   'descrizione',format('Fattura %s: incassati %s € su %s €',d.numero,d.importo_pagato,d.totale_da_pagare),'cosa_fare','Controllare gli incassi doppi della fattura'))
  FROM public.documenti_fiscali_elenco_operativo d WHERE d.company_id=p_company AND d.deleted_at IS NULL AND d.tipo<>'nota_credito' AND d.totale_da_pagare>0 AND coalesce(d.importo_pagato,0)>d.totale_da_pagare+0.005),'[]');
 -- 3. Spesa creata da un movimento mentre un debito aperto dello stesso fornitore aspettava quel pagamento
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','spesa_da_banca_su_debito_aperto','ids',jsonb_build_array(cc.id,sc.id),'importo',cc.amount,
   'descrizione',format('Spesa «%s» da banca (%s €) e scadenza aperta «%s» dello stesso fornitore',cc.name,cc.amount,sc.description),
   'cosa_fare','Se è lo stesso debito: riaprire il movimento e collegarlo alla scadenza'))
  FROM public.company_costs cc JOIN public.scadenze sc ON sc.company_id=cc.company_id AND sc.supplier_id=cc.supplier_id AND sc.direction='uscita'
   AND sc.status IN('da_pagare','parziale') AND coalesce(sc.is_previsionale,false)=false AND abs(sc.amount-coalesce(sc.paid_amount,0)-cc.amount)<0.005
   AND (sc.cost_id IS NULL OR sc.cost_id<>cc.id)
  WHERE cc.company_id=p_company AND coalesce(cc.senza_fattura,false) AND coalesce(cc.notes,'')~'^\[BANCA:'),'[]');
 -- 4. Previsione aperta con una scadenza reale dello stesso fornitore e commessa
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','previsione_non_sostituita','ids',jsonb_build_array(p.id)||to_jsonb(r.ids),'importo',p.amount-coalesce(p.paid_amount,0),
   'descrizione',format('Previsione «%s» ancora aperta: ci sono %s scadenze reali dello stesso fornitore',p.description,cardinality(r.ids)),
   'cosa_fare','Sostituire la previsione con la scadenza reale'))
  FROM public.scadenze p CROSS JOIN LATERAL (SELECT ARRAY(SELECT x.id FROM public.scadenze x WHERE x.company_id=p.company_id AND NOT coalesce(x.is_previsionale,false)
     AND x.direction=p.direction AND x.supplier_id=p.supplier_id AND x.order_id IS NOT DISTINCT FROM p.order_id AND x.status<>'annullata'
     AND NOT EXISTS(SELECT 1 FROM public.scadenze_sostituzioni z WHERE z.previsione_id=p.id AND z.reale_id=x.id AND z.annullato_at IS NULL)) ids) r
  WHERE p.company_id=p_company AND coalesce(p.is_previsionale,false) AND p.status IN('da_pagare','parziale') AND p.supplier_id IS NOT NULL AND cardinality(r.ids)>0),'[]');
 -- 5. Prima nota doppia sullo stesso movimento e documento
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','prima_nota_doppia','ids',to_jsonb(g.ids),'importo',g.s,
   'descrizione',format('%s registrazioni di prima nota per lo stesso movimento e documento',cardinality(g.ids)),'cosa_fare','Stornare la registrazione in più'))
  FROM (SELECT array_agg(pn.id ORDER BY pn.id) ids,sum(pn.amount) s FROM public.prima_nota_entries pn
   WHERE pn.company_id=p_company AND pn.bank_transaction_id IS NOT NULL AND pn.reversal_of IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries r WHERE r.company_id=p_company AND r.reversal_of=pn.id)
   GROUP BY pn.bank_transaction_id,coalesce(pn.documento_fiscale_id,pn.invoice_id,pn.scadenza_id,pn.cost_id) HAVING count(*)>1 AND coalesce(pn.documento_fiscale_id,pn.invoice_id,pn.scadenza_id,pn.cost_id) IS NOT NULL) g),'[]');
 -- 6. Ripartizioni dei costi su commesse che non fanno 100%
 out:=out||coalesce((SELECT jsonb_agg(jsonb_build_object('controllo','allocazioni_non_100','ids',jsonb_build_array(cc.id),'importo',cc.amount,
   'descrizione',format('Costo «%s» ripartito al %s%%',cc.name,a.pct),'cosa_fare','Completare la ripartizione: la parte mancante non va su nessuna commessa'))
  FROM public.company_costs cc CROSS JOIN LATERAL (SELECT round(sum(CASE WHEN x->>'pct'~'^[0-9]+(\.[0-9]+)?$' THEN (x->>'pct')::numeric ELSE 0 END),2) pct FROM jsonb_array_elements(cc.allocations) x) a
  WHERE cc.company_id=p_company AND jsonb_typeof(cc.allocations)='array' AND jsonb_array_length(cc.allocations)>0 AND abs(a.pct-100)>0.01),'[]');
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.cdg_controllo_doppi(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cdg_controllo_doppi(uuid) TO authenticated,service_role;

NOTIFY pgrst,'reload schema';

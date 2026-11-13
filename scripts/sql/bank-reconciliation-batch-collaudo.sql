-- Real procedures, demo company only, all test rows rolled back. No external push.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE TEMP TABLE qa_bank_results(scenario text,ok boolean);
CREATE FUNCTION pg_temp.qa_bank_tx(p_amount numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE tx uuid;account uuid;BEGIN
 SELECT id INTO account FROM public.bank_accounts WHERE company_id='d2000000-0000-4000-a000-000000000002' AND is_active LIMIT 1;
 IF account IS NULL THEN RAISE EXCEPTION 'Demo account missing';END IF;
 INSERT INTO public.bank_transactions(company_id,account_id,external_transaction_id,amount,booking_date,description,transaction_type,status,currency)
 VALUES('d2000000-0000-4000-a000-000000000002',account,'QA-BATCH-'||gen_random_uuid(),p_amount,current_date,'COLLAUDO TEMPORANEO riconciliazione lotto',CASE WHEN p_amount>0 THEN 'credit' ELSE 'debit' END,'booked','EUR') RETURNING id INTO tx;RETURN tx;
END $$;
CREATE FUNCTION pg_temp.qa_bank_doc(p_total numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE doc uuid;progressive int;BEGIN
 progressive:=100000000+floor(random()*100000000)::int;
 INSERT INTO public.documenti_fiscali(company_id,tipo,numero,numero_progressivo,stato,totale_da_pagare,totale_documento,cliente_snapshot,data_emissione)
 VALUES('d2000000-0000-4000-a000-000000000002','fattura','QA-BATCH-'||gen_random_uuid(),progressive,'emessa',p_total,p_total,'{"ragione_sociale":"COLLAUDO TEMPORANEO"}',current_date) RETURNING id INTO doc;RETURN doc;
END $$;
CREATE FUNCTION pg_temp.qa_bank_item(p_tx uuid,p_rows jsonb,p_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE m jsonb;BEGIN
 m:=public.bank_movimento_dettaglio('d2000000-0000-4000-a000-000000000002',p_tx);
 RETURN jsonb_build_object('id',p_tx,'mode','documents','expected_remaining',m->'links'->'remaining','revision',m->'links'->'revision','rows',p_rows,'difference_reason',p_reason);
END $$;
SELECT set_config('request.jwt.claims','{"sub":"e592255e-0c82-86cd-7f7b-d3046317f9cd","role":"authenticated"}',true);
DO $$
DECLARE co uuid:='d2000000-0000-4000-a000-000000000002'; tx uuid;tx2 uuid;d uuid;d2 uuid;sc uuid;sc2 uuid;rec uuid;item jsonb;result jsonb;req uuid;cost uuid;pn uuid;rejected boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='company_admin') THEN RAISE EXCEPTION 'Missing demo admin';END IF;
 -- Single balance + idempotency + complete reversal.
 d:=pg_temp.qa_bank_doc(100);tx:=pg_temp.qa_bank_tx(100);req:=gen_random_uuid();
 item:=pg_temp.qa_bank_item(tx,jsonb_build_array(jsonb_build_object('tipo','documento','id',d,'importo',100)));
 result:=public.bank_conferma_lotto(co,req,jsonb_build_array(item));
 IF public.bank_conferma_lotto(co,req,jsonb_build_array(item)) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Idempotency failed';END IF;
 INSERT INTO qa_bank_results SELECT 'Saldo singolo e ripetizione sicura',importo_pagato=100 FROM public.documenti_fiscali WHERE id=d;
 SELECT id INTO rec FROM public.bank_reconciliations WHERE transaction_id=tx AND unmatched_at IS NULL;
 PERFORM public.scollega_riga_ripartita(rec);
 INSERT INTO qa_bank_results SELECT 'Annullamento e ripristino residuo',importo_pagato=0 FROM public.documenti_fiscali WHERE id=d;
 -- Cumulative incoming and outgoing, partial receipts and advances.
 d:=pg_temp.qa_bank_doc(30);d2:=pg_temp.qa_bank_doc(70);tx:=pg_temp.qa_bank_tx(100);
 item:=pg_temp.qa_bank_item(tx,jsonb_build_array(jsonb_build_object('tipo','documento','id',d,'importo',30),jsonb_build_object('tipo','documento','id',d2,'importo',70)));
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item));
 INSERT INTO qa_bank_results SELECT 'Un incasso per più fatture',sum(importo_pagato)=100 FROM public.documenti_fiscali WHERE id IN(d,d2);
 d:=pg_temp.qa_bank_doc(100);tx:=pg_temp.qa_bank_tx(40);tx2:=pg_temp.qa_bank_tx(60);
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(pg_temp.qa_bank_item(tx,jsonb_build_array(jsonb_build_object('tipo','documento','id',d,'importo',40)))));
 INSERT INTO qa_bank_results SELECT 'Acconto e incasso parziale',importo_pagato=40 AND stato='parzialmente_pagata' FROM public.documenti_fiscali WHERE id=d;
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(pg_temp.qa_bank_item(tx2,jsonb_build_array(jsonb_build_object('tipo','documento','id',d,'importo',60)))));
 INSERT INTO qa_bank_results SELECT 'Più movimenti per la stessa fattura',importo_pagato=100 FROM public.documenti_fiscali WHERE id=d;
 INSERT INTO public.scadenze(company_id,tipo,description,amount,due_date) VALUES(co,'pagamento_fornitore','QA-BATCH fornitore 1',30,current_date) RETURNING id INTO sc;
 INSERT INTO public.scadenze(company_id,tipo,description,amount,due_date) VALUES(co,'pagamento_fornitore','QA-BATCH fornitore 2',70,current_date) RETURNING id INTO sc2;
 tx:=pg_temp.qa_bank_tx(-100);
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(pg_temp.qa_bank_item(tx,jsonb_build_array(jsonb_build_object('tipo','scadenza','id',sc,'importo',30),jsonb_build_object('tipo','scadenza','id',sc2,'importo',70)))));
 INSERT INTO qa_bank_results SELECT 'Pagamento cumulativo e scadenzario',sum(paid_amount)=100 FROM public.scadenze WHERE id IN(sc,sc2);
 -- Expense with no invoice, transfer without expense.
 tx:=pg_temp.qa_bank_tx(-5);item:=pg_temp.qa_bank_item(tx,'[]');item:=item||'{"mode":"none","category":"Bancario"}';
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item));
 INSERT INTO qa_bank_results SELECT 'Commissione senza fattura e Prima nota',count(*)=1 AND sum(amount)=5 FROM public.prima_nota_entries WHERE bank_transaction_id=tx AND direction='uscita';
 tx:=pg_temp.qa_bank_tx(200);item:=pg_temp.qa_bank_item(tx,'[]')||'{"mode":"none","category":"Giroconto"}';PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item));
 INSERT INTO qa_bank_results SELECT 'Giroconto senza ricavi o costi',NOT EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE bank_transaction_id=tx) AND (SELECT category='Giroconto' FROM public.bank_transactions WHERE id=tx);
 -- A document and an explicitly classified bank fee in the same debit.
 INSERT INTO public.scadenze(company_id,tipo,description,amount,due_date) VALUES(co,'pagamento_fornitore','QA-BATCH con commissione',100,current_date) RETURNING id INTO sc;
 tx:=pg_temp.qa_bank_tx(-102);
 item:=pg_temp.qa_bank_item(tx,jsonb_build_array(jsonb_build_object('tipo','scadenza','id',sc,'importo',100)),'commissioni');
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item));
 INSERT INTO qa_bank_results SELECT 'Commissione esplicita nel pagamento',reconciliation_status='reconciled' FROM public.bank_transactions WHERE id=tx;
 SELECT a.prima_nota_id,a.cost_id,r.id INTO pn,cost,rec FROM private.bank_adjustment_payments a JOIN public.bank_reconciliations r ON r.prima_nota_id=a.prima_nota_id AND r.unmatched_at IS NULL WHERE a.transaction_id=tx;
 PERFORM public.bank_scollega_pagamento(rec);
 INSERT INTO qa_bank_results SELECT 'Annullamento commissione senza stornare il fornitore',(SELECT paid_amount=100 FROM public.scadenze WHERE id=sc) AND EXISTS(SELECT 1 FROM public.prima_nota_entries WHERE reversal_of=pn) AND (SELECT reconciliation_status='parziale' FROM public.bank_transactions WHERE id=tx);
 -- Withholding uses the existing fiscal register, then reverses gross and withholding together.
 d:=pg_temp.qa_bank_doc(122);tx:=pg_temp.qa_bank_tx(111);
 item:=pg_temp.qa_bank_item(tx,'[]')||jsonb_build_object('mode','withholding','document_id',d);
 PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item));
 INSERT INTO qa_bank_results SELECT 'Ritenuta bonifico parlante: netto, lordo e residuo',importo_pagato=122 FROM public.documenti_fiscali WHERE id=d;
 SELECT id INTO rec FROM public.bank_reconciliations WHERE transaction_id=tx AND unmatched_at IS NULL;
 PERFORM public.scollega_bonifico_fattura(rec);
 INSERT INTO qa_bank_results SELECT 'Annullamento ritenuta e incasso lordo',importo_pagato=0 FROM public.documenti_fiscali WHERE id=d;
 -- Imported invoice: two bank receipts update local residual immediately.
 INSERT INTO public.invoices(company_id,client_company_name,invoice_number,total,paid_amount,status,external_provider,external_id)
 VALUES(co,'COLLAUDO TEMPORANEO','QA-BATCH-'||gen_random_uuid(),100,0,'issued','fattureincloud','QA-'||gen_random_uuid()) RETURNING id INTO d;
 tx:=pg_temp.qa_bank_tx(40);tx2:=pg_temp.qa_bank_tx(60);
 item:=pg_temp.qa_bank_item(tx,jsonb_build_array(jsonb_build_object('tipo','invoice','id',d,'importo',40)));
 result:=public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item,pg_temp.qa_bank_item(tx2,jsonb_build_array(jsonb_build_object('tipo','invoice','id',d,'importo',60)))));
 INSERT INTO qa_bank_results SELECT 'Fattura importata: due incassi e residuo immediato',paid_amount=100 AND public.bank_external_payment_target(d)=100 FROM public.invoices WHERE id=d;
 SELECT id INTO rec FROM public.bank_reconciliations WHERE transaction_id=tx AND invoice_id=d AND unmatched_at IS NULL;
 result:=public.scollega_riga_ripartita(rec);
 INSERT INTO qa_bank_results SELECT 'Fattura importata: annullamento e allineamento assoluto',paid_amount=60 AND (result->>'allinea')::boolean AND public.bank_external_payment_target(d)=60 FROM public.invoices WHERE id=d;
 -- Failure after a valid row: no partial commit.
 tx:=pg_temp.qa_bank_tx(11);tx2:=pg_temp.qa_bank_tx(12);
 item:=pg_temp.qa_bank_item(tx,'[]')||'{"mode":"none","category":"Giroconto"}';
 rejected:=false;BEGIN PERFORM public.bank_conferma_lotto(co,gen_random_uuid(),jsonb_build_array(item,jsonb_build_object('id',tx2,'mode','none','category','Giroconto','expected_remaining',999,'revision',0)));EXCEPTION WHEN OTHERS THEN rejected:=true;END;
 INSERT INTO qa_bank_results SELECT 'Lotto atomico con conflitto',rejected AND bool_and(chiuso_senza_documento IS NULL) FROM public.bank_transactions WHERE id IN(tx,tx2);
END $$;
SELECT * FROM qa_bank_results;
DO $$BEGIN IF EXISTS(SELECT 1 FROM qa_bank_results WHERE NOT coalesce(ok,false)) THEN RAISE EXCEPTION 'Bank batch verification failed';END IF;END $$;
ROLLBACK;

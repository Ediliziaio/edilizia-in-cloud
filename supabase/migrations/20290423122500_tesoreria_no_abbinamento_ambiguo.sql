-- Le commissioni senza un collegamento certo restano verificabili nella tesoreria.
CREATE OR REPLACE FUNCTION private.tes_chiudi_senza_fattura(p_company uuid, p_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 r record; cap numeric; intr numeric; spese numeric; cst uuid; cat text; rev int;
 vcap uuid; vint uuid; vsp uuid; n_costi int:=0; n_chiusi int:=0; n_rate int:=0; n_saltati int:=0; errori jsonb:='[]';
 costi_banca constant text[]:=ARRAY['13.03','13.06','13.07','13.08','13.09','13.10','12.09','31.01','31.02'];
BEGIN
 IF NOT coalesce((SELECT g.chiusura_senza_fattura_automatica FROM public.company_governance_settings g WHERE g.company_id=p_company),false) THEN
  RETURN jsonb_build_object('attiva',false);
 END IF;
 FOR r IN
  SELECT t.id, t.amount, t.booking_date, t.description, t.operativita_revision rev, v.codice, v.nome
    FROM public.bank_transactions t JOIN public.cassa_voci v ON v.id=t.cassa_voce_id AND v.company_id=t.company_id
   WHERE t.company_id=p_company AND coalesce(t.status,'booked')='booked' AND coalesce(t.currency,'EUR')='EUR'
     AND coalesce(t.reconciliation_status,'pending') NOT IN('reconciled','ignored','parziale') AND t.chiuso_senza_documento IS NULL
     AND t.cassa_ripartizione IS NULL
     AND t.linked_invoice_id IS NULL AND t.linked_cost_id IS NULL AND t.linked_scadenza_id IS NULL AND t.linked_installment_id IS NULL
     AND NOT EXISTS(SELECT 1 FROM public.bank_reconciliations x WHERE x.transaction_id=t.id AND x.unmatched_at IS NULL)
     AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.bank_transaction_id=t.id)
     AND (v.codice=ANY(costi_banca) OR v.codice IN('17.01','17.02','17.04','16.04','06.01') OR v.codice LIKE '12.%')
     -- Importo e data non identificano una spesa. Un'uscita esplicitamente in
     -- contanti è distinta. Le corrispondenze dubbie restano aperte e non
     -- occupano uno dei posti del lotto automatico.
     AND NOT (v.codice=ANY(costi_banca) AND t.amount<0 AND EXISTS (
       SELECT 1 FROM public.prima_nota_entries p
        WHERE p.company_id=t.company_id AND p.bank_transaction_id IS NULL
          AND p.direction='uscita' AND abs(p.amount-abs(t.amount))<0.005
          AND abs(p.entry_date-t.booking_date)<=3
          AND coalesce(lower(btrim(p.payment_method)), '') NOT IN ('contanti','contante','cash')
     ))
   ORDER BY t.booking_date, t.id
   LIMIT greatest(coalesce(p_limite,200),1)
 LOOP
  BEGIN
   IF r.codice=ANY(costi_banca) AND r.amount<0 THEN
    cat:=CASE WHEN r.codice IN('13.03','13.05') THEN 'interessi' WHEN r.codice='12.09' THEN 'tasse' ELSE 'spese bancarie' END;
    PERFORM public.chiudi_movimento_senza_fattura(r.id,'spesa',r.nome,
      left(regexp_replace(r.description,'\s+',' ','g'),185)||' · '||left(r.id::text,8),cat);
    n_costi:=n_costi+1;
   ELSIF r.codice IN('17.01','17.02') AND r.amount<0 THEN
    IF r.codice='17.01' THEN
     cap:=replace(replace(substring(r.description FROM 'Cap\.: *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
     intr:=replace(replace(substring(r.description FROM 'Int\.: *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
    ELSE
     cap:=replace(replace(substring(r.description FROM 'Quota capitale *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
     intr:=replace(replace(substring(r.description FROM 'Interessi *([0-9.]+,[0-9]{2})'),'.',''),',','.')::numeric;
    END IF;
    spese:=round(abs(r.amount)-coalesce(cap,0)-coalesce(intr,0),2);
    IF cap IS NULL OR intr IS NULL OR spese<0 OR spese>50 THEN n_saltati:=n_saltati+1; CONTINUE; END IF;
    SELECT id INTO vcap FROM public.cassa_voci WHERE company_id=p_company AND codice=r.codice;
    SELECT id INTO vint FROM public.cassa_voci WHERE company_id=p_company AND codice=CASE r.codice WHEN '17.01' THEN '13.01' ELSE '13.02' END;
    SELECT id INTO vsp FROM public.cassa_voci WHERE company_id=p_company AND codice='13.09';
    rev:=public.bank_movimento_ripartizione(p_company,r.id,
      jsonb_build_array(jsonb_build_object('voce',vcap,'cents',round(cap*100)::bigint),jsonb_build_object('voce',vint,'cents',round(intr*100)::bigint))
      ||CASE WHEN spese>0.004 THEN jsonb_build_array(jsonb_build_object('voce',vsp,'cents',round(spese*100)::bigint)) ELSE '[]'::jsonb END,
      r.rev,'Rata di finanziamento: capitale e interessi dalla causale');
    PERFORM public.chiudi_movimento_senza_fattura(r.id,'nessun_costo',CASE r.codice WHEN '17.01' THEN 'Rata mutuo' ELSE 'Rata prestito' END,
      format('Capitale %s €, interessi %s €, spese %s €',cap,intr,spese));
    INSERT INTO public.company_costs(company_id,name,amount,vat_rate,cost_type,recurrence,category,senza_fattura,due_date,documento_data,mese_competenza,
      is_paid,paid_date,payment_method,notes)
     VALUES(p_company,left(format('Interessi %s · rata del %s',CASE r.codice WHEN '17.01' THEN 'mutuo' ELSE 'prestito' END,to_char(r.booking_date,'DD/MM/YYYY')),200),
      round(intr+spese,2),0,'variable','once','interessi',true,r.booking_date,r.booking_date,date_trunc('month',r.booking_date)::date,
      true,r.booking_date,'rid','[RATA:'||r.id::text||']')
     RETURNING id INTO cst;
    INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,cost_id,is_auto,auto_source,reconciliation_method,bank_transaction_id,created_by)
     VALUES(p_company,'uscita','finanziamento',left('Quota capitale · '||regexp_replace(r.description,'\s+',' ','g'),300),cap,r.booking_date,'rid',NULL,true,'banca_senza_documento','generic_categorized',r.id,auth.uid()),
           (p_company,'uscita','fornitore',left('Interessi e spese · '||regexp_replace(r.description,'\s+',' ','g'),300),round(intr+spese,2),r.booking_date,'rid',cst,true,'banca_senza_documento','generic_categorized',r.id,auth.uid());
    n_rate:=n_rate+1;
   ELSIF (r.codice LIKE '12.%' AND r.codice<>'12.09') OR r.codice IN('06.01','16.04','17.04') THEN
    PERFORM public.chiudi_movimento_senza_fattura(r.id,'nessun_costo',r.nome,left(regexp_replace(r.description,'\s+',' ','g'),200));
    INSERT INTO public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,is_auto,auto_source,reconciliation_method,bank_transaction_id,created_by)
     VALUES(p_company,CASE WHEN r.amount<0 THEN 'uscita' ELSE 'entrata' END,
      CASE WHEN r.codice LIKE '12.%' THEN 'fiscale' WHEN r.codice='06.01' THEN 'stipendi' ELSE 'finanziamento' END,
      left(regexp_replace(r.description,'\s+',' ','g'),300),abs(r.amount),r.booking_date,'bonifico',true,'banca_senza_documento','generic_categorized',r.id,auth.uid());
    n_chiusi:=n_chiusi+1;
   ELSE
    n_saltati:=n_saltati+1;
   END IF;
  EXCEPTION WHEN OTHERS THEN
   errori:=errori||jsonb_build_array(jsonb_build_object('transaction_id',r.id,'voce',r.codice,'errore',SQLERRM));
  END;
 END LOOP;
 RETURN jsonb_build_object('attiva',true,'costi',n_costi,'gia_in_prima_nota',0,'senza_costo',n_chiusi,'rate',n_rate,'saltati',n_saltati,'errori',errori);
END $function$;

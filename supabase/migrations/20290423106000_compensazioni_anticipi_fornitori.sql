SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS private.compensazioni_anticipi_fornitori (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  costo_id uuid NOT NULL REFERENCES public.company_costs(id) ON DELETE RESTRICT,
  fornitore_id uuid NOT NULL,
  anticipo_riga_id uuid NOT NULL REFERENCES public.contabilita_righe(id) ON DELETE RESTRICT,
  debito_id uuid NOT NULL REFERENCES public.contabilita_conti(id) ON DELETE RESTRICT,
  scrittura_id uuid NOT NULL UNIQUE REFERENCES public.contabilita_scritture(id) ON DELETE RESTRICT,
  data date NOT NULL,
  importo numeric(14,2) NOT NULL CHECK (importo>0)
);
ALTER TABLE private.compensazioni_anticipi_fornitori ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.compensazioni_anticipi_fornitori FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS compensazioni_anticipi_per_costo ON private.compensazioni_anticipi_fornitori(company_id,costo_id);
CREATE INDEX IF NOT EXISTS compensazioni_anticipi_per_riga ON private.compensazioni_anticipi_fornitori(anticipo_riga_id);

CREATE OR REPLACE FUNCTION private.anticipi_compensazioni_al(p_company uuid,p_al date)
RETURNS SETOF private.compensazioni_anticipi_fornitori LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT a.* FROM private.compensazioni_anticipi_fornitori a
  WHERE a.company_id=$1 AND a.data<=$2 AND NOT EXISTS(
    SELECT 1 FROM public.contabilita_scritture s WHERE s.storno_di=a.scrittura_id AND s.company_id=$1 AND s.data_registrazione<=$2
  )
$$;

CREATE OR REPLACE FUNCTION public.anticipi_compensazioni_costo(p_company uuid,p_costo uuid,p_al date)
RETURNS TABLE(data date,importo numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT a.data,a.importo FROM private.anticipi_compensazioni_al($1,$3) a
   WHERE a.costo_id=$2 AND (public.ai_is_service_role() OR public.puo_vedere_scadenze($1))
$$;

CREATE OR REPLACE FUNCTION public.anticipi_compensati_costo(p_company uuid,p_costo uuid,p_al date)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT coalesce(sum(a.importo),0) FROM public.anticipi_compensazioni_costo($1,$2,$3) a
$$;

CREATE OR REPLACE FUNCTION public.anticipo_costo_ha_storico(p_company uuid,p_costo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT (public.ai_is_service_role() OR public.puo_vedere_scadenze($1)) AND EXISTS (
    SELECT 1 FROM private.compensazioni_anticipi_fornitori a WHERE a.company_id=$1 AND a.costo_id=$2
  )
$$;

CREATE OR REPLACE FUNCTION public.previsionale_compensazioni_anticipi(p_company_id uuid,p_al date)
RETURNS TABLE(id uuid,cost_id uuid,entry_date date,amount numeric,direction text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT a.id,a.costo_id,a.data,a.importo,'uscita'::text FROM private.anticipi_compensazioni_al($1,$2) a
    WHERE public.ai_is_service_role() OR public.puo_vedere_scadenze($1)
$$;

CREATE OR REPLACE FUNCTION private.anticipi_fornitore_disponibili(p_company uuid,p_fornitore uuid)
RETURNS TABLE(id uuid,conto_id uuid,data date,descrizione text,residuo numeric) LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT r.id,r.conto_id,s.data_registrazione, coalesce(r.descrizione,s.descrizione,c.descrizione),
       r.dare-coalesce(usato.totale,0)
  FROM public.contabilita_righe r
  JOIN public.contabilita_scritture s ON s.id=r.scrittura_id AND s.company_id=r.company_id
  JOIN public.contabilita_conti c ON c.id=r.conto_id AND c.company_id=r.company_id
  LEFT JOIN LATERAL (
    SELECT sum(a.importo) totale FROM private.compensazioni_anticipi_fornitori a
     WHERE a.anticipo_riga_id=r.id AND a.company_id=$1
       AND NOT EXISTS(SELECT 1 FROM public.contabilita_scritture k WHERE k.storno_di=a.scrittura_id)
  ) usato ON true
  WHERE r.company_id=$1 AND r.dare>0 AND s.origine='manuale' AND s.storno_di IS NULL AND c.attivo AND c.movimentabile
    AND private.contabilita_conto_anticipi(c) AND s.data_registrazione<=current_date AND r.dare>coalesce(usato.totale,0)
    AND NOT EXISTS(SELECT 1 FROM public.contabilita_scritture x WHERE x.storno_di=s.id)
    AND NOT EXISTS(SELECT 1 FROM private.compensazioni_anticipi_fornitori a
      WHERE a.anticipo_riga_id=r.id AND a.company_id=$1 AND a.fornitore_id<>$2)
$$;

CREATE OR REPLACE FUNCTION public.costo_anticipi_disponibili(p_costo uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.company_costs;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id=p_costo;
  IF c.id IS NULL OR c.supplier_id IS NULL OR public.contabilita_puo_scrivere(c.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso agli anticipi non disponibile' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object(
    'anticipi',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.data,a.id)
      FROM private.anticipi_fornitore_disponibili(c.company_id,c.supplier_id) a),'[]'::jsonb),
    'conti',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'nome',k.codice||' · '||k.descrizione) ORDER BY k.codice)
      FROM public.contabilita_conti k WHERE k.company_id=c.company_id AND k.natura='passivo' AND k.voce_cee='D.7'
        AND k.movimentabile AND k.attivo),'[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.compensa_costo_con_anticipo(
  p_costo uuid,p_anticipo uuid,p_debito uuid,p_importo numeric,p_richiesta uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.company_costs; a record; d jsonb; v_id uuid; v_scrittura uuid; v_efficace date:=current_date;
BEGIN
  SELECT * INTO c FROM public.company_costs WHERE id=p_costo;
  IF c.id IS NULL OR c.supplier_id IS NULL OR public.contabilita_puo_scrivere(c.company_id) IS NOT TRUE OR NOT EXISTS(
    SELECT 1 FROM public.companies co WHERE co.id=c.company_id AND co.contabilita_generale_attiva AND co.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'Accesso agli anticipi non disponibile' USING ERRCODE='42501'; END IF;
  IF p_richiesta IS NULL OR p_importo IS NULL OR p_importo<=0 OR p_importo>=1000000000000 OR p_importo<>round(p_importo,2) THEN
    RAISE EXCEPTION 'Importo della compensazione non valido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(c.company_id::text,2810));
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:'||c.company_id,0));
  SELECT * INTO c FROM public.company_costs WHERE id=p_costo FOR UPDATE;
  IF c.supplier_id IS NULL OR c.annullato_il IS NOT NULL THEN RAISE EXCEPTION 'Costo non disponibile' USING ERRCODE='22023'; END IF;
  SELECT x.scrittura_id INTO v_id FROM private.compensazioni_anticipi_fornitori x
    WHERE x.id=p_richiesta AND x.company_id=c.company_id AND x.anticipo_riga_id=p_anticipo AND x.costo_id=c.id AND x.importo=p_importo AND x.debito_id=p_debito;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('scrittura_id',v_id); END IF;
  d:=public.dettaglio_pagamento_costo(c.id);
  SELECT * INTO a FROM private.anticipi_fornitore_disponibili(c.company_id,c.supplier_id) f WHERE f.id=p_anticipo;
  IF NOT FOUND OR a.residuo<p_importo OR coalesce((d->>'da_verificare')::boolean,true) OR (d->>'residuo')::numeric<p_importo THEN
    RAISE EXCEPTION 'Anticipo o residuo del debito non disponibile per l’importo scelto.' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.contabilita_conti k WHERE k.id=p_debito AND k.company_id=c.company_id AND k.natura='passivo'
      AND k.voce_cee='D.7' AND k.attivo AND k.movimentabile) THEN
    RAISE EXCEPTION 'Scegli il conto debiti del fornitore.' USING ERRCODE='22023';
  END IF;
  v_scrittura:=public.contabilita_inserisci_scrittura(c.company_id,v_efficace,'Compensazione anticipo a fornitore',c.name,null,null,
    jsonb_build_array(jsonb_build_object('conto_id',p_debito,'dare',p_importo,'avere',0,'descrizione','Debito verso il fornitore'),
      jsonb_build_object('conto_id',a.conto_id,'dare',0,'avere',p_importo,'descrizione','Anticipo utilizzato')),
    'compensazione_anticipo',p_richiesta,null);
  INSERT INTO private.compensazioni_anticipi_fornitori(id,company_id,costo_id,fornitore_id,anticipo_riga_id,debito_id,scrittura_id,data,importo)
    VALUES(p_richiesta,c.company_id,c.id,c.supplier_id,p_anticipo,p_debito,v_scrittura,v_efficace,p_importo);
  RETURN public.spesa_pagamento_sincronizza(c.id)||jsonb_build_object('scrittura_id',v_scrittura);
END $$;

CREATE OR REPLACE FUNCTION public.registra_pagamento_costo(p_costo uuid, p_richiesta uuid, p_importo numeric DEFAULT NULL::numeric, p_data date DEFAULT CURRENT_DATE, p_metodo text DEFAULT 'bonifico'::text, p_riferimento text DEFAULT NULL::text, p_banca uuid DEFAULT NULL::uuid, p_esistente uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.company_costs; pn public.prima_nota_entries; tx public.bank_transactions;
 totale numeric; pagato numeric; v_compensato numeric; importo numeric; payload jsonb; risultato jsonb; idpn uuid; altra numeric; v_esistente uuid := p_esistente;
begin
 select * into c from public.company_costs where id=p_costo;
 if c.id is null then raise exception 'Costo non disponibile'; end if;
 perform public.spesa_pagamento_autorizza(c.company_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text,2810));
 select * into c from public.company_costs where id=p_costo for update;
 if p_richiesta is null or p_data is null or p_data>current_date or length(coalesce(p_riferimento,''))>500
 or p_importo::text in ('NaN','Infinity','-Infinity') or (p_importo is not null and (p_importo<=0 or p_importo<>round(p_importo,2))) then raise exception 'Dati pagamento non validi'; end if;
 payload:=jsonb_build_object('costo',p_costo,'importo',p_importo,'data',p_data,'metodo',p_metodo,'riferimento',p_riferimento,'banca',p_banca,'esistente',p_esistente);
 select * into pn from public.prima_nota_entries where company_id=c.company_id and payment_request_id=p_richiesta;
 if pn.id is not null then
  if pn.payment_payload is distinct from payload then raise exception 'Richiesta già usata con dati diversi'; end if;
  return public.spesa_pagamento_sincronizza(c.id)||jsonb_build_object('prima_nota_id',pn.id,'gia_registrato',true);
 end if;
 totale:=public.spesa_pagamento_totale(c.id);
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0) into pagato
 from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 v_compensato:=public.anticipi_compensati_costo(c.company_id,c.id,current_date);
 pagato:=pagato+v_compensato;
 select coalesce(sum(paid_amount),0) into altra from public.scadenze where cost_id=c.id and company_id=c.company_id and direction='uscita' and status<>'annullata';
 -- L'addebito della banca è la prova che i soldi sono usciti: chiude anche un costo segnato pagato senza cassa.
 if p_banca is null and ((c.is_paid and pagato=0) or altra>pagato+0.01) then raise exception 'Pagamento storico da riconciliare: nessuna nuova uscita creata'; end if;
 -- Pagamento già registrato dello stesso importo: si aggancia quello, non se ne crea un altro.
 if v_esistente is null and p_banca is not null and pagato>v_compensato then
  select x.id into v_esistente from public.prima_nota_entries x
   where x.company_id=c.company_id and x.cost_id=c.id and x.direction='uscita' and x.bank_transaction_id is null
     and x.amount=(select abs(b.amount) from public.bank_transactions b where b.id=p_banca and b.company_id=c.company_id)
     and not exists(select 1 from public.prima_nota_entries r where r.reversal_of=x.id)
   order by x.entry_date desc, x.id limit 1;
 end if;
 if v_esistente is not null then
  select * into pn from public.prima_nota_entries where id=v_esistente and company_id=c.company_id and direction='uscita' for update;
  if pn.id is null or pn.cost_id is distinct from c.id or exists(select 1 from public.prima_nota_entries where reversal_of=pn.id) then raise exception 'Pagamento esistente non valido per questo costo'; end if;
  if lower(coalesce(pn.payment_method,'')) in ('contanti','cash','mp01') or (pn.bank_account_id is null and lower(coalesce(pn.account_label,'')) like 'cassa%') then
   raise exception 'Questo pagamento è in contanti: collega la banca alla quota pagata tramite conto.' using errcode='23514';
  end if;
  if p_banca is null then raise exception 'Scegli il movimento bancario da collegare'; end if;
  idpn:=pn.id; importo:=pn.amount;
 else
  if p_banca is not null and pagato>v_compensato then raise exception 'Sono già presenti pagamenti: collega quello esistente o registra separatamente il nuovo acconto'; end if;
  importo:=coalesce(p_importo,totale-pagato);
  if importo is null or importo<=0 or pagato+importo>totale then
   if p_importo is null and pagato>=totale and p_banca is null then return jsonb_build_object('gia_registrato',true,'pagato',pagato,'residuo',0); end if;
   raise exception 'Importo superiore al residuo o documento già pagato';
  end if;
 end if;
 if p_banca is not null then
  select * into tx from public.bank_transactions where id=p_banca and company_id=c.company_id for update;
  if tx.id is null or tx.transaction_type<>'debit' or coalesce(tx.currency,'EUR')<>'EUR' or abs(tx.amount)<>importo then raise exception 'Movimento non compatibile: importo o azienda diversi'; end if;
  if (pn.bank_transaction_id is not null and pn.bank_transaction_id<>tx.id)
   or exists(select 1 from public.prima_nota_entries where bank_transaction_id=tx.id and id is distinct from idpn)
   or exists(select 1 from public.bank_reconciliations where transaction_id=tx.id and unmatched_at is null)
   or tx.linked_invoice_id is not null or tx.linked_installment_id is not null or tx.linked_scadenza_id is not null
   or (tx.reconciliation_status='reconciled' and (tx.linked_cost_id is distinct from c.id or idpn is null))
   or (tx.linked_cost_id is not null and tx.linked_cost_id<>c.id) then raise exception 'Movimento bancario già abbinato'; end if;
 end if;
 if idpn is null then
  insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,reference_number,cost_id,order_id,supplier_id,is_auto,auto_source,created_by,payment_request_id,payment_payload,bank_transaction_id)
  values(c.company_id,'uscita','fornitore','Pagamento: '||c.name,importo,p_data,p_metodo,p_riferimento,c.id,c.order_id,c.supplier_id,true,'company_cost_payment',auth.uid(),p_richiesta,payload,p_banca) returning id into idpn;
 elsif p_banca is not null then
  update public.prima_nota_entries set bank_transaction_id=p_banca where id=idpn;
 end if;
 if p_banca is not null then
  update public.bank_transactions set linked_cost_id=c.id,reconciliation_status='reconciled',reconciled_at=now() where id=p_banca;
 end if;
 risultato:=public.spesa_pagamento_sincronizza(c.id);
 return risultato||jsonb_build_object('prima_nota_id',idpn,'gia_registrato',v_esistente is not null);
end $function$;

CREATE OR REPLACE FUNCTION public.spesa_pagamento_sincronizza(p_costo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.company_costs; totale numeric; pagato numeric; residuo numeric; quota numeric; s record; ultima date;
begin
 select * into c from public.company_costs where id=p_costo for update;
 perform public.spesa_pagamento_autorizza(c.company_id);
 totale:=public.spesa_pagamento_totale(c.id);
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),max(p.entry_date)
 into pagato,ultima from public.prima_nota_entries p where p.company_id=c.company_id and
 (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 pagato:=pagato+public.anticipi_compensati_costo(c.company_id,c.id,current_date);
 ultima:=greatest(ultima,(select max(a.data) from public.anticipi_compensazioni_costo(c.company_id,c.id,current_date) a));
 if c.is_paid and pagato=0 and not exists(select 1 from public.prima_nota_entries where cost_id=c.id and reversal_of is not null) and not public.anticipo_costo_ha_storico(c.company_id,c.id) then raise exception 'Pagamento storico da riconciliare'; end if;
 if totale is null or totale<=0 or pagato<0 or pagato>totale+0.01 then raise exception 'Importi da riconciliare prima di registrare pagamenti'; end if;
 -- Non cambia il costo imponibile: il pagamento modifica soltanto la cassa.
 update public.company_costs set is_paid=(pagato>=totale),paid_date=case when pagato>=totale then ultima else null end where id=c.id;
 residuo:=pagato;
 for s in select * from public.scadenze where cost_id=c.id and company_id=c.company_id and direction='uscita' and status<>'annullata' order by due_date,id for update loop
  quota:=least(s.amount,greatest(0,residuo)); residuo:=residuo-quota;
  update public.scadenze set paid_amount=quota,status=case when quota>=amount then 'pagata' when quota>0 then 'parziale' else 'da_pagare' end,
   paid_date=case when quota>0 then ultima else null end where id=s.id;
 end loop;
 return jsonb_build_object('totale',totale,'pagato',pagato,'residuo',greatest(0,totale-pagato));
end $function$;

CREATE OR REPLACE FUNCTION public.dettaglio_pagamento_costo(p_costo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.company_costs; totale numeric; pagato numeric; compensato numeric; righe jsonb;
begin
 select * into c from public.company_costs where id=p_costo;
 if c.id is null or auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(c.company_id)
 or not (coalesce(public.puo_vedere_costi(auth.uid(), c.company_id),false) or public.user_can_read_accountant_company(c.company_id))
 then raise exception 'Costo non disponibile' using errcode='42501'; end if;
 select round(coalesce((select sum(case when tipo_documento in ('TD04','TD08','passive_credit_note') then -abs(totale_documento) else totale_documento end) from public.fatture_ricevute where company_cost_id=c.id and company_id=c.company_id and coalesce(stato,'') not in ('annullata','scartata','rifiutata')),c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),2) into totale;
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'importo',p.amount,'direzione',p.direction,'banca',p.bank_transaction_id,'riferimento',p.reference_number,'storno_di',p.reversal_of,'conto',p.account_label,'metodo',p.payment_method,'bank_account_id',p.bank_account_id) order by p.entry_date,p.created_at),'[]'::jsonb)
 into pagato,righe from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 compensato:=public.anticipi_compensati_costo(c.company_id,c.id,current_date);
 pagato:=pagato+compensato;
 return jsonb_build_object('id',c.id,'company_id',c.company_id,'nome',c.name,'totale',totale,'pagato',pagato,'residuo',greatest(0,totale-pagato),'da_verificare',(c.is_paid and pagato=0 and totale<>0 and not exists(select 1 from public.rate_fornitori r where r.company_cost_id=c.id and r.stato='stornata')) or pagato>totale or exists(select 1 from public.scadenze where company_id=c.company_id and cost_id=c.id and paid_amount>pagato),'movimenti',righe,'compensato',compensato,'puo_compensare',
   c.supplier_id IS NOT NULL AND c.annullato_il IS NULL AND public.contabilita_puo_scrivere(c.company_id)
     AND EXISTS(SELECT 1 FROM public.companies co WHERE co.id=c.company_id AND co.contabilita_generale_attiva));
end $function$;

CREATE OR REPLACE FUNCTION public.scadenzario_fonti(p_company_id uuid)
 RETURNS SETOF scadenze
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.assert_company_access(p_company_id);
  if not public.ai_is_service_role() and not public.puo_vedere_scadenze(p_company_id) then
    raise exception 'Non hai il permesso di vedere le scadenze.' using errcode = '42501';
  end if;

  -- Mantiene identità e azioni delle scadenze esistenti. La data convenzionale
  -- «ignota» non diventa una scadenza nell'anno 9999.
  return query select (jsonb_populate_record(null::public.scadenze,
    to_jsonb(s) || jsonb_build_object('due_date', nullif(s.due_date, date '9999-12-31')))).*
    from public.scadenze s where s.company_id = p_company_id;

  -- Costi senza una propria scadenza: totale lordo come nel pagamento delle spese,
  -- pagamenti al netto degli storni. Le rate fornitore sostituiscono il totale,
  -- con il pagato allocato una sola volta in ordine di scadenza.
  return query
  with costi as materialized (
    select c.*,
      round(coalesce((select sum(case when f.tipo_documento in ('TD04','TD08','passive_credit_note')
                       then -abs(f.totale_documento) else f.totale_documento end)
        from public.fatture_ricevute f where f.company_cost_id=c.id and f.company_id=c.company_id
          and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata')),
        c.amount * (1 + coalesce(c.vat_rate,0)/100)) - public.costo_stornato_da_note(c.id),2) as lordo,
      coalesce((select sum(case when p.direction='uscita' then p.amount else -p.amount end)
        from public.prima_nota_entries p where p.cost_id=c.id and p.company_id=c.company_id),0) + public.anticipi_compensati_costo(c.company_id,c.id,current_date) as versato
    from public.company_costs c
    where c.company_id=p_company_id and c.annullato_il is null and c.amount>0
      and not exists(select 1 from public.scadenze s where s.company_id=c.company_id and s.cost_id=c.id)
  ), quote as (
    select c.id as costo, r.id::text as chiave, r.importo as importo,
      nullif(r.scadenza,date '9999-12-31') as data, r.metodo as metodo,
      r.stato='pagata' as pagata,
      coalesce(sum(r.importo) filter(where r.stato='pagata') over(partition by c.id),0) as chiuse,
      coalesce(sum(r.importo) filter(where r.stato<>'pagata') over(partition by c.id order by r.scadenza nulls last,r.numero,r.id
        rows between unbounded preceding and 1 preceding),0) as precedente
    from costi c join public.rate_fornitori r on r.company_cost_id=c.id and r.company_id=c.company_id
    where r.stato<>'stornata' and r.importo>0
    union all
    select c.id,'totale',c.lordo,nullif(c.due_date,date '9999-12-31'),c.payment_method,false,0,0
    from costi c where not exists(select 1 from public.rate_fornitori r
      where r.company_cost_id=c.id and r.company_id=c.company_id and r.stato<>'stornata')
  )
  select (jsonb_populate_record(null::public.scadenze,jsonb_build_object(
    'id',md5('scadenzario:costo:'||c.id::text||':'||q.chiave)::uuid,'company_id',c.company_id,
    'tipo',case when c.supplier_id is null then 'costo_aziendale' else 'pagamento_fornitore' end,
    'direction','uscita','description',c.name,'amount',q.importo,'due_date',q.data,
    'paid_amount',p.importo,
    'status',case when p.importo>=q.importo then 'pagata' when p.importo>0 then 'parziale' else 'da_pagare' end,
    'paid_date',c.paid_date,'payment_method',q.metodo,'cost_id',c.id,'order_id',c.order_id,
    'supplier_id',c.supplier_id,'is_auto_generated',true,'auto_source','fonte_costo',
    'created_at',c.created_at,'updated_at',c.updated_at))).*
  from costi c join quote q on q.costo=c.id
  cross join lateral (select case when c.is_paid or q.pagata then q.importo
    else least(q.importo,greatest(0,c.versato-q.chiuse-q.precedente)) end as importo) p
  where q.importo>0;

  -- Il residuo delle commesse viene dalla regola comune del cruscotto, comprese
  -- le commesse storiche senza piano. I diritti sulle commesse restano quelli
  -- della RPC esistente e delle policy di orders (invoker).
  if public.ai_is_service_role() or public.user_can_read_accountant_company(p_company_id)
     or coalesce(public.has_permission_for_company(auth.uid(),'can_view_orders',p_company_id),false)
     or coalesce(public.has_permission_for_company(auth.uid(),'can_view_cruscotto',p_company_id),false) then
    return query
    select (jsonb_populate_record(null::public.scadenze,jsonb_build_object(
      'id',md5('scadenzario:rata:'||r.id)::uuid,'company_id',o.company_id,
      'tipo','incasso_cliente','direction','entrata',
      'description',concat_ws(' — ',coalesce(i.label,'Importo da pianificare'),o.order_code,
        coalesce(o.client_company,o.client_name)),
      'amount',r.amount,'due_date',nullif(r.expected_date,date '9999-12-31'),
      'paid_amount',0,'status','da_pagare','order_id',o.id,'payment_method',o.payment_type,
      'is_auto_generated',true,'auto_source','fonte_commessa',
      'created_at',o.created_at,'updated_at',o.updated_at))).*
    from public.cruscotto_rate_da_incassare(p_company_id) r
    join public.orders o on o.id=r.order_id and o.company_id=p_company_id and o.deleted_at is null
    left join public.order_installments i on i.id::text=r.id and i.order_id=o.id
    where r.amount>0
      -- Le scadenze già esplicite della commessa hanno precedenza: non si
      -- aggiunge una seconda previsione dello stesso credito.
      and not exists(select 1 from public.scadenze s where s.company_id=o.company_id
        and s.order_id=o.id and s.direction='entrata' and s.status<>'annullata')
      and not exists(select 1 from public.scadenze s where s.company_id=o.company_id and (
        s.invoice_id=i.invoice_id or s.notes like '%[DOC:'||coalesce(i.documento_fiscale_id::text,r.id)||']%'));
  end if;
end;
$function$;

DO $patch$
DECLARE d text:=pg_get_functiondef('public.scadenzario_rate_fornitori(uuid)'::regprocedure);
  prima text:=d;
BEGIN
  IF strpos(d,'anticipi_compensati_costo')>0 THEN RETURN; END IF;
  d:=replace(d,'coalesce(p.versato, 0) - r.chiuse - r.precedenti',
    'coalesce(p.versato, 0) + public.anticipi_compensati_costo(p_company_id,r.company_cost_id,current_date) - r.chiuse - r.precedenti');
  IF d=prima THEN RAISE EXCEPTION 'Calcolo residuo rate fornitori inatteso'; END IF;
  EXECUTE d;
END $patch$;

CREATE OR REPLACE FUNCTION private.contabilita_storno_anticipo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_costo uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM private.anticipi_compensazioni_al(NEW.company_id, current_date) a
    JOIN public.contabilita_righe r ON r.id=a.anticipo_riga_id AND r.company_id=a.company_id
    WHERE r.scrittura_id=NEW.storno_di
  ) THEN RAISE EXCEPTION 'Storna prima le compensazioni dell’anticipo.' USING ERRCODE='23514'; END IF;
  SELECT a.costo_id INTO v_costo FROM private.compensazioni_anticipi_fornitori a
   WHERE a.company_id=NEW.company_id AND a.scrittura_id=NEW.storno_di;
  IF v_costo IS NOT NULL THEN
    IF NEW.data_registrazione<>current_date THEN
      RAISE EXCEPTION 'Per riaprire il debito, registra lo storno della compensazione alla data di oggi.' USING ERRCODE='22023';
    END IF;
    PERFORM public.spesa_pagamento_sincronizza(v_costo);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contabilita_storno_anticipo ON public.contabilita_scritture;
CREATE TRIGGER contabilita_storno_anticipo AFTER INSERT ON public.contabilita_scritture
  FOR EACH ROW WHEN (NEW.storno_di IS NOT NULL) EXECUTE FUNCTION private.contabilita_storno_anticipo();

REVOKE ALL ON FUNCTION private.anticipi_compensazioni_al(uuid,date), private.anticipi_fornitore_disponibili(uuid,uuid),
  private.contabilita_storno_anticipo() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.anticipi_compensazioni_costo(uuid,uuid,date),public.anticipi_compensati_costo(uuid,uuid,date),
  public.anticipo_costo_ha_storico(uuid,uuid),public.previsionale_compensazioni_anticipi(uuid,date),
  public.costo_anticipi_disponibili(uuid),public.compensa_costo_con_anticipo(uuid,uuid,uuid,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anticipi_compensazioni_costo(uuid,uuid,date),public.anticipi_compensati_costo(uuid,uuid,date),
  public.anticipo_costo_ha_storico(uuid,uuid),public.previsionale_compensazioni_anticipi(uuid,date) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.costo_anticipi_disponibili(uuid),public.compensa_costo_con_anticipo(uuid,uuid,uuid,numeric,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.cg_debiti_fornitori_al(p_company uuid,p_rif date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  WITH compensazioni AS (
    SELECT a.costo_id,sum(a.importo) importo FROM private.anticipi_compensazioni_al($1,$2) a GROUP BY a.costo_id
  ), costi AS (
    SELECT c.id, c.is_paid, c.paid_date,
      coalesce(c.mese_competenza,c.documento_data,f.data,c.due_date,c.created_at::date) data,
      greatest(coalesce(f.lordo,c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),0) lordo,
      coalesce(p.versato,0)+coalesce(b.versato,0)+coalesce(a.importo,0) versato,
      coalesce(p.numero,0)+coalesce(b.numero,0) fonti_pagamento
    FROM public.company_costs c
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN f.tipo_documento IN ('TD04','TD08','passive_credit_note')
        THEN -abs(coalesce(f.netto_a_pagare,f.totale_documento)) ELSE coalesce(f.netto_a_pagare,f.totale_documento) END) lordo,
        count(*) numero,min(f.data_fattura) data
      FROM public.fatture_ricevute f WHERE f.company_cost_id=c.id AND f.company_id=c.company_id
        AND coalesce(f.stato,'') NOT IN ('annullata','scartata','rifiutata')
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN n.direction='uscita' THEN n.amount ELSE -n.amount END) versato,count(*) numero
      FROM public.prima_nota_entries n WHERE n.company_id=c.company_id AND n.entry_date<=$2
        AND (n.cost_id=c.id OR n.scadenza_id IN(SELECT s.id FROM public.scadenze s WHERE s.company_id=c.company_id AND s.cost_id=c.id))
    ) p ON true
    LEFT JOIN LATERAL (
      SELECT sum(abs(coalesce(t.amount_eur,t.amount))) versato,count(*) numero
      FROM public.bank_transactions t WHERE t.company_id=c.company_id AND t.linked_cost_id=c.id
        AND t.transaction_type='debit' AND coalesce(t.status,'booked')='booked'
        AND coalesce(t.value_date,t.booking_date)<=$2
        AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=c.company_id AND n.bank_transaction_id=t.id)
    ) b ON true
    LEFT JOIN compensazioni a ON a.costo_id=c.id
    WHERE c.company_id=$1 AND c.amount IS NOT NULL AND (c.annullato_il IS NULL OR c.annullato_il::date>$2)
      AND (f.numero>0 OR c.supplier_id IS NOT NULL)
  )
  SELECT coalesce((
    SELECT sum(CASE WHEN c.fonti_pagamento=0 AND c.versato=0 AND c.is_paid AND c.paid_date<=$2 THEN 0
      ELSE greatest(c.lordo-c.versato,0) END)
    FROM costi c WHERE c.data<=$2
  ),0) + coalesce((
    SELECT sum(greatest(s.amount-CASE WHEN s.paid_date>$2 THEN 0
      WHEN s.status='pagata' THEN s.amount ELSE coalesce(s.paid_amount,0) END,0))
    FROM public.scadenze s WHERE s.company_id=$1 AND s.direction='uscita' AND NOT coalesce(s.is_previsionale,false)
      AND s.status NOT IN ('annullata','cancelled') AND s.invoice_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM costi c WHERE c.id=s.cost_id)
      AND (s.due_date<=$2 OR s.created_at::date<=$2)
      AND (s.tipo='pagamento_fornitore' OR (s.tipo='costo_aziendale' AND s.due_date<=$2))
  ),0)
$$;
REVOKE ALL ON FUNCTION private.cg_debiti_fornitori_al(uuid,date) FROM PUBLIC, anon, authenticated;

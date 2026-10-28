set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.spesa_pagamento_autorizza(p_company uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 -- JWT service_role verificato da PostgREST: automazione server esistente,
 -- mai user_metadata. Lo stesso ruolo ha già accesso ai registri sottostanti.
 if auth.uid() is null and coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
 or not public.user_can_access_company(p_company)
 or not (coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false)
         or public.user_can_write_accountant_company(p_company)) then
  raise exception 'Pagamento non autorizzato per questa azienda' using errcode='42501';
 end if;
end $$;

create or replace function public.riconcilia_uscita_scadenza(p_transazione uuid,p_scadenza uuid,p_tipo text default 'manual',p_punteggio integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.bank_transactions; s public.scadenze; importo numeric; pn uuid; r jsonb; servizio boolean:=auth.uid() is null and coalesce(auth.jwt()->>'role','')='service_role';
begin
 select * into t from public.bank_transactions where id=p_transazione;
 if t.id is null then raise exception 'Movimento non disponibile'; end if;
 if not servizio and (auth.uid() is null or not public.user_can_access_company(t.company_id) or public.utente_sola_lettura(t.company_id) or not public.puo_gestire_scadenze(t.company_id)) then raise exception 'Riconciliazione non autorizzata' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(t.company_id::text,2810));
 select * into t from public.bank_transactions where id=p_transazione for update;
 select * into s from public.scadenze where id=p_scadenza and company_id=t.company_id for update;
 if s.id is null or s.direction<>'uscita' or s.status='annullata' or t.transaction_type<>'debit' or coalesce(t.currency,'EUR')<>'EUR' then raise exception 'Scadenza e addebito non compatibili'; end if;
 if exists(select 1 from public.bank_reconciliations where transaction_id=t.id and scadenza_id=s.id and unmatched_at is null and notes like '[PAGAMENTO_UNICO]%') then return jsonb_build_object('gia_registrato',true); end if;
 if t.linked_invoice_id is not null or t.linked_cost_id is not null or t.linked_scadenza_id is not null or t.linked_installment_id is not null or t.reconciliation_status='reconciled'
 or exists(select 1 from public.prima_nota_entries where bank_transaction_id=t.id)
 or exists(select 1 from public.bank_reconciliations where transaction_id=t.id and unmatched_at is null) then raise exception 'Movimento già riconciliato'; end if;
 importo:=abs(t.amount);
 if importo<=0 or importo>coalesce(s.amount,0)-coalesce(s.paid_amount,0) then raise exception 'Addebito superiore al residuo: ripartisci o verifica il movimento'; end if;
 if s.cost_id is not null then
  r:=public.registra_pagamento_costo(s.cost_id,t.id,importo,coalesce(t.booking_date,current_date),'bonifico',null,t.id);
  pn:=(r->>'prima_nota_id')::uuid;
  if not exists(select 1 from public.scadenze where id=s.id and paid_amount=s.paid_amount+importo) then raise exception 'Verifica le altre scadenze del costo prima di riconciliare questa'; end if;
 else
  r:=public.mark_scadenza_paid_con_richiesta(s.id,importo,'bonifico',coalesce(t.booking_date,current_date),null,'banca',t.id)::jsonb;
  if r ? 'error' then raise exception '%',r->>'error'; end if;
  pn:=(r->>'prima_nota_entry_id')::uuid;
  update public.prima_nota_entries set bank_transaction_id=t.id where id=pn and company_id=s.company_id;
 end if;
 if pn is null then raise exception 'Pagamento non registrato'; end if;
 update public.bank_transactions set linked_scadenza_id=s.id,reconciliation_status='reconciled',reconciled_at=now() where id=t.id;
 insert into public.bank_reconciliations(company_id,transaction_id,scadenza_id,matched_amount,match_type,match_score,matched_by,notes)
 values(s.company_id,t.id,s.id,importo,p_tipo,p_punteggio,auth.uid(),'[PAGAMENTO_UNICO] '||pn::text);
 return jsonb_build_object('prima_nota_id',pn,'importo',importo);
end $$;

create or replace function public.scollega_uscita_scadenza(p_riconciliazione uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare r public.bank_reconciliations;
begin
 select * into r from public.bank_reconciliations where id=p_riconciliazione;
 if r.id is null or auth.uid() is null or not public.user_can_access_company(r.company_id) or public.utente_sola_lettura(r.company_id) or not public.puo_gestire_scadenze(r.company_id) then raise exception 'Riconciliazione non autorizzata' using errcode='42501'; end if;
 if coalesce(r.notes,'') not like '[PAGAMENTO_UNICO]%' then raise exception 'Riconciliazione storica: verifica i movimenti prima di scollegare'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(r.company_id::text,2810));
 perform 1 from public.bank_transactions where id=r.transaction_id and company_id=r.company_id for update;
 select * into r from public.bank_reconciliations where id=p_riconciliazione for update;
 if r.unmatched_at is not null then return; end if;
 update public.prima_nota_entries set bank_transaction_id=null where bank_transaction_id=r.transaction_id and company_id=r.company_id;
 update public.bank_transactions set linked_scadenza_id=null,linked_cost_id=null,reconciliation_status='pending',reconciled_at=null where id=r.transaction_id and company_id=r.company_id;
 update public.bank_reconciliations set unmatched_at=now() where id=r.id;
 -- Scollegare la banca non annulla un pagamento già eseguito.
end $$;
revoke all on function public.riconcilia_uscita_scadenza(uuid,uuid,text,integer),public.scollega_uscita_scadenza(uuid) from public,anon;
grant execute on function public.riconcilia_uscita_scadenza(uuid,uuid,text,integer),public.scollega_uscita_scadenza(uuid) to authenticated;
grant execute on function public.riconcilia_uscita_scadenza(uuid,uuid,text,integer),public.spesa_pagamento_autorizza(uuid),public.spesa_pagamento_totale(uuid),public.spesa_pagamento_sincronizza(uuid),public.registra_pagamento_costo(uuid,uuid,numeric,date,text,text,uuid,uuid),public.mark_scadenza_paid_con_richiesta(uuid,numeric,text,date,text,text,uuid) to service_role;
CREATE OR REPLACE FUNCTION public.mark_scadenza_paid_con_richiesta(p_scadenza_id uuid, p_amount numeric, p_payment_method text DEFAULT 'bonifico'::text, p_payment_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_account_label text DEFAULT 'banca'::text, p_request uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scadenza RECORD;
  v_remaining NUMERIC;
  v_new_paid NUMERIC;
  v_new_status TEXT;
  v_pn_id UUID;
  v_direction TEXT;
  v_category TEXT;
  v_payload jsonb;
  v_cost_total numeric;
  v_cost_paid numeric;
  v_previous public.prima_nota_entries;
BEGIN
  SELECT * INTO v_scadenza FROM scadenze WHERE id = p_scadenza_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Scadenza non trovata');
  END IF;

  -- SICUREZZA (P0): la funzione è SECURITY DEFINER (bypassa RLS). Senza questo
  -- assert un utente di un'altra azienda (o anon con la key pubblica) poteva
  -- marcare pagata una scadenza altrui creando prima nota nella cassa altrui.
  IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN PERFORM public.assert_company_access(v_scadenza.company_id); END IF;
  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(v_scadenza.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare pagamenti.' USING ERRCODE = '42501';
  END IF;

  if coalesce(auth.jwt()->>'role','')<>'service_role' and (public.utente_sola_lettura(v_scadenza.company_id) or auth.uid() is null) then raise exception 'Pagamento non autorizzato' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_scadenza.company_id::text,2810));
  select * into v_scadenza from public.scadenze where id=p_scadenza_id for update;
  if p_request is null or p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2)
  or p_payment_date is null or p_payment_date>current_date then raise exception 'Dati pagamento non validi'; end if;
  v_payload:=jsonb_build_object('scadenza',p_scadenza_id,'importo',p_amount,'data',p_payment_date,'metodo',p_payment_method,'notes',p_notes,'conto',p_account_label);
  select * into v_previous from public.prima_nota_entries where company_id=v_scadenza.company_id and payment_request_id=p_request;
  if v_previous.id is not null then
   if v_previous.payment_payload is distinct from v_payload then raise exception 'Richiesta già usata con dati diversi'; end if;
   return json_build_object('success',true,'gia_registrato',true,'prima_nota_entry_id',v_previous.id);
  end if;
  if v_scadenza.status='annullata' then raise exception 'Scadenza annullata'; end if;
  if v_scadenza.cost_id is not null then
   perform public.spesa_pagamento_autorizza(v_scadenza.company_id);
   perform 1 from public.company_costs where id=v_scadenza.cost_id and company_id=v_scadenza.company_id for update;
   if not found then raise exception 'Costo non appartenente alla scadenza'; end if;
   v_cost_total:=public.spesa_pagamento_totale(v_scadenza.cost_id);
   select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0) into v_cost_paid from public.prima_nota_entries p
    where p.company_id=v_scadenza.company_id and (p.cost_id=v_scadenza.cost_id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=v_scadenza.cost_id));
   if exists(select 1 from public.company_costs where id=v_scadenza.cost_id and is_paid and v_cost_paid=0) then raise exception 'Pagamento storico da riconciliare'; end if;
   if v_cost_total is null or v_cost_paid+p_amount>v_cost_total then raise exception 'Importo superiore al residuo del costo'; end if;
  end if;

  -- La scadenza di una fattura emessa si incassa dalla fattura: così l'incasso entra una volta sola
  -- (movimento, prima nota, rata).
  IF coalesce(v_scadenza.notes, '') LIKE '%[DOC:%' THEN
    RETURN json_build_object('error', 'Questa scadenza è di una fattura: registra l''incasso dalla fattura.');
  END IF;

  v_remaining := v_scadenza.amount - v_scadenza.paid_amount;
  IF p_amount <= 0 OR p_amount > v_remaining THEN
    RETURN json_build_object('error', 'Importo non valido. Residuo: ' || v_remaining);
  END IF;

  v_new_paid := v_scadenza.paid_amount + p_amount;
  IF v_new_paid >= v_scadenza.amount THEN
    v_new_status := 'pagata';
  ELSE
    v_new_status := 'parziale';
  END IF;

  IF v_scadenza.direction = 'entrata' THEN
    v_direction := 'entrata';
    v_category := 'incasso';
  ELSE
    v_direction := 'uscita';
    v_category := CASE v_scadenza.tipo
      WHEN 'pagamento_fornitore' THEN 'fornitore'
      WHEN 'costo_aziendale' THEN 'costo'
      WHEN 'scadenza_fiscale' THEN 'fiscale'
      ELSE 'altro'
    END;
  END IF;

  INSERT INTO prima_nota_entries (
    company_id, direction, category, description, amount, entry_date,
    payment_method, supplier_id, invoice_id, order_id, scadenza_id,
    order_item_id, account_label, is_auto, auto_source, notes, created_by, cost_id, payment_request_id, payment_payload
  ) VALUES (
    v_scadenza.company_id, v_direction, v_category,
    'Pagamento: ' || v_scadenza.description,
    p_amount, p_payment_date, p_payment_method,
    v_scadenza.supplier_id, v_scadenza.invoice_id, v_scadenza.order_id,
    p_scadenza_id, v_scadenza.order_item_id, p_account_label,
    true, 'scadenzario', p_notes,
    (SELECT auth.uid()), v_scadenza.cost_id, p_request, v_payload
  )
  RETURNING id INTO v_pn_id;

  UPDATE scadenze SET
    paid_amount = v_new_paid,
    status = v_new_status,
    paid_date = p_payment_date,
    payment_method = p_payment_method,
    prima_nota_entry_id = v_pn_id,
    updated_at = NOW()
  WHERE id = p_scadenza_id;

  if v_scadenza.cost_id is not null then
   update public.company_costs set is_paid=(v_cost_paid+p_amount>=v_cost_total),paid_date=case when v_cost_paid+p_amount>=v_cost_total then p_payment_date else null end where id=v_scadenza.cost_id and company_id=v_scadenza.company_id;
  end if;
  RETURN json_build_object(
    'success', true,
    'new_status', v_new_status,
    'paid_amount', v_new_paid,
    'prima_nota_entry_id', v_pn_id
  );
END;
$function$
;


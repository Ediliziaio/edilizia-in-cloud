-- Dipendenze finanziarie correnti: snapshot del 19/11/2026 per i test PostgreSQL isolati.
CREATE OR REPLACE FUNCTION public.costo_allinea_rate_fornitori()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_setting('rate_fornitori.da_rata', true) = 'on' then
    return null;
  end if;
  if new.is_paid is not distinct from old.is_paid then
    return null;
  end if;

  if coalesce(new.is_paid, false) then
    update public.rate_fornitori
       set stato = 'pagata', pagata_il = coalesce(new.paid_date, pagata_il)
     where company_cost_id = new.id and stato not in ('pagata', 'stornata');
    if coalesce(new.amount, 0) > 0 then
      update public.fatture_ricevute
         set pagata_il = coalesce(new.paid_date, (now() at time zone 'Europe/Rome')::date),
             pagamento_segnato_da = coalesce(pagamento_segnato_da, auth.uid()),
             pagamento_segnato_at = coalesce(pagamento_segnato_at, now())
       where company_cost_id = new.id and company_id = new.company_id and pagata_il is null;
    end if;
  else
    update public.rate_fornitori
       set stato = 'da_pagare', pagata_il = null
     where company_cost_id = new.id and stato = 'pagata';
    update public.fatture_ricevute
       set pagata_il = null
     where company_cost_id = new.id and company_id = new.company_id and pagata_il is not null;
  end if;
  return null;
end
$function$
;
CREATE OR REPLACE FUNCTION public.prima_nota_elimina(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare p public.prima_nota_entries%rowtype; v_motivo text; v_n integer; v_pag integer;
begin
  select * into p from public.prima_nota_entries where id=p_id for update;
  if not found then raise exception 'Registrazione non trovata o non visibile.' using errcode='P0002'; end if;
  v_motivo:=public.prima_nota_modificabile(p);
  if v_motivo is not null then raise exception '%',v_motivo using errcode='P0001'; end if;
  delete from public.invoice_payments where reference='prima_nota:'||p.id and company_id=p.company_id;
  get diagnostics v_pag=row_count;
  delete from public.prima_nota_entries where id=p.id;
  get diagnostics v_n=row_count;
  if v_n<>1 then raise exception 'Non hai il permesso di eliminare questa registrazione.' using errcode='42501'; end if;
  return jsonb_build_object('eliminata',true,'incassi_tolti',v_pag,'invoice_id',p.invoice_id);
end; $function$
;
CREATE OR REPLACE FUNCTION public.prima_nota_modificabile(p prima_nota_entries)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p.is_auto THEN 'È una registrazione automatica: si cambia dal documento che l''ha creata.'
    WHEN p.documento_fiscale_id IS NOT NULL THEN 'È l''incasso di una fattura emessa dal programma: si annulla dalla fattura.'
    WHEN p.bank_transaction_id IS NOT NULL THEN 'Viene dalla riconciliazione bancaria: si cambia da Tesoreria.'
    WHEN p.cost_id IS NOT NULL THEN 'È il pagamento di un costo: si cambia dal costo.'
  END;
$function$
;
CREATE OR REPLACE FUNCTION public.rate_fornitori_allinea_costo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cost       uuid := coalesce(new.company_cost_id, old.company_cost_id);
  v_aperte     integer;
  v_totali     integer;
  v_ultima     date;
  v_prossima   date;
  v_is_paid    boolean;
  v_scadenza   date;
begin
  select count(*) filter (where stato not in ('pagata', 'stornata')),
         count(*),
         max(pagata_il),
         min(scadenza) filter (where stato not in ('pagata', 'stornata'))
    into v_aperte, v_totali, v_ultima, v_prossima
    from public.rate_fornitori where company_cost_id = v_cost;
  if v_totali = 0 then
    return null;
  end if;

  select is_paid, due_date into v_is_paid, v_scadenza
    from public.company_costs where id = v_cost;

  perform set_config('rate_fornitori.da_rata', 'on', true);
  if v_aperte = 0 and not coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = true, paid_date = v_ultima, updated_at = now()
     where id = v_cost;
  elsif v_aperte > 0 and coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = false, paid_date = null, updated_at = now()
     where id = v_cost;
  end if;
  if v_prossima is not null and v_prossima is distinct from v_scadenza then
    update public.company_costs
       set due_date = v_prossima, updated_at = now()
     where id = v_cost;
  end if;
  perform set_config('rate_fornitori.da_rata', 'off', true);
  return null;
end
$function$
;
CREATE OR REPLACE FUNCTION public.rate_fornitori_prima_di_salvare()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.stato is distinct from old.stato then
    if 'stornata' in (new.stato, old.stato) and current_setting('rate_fornitori.da_storno', true) is distinct from 'on' then
      raise exception 'Questa rata è chiusa da una nota di credito: togli prima il collegamento della nota.' using errcode = 'P0001';
    end if;
    new.stato_cambiato_da := auth.uid();
    new.stato_cambiato_il := now();
    if new.stato = 'pagata' and new.pagata_il is null then
      new.pagata_il := (now() at time zone 'Europe/Rome')::date;
    elsif new.stato <> 'pagata' then
      new.pagata_il := null;
    end if;
  end if;
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.spesa_pagamento_autorizza(p_company uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 -- JWT service_role verificato da PostgREST: automazione server esistente,
 -- mai user_metadata. Lo stesso ruolo ha già accesso ai registri sottostanti.
 if auth.uid() is null and coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
 or not public.user_can_access_company(p_company)
 or not (coalesce(public.puo_vedere_costi(auth.uid(), p_company),false)
         or public.user_can_write_accountant_company(p_company)) then
  raise exception 'Pagamento non autorizzato per questa azienda' using errcode='42501';
 end if;
end $function$
;
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
 if c.is_paid and pagato=0 and not exists(select 1 from public.prima_nota_entries where cost_id=c.id and reversal_of is not null) then raise exception 'Pagamento storico da riconciliare'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.spesa_pagamento_totale(p_costo uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare azienda uuid; valore numeric;
begin
 select company_id into azienda from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(azienda);
 select round(coalesce((select sum(case when f.tipo_documento in ('TD04','TD08','passive_credit_note') then -abs(f.totale_documento) else f.totale_documento end)
 from public.fatture_ricevute f where f.company_cost_id=c.id and f.company_id=c.company_id
 and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata')),
 c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),2) into valore from public.company_costs c where c.id=p_costo;
 return valore;
end $function$
;

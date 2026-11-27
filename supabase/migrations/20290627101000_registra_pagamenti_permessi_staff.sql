-- L'accesso ai costi abilita i pagamenti anche quando Prima Nota non è visibile.
-- Le tre operazioni qui sotto leggono soltanto i movimenti dei costi autorizzati;
-- le policy RLS della Prima Nota e della Tesoreria rimangono invariate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Non estendere implicitamente a chi può soltanto vedere i costi. La sola
-- compatibilità con la Prima Nota riguarda le operazioni che già funzionavano.
create or replace function private.puo_gestire_pagamenti_costi(p_company uuid, p_prima_nota_precedente boolean)
returns boolean language sql stable security invoker set search_path = '' as $function$
  select case when auth.uid() is null then coalesce(auth.jwt()->>'role','') = 'service_role'
    else coalesce(public.has_permission_for_company(auth.uid(),'can_manage_payments',p_company),false)
      or coalesce(public.user_can_write_accountant_company(p_company),false)
      or coalesce((p_prima_nota_precedente and p_company = public.get_my_company_id()
        and coalesce(public.contabilita_puo_leggere(p_company),false)),false) end
$function$;
revoke all on function private.puo_gestire_pagamenti_costi(uuid,boolean) from public,anon,authenticated,service_role;

create or replace function private.registra_pagamento_costo_con_conto_autorizzato(
  p_costo uuid, p_richiesta uuid, p_importo numeric, p_data date, p_metodo text, p_riferimento text,
  p_conto_banca uuid default null, p_conto_liquidita uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare c public.company_costs; p public.prima_nota_entries; risultato jsonb;
begin
  select * into c from public.company_costs where id = p_costo;
  if not found then raise exception 'Costo non disponibile' using errcode = '42501'; end if;
  perform public.spesa_pagamento_autorizza(c.company_id);
  if not private.puo_gestire_pagamenti_costi(c.company_id,true) then
    raise exception 'Non hai il permesso di gestire i pagamenti.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text, 2810));
  perform 1 from public.company_costs where id = c.id and company_id = c.company_id for update;
  if not found then raise exception 'Costo non disponibile' using errcode = '42501'; end if;

  -- La vista applica i permessi di Tesoreria all'utente reale, anche nel definer.
  if p_conto_banca is not null and not exists (
    select 1 from public.bank_accounts_operativi b
     where b.id = p_conto_banca and b.company_id = c.company_id and b.is_active
  ) then raise exception 'Il conto bancario non è attivo o disponibile per questa azienda' using errcode = '23514'; end if;
  -- Un UUID indovinato non deve permettere di usare il piano contabile nascosto.
  -- Il trigger della prima nota verifica inoltre che sia un conto di liquidità.
  if p_conto_liquidita is not null and (
    (not public.contabilita_puo_leggere(c.company_id)
      and not (auth.uid() is null and coalesce(auth.jwt()->>'role','') = 'service_role'))
    or not exists (select 1 from public.contabilita_conti x where x.id = p_conto_liquidita
      and x.company_id = c.company_id and x.attivo and x.movimentabile and x.natura = 'attivo')
  ) then raise exception 'Il conto di liquidità non è disponibile per questa azienda' using errcode = '23514'; end if;

  select * into p from public.prima_nota_entries where company_id = c.company_id and payment_request_id = p_richiesta;
  if p.id is not null and (p.bank_account_id is distinct from p_conto_banca or p.conto_liquidita_id is distinct from p_conto_liquidita) then
    raise exception 'Richiesta già usata con un conto diverso' using errcode = 'PT409';
  end if;
  risultato := public.registra_pagamento_costo(p_costo, p_richiesta, p_importo, p_data, p_metodo, p_riferimento, null, null);
  if risultato->>'prima_nota_id' is not null then
    update public.prima_nota_entries set bank_account_id = p_conto_banca, conto_liquidita_id = p_conto_liquidita,
      account_label = case when p_metodo in ('contanti','cash','MP01') then 'cassa' else 'banca' end
      where company_id = c.company_id and cost_id = c.id and id = (risultato->>'prima_nota_id')::uuid;
  end if;
  return risultato;
end $function$;

create or replace function private.storna_pagamenti_costo_autorizzato(p_costo uuid, p_data date default current_date)
returns void language plpgsql security definer set search_path = '' as $function$
declare c public.company_costs; movimento record; pagato numeric; scaduto numeric;
begin
  select * into c from public.company_costs where id = p_costo;
  if not found then raise exception 'Costo non disponibile' using errcode = '42501'; end if;
  perform public.spesa_pagamento_autorizza(c.company_id);
  if not private.puo_gestire_pagamenti_costi(c.company_id,true) then
    raise exception 'Non hai il permesso di gestire i pagamenti.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text, 2810));
  select * into c from public.company_costs where id = p_costo and company_id = c.company_id for update;
  if not found then raise exception 'Costo non disponibile' using errcode = '42501'; end if;
  perform 1 from public.prima_nota_entries where cost_id = c.id and company_id = c.company_id order by id for update;
  if p_data is null or p_data > current_date then raise exception 'Data storno non valida'; end if;
  if exists (select 1 from public.prima_nota_entries p where p.cost_id = c.id and p.company_id = c.company_id
     and (p.bank_transaction_id is not null or p.sal_sub_id is not null or p.unita_movimento_id is not null
       or p.documento_fiscale_id is not null or p.movimento_id is not null))
    or exists (select 1 from public.sal_sub_pagamenti q join public.prima_nota_entries p on p.id = q.prima_nota_id where p.cost_id = c.id and p.company_id = c.company_id)
    or exists (select 1 from public.bank_reconciliations b join public.prima_nota_entries p on p.id = b.prima_nota_id where p.cost_id = c.id and p.company_id = c.company_id and b.unmatched_at is null)
    or exists (select 1 from public.unita_movimenti u join public.prima_nota_entries p on p.id = u.prima_nota_id or p.id = u.storno_prima_nota_id where p.cost_id = c.id and p.company_id = c.company_id)
    or exists (select 1 from private.saldi_rapidi_fatture_ricevute s join public.prima_nota_entries p on p.id = s.movimento_id where p.cost_id = c.id and p.company_id = c.company_id and s.annullato_at is null)
  then raise exception 'Pagamento collegato a banca, SAL, unità o saldo rapido: gestisci prima il collegamento di origine'; end if;
  if c.is_paid and not exists (select 1 from public.prima_nota_entries where cost_id = c.id and company_id = c.company_id) then
    raise exception 'Pagamento storico da verificare';
  end if;
  select coalesce(sum(case when p.direction = 'uscita' then p.amount else -p.amount end),0)
    into pagato from public.prima_nota_entries p where p.company_id = c.company_id and
      (p.cost_id = c.id or exists (select 1 from public.scadenze d where d.id = p.scadenza_id and d.cost_id = c.id and d.company_id = c.company_id));
  pagato := pagato + public.anticipi_compensati_costo(c.company_id,c.id,current_date);
  select coalesce(sum(paid_amount),0) into scaduto from public.scadenze
    where cost_id = c.id and company_id = c.company_id and direction = 'uscita' and status <> 'annullata';
  if scaduto > pagato + 0.01 then raise exception 'Pagamento storico da riconciliare prima dello storno'; end if;
  for movimento in select * from public.prima_nota_entries x where x.cost_id = c.id and x.company_id = c.company_id and x.direction = 'uscita'
    and not exists (select 1 from public.prima_nota_entries r where r.reversal_of = x.id) for update loop
    insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,cost_id,order_id,is_auto,auto_source,created_by,reversal_of)
      values(c.company_id,'entrata','storno','Storno pagamento: '||c.name,movimento.amount,p_data,c.id,c.order_id,true,'storno_pagamento',auth.uid(),movimento.id);
  end loop;
  perform public.spesa_pagamento_sincronizza(c.id);
end $function$;

create or replace function private.registra_pagamenti_costi_autorizzato(p_ids uuid[], p_data date default current_date, p_storno boolean default false)
returns void language plpgsql security definer set search_path = '' as $function$
declare cid uuid; azienda uuid;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 100 or array_position(p_ids,null) is not null then
    raise exception 'Seleziona da 1 a 100 costi';
  end if;
  select company_id into azienda from public.company_costs where id = any(p_ids) limit 1;
  if azienda is null or (select count(*) from public.company_costs where id = any(p_ids) and company_id = azienda)
      <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Seleziona costi disponibili della stessa azienda';
  end if;
  perform public.spesa_pagamento_autorizza(azienda);
  if not private.puo_gestire_pagamenti_costi(azienda,true) then
    raise exception 'Non hai il permesso di gestire i pagamenti.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(azienda::text, 2810));
  for cid in select distinct unnest(p_ids) order by 1 loop
    if p_storno then perform public.storna_pagamenti_costo(cid,p_data);
    else perform public.registra_pagamento_costo(cid,gen_random_uuid(),null,p_data); end if;
  end loop;
end $function$;

-- Le API pubbliche rimangono invoker. I percorsi privilegiati sono interni e
-- verificano comunque identità, azienda e permessi anche se chiamati direttamente.
create or replace function public.registra_pagamento_costo_con_conto(
  p_costo uuid, p_richiesta uuid, p_importo numeric, p_data date, p_metodo text, p_riferimento text,
  p_conto_banca uuid default null, p_conto_liquidita uuid default null
) returns jsonb language sql security invoker set search_path = '' as $function$
  select private.registra_pagamento_costo_con_conto_autorizzato(p_costo,p_richiesta,p_importo,p_data,p_metodo,p_riferimento,p_conto_banca,p_conto_liquidita)
$function$;
create or replace function public.storna_pagamenti_costo(p_costo uuid, p_data date default current_date)
returns void language sql security invoker set search_path = '' as $function$
  select private.storna_pagamenti_costo_autorizzato(p_costo,p_data)
$function$;
create or replace function public.registra_pagamenti_costi(p_ids uuid[], p_data date default current_date, p_storno boolean default false)
returns void language sql security invoker set search_path = '' as $function$
  select private.registra_pagamenti_costi_autorizzato(p_ids,p_data,p_storno)
$function$;
revoke all on function private.registra_pagamento_costo_con_conto_autorizzato(uuid,uuid,numeric,date,text,text,uuid,uuid),
  private.storna_pagamenti_costo_autorizzato(uuid,date), private.registra_pagamenti_costi_autorizzato(uuid[],date,boolean) from public,anon;
grant execute on function private.registra_pagamento_costo_con_conto_autorizzato(uuid,uuid,numeric,date,text,text,uuid,uuid),
  private.storna_pagamenti_costo_autorizzato(uuid,date), private.registra_pagamenti_costi_autorizzato(uuid[],date,boolean) to authenticated,service_role;

-- Anche la rimozione singola richiede il permesso di gestione. Prima della
-- correzione era riservata ad amministratori e commercialisti operativi.
create or replace function private.pagamento_costo_annulla_dedicato(p_movimento uuid, p_versione timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare p public.prima_nota_entries; azienda uuid; costo uuid; prova jsonb; motivo text;
begin
  if auth.uid() is null or public.utente_bloccato() then
    raise exception 'Pagamento non disponibile per questo accesso.' using errcode = '42501';
  end if;
  select * into p from public.prima_nota_entries where id = p_movimento and public.user_can_access_company(company_id);
  if not found or p.cost_id is null or p.direction is distinct from 'uscita' then return null; end if;
  perform public.spesa_pagamento_autorizza(p.company_id);
  if not private.puo_gestire_pagamenti_costi(p.company_id,false) then
    raise exception 'Non hai il permesso di gestire i pagamenti.' using errcode = '42501';
  end if;
  azienda := p.company_id;
  costo := p.cost_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(azienda::text, 2810));
  perform 1 from public.company_costs where id = costo and company_id = azienda for update;
  if not found then raise exception 'Costo collegato non disponibile.' using errcode = '42501'; end if;
  perform 1 from public.prima_nota_entries where cost_id = costo and company_id = azienda order by id for update;
  select * into p from public.prima_nota_entries where id = p_movimento and company_id = azienda for update;
  if not found or p.cost_id is distinct from costo or p_versione is null or p.updated_at is distinct from p_versione then
    raise exception 'Il pagamento è cambiato. Ricarica la fattura prima di toglierlo.' using errcode = 'PT409';
  end if;
  motivo := public.pagamento_costo_annullabile(p);
  if motivo is not null then raise exception '%', motivo using errcode = 'P0001'; end if;
  prova := public.pagamento_saldo_rapido_aperto(p.id);
  if prova is not null then
    perform public.annulla_saldo_fattura_ricevuta((prova->>'fattura_id')::uuid, (prova->>'richiesta')::uuid);
    return jsonb_build_object('via', 'saldo_rapido', 'fattura_id', prova->>'fattura_id', 'annullato', true);
  end if;
  return private.pagamento_costo_rimuovi(p.id, p_versione) || jsonb_build_object('via', 'prima_nota', 'annullato', true);
end $function$;
revoke all on function private.pagamento_costo_annulla_dedicato(uuid,timestamptz) from public,anon;
grant execute on function private.pagamento_costo_annulla_dedicato(uuid,timestamptz) to authenticated,service_role;

-- Le azioni offerte nel pannello derivano dagli stessi controlli del database,
-- comprese le deleghe del commercialista e gli utenti in sola lettura.
do $migration$
declare definizione text; aggiornata text; inizio text := 'return jsonb_build_object(''id'',c.id,''company_id'',c.company_id,';
begin
  select pg_get_functiondef('public.dettaglio_pagamento_costo(uuid)'::regprocedure) into definizione;
  if position('''puo_registrare_pagamento''' in definizione) = 0 then
    if position(inizio in definizione) = 0 then raise exception 'Dettaglio pagamenti inatteso: permessi non aggiornati'; end if;
    aggiornata := replace(definizione, inizio, $body$return jsonb_build_object(
      'puo_registrare_pagamento', not public.utente_sola_lettura(c.company_id)
        and (coalesce(public.puo_vedere_costi(auth.uid(),c.company_id),false) or public.user_can_write_accountant_company(c.company_id))
        and private.puo_gestire_pagamenti_costi(c.company_id,true),
      'puo_togliere_pagamento', not public.utente_sola_lettura(c.company_id)
        and (coalesce(public.puo_vedere_costi(auth.uid(),c.company_id),false) or public.user_can_write_accountant_company(c.company_id))
        and private.puo_gestire_pagamenti_costi(c.company_id,false),
      'id',c.id,'company_id',c.company_id,$body$);
    execute aggiornata;
  end if;
end $migration$;

revoke all on function public.registra_pagamento_costo_con_conto(uuid,uuid,numeric,date,text,text,uuid,uuid),
  public.storna_pagamenti_costo(uuid,date), public.registra_pagamenti_costi(uuid[],date,boolean) from public,anon;
grant execute on function public.registra_pagamento_costo_con_conto(uuid,uuid,numeric,date,text,text,uuid,uuid),
  public.storna_pagamenti_costo(uuid,date), public.registra_pagamenti_costi(uuid[],date,boolean) to authenticated,service_role;

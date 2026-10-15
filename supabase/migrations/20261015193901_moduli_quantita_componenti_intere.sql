-- Quantità NUMERIC(…,2): JSON deve contenere 12, non 12.00, per il writer intero.
-- Un solo motore per anteprima e conferma. Le voci e gli importi sono letti
-- dal server: nessun prezzo, cliente o elenco di articoli arriva dal browser.
create or replace function public.converti_modulo_commessa_atomic(
  p_modulo text, p_progetto_id uuid, p_raggruppa_capitoli boolean default false,
  p_anteprima boolean default true, p_impronta text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  q jsonb; r jsonb; materiali jsonb := '[]'; fasi jsonb := '[]';
  componenti jsonb := '[]'; servizi jsonb := '[]'; ore jsonb := '[]'; voci jsonb := '[]';
  azienda uuid; profilo uuid; ordine uuid; stato uuid; esito jsonb;
  aliquota numeric; netto numeric; quantita numeric; prezzo numeric; costo numeric;
  nome text; note text; descrizione text; indirizzo text; codice text; impronta text;
  posizione integer := 0; esclusi integer := 0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode='42501';
  end if;
  if p_modulo='fv' then
    select to_jsonb(p) into q from public.fv_progetti p where id=p_progetto_id for update;
  elsif p_modulo='rst' then
    select to_jsonb(p) into q from public.rst_progetti p where id=p_progetto_id for update;
  else raise exception 'Modulo non valido.'; end if;
  if q is null then raise exception 'Preventivo non trovato.'; end if;
  azienda := (q->>'company_id')::uuid;
  perform public.assert_company_access(azienda);
  -- Stessa visibilità delle tabelle di origine, anche per «solo assegnati».
  if azienda is distinct from public.get_effective_company_id()
     or public.check_staff_visibility(auth.uid(), (q->>'created_by')::uuid) is not true
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',azienda) is not true then
    raise exception 'Non hai il permesso di convertire questo preventivo.' using errcode='42501';
  end if;
  -- Non basta che una vecchia riga di accesso esista ancora.
  if azienda is distinct from public.get_user_company_id(auth.uid())
     and not public.has_role(auth.uid(),'super_admin'::public.app_role)
     and not exists(select 1 from public.multi_company_access m where m.user_id=auth.uid()
       and m.company_id=azienda and m.status = 'active' and (m.expires_at is null or m.expires_at>now())) then
    raise exception 'Accesso azienda scaduto o revocato.' using errcode='42501';
  end if;
  if nullif(q->>'ordine_id','') is not null then
    raise exception 'Questo preventivo è già diventato una commessa.' using errcode='23505';
  end if;
  if coalesce((q->>'annullato')::boolean,false) or nullif(q->>'deleted_at','') is not null then
    raise exception 'Il preventivo è stato eliminato o annullato.';
  end if;
  aliquota := coalesce((q->>case when p_modulo='fv' then 'iva_aliquota' else 'iva_pct' end)::numeric,
    case when p_modulo='fv' then 10 else 22 end);
  if aliquota<0 then aliquota := case when p_modulo='fv' then 10 else 22 end; end if;
  if aliquota>0 and aliquota<=1 then aliquota := round(aliquota*100,2); end if;
  if p_modulo='fv' then
    netto := case when coalesce((q->>'prezzo_vendita_manuale')::numeric,0)>0
      then round((q->>'prezzo_vendita_manuale')::numeric,2)
      else round(coalesce((q->>'prezzo_vendita_iva_inclusa')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(c) order by ordinamento,id),'[]') into componenti
      from (select * from public.fv_componenti_progetto where progetto_id=p_progetto_id for share) c;
    select coalesce(jsonb_agg(to_jsonb(s) order by ordinamento,id),'[]') into servizi
      from (select * from public.fv_servizi_progetto where progetto_id=p_progetto_id for share) s;
    select coalesce(jsonb_agg(to_jsonb(m) order by ordinamento,id),'[]') into ore
      from (select * from public.fv_manodopera_progetto where progetto_id=p_progetto_id for share) m;
    for r in select value from jsonb_array_elements(componenti) loop
      quantita := coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      nome := coalesce(nullif(trim(concat_ws(' ',r->>'marca',r->>'modello')),''),nullif(r->>'descrizione',''),'Componente');
      prezzo := coalesce((r->>'prezzo_unitario_vendita')::numeric,(r->>'prezzo_unitario_netto')::numeric,0);
      costo := coalesce((r->>'prezzo_unitario_netto')::numeric,0);
      note := nullif(concat_ws(' · ',nullif(r->>'descrizione',''),nullif(r->>'categoria','')),'');
      if quantita<>trunc(quantita) then
        note:=concat(quantita,' unità × ',prezzo,' €',case when note is not null then ' · '||note else '' end);
      end if;
      materiali:=materiali||jsonb_build_array(jsonb_build_object('name',left(nome,120),'description',note,
        'quantity',(case when quantita=trunc(quantita) then quantita else 1 end)::integer,
        'unit_price',round(case when quantita=trunc(quantita) then prezzo else prezzo*quantita end,2),
        'purchase_price',round(case when quantita=trunc(quantita) then costo else costo*quantita end,2),
        'status','da_ordinare','position',jsonb_array_length(materiali),'vat_rate',aliquota));
    end loop;
    for r in select value from jsonb_array_elements(servizi) loop
      quantita:=coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),nullif(r->>'tipo',''),'Servizio'),
        'notes',concat_ws(E'\n',nullif(r->>'tipo',''),quantita||' unità')));
    end loop;
    for r in select value from jsonb_array_elements(ore) loop
      quantita:=coalesce((r->>'ore')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Manodopera'),
        'notes',quantita||' h · Manodopera prevista; le ore effettive si registrano in cantiere.'));
    end loop;
    descrizione:=coalesce(nullif(trim(q->>'titolo'),''),'Impianto fotovoltaico '||coalesce(q->>'numero',''));
    codice:=q->>'numero';
    indirizzo:=concat_ws(', ',nullif(q->>'indirizzo',''),nullif(trim(concat_ws(' ',q->>'cap',q->>'comune')),''),nullif(q->>'provincia',''));
  else
    netto:=case when coalesce((q->>'totale_imponibile')::numeric,0)>0 then round((q->>'totale_imponibile')::numeric,2)
      else round(coalesce((q->>'totale')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(v) order by v.ordine,v.id),'[]') into voci
      from (select * from public.rst_computo_voci where progetto_id=p_progetto_id for share) v;
    for r in select value from jsonb_array_elements(voci) loop
      quantita:=coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      -- Il costo materiali di un computo è una stima della lavorazione:
      -- non identifica un articolo reale da ordinare né un costo consuntivo.
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Lavorazione'),
        'capitolo',coalesce(nullif(trim(r->>'capitolo_nome'),''),'Generale'),
        'notes',concat_ws(E'\n',nullif(r->>'capitolo_nome',''),quantita||' '||coalesce(r->>'unita_misura',''))));
    end loop;
    if p_raggruppa_capitoli then
      select coalesce(jsonb_agg(jsonb_build_object('name',capitolo,'notes',dettaglio) order by prima),'[]') into fasi
      from (select value->>'capitolo' capitolo,min(n) prima,
        string_agg((value->>'name')||E'\n'||(value->>'notes'),E'\n\n' order by n) dettaglio
        from jsonb_array_elements(fasi) with ordinality a(value,n) group by value->>'capitolo') gruppi;
    end if;
    descrizione:=coalesce(nullif(left(split_part(trim(q->>'note'),E'\n',1),120),''),'Ristrutturazione '||coalesce(q->>'code',''));
    codice:=q->>'code';
    indirizzo:=concat_ws(', ',nullif(q->>'cantiere_indirizzo',''),nullif(trim(concat_ws(' ',q->>'cantiere_cap',q->>'cantiere_citta')),''),nullif(q->>'cantiere_provincia',''));
  end if;
  if netto<=0 then raise exception 'Il preventivo non ha un prezzo di vendita: completalo prima di creare la commessa.'; end if;
  impronta:=md5(jsonb_build_array(q,componenti,servizi,ore,voci,p_raggruppa_capitoli)::text);
  esito:=jsonb_build_object('materiali',materiali,'fasi',fasi,'imponibile',netto,'aliquota',aliquota,
    'totale',round(netto*(1+aliquota/100),2),'impronta',impronta,'esclusi',esclusi,'descrizione',descrizione);
  if p_anteprima then return esito; end if;
  if p_impronta is distinct from impronta then
    raise exception 'Il preventivo è cambiato: rivedi il riepilogo prima di creare la commessa.' using errcode='40001';
  end if;
  select id into stato from public.order_statuses where company_id=azienda
    order by is_default desc nulls last,position asc nulls last,created_at asc limit 1;
  if stato is null then raise exception 'Imposta almeno uno stato commessa per questa azienda.'; end if;
  select customer_profile_id into profilo from public.marketing_contacts
    where id=(q->>'cliente_id')::uuid and company_id=azienda;
  esito:=esito||public.create_order_atomic(jsonb_build_object('company_id',azienda,'customer_id',profilo,
    'order_code',public.prossimo_numero_commessa(azienda),'description',descrizione,'total_amount',netto,
    'deposit_amount',0,'balance_amount',netto,'payment_type','standard','current_status_id',stato,
    'assigned_to',case when public.solo_assegnati_attivo() then auth.uid() else null end,
    'vat_rate',aliquota,'internal_notes',concat('Da preventivo ',p_modulo,' ',codice)),materiali,null,auth.uid(),'[]');
  ordine:=(esito->>'id')::uuid;
  update public.orders set created_by=auth.uid(),
    client_name=nullif(trim(concat_ws(' ',q->>'cliente_nome',q->>'cliente_cognome')),''),
    client_email=nullif(q->>'cliente_email',''),client_phone=nullif(q->>'cliente_telefono',''),
    indirizzo_lavori=nullif(indirizzo,''),work_address=nullif(indirizzo,''),
    fv_progetto_id=case when p_modulo='fv' then p_progetto_id else null end,
    rst_progetto_id=case when p_modulo='rst' then p_progetto_id else null end
    where id=ordine and company_id=azienda;
  for r in select value from jsonb_array_elements(fasi) loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes)
      values(azienda,ordine,r->>'name',posizione,concat_ws(E'\n',r->>'notes','Dal preventivo '||coalesce(codice,'')));
    posizione:=posizione+1;
  end loop;
  if p_modulo='fv' then update public.fv_progetti set ordine_id=ordine where id=p_progetto_id;
  else update public.rst_progetti set ordine_id=ordine where id=p_progetto_id; end if;
  return esito;
end;
$$;
revoke all on function public.converti_modulo_commessa_atomic(text,uuid,boolean,boolean,text) from public,anon;
grant execute on function public.converti_modulo_commessa_atomic(text,uuid,boolean,boolean,text) to authenticated;

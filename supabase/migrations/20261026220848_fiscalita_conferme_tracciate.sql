-- Administrative confirmations only. No tax liability, bank payment or legal conservation is created.
create schema if not exists private;
create table public.fiscalita_periodi (
 company_id uuid not null references public.companies(id), mese date not null,
 stato text not null check(stato in('aperto','chiuso')), revisione integer not null default 1,
 motivo text not null, snapshot jsonb not null default '{}'::jsonb,
 attore uuid not null default auth.uid(), aggiornato_il timestamptz not null default now(),
 primary key(company_id,mese),check(extract(day from mese)=1)
);
create table public.fiscalita_storico (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
 tabella text not null,record_id text not null,azione text not null,
 prima jsonb,dopo jsonb,attore uuid not null,registrato_il timestamptz not null default now()
);
create index fiscalita_storico_ricerca on public.fiscalita_storico(company_id,tabella,record_id,registrato_il desc);
alter table public.fiscalita_periodi enable row level security;
alter table public.fiscalita_storico enable row level security;
create policy fiscalita_periodi_admin on public.fiscalita_periodi for all to authenticated
 using(not public.utente_bloccato() and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)))
 with check(not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
create policy fiscalita_storico_admin on public.fiscalita_storico for select to authenticated
 using(not public.utente_bloccato() and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role)));
revoke all on public.fiscalita_periodi,public.fiscalita_storico from public,anon,authenticated;
grant select on public.fiscalita_periodi,public.fiscalita_storico to authenticated;
grant insert(company_id,mese,stato,motivo),update(stato,motivo) on public.fiscalita_periodi to authenticated;

create function public.fiscalita_verifica_scrittura(p_company uuid) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company)
 or (public.e_amministratore_di(p_company) or public.has_role(auth.uid(),'super_admin'::public.app_role)) is distinct from true then raise exception 'Operazione fiscale non autorizzata' using errcode='42501'; end if;
end $$;
revoke all on function public.fiscalita_verifica_scrittura(uuid) from public,anon;
grant execute on function public.fiscalita_verifica_scrittura(uuid) to authenticated;

create function private.fiscalita_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare j jsonb; r record; docs jsonb:='[]'::jsonb; c uuid; old_month date; new_month date;
begin
 if tg_table_name in('f24_entries','ritenute_garanzia') then
  c:=case when tg_op='DELETE' then old.company_id else new.company_id end;
  perform public.fiscalita_verifica_scrittura(c);
  if tg_op='DELETE' then raise exception 'Registrazione fiscale non cancellabile: usa rettifica documentata'; end if;
  if tg_op='UPDATE' and new.company_id<>old.company_id then raise exception 'Azienda non modificabile'; end if;
 end if;
 if tg_table_name='f24_entries' then
  if new.anno is null or new.anno not between 2000 and 2100 or new.mese is null or new.mese not between 1 and 12 then raise exception 'Periodo F24 non valido'; end if;
  if new.importo is null or new.importo<=0 or new.importo>1000000000 or new.importo<>round(new.importo,2) or length(btrim(coalesce(new.note,'')))<5 then raise exception 'Importo e riferimento F24 obbligatori'; end if;
  if tg_op='INSERT' or new.tributo_code is distinct from old.tributo_code or new.mese is distinct from old.mese then
   if new.tributo_code is null or (new.tributo_code not in('1001','1040') and new.tributo_code not in(select (6000+x)::text from generate_series(1,12) x)) then raise exception 'Codice erariale non supportato'; end if;
   if new.tributo_code between '6001' and '6012' and new.tributo_code::integer-6000<>new.mese then raise exception 'Codice IVA e mese di riferimento non coerenti'; end if;
  end if;
  if tg_op='INSERT' and new.stato<>'da_pagare' then raise exception 'Una nuova registrazione F24 non è un pagamento'; end if;
  if tg_op='UPDATE' and old.stato='pagato' and (to_jsonb(new)-'updated_at')<>(to_jsonb(old)-'updated_at') then raise exception 'Versamento registrato immutabile'; end if;
  if tg_op='UPDATE' and new.stato='pagato' and old.stato<>'pagato' and (new.data_pagamento is null or new.note is not distinct from old.note) then raise exception 'Serve una quietanza con data e riferimento specifico'; end if;
  new_month:=make_date(new.anno,new.mese,1);
  if tg_op='UPDATE' and old.mese between 1 and 12 then old_month:=make_date(old.anno,old.mese,1); end if;
 elsif tg_table_name='ritenute_garanzia' then
  if new.importo is null or new.importo<=0 then raise exception 'Importo ritenuta non valido'; end if;
  if tg_op='INSERT' and new.stato<>'trattenuta' then raise exception 'Registra prima la garanzia, poi conferma lo svincolo documentato'; end if;
  if tg_op='UPDATE' and new.importo is distinct from old.importo and new.note is not distinct from old.note then raise exception 'Rettifica importo: serve un nuovo riferimento documentato'; end if;
  if tg_op='UPDATE' and new.stato is distinct from old.stato and (new.note is not distinct from old.note or length(btrim(coalesce(new.note,'')))<5) then raise exception 'Cambio stato ritenuta: serve motivo e riferimento'; end if;
  if new.stato='svincolata' and new.data_svincolo_effettiva is null then raise exception 'Data di svincolo obbligatoria'; end if;
  new_month:=date_trunc('month',coalesce(new.data_svincolo_effettiva,new.created_at::date))::date;
  if tg_op='UPDATE' then old_month:=date_trunc('month',coalesce(old.data_svincolo_effettiva,old.created_at::date))::date; end if;
 else
  if tg_op='UPDATE' then
   if new.company_id is distinct from old.company_id or new.id is distinct from old.id then raise exception 'Identità fiscale non modificabile'; end if;
   if tg_table_name='documenti_fiscali' and (to_jsonb(new)->'tipo',to_jsonb(new)->'numero',to_jsonb(new)->'data_emissione',to_jsonb(new)->'imponibile_totale',to_jsonb(new)->'iva_totale',to_jsonb(new)->'totale_documento',to_jsonb(new)->'riepilogo_iva',to_jsonb(new)->'esigibilita_iva',to_jsonb(new)->'deleted_at',(new.stato in('bozza','annullata')))
    is not distinct from (to_jsonb(old)->'tipo',to_jsonb(old)->'numero',to_jsonb(old)->'data_emissione',to_jsonb(old)->'imponibile_totale',to_jsonb(old)->'iva_totale',to_jsonb(old)->'totale_documento',to_jsonb(old)->'riepilogo_iva',to_jsonb(old)->'esigibilita_iva',to_jsonb(old)->'deleted_at',(old.stato in('bozza','annullata'))) then return new; end if;
   if tg_table_name='fatture_ricevute' then
    if (to_jsonb(new)->'tipo_documento',to_jsonb(new)->'numero_fattura',new.data_fattura,new.data_ricezione_sdi,new.imponibile_totale,new.iva_totale,new.totale_documento,new.riepilogo_iva,new.aliquota_reverse_charge,(new.stato in('non_letta','letta','contabilizzata')))
     is not distinct from (to_jsonb(old)->'tipo_documento',to_jsonb(old)->'numero_fattura',old.data_fattura,old.data_ricezione_sdi,old.imponibile_totale,old.iva_totale,old.totale_documento,old.riepilogo_iva,old.aliquota_reverse_charge,(old.stato in('non_letta','letta','contabilizzata'))) then return new; end if;
   end if;
  end if;
  if tg_op<>'INSERT' then docs:=docs||jsonb_build_array(to_jsonb(old)); end if;
  if tg_op<>'DELETE' then docs:=docs||jsonb_build_array(to_jsonb(new)); end if;
  for j in select value from jsonb_array_elements(docs) loop
   c:=(j->>'company_id')::uuid;
   if tg_table_name='documenti_fiscali' then new_month:=date_trunc('month',(j->>'data_emissione')::date)::date;
   else new_month:=date_trunc('month',public.data_detrazione_iva((j->>'data_fattura')::date,(j->>'data_ricezione_sdi')::timestamptz))::date; end if;
   if new_month is not null then
    perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||c||':'||new_month,0));
    if exists(select 1 from public.fiscalita_periodi where company_id=c and mese=new_month and stato='chiuso') then raise exception 'Periodo fiscale chiuso: serve riapertura autorizzata'; end if;
   end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 for r in select distinct m from unnest(array[old_month,new_month]) m where m is not null order by m loop
  perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||c||':'||r.m,0));
  if exists(select 1 from public.fiscalita_periodi where company_id=c and mese=r.m and stato='chiuso') then raise exception 'Periodo fiscale chiuso: serve riapertura autorizzata'; end if;
 end loop;
 return new;
end $$;
revoke all on function private.fiscalita_guard() from public,anon,authenticated;
create trigger fiscalita_guard before insert or update or delete on public.f24_entries for each row execute function private.fiscalita_guard();
create trigger fiscalita_guard before insert or update or delete on public.ritenute_garanzia for each row execute function private.fiscalita_guard();
create trigger fiscalita_guard before insert or update or delete on public.documenti_fiscali for each row execute function private.fiscalita_guard();
create trigger fiscalita_guard before insert or update or delete on public.fatture_ricevute for each row execute function private.fiscalita_guard();

create function private.fiscalita_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.fiscalita_storico(company_id,tabella,record_id,azione,prima,dopo,attore)
 values(new.company_id,tg_table_name,case when tg_table_name='fiscalita_periodi' then to_jsonb(new)->>'mese' else to_jsonb(new)->>'id' end,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),auth.uid());
 return new;
end $$;
revoke all on function private.fiscalita_audit() from public,anon,authenticated;
create trigger fiscalita_audit after insert or update on public.f24_entries for each row execute function private.fiscalita_audit();
create trigger fiscalita_audit after insert or update on public.ritenute_garanzia for each row execute function private.fiscalita_audit();
create trigger fiscalita_audit after insert or update on public.fiscalita_periodi for each row execute function private.fiscalita_audit();

create function public.fiscalita_f24_anteprima(p_company uuid,p_anno integer,p_mese integer) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare v_rows jsonb;v_iva jsonb;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 if p_anno is null or p_anno not between 2000 and 2100 or p_mese is null or p_mese not between 1 and 12 then raise exception 'Periodo non valido'; end if;
 select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]'::jsonb) into v_rows from public.f24_entries f where company_id=p_company and anno=p_anno and mese=p_mese;
 v_iva:=public.liquidazione_iva_periodo(p_company,'mensile',p_anno,p_mese,null);
 return jsonb_build_object('versione',md5(v_rows::text),'registrazioni',v_rows,'iva_preliminare',v_iva,'conferma_automatica',false,'avvertenza','Nessuna proposta fiscale automatica: importi e codici devono provenire dal prospetto del consulente. Il calcolo IVA è preliminare, non un debito confermato.');
end $$;

create function public.fiscalita_f24_conferma(p_company uuid,p_anno integer,p_mese integer,p_versione text,p_righe jsonb,p_riferimento text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_preview jsonb;r jsonb;v_importo numeric;v_code text;v_result jsonb;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 if p_anno is null or p_anno not between 2000 and 2100 or p_mese is null or p_mese not between 1 and 12 then raise exception 'Periodo non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||p_company||':'||make_date(p_anno,p_mese,1),0));
 v_preview:=public.fiscalita_f24_anteprima(p_company,p_anno,p_mese);
 if p_versione is distinct from (v_preview->>'versione') then raise exception 'Registrazioni cambiate: rivedi l’anteprima'; end if;
 if length(btrim(coalesce(p_riferimento,'')))<5 or length(p_riferimento)>2000 or jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) not between 1 and 100 then raise exception 'Righe e riferimento del consulente obbligatori'; end if;
 for r in select value from jsonb_array_elements(p_righe) loop
  v_code:=r->>'tributo_code';v_importo:=(r->>'importo')::numeric;
  if v_code is null or (v_code not in('1001','1040') and v_code not in(select (6000+x)::text from generate_series(1,12) x)) or v_importo is null or v_importo<=0 or v_importo>1000000000 or v_importo<>round(v_importo,2) then raise exception 'Codice erariale o importo non valido'; end if;
  if exists(select 1 from public.f24_entries where company_id=p_company and anno=p_anno and mese=p_mese and tributo_code=v_code) then raise exception 'Tributo già registrato nel periodo: nessuna sovrascrittura automatica'; end if;
  insert into public.f24_entries(company_id,anno,mese,tributo_code,tributo_descrizione,importo,stato,data_scadenza,note)
   values(p_company,p_anno,p_mese,v_code,'Dato comunicato dal consulente · codice '||v_code,v_importo,'da_pagare',(r->>'data_scadenza')::date,btrim(p_riferimento));
 end loop;
 select coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]'::jsonb) into v_result from public.f24_entries f where company_id=p_company and anno=p_anno and mese=p_mese;
 return jsonb_build_object('ok',true,'registrazioni',v_result,'nessun_pagamento',true);
end $$;
-- The unsafe legacy auto-composer must not remain a bypass for AI/background callers.
create or replace function public.f24_componi(p_company_id uuid,p_anno integer,p_mese integer,p_rigenera boolean default false) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'Composizione automatica non disponibile: usa anteprima e conferma con prospetto del consulente'; end $$;

create function public.fiscalita_svincolo_anteprima(p_company uuid,p_id uuid) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare r public.ritenute_garanzia;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 select * into r from public.ritenute_garanzia where company_id=p_company and id=p_id;
 if r.id is null then raise exception 'Ritenuta non disponibile'; end if;
 return jsonb_build_object('versione',md5(to_jsonb(r)::text),'registrazione',to_jsonb(r));
end $$;
create function public.fiscalita_svincola(p_company uuid,p_id uuid,p_versione text,p_data date,p_riferimento text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.ritenute_garanzia;v_result jsonb;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 select * into r from public.ritenute_garanzia where company_id=p_company and id=p_id for update;
 if r.id is null or r.stato<>'trattenuta' then raise exception 'Ritenuta non disponibile o già svincolata'; end if;
 if p_versione is distinct from md5(to_jsonb(r)::text) then raise exception 'Ritenuta cambiata: aggiorna prima di confermare'; end if;
 if p_data is null or p_data>(now() at time zone 'Europe/Rome')::date or length(btrim(coalesce(p_riferimento,'')))<5 or length(p_riferimento)>2000 then raise exception 'Data e riferimento di svincolo obbligatori'; end if;
 update public.ritenute_garanzia set stato='svincolata',data_svincolo_effettiva=p_data,note=concat_ws(E'\n',r.note,'Svincolo documentato: '||btrim(p_riferimento)) where id=p_id and company_id=p_company returning to_jsonb(ritenute_garanzia.*) into v_result;
 return jsonb_build_object('registrazione',v_result,'incasso_registrato',false);
end $$;

create function private.fiscalita_transizione() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.fiscalita_verifica_scrittura(new.company_id);
 if new.mese<>date_trunc('month',new.mese)::date or new.mese<date '2000-01-01' or new.mese>date '2100-12-01' or length(btrim(coalesce(new.motivo,'')))<5 or length(new.motivo)>2000 then raise exception 'Periodo e motivo non validi'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||new.company_id||':'||new.mese,0));
 if tg_op='UPDATE' and (new.company_id<>old.company_id or new.mese<>old.mese or new.stato=old.stato) then raise exception 'Transizione non valida'; end if;
 if tg_op='INSERT' and new.stato<>'chiuso' then raise exception 'Nessun periodo da riaprire'; end if;
 if new.stato='chiuso' and new.mese>=date_trunc('month',now() at time zone 'Europe/Rome')::date then raise exception 'Puoi chiudere solo un mese concluso'; end if;
 new.revisione:=case when tg_op='INSERT' then 1 else old.revisione+1 end;new.attore:=auth.uid();new.aggiornato_il:=now();
 if new.stato='chiuso' then
  select jsonb_build_object('f24',coalesce(jsonb_agg(to_jsonb(f) order by f.id),'[]'::jsonb),'natura','Chiusura amministrativa; non certifica la liquidazione né i versamenti') into new.snapshot from public.f24_entries f where company_id=new.company_id and anno=extract(year from new.mese) and mese=extract(month from new.mese);
  if jsonb_array_length(new.snapshot->'f24')=0 then raise exception 'Nessuna registrazione F24 verificata nel mese: chiusura non disponibile'; end if;
 else new.snapshot:=old.snapshot;end if;
 return new;
end $$;
revoke all on function private.fiscalita_transizione() from public,anon,authenticated;
create trigger fiscalita_transizione before insert or update on public.fiscalita_periodi for each row execute function private.fiscalita_transizione();
create function public.fiscalita_transizione_periodo(p_company uuid,p_mese date,p_revisione integer,p_stato text,p_motivo text) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_revision integer;v_result jsonb;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 if p_mese is null or p_revisione is null or p_stato is null or p_stato not in('aperto','chiuso') then raise exception 'Transizione non valida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('fiscal-month:'||p_company||':'||p_mese,0));
 select revisione into v_revision from public.fiscalita_periodi where company_id=p_company and mese=p_mese for update;
 if coalesce(v_revision,0)<>p_revisione then raise exception 'Periodo cambiato: aggiorna prima di confermare'; end if;
 if v_revision is null then insert into public.fiscalita_periodi(company_id,mese,stato,motivo) values(p_company,p_mese,p_stato,p_motivo) returning to_jsonb(fiscalita_periodi.*) into v_result;
 else update public.fiscalita_periodi set stato=p_stato,motivo=p_motivo where company_id=p_company and mese=p_mese returning to_jsonb(fiscalita_periodi.*) into v_result;end if;
 return v_result;
end $$;
revoke all on function public.fiscalita_f24_anteprima(uuid,integer,integer),public.fiscalita_f24_conferma(uuid,integer,integer,text,jsonb,text),public.fiscalita_svincolo_anteprima(uuid,uuid),public.fiscalita_svincola(uuid,uuid,text,date,text),public.fiscalita_transizione_periodo(uuid,date,integer,text,text) from public,anon;
grant execute on function public.fiscalita_f24_anteprima(uuid,integer,integer),public.fiscalita_f24_conferma(uuid,integer,integer,text,jsonb,text),public.fiscalita_svincolo_anteprima(uuid,uuid),public.fiscalita_svincola(uuid,uuid,text,date,text),public.fiscalita_transizione_periodo(uuid,date,integer,text,text) to authenticated;

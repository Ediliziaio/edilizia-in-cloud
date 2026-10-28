set local lock_timeout='3s';
set local statement_timeout='60s';
create table if not exists public.subappalto_quadri_lavori (
 id uuid primary key,company_id uuid not null references public.companies(id),
 contratto_id uuid not null references public.contratti_subappalto(id),
 revisione integer not null, voci jsonb not null check(jsonb_typeof(voci)='array'),
 maturazione text not null check(maturazione in('saldo','sal_periodici','traguardi')),
 giorni_pagamento integer check(giorni_pagamento between 0 and 365),
 importo_lavori numeric(12,2) not null,contratto_snapshot jsonb not null,
 motivo text not null,richiesta jsonb not null,created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),unique(contratto_id,revisione)
);
create table if not exists public.subappalto_misure (
 id uuid primary key,company_id uuid not null references public.companies(id),
 contratto_id uuid not null references public.contratti_subappalto(id),
 quadro_id uuid not null references public.subappalto_quadri_lavori(id),voce_id uuid not null,
 data_rilievo date not null,quantita_dichiarata numeric(14,4) not null,
 quantita_riconosciuta numeric(14,4),prezzo_unitario numeric(12,2) not null,
 importo_riconosciuto numeric(12,2),stato text not null default 'dichiarata' check(stato in('dichiarata','riconosciuta','annullata')),
 riferimento text not null,nota_verifica text,nota_annullamento text,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 verificato_da uuid references public.profiles(id),verificato_il timestamptz,
 annullato_da uuid references public.profiles(id),annullato_il timestamptz,
 revisione integer not null default 1,sal_id uuid references public.sal_subappaltatori(id),
 check(quantita_dichiarata>0),check(quantita_riconosciuta>=0 and quantita_riconosciuta<=quantita_dichiarata),
 check(prezzo_unitario>=0),check(importo_riconosciuto>=0)
);
create index if not exists subappalto_misure_contratto on public.subappalto_misure(company_id,contratto_id,created_at);
create index if not exists subappalto_misure_sal on public.subappalto_misure(sal_id) where sal_id is not null;
alter table public.subappalto_quadri_lavori enable row level security;
alter table public.subappalto_misure enable row level security;
revoke all on public.subappalto_quadri_lavori,public.subappalto_misure from public,anon,authenticated;
grant select on public.subappalto_quadri_lavori,public.subappalto_misure to authenticated;
drop policy if exists subappalto_quadri_leggi on public.subappalto_quadri_lavori;
create policy subappalto_quadri_leggi on public.subappalto_quadri_lavori for select to authenticated
 using(auth.uid() is not null and not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id) and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id));
drop policy if exists subappalto_misure_leggi on public.subappalto_misure;
create policy subappalto_misure_leggi on public.subappalto_misure for select to authenticated
 using(auth.uid() is not null and not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id) and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id));

create or replace function public.subappalto_lavori_autorizza(p_company uuid) returns void
 language plpgsql security invoker set search_path='' as $$ begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',p_company),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false)
 then raise exception 'Gestione lavori subappalto non autorizzata' using errcode='42501'; end if;
end $$;
revoke all on function public.subappalto_lavori_autorizza(uuid) from public,anon;
grant execute on function public.subappalto_lavori_autorizza(uuid) to authenticated;

-- Mutazioni solo tramite RPC: controllo esplicito del chiamante e del contesto,
-- senza concedere scritture dirette alle tabelle o far scegliere attori/date al client.
create or replace function public.subappalto_quadro_registra(p_company uuid,p_contratto uuid,p_id uuid,p_voci jsonb,p_maturazione text,p_giorni integer,p_motivo text,p_importo_atteso numeric)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratti_subappalto;q public.subappalto_quadri_lavori;v jsonb;righe jsonb:='[]';
 ids uuid[]:='{}';vid uuid;fase uuid;qt numeric;prezzo numeric;totale numeric:=0;v_richiesta jsonb;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 if p_id is null or p_voci is null or jsonb_typeof(p_voci)<>'array' or jsonb_array_length(p_voci) not between 1 and 100 or length(p_voci::text)>250000
 or p_maturazione is null or p_maturazione not in('saldo','sal_periodici','traguardi') or (p_giorni is not null and p_giorni not between 0 and 365)
 or length(btrim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Completa elenco, maturazione e motivo del quadro lavori' using errcode='22023';end if;
 v_richiesta:=jsonb_build_object('voci',p_voci,'maturazione',p_maturazione,'giorni',p_giorni,'motivo',btrim(p_motivo),'importo_atteso',p_importo_atteso);
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null or not exists(select 1 from public.orders where id=c.order_id and company_id=p_company and deleted_at is null)
 or not exists(select 1 from public.subappaltatori_sicurezza where id=c.subappaltatore_id and company_id=p_company) then raise exception 'Contratto non disponibile' using errcode='42501';end if;
 select * into q from public.subappalto_quadri_lavori where id=p_id;
 if q.id is not null then
  if q.company_id<>p_company or q.contratto_id<>p_contratto or q.richiesta<>v_richiesta then raise exception 'Richiesta già usata per un altro quadro' using errcode='23505';end if;
  return jsonb_build_object('id',q.id,'revisione',q.revisione);
 end if;
 if exists(select 1 from public.sal_subappaltatori where contratto_id=c.id and stato<>'contestato' and importo_lordo>0) then raise exception 'Contratto con SAL già registrati: serve una riconciliazione iniziale prima di introdurre quantità';end if;
 if exists(select 1 from public.subappalto_misure where contratto_id=c.id and stato='riconosciuta') then raise exception 'Ci sono misure riconosciute: serve un percorso di variante, non la riscrittura della base';end if;
 if p_importo_atteso is distinct from c.importo_contrattuale then raise exception 'Importo contrattuale cambiato: ricarica il contratto';end if;
 for v in select value from jsonb_array_elements(p_voci) loop
  vid:=(v->>'id')::uuid;fase:=nullif(v->>'fase_id','')::uuid;
  qt:=(v->>'quantita')::numeric;prezzo:=(v->>'prezzo')::numeric;
  if vid is null or vid=any(ids) or length(btrim(coalesce(v->>'descrizione',''))) not between 2 and 2000
  or coalesce(v->>'base','') not in('corpo','misura','ore') or length(btrim(coalesce(v->>'unita',''))) not between 1 and 15
  or qt is null or qt<=0 or qt>999999999 or qt<>round(qt,4) or prezzo is null or prezzo<0 or prezzo>999999999 or prezzo<>round(prezzo,2)
  or ((v->>'base')='corpo' and (qt<>1 or (v->>'unita')<>'quota')) or ((v->>'base')='ore' and (v->>'unita')<>'h')
  then raise exception 'Voce lavori non valida: controlla quantità, unità e prezzo' using errcode='22023';end if;
  if fase is not null and not exists(select 1 from public.order_work_phases where id=fase and company_id=p_company and order_id=c.order_id) then raise exception 'Lavorazione estranea alla commessa' using errcode='23514';end if;
  totale:=totale+round(qt*prezzo,2);ids:=array_append(ids,vid);
  righe:=righe||jsonb_build_array(jsonb_build_object('id',vid,'fase_id',fase,'descrizione',btrim(v->>'descrizione'),'base',v->>'base','unita',btrim(v->>'unita'),'quantita',qt,'prezzo',prezzo,'importo',round(qt*prezzo,2)));
 end loop;
 if totale<>c.importo_contrattuale then raise exception 'Il totale voci (%) deve coincidere con i lavori del contratto (%), oneri separati',totale,c.importo_contrattuale using errcode='23514';end if;
 insert into public.subappalto_quadri_lavori(id,company_id,contratto_id,revisione,voci,maturazione,giorni_pagamento,importo_lavori,contratto_snapshot,motivo,richiesta,created_by)
 select p_id,p_company,c.id,coalesce(max(revisione),0)+1,righe,p_maturazione,p_giorni,totale,
 jsonb_build_object('numero',c.numero_contratto,'descrizione',c.descrizione_lavori,'importo_lavori',c.importo_contrattuale,'oneri_sicurezza',c.oneri_sicurezza,'modalita_pagamento',c.modalita_pagamento,'firmato_il',c.firmato_il),btrim(p_motivo),v_richiesta,auth.uid()
 from public.subappalto_quadri_lavori where contratto_id=c.id returning * into q;
 return jsonb_build_object('id',q.id,'revisione',q.revisione);
end $$;

create or replace function public.subappalto_misura_registra(p_company uuid,p_quadro uuid,p_voce uuid,p_id uuid,p_data date,p_quantita numeric,p_riferimento text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.subappalto_quadri_lavori;m public.subappalto_misure;v jsonb;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 select * into q from public.subappalto_quadri_lavori where id=p_quadro and company_id=p_company;
 if q.id is null then raise exception 'Elenco lavori non disponibile' using errcode='42501';end if;
 perform 1 from public.contratti_subappalto where id=q.contratto_id and company_id=p_company for update;
 select * into m from public.subappalto_misure where id=p_id;
 if m.id is not null then
  if (m.company_id,m.quadro_id,m.voce_id,m.data_rilievo,m.quantita_dichiarata,m.riferimento) is distinct from (p_company,p_quadro,p_voce,p_data,p_quantita,btrim(p_riferimento)) then raise exception 'Richiesta misura già usata con dati diversi' using errcode='23505';end if;
  return jsonb_build_object('id',m.id);
 end if;
 if not exists(select 1 from public.contratti_subappalto cs join public.orders o on o.id=cs.order_id where cs.id=q.contratto_id and cs.company_id=p_company and o.company_id=p_company and o.deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501';end if;
 if q.revisione<>(select max(revisione) from public.subappalto_quadri_lavori where contratto_id=q.contratto_id) then raise exception 'Elenco aggiornato: ricarica prima di rilevare quantità';end if;
 select value into v from jsonb_array_elements(q.voci) where value->>'id'=p_voce::text;
 if v is null or p_id is null or p_data is null or p_data<date '2000-01-01' or p_data>(now() at time zone 'Europe/Rome')::date
 or p_quantita is null or p_quantita<=0 or p_quantita>999999999 or p_quantita<>round(p_quantita,4) or length(btrim(coalesce(p_riferimento,''))) not between 5 and 2000 then raise exception 'Completa voce, quantità, data e riferimento della rilevazione' using errcode='22023';end if;
 insert into public.subappalto_misure(id,company_id,contratto_id,quadro_id,voce_id,data_rilievo,quantita_dichiarata,prezzo_unitario,riferimento,created_by)
 values(p_id,p_company,q.contratto_id,q.id,p_voce,p_data,p_quantita,(v->>'prezzo')::numeric,btrim(p_riferimento),auth.uid());
 return jsonb_build_object('id',p_id);
end $$;

create or replace function public.subappalto_misura_verifica(p_company uuid,p_id uuid,p_revisione integer,p_quantita numeric,p_nota text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.subappalto_misure;q public.subappalto_quadri_lavori;v jsonb;riconosciuta numeric;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 select * into m from public.subappalto_misure where id=p_id and company_id=p_company;
 if m.id is null then raise exception 'Misura non disponibile' using errcode='42501';end if;
 perform 1 from public.contratti_subappalto where id=m.contratto_id and company_id=p_company for update;
 select * into m from public.subappalto_misure where id=p_id and company_id=p_company for update;
 if m.revisione is distinct from p_revisione or m.stato<>'dichiarata' then raise exception 'Misura già verificata o cambiata: ricarica i dati';end if;
 select * into q from public.subappalto_quadri_lavori where id=m.quadro_id;
 if q.revisione<>(select max(revisione) from public.subappalto_quadri_lavori where contratto_id=m.contratto_id) then raise exception 'La base lavori è cambiata: riconcilia la rilevazione prima di riconoscerla';end if;
 select value into v from jsonb_array_elements(q.voci) where value->>'id'=m.voce_id::text;
 if p_quantita is null or p_quantita<0 or p_quantita>m.quantita_dichiarata or p_quantita<>round(p_quantita,4) or length(btrim(coalesce(p_nota,''))) not between 5 and 2000 then raise exception 'Quantità riconosciuta e riferimento di verifica non validi' using errcode='22023';end if;
 select coalesce(sum(quantita_riconosciuta),0) into riconosciuta from public.subappalto_misure where contratto_id=m.contratto_id and voce_id=m.voce_id and stato='riconosciuta';
 if riconosciuta+p_quantita>(v->>'quantita')::numeric then raise exception 'Quantità oltre l’affidamento: autorizza prima una variante' using errcode='23514';end if;
 update public.subappalto_misure set quantita_riconosciuta=p_quantita,importo_riconosciuto=round(p_quantita*prezzo_unitario,2),stato='riconosciuta',nota_verifica=btrim(p_nota),verificato_da=auth.uid(),verificato_il=now(),revisione=revisione+1 where id=m.id returning * into m;
 return jsonb_build_object('id',m.id,'importo',m.importo_riconosciuto);
end $$;

create or replace function public.subappalto_misura_annulla(p_company uuid,p_id uuid,p_revisione integer,p_motivo text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.subappalto_misure;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 select * into m from public.subappalto_misure where id=p_id and company_id=p_company;
 if m.id is null then raise exception 'Misura non disponibile' using errcode='42501';end if;
 perform 1 from public.contratti_subappalto where id=m.contratto_id and company_id=p_company for update;
 select * into m from public.subappalto_misure where id=p_id and company_id=p_company for update;
 if m.revisione is distinct from p_revisione or m.stato='annullata' or m.sal_id is not null then raise exception 'Misura cambiata o già contabilizzata: serve una rettifica dedicata';end if;
 if length(btrim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Indica il motivo dell’annullamento' using errcode='22023';end if;
 update public.subappalto_misure set stato='annullata',nota_annullamento=btrim(p_motivo),annullato_da=auth.uid(),annullato_il=now(),revisione=revisione+1 where id=m.id;
 return jsonb_build_object('id',m.id);
end $$;

create or replace function public.subappalto_sal_da_misure(p_company uuid,p_contratto uuid,p_id uuid,p_misure uuid[],p_data date,p_ritenuta numeric,p_note text default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratti_subappalto;s public.sal_subappaltatori;m public.subappalto_misure;totale numeric:=0;n integer;v jsonb;conteggio integer:=0;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 if p_id is null or cardinality(p_misure) not between 1 and 100 or cardinality(p_misure)<>(select count(distinct x) from unnest(p_misure) x) then raise exception 'Seleziona misure distinte per questo SAL' using errcode='22023';end if;
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null then raise exception 'Contratto non disponibile' using errcode='42501';end if;
 select * into s from public.sal_subappaltatori where id=p_id;
 for m in select * from public.subappalto_misure where id=any(p_misure) and company_id=p_company and contratto_id=c.id order by id for update loop
  if m.stato<>'riconosciuta' or (m.sal_id is not null and m.sal_id<>p_id) or (s.id is not null and m.sal_id is distinct from p_id) or m.data_rilievo>p_data then raise exception 'Misura non riconosciuta, già contabilizzata o successiva alla data SAL';end if;
  totale:=totale+m.importo_riconosciuto;conteggio:=conteggio+1;
 end loop;
 if conteggio<>cardinality(p_misure) or totale<=0 then raise exception 'Misure estranee o totale SAL non positivo' using errcode='23514';end if;
 if s.id is not null and exists(select 1 from public.subappalto_misure where sal_id=p_id and not(id=any(p_misure))) then raise exception 'Richiesta SAL già usata per altre misure';end if;
 n:=s.numero_sal;
 if n is null then select coalesce(max(numero_sal),0)+1 into n from public.sal_subappaltatori where contratto_id=c.id;end if;
 v:=public.sal_sub_registra_con_garanzia(p_company,c.id,p_id,n,p_data,totale,p_ritenuta,'verificato',p_note);
 update public.subappalto_misure set sal_id=p_id,revisione=revisione+1 where id=any(p_misure) and sal_id is null;
 return v||jsonb_build_object('numero_sal',n,'importo_lordo',totale);
end $$;

revoke all on function public.subappalto_quadro_registra(uuid,uuid,uuid,jsonb,text,integer,text,numeric) from public,anon;
revoke all on function public.subappalto_misura_registra(uuid,uuid,uuid,uuid,date,numeric,text) from public,anon;
revoke all on function public.subappalto_misura_verifica(uuid,uuid,integer,numeric,text) from public,anon;
revoke all on function public.subappalto_misura_annulla(uuid,uuid,integer,text) from public,anon;
revoke all on function public.subappalto_sal_da_misure(uuid,uuid,uuid,uuid[],date,numeric,text) from public,anon;
grant execute on function public.subappalto_quadro_registra(uuid,uuid,uuid,jsonb,text,integer,text,numeric) to authenticated;
grant execute on function public.subappalto_misura_registra(uuid,uuid,uuid,uuid,date,numeric,text) to authenticated;
grant execute on function public.subappalto_misura_verifica(uuid,uuid,integer,numeric,text) to authenticated;
grant execute on function public.subappalto_misura_annulla(uuid,uuid,integer,text) to authenticated;
grant execute on function public.subappalto_sal_da_misure(uuid,uuid,uuid,uuid[],date,numeric,text) to authenticated;

-- Fixture sintetiche dentro sotto-transazione: anche i SAL/garanzie sono annullati.
do $$
declare a record;origine record;cid uuid:=gen_random_uuid();qid uuid:=gen_random_uuid();voce uuid:=gen_random_uuid();
 m1 uuid:=gen_random_uuid();m2 uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();v jsonb;righe jsonb;ok boolean:=false;
 claims text:=current_setting('request.jwt.claims',true);subclaim text:=current_setting('request.jwt.claim.sub',true);
begin
 select p.id,p.company_id into a from public.profiles p join public.user_roles u on u.user_id=p.id
 where u.role::text in('company_admin','super_admin') and exists(select 1 from public.contratti_subappalto cs join public.orders o on o.id=cs.order_id where cs.company_id=p.company_id and o.order_code like 'DEMO%' and o.deleted_at is null) limit 1;
 if a.id is null then raise exception 'Amministratore demo non disponibile per il collaudo';end if;
 select cs.* into origine from public.contratti_subappalto cs join public.orders o on o.id=cs.order_id where cs.company_id=a.company_id and o.order_code like 'DEMO%' and o.deleted_at is null limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',a.id::text,true);
 begin
  insert into public.contratti_subappalto(id,company_id,subappaltatore_id,order_id,numero_contratto,descrizione_lavori,importo_contrattuale,ritenuta_garanzia_pct)
  values(cid,a.company_id,origine.subappaltatore_id,origine.order_id,'COLLAUDO TEMP MISURE','COLLAUDO sintetico quadro lavori',1000,5);
  righe:=jsonb_build_array(jsonb_build_object('id',voce,'descrizione','Lavoro demo a corpo','base','corpo','unita','quota','quantita',1,'prezzo',1000));
  v:=public.subappalto_quadro_registra(a.company_id,cid,qid,righe,'sal_periodici',30,'Prima impostazione DEMO',1000);
  perform public.subappalto_quadro_registra(a.company_id,cid,qid,righe,'sal_periodici',30,'Prima impostazione DEMO',1000);
  if (select count(*) from public.subappalto_quadri_lavori where contratto_id=cid)<>1 then raise exception 'Quadro duplicato';end if;
  begin
   perform public.subappalto_quadro_registra(a.company_id,cid,gen_random_uuid(),jsonb_set(righe,'{0,prezzo}','999'),'saldo',null,'Totale errato DEMO',1000);
   raise exception 'Totale incoerente accettato';
  exception when check_violation then null;end;
  perform public.subappalto_misura_registra(a.company_id,qid,voce,m1,current_date,.6,'Rilievo DEMO 1');
  perform public.subappalto_misura_registra(a.company_id,qid,voce,m1,current_date,.6,'Rilievo DEMO 1');
  if (select count(*) from public.subappalto_misure where contratto_id=cid)<>1 then raise exception 'Misura duplicata';end if;
  perform public.subappalto_misura_verifica(a.company_id,m1,1,.5,'Verifica DEMO parziale');
  if (select importo_riconosciuto from public.subappalto_misure where id=m1)<>500 then raise exception 'Valore riconosciuto errato';end if;
  begin
   perform public.subappalto_misura_verifica(a.company_id,m1,1,.5,'Ritentativo vecchia revisione');raise exception 'Doppia verifica accettata';
  exception when raise_exception then if sqlerrm='Doppia verifica accettata' then raise;end if;end;
  perform public.subappalto_misura_registra(a.company_id,qid,voce,m2,current_date,.6,'Rilievo DEMO 2');
  begin
   perform public.subappalto_misura_verifica(a.company_id,m2,1,.6,'Eccedenza non autorizzata');raise exception 'Eccedenza accettata';
  exception when check_violation then null;end;
  perform public.subappalto_misura_verifica(a.company_id,m2,1,.5,'Verifica DEMO saldo');
  v:=public.subappalto_sal_da_misure(a.company_id,cid,sid,array[m1,m2],current_date,5,'COLLAUDO TEMP SAL MISURE');
  if (select importo_lordo from public.sal_subappaltatori where id=sid)<>1000 or (select importo_netto from public.sal_subappaltatori where id=sid)<>950 then raise exception 'SAL non valorizzato dalle misure';end if;
  if (select count(*) from public.subappalto_misure where sal_id=sid)<>2 then raise exception 'Fonti SAL non collegate';end if;
  perform public.subappalto_sal_da_misure(a.company_id,cid,sid,array[m1,m2],current_date,5,'COLLAUDO TEMP SAL MISURE');
  if (select count(*) from public.ritenute_garanzia where sal_id=sid)<>1 then raise exception 'Garanzia duplicata';end if;
  begin
   perform public.subappalto_misura_annulla(a.company_id,m1,3,'Annullamento misura contabilizzata');raise exception 'Misura contabilizzata annullata';
  exception when raise_exception then if sqlerrm='Misura contabilizzata annullata' then raise;end if;end;
  begin
   perform public.subappalto_sal_da_misure(a.company_id,cid,gen_random_uuid(),array[m1],current_date,5,null);raise exception 'Misura contabilizzata due volte';
  exception when raise_exception then if sqlerrm='Misura contabilizzata due volte' then raise;end if;end;
  ok:=true;raise exception using errcode='PZ001',message='rollback collaudo lavori';
 exception when sqlstate 'PZ001' then null;end;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(subclaim,''),true);
 if not ok then raise exception 'Collaudo lavori incompleto';end if;
end $$;

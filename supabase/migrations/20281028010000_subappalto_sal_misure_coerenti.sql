set local lock_timeout='3s';
set local statement_timeout='60s';
-- Verifica a fine transazione: inserimento SAL e attribuzione misure sono atomici.
-- Impedisce che il vecchio inserimento manuale aggiri il percorso quantitativo.
create or replace function public.subappalto_sal_misure_coerenti() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.sal_subappaltatori;totale numeric;quante integer;
begin
 select * into s from public.sal_subappaltatori where id=new.id;
 if s.id is null or not exists(select 1 from public.subappalto_quadri_lavori where contratto_id=s.contratto_id) then return null;end if;
 select count(*),coalesce(sum(importo_riconosciuto),0) into quante,totale from public.subappalto_misure where sal_id=s.id;
 if quante=0 or totale<>s.importo_lordo or exists(select 1 from public.subappalto_misure m where m.sal_id=s.id and (m.company_id<>s.company_id or m.contratto_id<>s.contratto_id or m.stato<>'riconosciuta'))
 then raise exception 'Questo contratto usa i lavori misurati: prepara il SAL da Lavori e quantità. Importo e fonti devono coincidere' using errcode='23514';end if;
 return null;
end $$;
revoke all on function public.subappalto_sal_misure_coerenti() from public,anon,authenticated;
drop trigger if exists subappalto_sal_misure_coerenti on public.sal_subappaltatori;
create constraint trigger subappalto_sal_misure_coerenti after insert or update on public.sal_subappaltatori
 deferrable initially deferred for each row execute function public.subappalto_sal_misure_coerenti();

create or replace function public.subappalto_misura_verifica(p_company uuid,p_id uuid,p_revisione integer,p_quantita numeric,p_nota text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.subappalto_misure;q public.subappalto_quadri_lavori;v jsonb;riconosciuta numeric;valore_riconosciuto numeric;
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
 select coalesce(sum(importo_riconosciuto),0) into valore_riconosciuto from public.subappalto_misure where contratto_id=m.contratto_id and voce_id=m.voce_id and stato='riconosciuta';
 if valore_riconosciuto+round(p_quantita*m.prezzo_unitario,2)>round((v->>'quantita')::numeric*(v->>'prezzo')::numeric,2) then raise exception 'Arrotondamenti oltre il valore affidato: serve una rettifica tracciata' using errcode='23514';end if;
 select coalesce(sum(quantita_riconosciuta),0) into riconosciuta from public.subappalto_misure where contratto_id=m.contratto_id and voce_id=m.voce_id and stato='riconosciuta';
 if riconosciuta+p_quantita>(v->>'quantita')::numeric then raise exception 'Quantità oltre l’affidamento: autorizza prima una variante' using errcode='23514';end if;
 update public.subappalto_misure set quantita_riconosciuta=p_quantita,importo_riconosciuto=round(p_quantita*prezzo_unitario,2),stato='riconosciuta',nota_verifica=btrim(p_nota),verificato_da=auth.uid(),verificato_il=now(),revisione=revisione+1 where id=m.id returning * into m;
 return jsonb_build_object('id',m.id,'importo',m.importo_riconosciuto);
end $$;


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
  begin
   perform public.sal_sub_registra_con_garanzia(a.company_id,cid,gen_random_uuid(),77,current_date,200,5,'verificato','Inserimento manuale vietato DEMO');
   set constraints public.subappalto_sal_misure_coerenti immediate;
   raise exception 'SAL senza misure accettato';
  exception when check_violation then null;end;
  v:=public.subappalto_sal_da_misure(a.company_id,cid,sid,array[m1,m2],current_date,5,'COLLAUDO TEMP SAL MISURE');
  set constraints public.subappalto_sal_misure_coerenti immediate;
  set constraints public.subappalto_sal_misure_coerenti deferred;
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

set local lock_timeout='3s';
set local statement_timeout='60s';
-- La base registrata congela soggetti e valore economico. Note, date operative e stato restano modificabili.
-- La creazione del quadro e l'aggiornamento del contratto usano lo stesso lock di riga.
create or replace function public.subappalto_base_contratto_protetta() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (new.company_id,new.order_id,new.subappaltatore_id,new.importo_contrattuale,new.oneri_sicurezza)
    is distinct from (old.company_id,old.order_id,old.subappaltatore_id,old.importo_contrattuale,old.oneri_sicurezza)
    and exists(select 1 from public.subappalto_quadri_lavori where contratto_id=old.id)
 then raise exception 'Base lavori già registrata: soggetti, importo e oneri richiedono una variante tracciata; non modificare il contratto originario' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.subappalto_base_contratto_protetta() from public,anon,authenticated;
drop trigger if exists subappalto_base_contratto_protetta on public.contratti_subappalto;
create trigger subappalto_base_contratto_protetta before update of company_id,order_id,subappaltatore_id,importo_contrattuale,oneri_sicurezza on public.contratti_subappalto
for each row execute function public.subappalto_base_contratto_protetta();

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
  begin
   update public.contratti_subappalto set importo_contrattuale=2000 where id=cid;
   raise exception 'Importo base alterato';
  exception when check_violation then null;end;
  update public.contratti_subappalto set note='Nota operativa consentita DEMO' where id=cid;
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

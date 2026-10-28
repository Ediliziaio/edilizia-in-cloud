set local lock_timeout='3s';
set local statement_timeout='60s';
-- Una transazione, privilegi del chiamante e policy esistenti: nessun bypass fiscale.
create or replace function public.sal_sub_registra_con_garanzia(
 p_company uuid,p_contratto uuid,p_id uuid,p_numero integer,p_data date,
 p_lordo numeric,p_ritenuta numeric,p_stato text,p_note text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.contratti_subappalto; s public.sal_subappaltatori; rid uuid; trattenuta numeric;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',p_company),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false)
 then raise exception 'Registrazione SAL non autorizzata' using errcode='42501'; end if;
 if p_id is null or p_numero is null or p_numero<1 or p_data is null or p_data<date '2000-01-01' or p_data>(now() at time zone 'Europe/Rome')::date
 or p_lordo is null or p_lordo<=0 or p_lordo>9999999999.99 or p_lordo<>round(p_lordo,2)
 or p_ritenuta is null or p_ritenuta<0 or p_ritenuta>100 or p_ritenuta<>round(p_ritenuta,2)
 or p_stato is null or p_stato not in ('ricevuto','verificato','contestato') or length(coalesce(p_note,''))>6000
 then raise exception 'Dati SAL non validi: il pagamento si registra separatamente' using errcode='22023'; end if;
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null or not exists(select 1 from public.orders where id=c.order_id and company_id=p_company and deleted_at is null)
 or not exists(select 1 from public.subappaltatori_sicurezza where id=c.subappaltatore_id and company_id=p_company)
 then raise exception 'Contratto non disponibile per questa azienda' using errcode='42501'; end if;
 -- Lock del contratto serializza numero e ritentativi anche tra sessioni diverse.
 select * into s from public.sal_subappaltatori where id=p_id;
 if s.id is not null then
  if (s.company_id,s.contratto_id,s.numero_sal,s.data_emissione,s.importo_lordo,s.ritenuta_pct,s.stato,s.note)
    is distinct from (p_company,p_contratto,p_numero,p_data,p_lordo,p_ritenuta,p_stato,nullif(btrim(p_note),'')) then
    raise exception 'Richiesta già usata con dati diversi: rileggi i SAL prima di riprovare' using errcode='23505'; end if;
  return jsonb_build_object('id',s.id,'gia_registrato',true);
 end if;
 if exists(select 1 from public.sal_subappaltatori where contratto_id=p_contratto and numero_sal=p_numero) then
  raise exception 'Numero SAL già presente nel contratto: aggiorna la numerazione' using errcode='23505'; end if;
 trattenuta:=round(p_lordo*p_ritenuta/100,2);
 if trattenuta>0 then perform public.fiscalita_verifica_scrittura(p_company); end if;
 insert into public.sal_subappaltatori(id,company_id,contratto_id,subappaltatore_id,order_id,numero_sal,data_emissione,importo_lordo,ritenuta_pct,stato,note)
 values(p_id,p_company,c.id,c.subappaltatore_id,c.order_id,p_numero,p_data,p_lordo,p_ritenuta,p_stato,nullif(btrim(p_note),'')) returning * into s;
 if trattenuta>0 then
  insert into public.ritenute_garanzia(company_id,contratto_id,sal_id,importo,stato,percentuale_applicata,direzione,note)
  values(p_company,c.id,s.id,s.ritenuta_importo,'trattenuta',p_ritenuta,'passiva','Garanzia collegata al SAL n. '||p_numero) returning id into rid;
  if p_stato='contestato' then
   update public.ritenute_garanzia set stato='annullata',note='SAL n. '||p_numero||' contestato alla registrazione: garanzia esclusa dal riconosciuto' where id=rid;
  end if;
 end if;
 return jsonb_build_object('id',s.id,'ritenuta_id',rid,'gia_registrato',false);
end $$;
revoke all on function public.sal_sub_registra_con_garanzia(uuid,uuid,uuid,integer,date,numeric,numeric,text,text) from public,anon;
grant execute on function public.sal_sub_registra_con_garanzia(uuid,uuid,uuid,integer,date,numeric,numeric,text,text) to authenticated;

-- Anche la sincronizzazione di una contestazione deve lasciare un motivo nel registro.
create or replace function public.sal_sub_ritenuta_segue_stato()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.stato='contestato' and old.stato is distinct from 'contestato' then
  update public.ritenute_garanzia set stato='annullata',note=concat_ws(E'\n',note,'SAL n. '||new.numero_sal||' contestato: garanzia sospesa dal riepilogo riconosciuto') where sal_id=new.id and company_id=new.company_id and stato='trattenuta';
 elsif old.stato='contestato' and new.stato is distinct from 'contestato' then
  update public.ritenute_garanzia set stato='trattenuta',note=concat_ws(E'\n',note,'SAL n. '||new.numero_sal||': contestazione rimossa, garanzia ripristinata') where sal_id=new.id and company_id=new.company_id and stato='annullata';
 end if;
 return new;
end $$;
revoke all on function public.sal_sub_ritenuta_segue_stato() from public,anon,authenticated;

-- Verifica end-to-end DB con fixture annullate: niente SAL o svincoli di prova persistono.
do $$
declare
 a record;c record;s uuid:=gen_random_uuid();z uuid:=gen_random_uuid();b uuid:=gen_random_uuid();
 n integer;v jsonb;g uuid;ok boolean:=false;
 claims text:=current_setting('request.jwt.claims',true);subclaim text:=current_setting('request.jwt.claim.sub',true);
begin
 select p.id,p.company_id into a from public.profiles p join public.user_roles u on u.user_id=p.id
 where u.role::text in ('company_admin','super_admin') and exists(select 1 from public.contratti_subappalto cx join public.orders o on o.id=cx.order_id where cx.company_id=p.company_id and o.order_code like 'DEMO%' and o.deleted_at is null) limit 1;
 if a.id is null then raise exception 'Collaudo SAL: amministratore DEMO non disponibile'; end if;
 select cs.* into c from public.contratti_subappalto cs join public.orders o on o.id=cs.order_id where cs.company_id=a.company_id and o.order_code like 'DEMO%' and o.deleted_at is null order by cs.id limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',a.id::text,true);
 begin
  select coalesce(max(numero_sal),0)+1000 into n from public.sal_subappaltatori where contratto_id=c.id;
  v:=public.sal_sub_registra_con_garanzia(a.company_id,c.id,s,n,current_date,1000,5,'ricevuto','COLLAUDO TEMP transazione');
  select id into g from public.ritenute_garanzia where sal_id=s;
  if g is null or (select importo from public.ritenute_garanzia where id=g)<>50 or (select percentuale_applicata from public.ritenute_garanzia where id=g)<>5 or (select importo_netto from public.sal_subappaltatori where id=s)<>950 then raise exception 'SAL/garanzia non coerenti'; end if;
  v:=public.sal_sub_registra_con_garanzia(a.company_id,c.id,s,n,current_date,1000,5,'ricevuto','COLLAUDO TEMP transazione');
  if (v->>'gia_registrato')::boolean is not true or (select count(*) from public.ritenute_garanzia where sal_id=s)<>1 then raise exception 'Ritentativo duplicato'; end if;
  begin
   perform public.sal_sub_registra_con_garanzia(a.company_id,c.id,gen_random_uuid(),n,current_date,1000,5,'ricevuto',null);
   raise exception 'Numero SAL duplicato accettato';
  exception when unique_violation then null; end;
  update public.sal_subappaltatori set stato='contestato' where id=s;
  if (select stato from public.ritenute_garanzia where id=g)<>'annullata' then raise exception 'Contestazione non allineata'; end if;
  update public.sal_subappaltatori set stato='verificato' where id=s;
  if (select stato from public.ritenute_garanzia where id=g)<>'trattenuta' then raise exception 'Garanzia non ripristinata'; end if;
  -- Il flusso documentato di svincolo cambia il registro, non lo stato di pagamento del SAL.
  v:=public.fiscalita_svincolo_anteprima(a.company_id,g);
  perform public.fiscalita_svincola(a.company_id,g,v->>'versione',current_date,'COLLAUDO TEMP verbale di svincolo');
  if (select stato from public.ritenute_garanzia where id=g)<>'svincolata' or (select stato from public.sal_subappaltatori where id=s)<>'verificato' then raise exception 'Svincolo confuso con pagamento'; end if;
  perform public.sal_sub_registra_con_garanzia(a.company_id,c.id,z,n+1,current_date,500,0,'ricevuto',null);
  if exists(select 1 from public.ritenute_garanzia where sal_id=z) then raise exception 'Garanzia creata con 0%%'; end if;
  begin
   perform public.sal_sub_registra_con_garanzia(a.company_id,c.id,b,n+2,current_date,500,5,'pagato',null);
   raise exception 'Pagamento implicito accettato';
  exception when invalid_parameter_value then null; end;
  if exists(select 1 from public.sal_subappaltatori where id=b) then raise exception 'Scrittura parziale'; end if;
  perform public.sal_sub_registra_con_garanzia(a.company_id,c.id,b,n+2,current_date,500,5,'contestato',null);
  if not exists(select 1 from public.ritenute_garanzia where sal_id=b and stato='annullata') then raise exception 'Garanzia SAL contestato attiva'; end if;
  ok:=true;raise exception using errcode='PZ001',message='Rollback fixture SAL/garanzie';
 exception when sqlstate 'PZ001' then null;
 end;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(subclaim,''),true);
 if not ok then raise exception 'Collaudo SAL non concluso'; end if;
end $$;

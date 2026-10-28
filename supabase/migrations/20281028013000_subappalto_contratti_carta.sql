set local lock_timeout='3s';
set local statement_timeout='60s';
create table if not exists public.subappalto_contratti_carta (
 id uuid primary key,company_id uuid not null references public.companies(id),contratto_id uuid not null references public.contratti_subappalto(id),
 firmato_il date not null,firmato_da text not null,file_name text not null,mime_type text not null check(mime_type in('application/pdf','image/jpeg','image/png')),
 file_size integer not null check(file_size between 1 and 20971520),file_path text not null unique,
 stato text not null default 'bozza' check(stato in('bozza','archiviato')),contratto_snapshot jsonb not null,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),archiviato_il timestamptz
);
create index if not exists subappalto_contratti_carta_elenco on public.subappalto_contratti_carta(company_id,contratto_id,created_at desc);
alter table public.subappalto_contratti_carta enable row level security;
revoke all on public.subappalto_contratti_carta from public,anon,authenticated;
grant select on public.subappalto_contratti_carta to authenticated;
drop policy if exists contratti_carta_leggi on public.subappalto_contratti_carta;
create policy contratti_carta_leggi on public.subappalto_contratti_carta for select to authenticated using(
 auth.uid() is not null and not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id) and public.has_permission_for_company(auth.uid(),'can_view_costs',company_id)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('contratti-sub-carta','contratti-sub-carta',false,20971520,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Le policy restrittive proteggono questo bucket anche dalle policy generiche preesistenti.
drop policy if exists contratti_carta_file_leggi on storage.objects;
create policy contratti_carta_file_leggi on storage.objects for select to authenticated using(bucket_id='contratti-sub-carta' and exists(select 1 from public.subappalto_contratti_carta d where d.file_path=name and (d.stato='archiviato' or d.created_by=auth.uid())));
drop policy if exists contratti_carta_file_carica on storage.objects;
create policy contratti_carta_file_carica on storage.objects for insert to authenticated with check(bucket_id='contratti-sub-carta' and exists(select 1 from public.subappalto_contratti_carta d where d.file_path=name and d.stato='bozza' and d.created_by=auth.uid() and not public.utente_sola_lettura(d.company_id) and public.has_permission_for_company(auth.uid(),'can_edit_orders',d.company_id)));
drop policy if exists contratti_carta_file_limite_leggi on storage.objects;
create policy contratti_carta_file_limite_leggi on storage.objects as restrictive for select to authenticated using(bucket_id<>'contratti-sub-carta' or exists(select 1 from public.subappalto_contratti_carta d where d.file_path=name and (d.stato='archiviato' or d.created_by=auth.uid())));
drop policy if exists contratti_carta_file_limite_carica on storage.objects;
create policy contratti_carta_file_limite_carica on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'contratti-sub-carta' or exists(select 1 from public.subappalto_contratti_carta d where d.file_path=name and d.stato='bozza' and d.created_by=auth.uid() and not public.utente_sola_lettura(d.company_id) and public.has_permission_for_company(auth.uid(),'can_edit_orders',d.company_id)));
drop policy if exists contratti_carta_file_immutabile on storage.objects;
create policy contratti_carta_file_immutabile on storage.objects as restrictive for update to authenticated using(bucket_id<>'contratti-sub-carta') with check(bucket_id<>'contratti-sub-carta');
drop policy if exists contratti_carta_file_conserva on storage.objects;
create policy contratti_carta_file_conserva on storage.objects as restrictive for delete to authenticated using(bucket_id<>'contratti-sub-carta');
drop policy if exists contratti_carta_file_anon on storage.objects;
create policy contratti_carta_file_anon on storage.objects as restrictive for all to anon using(bucket_id<>'contratti-sub-carta') with check(bucket_id<>'contratti-sub-carta');

create or replace function public.subappalto_carta_prepara(p_company uuid,p_contratto uuid,p_id uuid,p_data date,p_firmato_da text,p_nome text,p_mime text,p_dimensione integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratti_subappalto;d public.subappalto_contratti_carta;percorso text;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 if p_id is null or p_data is null or p_data<'2000-01-01'::date or p_data>(now() at time zone 'Europe/Rome')::date or length(btrim(coalesce(p_firmato_da,''))) not between 2 and 200 or length(btrim(coalesce(p_nome,''))) not between 1 and 250 or p_mime is null or p_mime not in('application/pdf','image/jpeg','image/png') or p_dimensione is null or p_dimensione not between 1 and 20971520 then raise exception 'Controlla data, firmatario e file PDF/JPG/PNG entro 20 MB' using errcode='22023';end if;
 select * into c from public.contratti_subappalto where id=p_contratto and company_id=p_company for update;
 if c.id is null or not exists(select 1 from public.orders where id=c.order_id and company_id=p_company and deleted_at is null) then raise exception 'Contratto non disponibile' using errcode='42501';end if;
 if exists(select 1 from public.signature_requests where id=c.firma_richiesta_id and status in('pending','otp_verified','signed')) then raise exception 'È presente una firma elettronica attiva o completata: gestisci quella richiesta prima di registrare una copia cartacea';end if;
 select * into d from public.subappalto_contratti_carta where id=p_id;
 if d.id is not null then
  if d.company_id<>p_company or d.contratto_id<>p_contratto or d.created_by<>auth.uid() or d.firmato_il<>p_data or d.firmato_da<>btrim(p_firmato_da) or d.file_name<>btrim(p_nome) or d.mime_type<>p_mime or d.file_size<>p_dimensione then raise exception 'Richiesta già utilizzata: ricarica il modulo' using errcode='23505';end if;
 else
  percorso:=p_company::text||'/'||p_id::text||'/contratto.'||case p_mime when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg' else 'png' end;
  insert into public.subappalto_contratti_carta(id,company_id,contratto_id,firmato_il,firmato_da,file_name,mime_type,file_size,file_path,contratto_snapshot,created_by)
  values(p_id,p_company,p_contratto,p_data,btrim(p_firmato_da),btrim(p_nome),p_mime,p_dimensione,percorso,to_jsonb(c),auth.uid()) returning * into d;
 end if;
 return jsonb_build_object('id',d.id,'file_path',d.file_path,'stato',d.stato,'file_caricato',exists(select 1 from storage.objects where bucket_id='contratti-sub-carta' and name=d.file_path));
end $$;

create or replace function public.subappalto_carta_conferma(p_company uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.contratti_subappalto;d public.subappalto_contratti_carta;meta jsonb;
begin
 perform public.subappalto_lavori_autorizza(p_company);
 select * into d from public.subappalto_contratti_carta where id=p_id and company_id=p_company and created_by=auth.uid();
 if d.id is null then raise exception 'Caricamento non disponibile' using errcode='42501';end if;
 select * into c from public.contratti_subappalto where id=d.contratto_id and company_id=p_company for update;
 select * into d from public.subappalto_contratti_carta where id=p_id for update;
 if d.stato='archiviato' then return jsonb_build_object('id',d.id);end if;
 if to_jsonb(c) is distinct from d.contratto_snapshot then raise exception 'Il contratto è cambiato durante il caricamento: ricarica e verifica la copia firmata';end if;
 if exists(select 1 from public.signature_requests where id=c.firma_richiesta_id and status in('pending','otp_verified','signed')) then raise exception 'Firma elettronica attiva o completata: copia cartacea non registrata';end if;
 select metadata into meta from storage.objects where bucket_id='contratti-sub-carta' and name=d.file_path;
 if meta is null or coalesce((meta->>'size')::bigint,0)<>d.file_size or coalesce(meta->>'mimetype','')<>d.mime_type then raise exception 'File non caricato completamente o formato non coerente: riprova';end if;
 update public.contratti_subappalto set firmato_il=(d.firmato_il+time '12:00') at time zone 'Europe/Rome',firmato_da=d.firmato_da where id=c.id;
 update public.subappalto_contratti_carta set stato='archiviato',archiviato_il=now() where id=d.id;
 return jsonb_build_object('id',d.id);
end $$;
revoke all on function public.subappalto_carta_prepara(uuid,uuid,uuid,date,text,text,text,integer),public.subappalto_carta_conferma(uuid,uuid) from public,anon;
grant execute on function public.subappalto_carta_prepara(uuid,uuid,uuid,date,text,text,text,integer),public.subappalto_carta_conferma(uuid,uuid) to authenticated;

-- Collaudo transazionale: oggetti Storage simulati, nessun file o contratto reale conservato.
do $$ declare a record;o record;c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();r jsonb;ok boolean:=false;
 claims text:=current_setting('request.jwt.claims',true);subclaim text:=current_setting('request.jwt.claim.sub',true);
begin
 select p.id,p.company_id into a from public.profiles p join public.user_roles u on u.user_id=p.id where u.role::text in('company_admin','super_admin') and exists(select 1 from public.contratti_subappalto cs join public.orders x on x.id=cs.order_id where cs.company_id=p.company_id and x.order_code like 'DEMO%' and x.deleted_at is null) limit 1;
 if a.id is null then raise exception 'Amministratore DEMO richiesto per collaudo';end if;
 select cs.* into o from public.contratti_subappalto cs join public.orders x on x.id=cs.order_id where cs.company_id=a.company_id and x.order_code like 'DEMO%' and x.deleted_at is null limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);perform set_config('request.jwt.claim.sub',a.id::text,true);
 begin
 insert into public.contratti_subappalto(id,company_id,subappaltatore_id,order_id,numero_contratto,descrizione_lavori,importo_contrattuale,ritenuta_garanzia_pct) values(c,a.company_id,o.subappaltatore_id,o.order_id,'COLLAUDO TEMP CARTA','DEMO nessuna firma reale',1000,5);
 r:=public.subappalto_carta_prepara(a.company_id,c,d,current_date,'Firmatario DEMO','contratto-demo.pdf','application/pdf',100);
 perform public.subappalto_carta_prepara(a.company_id,c,d,current_date,'Firmatario DEMO','contratto-demo.pdf','application/pdf',100);
 if(select count(*) from public.subappalto_contratti_carta where contratto_id=c)<>1 then raise exception 'Duplicazione caricamento';end if;
 begin
  perform public.subappalto_carta_conferma(a.company_id,d);raise exception 'Firma senza file accettata';
 exception when raise_exception then if sqlerrm='Firma senza file accettata' then raise;end if;end;
 if(select firmato_il from public.contratti_subappalto where id=c) is not null then raise exception 'Contratto firmato senza file';end if;
 insert into storage.objects(bucket_id,name,metadata) values('contratti-sub-carta',r->>'file_path',jsonb_build_object('size',99,'mimetype','application/pdf'));
 begin
  perform public.subappalto_carta_conferma(a.company_id,d);raise exception 'File incompleto accettato';
 exception when raise_exception then if sqlerrm='File incompleto accettato' then raise;end if;end;
 update storage.objects set metadata=jsonb_build_object('size',100,'mimetype','application/pdf') where bucket_id='contratti-sub-carta' and name=r->>'file_path';
 perform public.subappalto_carta_conferma(a.company_id,d);perform public.subappalto_carta_conferma(a.company_id,d);
 if(select stato from public.subappalto_contratti_carta where id=d)<>'archiviato' or (select firmato_da from public.contratti_subappalto where id=c)<>'Firmatario DEMO' then raise exception 'Registrazione non atomica';end if;
 if(select importo_contrattuale from public.contratti_subappalto where id=c)<>1000 then raise exception 'Importo alterato';end if;
 ok:=true;raise exception using errcode='PZ001',message='rollback collaudo carta';
 exception when sqlstate 'PZ001' then null;end;
 perform set_config('request.jwt.claims',coalesce(claims,''),true);perform set_config('request.jwt.claim.sub',coalesce(subclaim,''),true);
 if not ok then raise exception 'Collaudo incompleto';end if;
end $$;

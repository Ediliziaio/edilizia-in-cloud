-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
create table if not exists public.mezzi_verbali_tecnici (
 id uuid primary key,company_id uuid not null references public.companies(id) on delete cascade,
 mezzo_id uuid not null references public.mezzi(id) on delete cascade,manutenzione_id uuid not null,documento_id uuid not null,
 fonte_impronta text not null check(fonte_impronta~'^[0-9a-f]{64}$'),fonte_snapshot jsonb not null,
 origine_path text not null,copia_path text not null,sha256 text not null check(sha256~'^[0-9a-f]{64}$'),dimensione integer not null check(dimensione between 1 and 20971520),
 parametri jsonb not null,registrato_da uuid not null,registrato_il timestamptz not null default clock_timestamp()
);
alter table public.mezzi_verbali_tecnici enable row level security;
revoke all on table public.mezzi_verbali_tecnici from public,anon,authenticated,service_role;
grant select,insert on table public.mezzi_verbali_tecnici to service_role;
create index if not exists mezzi_verbali_tecnici_macchina_idx on public.mezzi_verbali_tecnici(company_id,mezzo_id,registrato_il desc);

create or replace function public.mezzi_verbale_parametri(_p jsonb) returns jsonb language plpgsql immutable security invoker set search_path=public as $$
declare a date;b date;v jsonb;begin
 if jsonb_typeof(_p) is distinct from 'object' or _p->'conferma_tecnica' is distinct from 'true'::jsonb or coalesce(length(trim(_p->>'titolo')),0) not between 1 and 180 or coalesce(_p->>'categoria','') not in('revisione','verifica_periodica','libretto','taratura','manuale_ce','pimus','autorizzazione_ministeriale') then raise exception 'Titolo, classificazione e conferma del documento tecnico sono necessari';end if;
 if coalesce(_p->>'data_inizio','')<>'' then if _p->>'data_inizio'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Data documento non valida';end if;a:=(_p->>'data_inizio')::date;end if;
 if coalesce(_p->>'data_scadenza','')<>'' then if _p->>'data_scadenza'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Scadenza non valida';end if;b:=(_p->>'data_scadenza')::date;end if;
 if b<a then raise exception 'Scadenza precedente all’inizio del documento';end if;
 v:=jsonb_build_object('titolo',trim(_p->>'titolo'),'categoria',_p->>'categoria','data_inizio',a,'data_scadenza',b,'conferma_tecnica',true);
 if v is distinct from _p then raise exception 'Parametri documentali non canonici';end if;return v;
end$$;
revoke all on function public.mezzi_verbale_parametri(jsonb) from public,anon,authenticated;grant execute on function public.mezzi_verbale_parametri(jsonb) to service_role;

create or replace function public.mezzi_verbale_puo_registrare(_autore uuid,_company uuid) returns boolean language sql stable security invoker set search_path=public as $$select _autore is not null and coalesce(public.has_permission_for_company(_autore,'can_edit_mezzi',_company),false)$$;
revoke all on function public.mezzi_verbale_puo_registrare(uuid,uuid) from public,anon,authenticated;grant execute on function public.mezzi_verbale_puo_registrare(uuid,uuid) to service_role;

create or replace function public.mezzi_verbale_fonte(_company uuid,_mezzo uuid,_manutenzione uuid,_autore uuid) returns jsonb language plpgsql stable security invoker set search_path=public set timezone='UTC' as $$
declare m public.mezzi_manutenzioni;o jsonb;b jsonb;begin
 if not public.mezzi_verbale_puo_registrare(_autore,_company) or not exists(select 1 from public.mezzi where id=_mezzo and company_id=_company and deleted_at is null) then raise exception 'Non puoi registrare documenti di questa macchina' using errcode='42501';end if;
 select * into m from public.mezzi_manutenzioni where id=_manutenzione and company_id=_company and mezzo_id=_mezzo;
 if not found or m.file_path is null or nullif(trim(m.file_name),'') is null or left(m.file_path,length(_company::text||'/'||_mezzo::text||'/'))<>_company::text||'/'||_mezzo::text||'/' or array_length(string_to_array(m.file_path,'/'),1)<>3 or position(E'\\' in m.file_path)>0 or m.file_path~'(^|/)(\.|\.\.|)(/|$)' then raise exception 'Allegato dell’intervento non disponibile o non pertinente';end if;
 select jsonb_build_object('id',x.id,'versione',x.version,'aggiornato_il',x.updated_at,'etag',x.metadata->>'eTag','dimensione',x.metadata->'size') into o from storage.objects x where x.bucket_id='mezzi-documenti' and x.name=m.file_path;
 if o is null then raise exception 'Originale dell’intervento non disponibile';end if;
 b:=jsonb_build_object('company_id',_company,'mezzo_id',_mezzo,'manutenzione_id',m.id,'tipo',m.tipo,'data',m.data,'file_name',m.file_name);
 return jsonb_build_object('foto',b||jsonb_build_object('impronta',public.sicurezza_sds_impronta(b||jsonb_build_object('oggetto',o,'aggiornato_il',m.updated_at))),'path',m.file_path);
end$$;
revoke all on function public.mezzi_verbale_fonte(uuid,uuid,uuid,uuid) from public,anon,authenticated;grant execute on function public.mezzi_verbale_fonte(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.mezzi_verbale_copia_esistente(_company uuid,_mezzo uuid,_manutenzione uuid,_richiesta uuid,_impronta text,_parametri jsonb,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r public.mezzi_verbali_tecnici;p jsonb;begin
 if not public.mezzi_verbale_puo_registrare(_autore,_company) then raise exception 'Permesso modifica Mezzi necessario' using errcode='42501';end if;
 p:=public.mezzi_verbale_parametri(_parametri);
 select * into r from public.mezzi_verbali_tecnici where id=_richiesta;if not found then return null;end if;
 if r.company_id is distinct from _company or r.mezzo_id is distinct from _mezzo or r.manutenzione_id is distinct from _manutenzione then raise exception 'Richiesta non pertinente' using errcode='42501';end if;
 if r.fonte_impronta is distinct from _impronta or r.parametri is distinct from p then raise exception 'La richiesta è già stata usata con dati diversi: riapri il dialogo e verifica' using errcode='40001';end if;
 return jsonb_build_object('id',r.id,'documento_id',r.documento_id,'company_id',r.company_id,'mezzo_id',r.mezzo_id,'manutenzione_id',r.manutenzione_id,'titolo',r.parametri->>'titolo','categoria',r.parametri->>'categoria','registrato_il',r.registrato_il,'copia_path',r.copia_path,'disponibile',exists(select 1 from public.mezzi_documenti d join storage.objects o on o.bucket_id='mezzi-documenti' and o.name=d.file_path where d.id=r.documento_id and d.company_id=r.company_id and d.mezzo_id=r.mezzo_id and d.file_path=r.copia_path));
end$$;
revoke all on function public.mezzi_verbale_copia_esistente(uuid,uuid,uuid,uuid,text,jsonb,uuid) from public,anon,authenticated;grant execute on function public.mezzi_verbale_copia_esistente(uuid,uuid,uuid,uuid,text,jsonb,uuid) to service_role;

create or replace function public.mezzi_verbale_completa(_company uuid,_mezzo uuid,_manutenzione uuid,_richiesta uuid,_impronta text,_parametri jsonb,_autore uuid,_tentativo uuid,_copia_path text,_sha256 text,_dimensione integer) returns jsonb language plpgsql security invoker set search_path=public as $$
declare r jsonb;f jsonb;p jsonb;doc uuid:=gen_random_uuid();prefisso text;begin
 if _richiesta is null or _tentativo is null or coalesce(_impronta,'')!~'^[0-9a-f]{64}$' then raise exception 'Identità della registrazione non valida';end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtextextended('mezzi-verbale-richiesta:'||_richiesta::text,0));
 r:=public.mezzi_verbale_copia_esistente(_company,_mezzo,_manutenzione,_richiesta,_impronta,_parametri,_autore);if r is not null then return r;end if;
 p:=public.mezzi_verbale_parametri(_parametri);
 -- Shared with the V writer triggers; metadata cannot change between this check and insertion.
 perform pg_advisory_xact_lock(hashtextextended('pos-documenti-mezzo:'||_company::text||':'||_mezzo::text,0));
 perform 1 from public.mezzi_manutenzioni where id=_manutenzione and company_id=_company and mezzo_id=_mezzo for share;
 perform 1 from storage.objects o join public.mezzi_manutenzioni m on m.file_path=o.name and m.id=_manutenzione and m.company_id=_company and m.mezzo_id=_mezzo where o.bucket_id='mezzi-documenti' and left(o.name,length(_company::text||'/'||_mezzo::text||'/'))=_company::text||'/'||_mezzo::text||'/' for share of o;
 f:=public.mezzi_verbale_fonte(_company,_mezzo,_manutenzione,_autore);
 if f->'foto'->>'impronta' is distinct from _impronta then raise exception 'Allegato dell’intervento cambiato: rileggi e verifica' using errcode='40001';end if;
 prefisso:=_company::text||'/'||_mezzo::text||'/'||_richiesta::text||'-'||_tentativo::text||'-';
 if _copia_path is null or left(_copia_path,length(prefisso))<>prefisso or length(_copia_path)<=length(prefisso) or array_length(string_to_array(_copia_path,'/'),1)<>3 or position(E'\\' in _copia_path)>0 or _copia_path=f->>'path' or coalesce(_sha256,'')!~'^[0-9a-f]{64}$' or _dimensione is null or _dimensione not between 1 and 20971520 then raise exception 'Copia tecnica non valida';end if;
 perform 1 from storage.objects where bucket_id='mezzi-documenti' and name=_copia_path for share;if not found then raise exception 'Copia tecnica non conservata';end if;
 insert into public.mezzi_documenti(id,company_id,mezzo_id,categoria,titolo,data_inizio,data_scadenza,file_path,file_name,created_by)values(doc,_company,_mezzo,p->>'categoria',p->>'titolo',nullif(p->>'data_inizio','')::date,nullif(p->>'data_scadenza','')::date,_copia_path,f->'foto'->>'file_name',_autore);
 insert into public.mezzi_verbali_tecnici(id,company_id,mezzo_id,manutenzione_id,documento_id,fonte_impronta,fonte_snapshot,origine_path,copia_path,sha256,dimensione,parametri,registrato_da)values(_richiesta,_company,_mezzo,_manutenzione,doc,_impronta,f->'foto',f->>'path',_copia_path,_sha256,_dimensione,p,_autore);
 return public.mezzi_verbale_copia_esistente(_company,_mezzo,_manutenzione,_richiesta,_impronta,p,_autore);
end$$;
revoke all on function public.mezzi_verbale_completa(uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid,text,text,integer) from public,anon,authenticated;grant execute on function public.mezzi_verbale_completa(uuid,uuid,uuid,uuid,text,jsonb,uuid,uuid,text,text,integer) to service_role;

create or replace function public.mezzi_verbali_tecnici_elenco(_company uuid,_mezzo uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb;begin
 if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_mezzi',_company),false) or not exists(select 1 from public.mezzi where id=_mezzo and company_id=_company) then raise exception 'Registro non disponibile' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'documento_id',j.documento_id,'manutenzione_id',j.manutenzione_id,'fonte_impronta',j.fonte_impronta,'data_intervento',j.fonte_snapshot->>'data','titolo',j.parametri->>'titolo','categoria',j.parametri->>'categoria','registrato_il',j.registrato_il,'registrato_da',j.registrato_da,'disponibile',exists(select 1 from public.mezzi_documenti d join storage.objects o on o.bucket_id='mezzi-documenti' and o.name=d.file_path where d.id=j.documento_id and d.company_id=_company and d.mezzo_id=_mezzo and d.file_path=j.copia_path)) order by j.registrato_il desc,j.id),'[]') into r from (select * from public.mezzi_verbali_tecnici where company_id=_company and mezzo_id=_mezzo order by registrato_il desc,id limit 201)j;
 if jsonb_array_length(r)>200 then raise exception 'Registro esteso: lettura non troncata, serve un filtro di periodo';end if;return jsonb_build_object('company_id',_company,'mezzo_id',_mezzo,'registrazioni',r);
end$$;
revoke all on function public.mezzi_verbali_tecnici_elenco(uuid,uuid) from public,anon;grant execute on function public.mezzi_verbali_tecnici_elenco(uuid,uuid) to authenticated;
notify pgrst,'reload schema';

set local lock_timeout='3s';set local statement_timeout='60s';
-- A company SDS is a technical document owned by the company, never an unscoped personal dossier.
alter table public.sicurezza_fascicolo drop constraint if exists sicurezza_fascicolo_check;
alter table public.sicurezza_fascicolo add constraint sicurezza_fascicolo_check check(
 order_id is not null or subappaltatore_id is not null or
 (tipo='sds' and operaio_id is null and incarico_id is null and fase_id is null)
);

create table if not exists public.sicurezza_sds_revisioni (
 documento_id uuid primary key references public.sicurezza_fascicolo(id),
 company_id uuid not null references public.companies(id),
 precedente_id uuid not null references public.sicurezza_fascicolo(id),
 impronta_precedente text not null,impronta_documento text not null,
 collegato_da uuid not null references auth.users(id),collegato_il timestamptz not null default clock_timestamp(),
 check(documento_id<>precedente_id)
);
create index if not exists sds_revisioni_precedente on public.sicurezza_sds_revisioni(company_id,precedente_id);
create index if not exists sds_revisioni_autore on public.sicurezza_sds_revisioni(collegato_da);
alter table public.sicurezza_sds_revisioni enable row level security;
revoke all on public.sicurezza_sds_revisioni from public,anon,authenticated,service_role;
grant select on public.sicurezza_sds_revisioni to authenticated,service_role;
drop policy if exists sds_revisioni_lettura on public.sicurezza_sds_revisioni;
create policy sds_revisioni_lettura on public.sicurezza_sds_revisioni for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
create or replace function public.sds_revisione_immutabile() returns trigger language plpgsql security invoker set search_path=public as $$begin raise exception 'Il collegamento tra revisioni SDS non si modifica o elimina';end$$;
revoke all on function public.sds_revisione_immutabile() from public,anon,authenticated;
drop trigger if exists sds_revisione_immutabile on public.sicurezza_sds_revisioni;
create trigger sds_revisione_immutabile before update or delete on public.sicurezza_sds_revisioni for each row execute function public.sds_revisione_immutabile();

create or replace function public.sds_aziendali_quadro(_company uuid) returns jsonb language plpgsql security definer set search_path=public set timezone='UTC' as $$begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object(
 'impronta',public.sicurezza_sds_documento(e)->>'impronta',
 'precedente_id',(select r.precedente_id from public.sicurezza_sds_revisioni r where r.documento_id=e.id and r.company_id=_company),
 'successive',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'titolo',d.titolo,'revisione',d.revisione,'stato',d.stato) order by r.collegato_il,d.id) from public.sicurezza_sds_revisioni r join public.sicurezza_fascicolo d on d.id=r.documento_id and d.company_id=_company where r.precedente_id=e.id and r.company_id=_company),'[]'::jsonb),
 'impieghi',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'order_id',p.order_id,'order_code',o.order_code,'nome',p.nome,'versione',p.versione,'fase_id',p.fase_id,'dal',p.dal,'al',p.al,'annullato',p.annullato) order by o.order_code,p.id) from public.sicurezza_prodotti_impieghi p join public.orders o on o.id=p.order_id and o.company_id=_company where p.company_id=_company and p.evidenza_id=e.id),'[]'::jsonb)
 ) order by e.updated_at desc,e.id) from public.sicurezza_fascicolo e where e.company_id=_company and e.tipo='sds' and e.order_id is null and e.subappaltatore_id is null and e.operaio_id is null and e.incarico_id is null and e.fase_id is null),'[]'::jsonb);
end$$;
revoke all on function public.sds_aziendali_quadro(uuid) from public,anon;
grant execute on function public.sds_aziendali_quadro(uuid) to authenticated;

create or replace function public.sds_collega_revisione(_company uuid,_documento uuid,_precedente uuid,_impronta_precedente text) returns public.sicurezza_sds_revisioni
language plpgsql security definer set search_path=public set timezone='UTC' as $$
declare d public.sicurezza_fascicolo;p public.sicurezza_fascicolo;r public.sicurezza_sds_revisioni;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi collegare revisioni SDS' using errcode='42501';end if;
 if _documento is null or _precedente is null or _documento=_precedente then raise exception 'Scegli due documenti SDS distinti';end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtextextended('sds_revisioni:'||_company::text,0));
 select * into d from public.sicurezza_fascicolo where id=_documento and company_id=_company for share;
 select * into p from public.sicurezza_fascicolo where id=_precedente and company_id=_company for share;
 if d.id is null or p.id is null or d.tipo<>'sds' or p.tipo<>'sds' or d.order_id is not null or p.order_id is not null or d.subappaltatore_id is not null or p.subappaltatore_id is not null or d.operaio_id is not null or p.operaio_id is not null or d.incarico_id is not null or p.incarico_id is not null or d.fase_id is not null or p.fase_id is not null then raise exception 'Scegli SDS aziendali della stessa impresa';end if;
 select * into r from public.sicurezza_sds_revisioni where documento_id=_documento;
 if found then
  if r.company_id=_company and r.precedente_id=_precedente and r.impronta_precedente=_impronta_precedente then return r;end if;
  raise exception 'La revisione è già collegata: non si cambia la sua provenienza' using errcode='40001';
 end if;
 if public.sicurezza_sds_documento(p)->>'impronta' is distinct from _impronta_precedente then raise exception 'Il precedente è cambiato: rileggilo prima di collegare la revisione' using errcode='40001';end if;
 if nullif(trim(d.revisione),'') is null or d.data_rilascio is null or nullif(trim(d.file_path),'') is null or nullif(trim(d.file_name),'') is null or d.stato in ('superato','non_applicabile') then raise exception 'Completa file, revisione e data della nuova SDS prima di collegarla';end if;
 if p.data_rilascio is not null and d.data_rilascio<p.data_rilascio then raise exception 'La nuova SDS precede la data del documento precedente';end if;
 if exists(with recursive antenati(id,profondita) as (
  select _precedente,0 union all select r0.precedente_id,a.profondita+1 from antenati a join public.sicurezza_sds_revisioni r0 on r0.documento_id=a.id and r0.company_id=_company where a.profondita<100
 ) select 1 from antenati where id=_documento or profondita=100) then raise exception 'Il collegamento creerebbe un ciclo o una catena troppo lunga';end if;
 insert into public.sicurezza_sds_revisioni(documento_id,company_id,precedente_id,impronta_precedente,impronta_documento,collegato_da) values(_documento,_company,_precedente,_impronta_precedente,public.sicurezza_sds_documento(d)->>'impronta',auth.uid()) returning * into r;
 return r;
end$$;
revoke all on function public.sds_collega_revisione(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.sds_collega_revisione(uuid,uuid,uuid,text) to authenticated;

create or replace function public.sds_documento_ambito_stabile() returns trigger language plpgsql security definer set search_path=public as $$begin
 if (new.company_id,new.order_id,new.subappaltatore_id,new.operaio_id,new.incarico_id,new.fase_id,new.tipo) is distinct from (old.company_id,old.order_id,old.subappaltatore_id,old.operaio_id,old.incarico_id,old.fase_id,old.tipo) and (exists(select 1 from public.sicurezza_prodotti_impieghi p where p.evidenza_id=old.id) or exists(select 1 from public.sicurezza_sds_revisioni r where r.documento_id=old.id or r.precedente_id=old.id)) then raise exception 'SDS referenziata: conserva tipo, titolare e ambito; carica un altro documento';end if;
 return new;
end$$;
revoke all on function public.sds_documento_ambito_stabile() from public,anon,authenticated;
drop trigger if exists sds_documento_ambito_stabile on public.sicurezza_fascicolo;
create trigger sds_documento_ambito_stabile before update on public.sicurezza_fascicolo for each row when(old.tipo='sds') execute function public.sds_documento_ambito_stabile();

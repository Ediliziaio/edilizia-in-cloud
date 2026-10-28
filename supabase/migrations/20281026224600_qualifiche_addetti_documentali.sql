-- X: reviewed qualifications anchored to a named person's existing training document.
-- No medical/identity document, automatic course recognition or default renewal cadence.
set local lock_timeout='3s';set local statement_timeout='60s';
create table if not exists public.sicurezza_qualifiche_addetti(
 id uuid primary key,company_id uuid not null references public.companies(id),
 persona_tipo text not null check(persona_tipo in('hr','esterno')),persona_id uuid not null,
 famiglia_id uuid not null,versione integer not null check(versione>0),precedente_id uuid references public.sicurezza_qualifiche_addetti(id),
 stato text not null check(stato in('riesaminata','revocata')),fonte_id uuid not null,fonte_impronta text not null,fonte_snapshot jsonb not null,
 dati jsonb not null,motivo text not null default '',richiesta jsonb not null,registrato_da uuid not null,registrato_il timestamptz not null default clock_timestamp(),
 unique(famiglia_id,versione)
);
alter table public.sicurezza_qualifiche_addetti enable row level security;
revoke all on public.sicurezza_qualifiche_addetti from public,anon,authenticated;
create index if not exists sicurezza_qualifiche_persona on public.sicurezza_qualifiche_addetti(company_id,persona_tipo,persona_id,registrato_il desc);

create or replace function public.sicurezza_qualifiche_accesso(_company uuid,_tipo text,_persona uuid,_scrittura boolean default false) returns jsonb language plpgsql security invoker set search_path=public as $$
declare p jsonb;hr boolean;sf boolean;begin
 hr:=coalesce(public.has_permission_for_company(auth.uid(),'can_view_persone',_company),false);
 sf:=coalesce(public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company),false);
 if auth.uid() is null or _tipo not in('hr','esterno') or _tipo is null or (_tipo='hr' and not(hr or sf)) or (_tipo='esterno' and not sf) or _scrittura and (public.utente_sola_lettura(_company) or _tipo='hr' and not hr) then raise exception 'Non puoi consultare o gestire le qualifiche di questa persona' using errcode='42501';end if;
 if _tipo='hr' then select jsonb_build_object('id',id,'tipo',_tipo,'nome',nome,'cognome',cognome,'attivo',attivo) into p from public.hr_profili where id=_persona and company_id=_company;
 else select jsonb_build_object('id',id,'tipo',_tipo,'nome',nome,'cognome',cognome,'subappaltatore_id',subappaltatore_id,'attivo',attivo) into p from public.subappaltatori_operai where id=_persona and company_id=_company;end if;
 if p is null then raise exception 'Persona non presente in questa azienda' using errcode='42501';end if;return p;
end$$;
revoke all on function public.sicurezza_qualifiche_accesso(uuid,text,uuid,boolean) from public,anon,authenticated;

create or replace function public.sicurezza_qualifica_fonte(_company uuid,_tipo text,_persona uuid,_fonte uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare p jsonb;f jsonb;percorso text;bucket text;oggetto jsonb;begin
 p:=public.sicurezza_qualifiche_accesso(_company,_tipo,_persona,false);
 if _tipo='hr' then
  select jsonb_build_object('id',d.id,'categoria',d.categoria,'titolo',d.titolo,'ente',d.ente,'data_rilascio',d.data_rilascio,'data_scadenza',d.data_scadenza,'file_name',d.file_name,'updated_at',d.updated_at),d.file_path into f,percorso from public.hr_documenti d where d.id=_fonte and d.company_id=_company and d.hr_profilo_id=_persona and d.categoria in('corso_sicurezza','patente');bucket:='hr-documenti';
 else
  select jsonb_build_object('id',d.id,'categoria',d.tipo,'titolo',d.titolo,'data_rilascio',d.data_rilascio,'data_scadenza',d.data_scadenza,'file_name',d.file_name,'stato',d.stato,'updated_at',d.updated_at,'order_id',d.order_id,'fase_id',d.fase_id,'applicabile_dal',d.applicabile_dal,'applicabile_al',d.applicabile_al),d.file_path into f,percorso from public.sicurezza_fascicolo d where d.id=_fonte and d.company_id=_company and d.operaio_id=_persona and d.subappaltatore_id=(p->>'subappaltatore_id')::uuid and d.tipo in('formazione','qualificazione') and d.stato not in('superato','non_applicabile');bucket:='fascicoli-cantiere';
 end if;
 if f is null or percorso is null or nullif(trim(f->>'file_name'),'') is null or left(percorso,length(_company::text||'/'))<>_company::text||'/' or array_length(string_to_array(percorso,'/'),1)<>3 or position(E'\\' in percorso)>0 or percorso~'(^|/)(\.|\.\.|)(/|$)' then raise exception 'Originale formativo non disponibile o non pertinente';end if;
 -- HR files are stored under the profile; external files under the evidence ID.
 if split_part(percorso,'/',2)<>(case when _tipo='hr' then _persona::text else _fonte::text end) then raise exception 'Percorso originale non pertinente';end if;
 select jsonb_build_object('id',id,'versione',version,'aggiornato_il',updated_at,'etag',metadata->>'eTag','dimensione',metadata->'size') into oggetto from storage.objects where bucket_id=bucket and name=percorso;
 if oggetto is null then raise exception 'Originale non presente nell’archivio';end if;
 f:=f||jsonb_build_object('persona',p-'attivo');
 return jsonb_build_object('foto',f||jsonb_build_object('impronta',public.sicurezza_sds_impronta(f||jsonb_build_object('oggetto',oggetto))),'bucket',bucket,'path',percorso);
end$$;
revoke all on function public.sicurezza_qualifica_fonte(uuid,text,uuid,uuid) from public,anon,authenticated;

create or replace function public.sicurezza_qualifiche_quadro(_company uuid,_tipo text,_persona uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p jsonb;r jsonb:='[]';f jsonb;elenco jsonb:='[]';x record;corrente boolean;puo boolean;begin
 p:=public.sicurezza_qualifiche_accesso(_company,_tipo,_persona,false);
 puo:=_tipo='esterno' or coalesce(public.has_permission_for_company(auth.uid(),'can_view_persone',_company),false);
 -- Only authorized document readers receive source paths; Safety-only HR readers see the reviewed projection.
 if puo then
 for x in select id from public.hr_documenti where _tipo='hr' and company_id=_company and hr_profilo_id=_persona and categoria in('corso_sicurezza','patente') union all select id from public.sicurezza_fascicolo where _tipo='esterno' and company_id=_company and operaio_id=_persona and subappaltatore_id=(p->>'subappaltatore_id')::uuid and tipo in('formazione','qualificazione') and stato not in('superato','non_applicabile') loop
  if jsonb_array_length(elenco)>=200 then raise exception 'Più di 200 originali: serve un filtro prima di continuare';end if;
  begin f:=public.sicurezza_qualifica_fonte(_company,_tipo,_persona,x.id);elenco:=elenco||jsonb_build_array(f);exception when raise_exception then elenco:=elenco||jsonb_build_array(jsonb_build_object('id',x.id,'non_disponibile',true));end;
 end loop;end if;
 for x in select * from public.sicurezza_qualifiche_addetti where company_id=_company and persona_tipo=_tipo and persona_id=_persona order by registrato_il desc,id limit 201 loop
  if jsonb_array_length(r)>=200 then raise exception 'Più di 200 revisioni: serve un filtro prima di continuare';end if;
  corrente:=false;
  begin f:=public.sicurezza_qualifica_fonte(_company,_tipo,_persona,x.fonte_id);corrente:=f->'foto'->>'impronta'=x.fonte_impronta;exception when raise_exception then corrente:=false;end;
  r:=r||jsonb_build_array(jsonb_build_object('id',x.id,'famiglia_id',x.famiglia_id,'versione',x.versione,'precedente_id',x.precedente_id,'stato',x.stato,'dati',x.dati,'motivo',x.motivo,'fonte_id',x.fonte_id,'fonte_impronta',x.fonte_impronta,'fonte_corrente',corrente,'registrato_da',x.registrato_da,'registrato_il',x.registrato_il));
 end loop;
 return jsonb_build_object('company_id',_company,'persona',p,'puo_classificare',puo and not public.utente_sola_lettura(_company),'fonti',elenco,'registrazioni',r);
end$$;
revoke all on function public.sicurezza_qualifiche_quadro(uuid,text,uuid) from public,anon;grant execute on function public.sicurezza_qualifiche_quadro(uuid,text,uuid) to authenticated;

create or replace function public.sicurezza_qualifica_registra(_id uuid,_company uuid,_tipo text,_persona uuid,_precedente uuid,_azione text,_fonte uuid,_impronta text,_dati jsonb,_motivo text default '') returns jsonb language plpgsql security definer set search_path=public as $$
declare p jsonb;e public.sicurezza_qualifiche_addetti;prec public.sicurezza_qualifiche_addetti;ultimo uuid;f jsonb;richiesta jsonb;fam uuid;v integer;d jsonb;inizio date;fine date;k text;begin
 p:=public.sicurezza_qualifiche_accesso(_company,_tipo,_persona,true);
 if _id is null or _azione not in('riesamina','revoca') or _azione is null or length(coalesce(_dati::text,''))>20000 or length(coalesce(_motivo,''))>2000 then raise exception 'Richiesta non valida';end if;
 richiesta:=jsonb_build_object('precedente',_precedente,'azione',_azione,'fonte',_fonte,'impronta',_impronta,'dati',_dati,'motivo',coalesce(_motivo,''));
 perform set_config('lock_timeout','3s',true);perform pg_advisory_xact_lock(hashtextextended('qualifiche:'||_company::text||':'||_tipo||':'||_persona::text,0));
 select * into e from public.sicurezza_qualifiche_addetti where id=_id;
 if found then
  if (e.company_id,e.persona_tipo,e.persona_id,e.registrato_da,e.richiesta) is distinct from (_company,_tipo,_persona,auth.uid(),richiesta) then raise exception 'Richiesta già utilizzata con dati diversi' using errcode='40001';end if;
  return jsonb_build_object('id',e.id,'famiglia_id',e.famiglia_id,'versione',e.versione);
 end if;
 if _precedente is not null then
  select * into prec from public.sicurezza_qualifiche_addetti where id=_precedente and company_id=_company and persona_tipo=_tipo and persona_id=_persona;
  if not found then raise exception 'Revisione precedente non pertinente';end if;
  select id into ultimo from public.sicurezza_qualifiche_addetti where famiglia_id=prec.famiglia_id order by versione desc limit 1;
  if ultimo is distinct from _precedente then raise exception 'Esiste una revisione più recente: rileggi le qualifiche' using errcode='40001';end if;
  fam:=prec.famiglia_id;v:=prec.versione+1;
 else fam:=_id;v:=1;end if;
 if _azione='revoca' then
  if _fonte is not null or _impronta is not null or _dati is not null then raise exception 'La revoca usa esclusivamente il riferimento precedente e il motivo';end if;
  if prec.id is null or prec.stato='revocata' or coalesce(length(trim(_motivo)),0)=0 then raise exception 'Indica una qualifica attiva e il motivo della revoca';end if;
  d:=prec.dati;f:=jsonb_build_object('foto',prec.fonte_snapshot);_fonte:=prec.fonte_id;_impronta:=prec.fonte_impronta;
 else
  if jsonb_typeof(_dati) is distinct from 'object' or _dati->'conferma_lettura' is distinct from 'true'::jsonb or _dati->>'tipologia' not in('formazione','abilitazione','addestramento','qualifica') or _dati->>'tipologia' is null then raise exception 'Classifica e conferma la lettura dell’originale';end if;
  d:=jsonb_build_object('tipologia',_dati->>'tipologia','conferma_lettura',true);
  foreach k in array array['titolo','ambito','ente','validita_dal','validita_al','motivazione_senza_scadenza','limitazioni','riferimento'] loop d:=d||jsonb_build_object(k,trim(coalesce(_dati->>k,'')));end loop;
  if d is distinct from _dati or coalesce(length(d->>'titolo'),0) not between 1 and 180 or coalesce(length(d->>'ambito'),0) not between 1 and 2000 or coalesce(length(d->>'ente'),0) not between 1 and 300 or length(d->>'limitazioni')>2000 or length(d->>'riferimento')>2000 or length(d->>'motivazione_senza_scadenza')>2000 then raise exception 'Indica titolo, ambito, ente e dati canonici entro i limiti';end if;
  if d->>'validita_dal'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or d->>'validita_al'<>'' and d->>'validita_al'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Date non valide';end if;
  inizio:=(d->>'validita_dal')::date;fine:=nullif(d->>'validita_al','')::date;
  if fine<inizio or fine is null and length(d->>'motivazione_senza_scadenza')=0 or fine is not null and length(d->>'motivazione_senza_scadenza')<>0 then raise exception 'Controlla periodo o motivazione dell’assenza di scadenza';end if;
  if prec.id is not null and (d->>'titolo',d->>'tipologia',d->>'ambito') is distinct from (prec.dati->>'titolo',prec.dati->>'tipologia',prec.dati->>'ambito') then raise exception 'Una revisione conserva titolo, tipologia e ambito; crea una qualifica distinta per un ambito diverso';end if;
  if _tipo='hr' then perform 1 from public.hr_profili where id=_persona and company_id=_company for share;else perform 1 from public.subappaltatori_operai where id=_persona and company_id=_company for share;end if;
  if _tipo='hr' then perform 1 from public.hr_documenti where id=_fonte and company_id=_company and hr_profilo_id=_persona for share;
  else perform 1 from public.sicurezza_fascicolo where id=_fonte and company_id=_company and operaio_id=_persona for share;end if;
  f:=public.sicurezza_qualifica_fonte(_company,_tipo,_persona,_fonte);
  perform 1 from storage.objects where bucket_id=f->>'bucket' and name=f->>'path' for share;
  f:=public.sicurezza_qualifica_fonte(_company,_tipo,_persona,_fonte);
  if f->'foto'->>'impronta' is distinct from _impronta then raise exception 'Originale o identità della persona cambiati: rileggi e riesamina' using errcode='40001';end if;
  if nullif(f->'foto'->>'data_rilascio','')::date>inizio or nullif(f->'foto'->>'data_scadenza','') is not null and (fine is null or fine>(f->'foto'->>'data_scadenza')::date) then raise exception 'Il periodo dichiarato supera le date dell’originale';end if;
 end if;
 insert into public.sicurezza_qualifiche_addetti(id,company_id,persona_tipo,persona_id,famiglia_id,versione,precedente_id,stato,fonte_id,fonte_impronta,fonte_snapshot,dati,motivo,richiesta,registrato_da)values(_id,_company,_tipo,_persona,fam,v,_precedente,case when _azione='revoca' then 'revocata' else 'riesaminata' end,_fonte,_impronta,f->'foto',d,coalesce(_motivo,''),richiesta,auth.uid());
 return jsonb_build_object('id',_id,'famiglia_id',fam,'versione',v);
end$$;
revoke all on function public.sicurezza_qualifica_registra(uuid,uuid,text,uuid,uuid,text,uuid,text,jsonb,text) from public,anon;grant execute on function public.sicurezza_qualifica_registra(uuid,uuid,text,uuid,uuid,text,uuid,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';

create or replace function public.sicurezza_qualifiche_immutabili() returns trigger language plpgsql security invoker set search_path=public as $$begin raise exception 'Le qualifiche conservano lo storico: registra una revisione o revoca';end$$;
revoke all on function public.sicurezza_qualifiche_immutabili() from public,anon,authenticated;
drop trigger if exists qualifiche_immutabili on public.sicurezza_qualifiche_addetti;
create trigger qualifiche_immutabili before update or delete on public.sicurezza_qualifiche_addetti for each row execute function public.sicurezza_qualifiche_immutabili();

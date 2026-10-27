-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
create table if not exists public.sicurezza_profili_requisiti (
 id uuid primary key,company_id uuid not null references public.companies(id),famiglia_id uuid not null references public.sicurezza_profili_requisiti(id),
 versione integer not null check(versione>0),precedente_id uuid references public.sicurezza_profili_requisiti(id),
 nome text not null check(length(trim(nome)) between 1 and 120),attivita text not null,ruoli text not null,limiti text not null,
 criteri jsonb not null check(jsonb_typeof(criteri)='array' and jsonb_array_length(criteri) between 1 and 50),
 richiesta jsonb not null,creato_da uuid not null references auth.users(id),creato_il timestamptz not null default clock_timestamp(),
 archiviato boolean not null default false,archiviato_da uuid references auth.users(id),archiviato_il timestamptz,
 unique(company_id,famiglia_id,versione),unique(id,company_id)
);
create index if not exists profili_requisiti_azienda on public.sicurezza_profili_requisiti(company_id,nome,versione desc);
create index if not exists profili_requisiti_famiglia on public.sicurezza_profili_requisiti(famiglia_id);
create index if not exists profili_requisiti_precedente on public.sicurezza_profili_requisiti(precedente_id) where precedente_id is not null;
create index if not exists profili_requisiti_autore on public.sicurezza_profili_requisiti(creato_da);
create index if not exists profili_requisiti_archiviatore on public.sicurezza_profili_requisiti(archiviato_da) where archiviato_da is not null;
create table if not exists public.sicurezza_profili_eventi (
 id uuid primary key default gen_random_uuid(),company_id uuid not null,profilo_id uuid not null,
 azione text not null check(azione in ('creato','archiviato','ripristinato')),autore uuid not null references auth.users(id),data timestamptz not null default clock_timestamp(),
 foreign key(profilo_id,company_id) references public.sicurezza_profili_requisiti(id,company_id)
);
create index if not exists profili_eventi_profilo on public.sicurezza_profili_eventi(company_id,profilo_id,data desc);
create index if not exists profili_eventi_autore on public.sicurezza_profili_eventi(autore);
alter table public.sicurezza_profili_requisiti enable row level security;
alter table public.sicurezza_profili_eventi enable row level security;
revoke all on public.sicurezza_profili_requisiti,public.sicurezza_profili_eventi from public,anon,authenticated,service_role;
grant select on public.sicurezza_profili_requisiti,public.sicurezza_profili_eventi to authenticated,service_role;
drop policy if exists profili_requisiti_lettura on public.sicurezza_profili_requisiti;
create policy profili_requisiti_lettura on public.sicurezza_profili_requisiti for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
drop policy if exists profili_eventi_lettura on public.sicurezza_profili_eventi;
create policy profili_eventi_lettura on public.sicurezza_profili_eventi for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
create or replace function public.sicurezza_profilo_immutabile() returns trigger language plpgsql set search_path=public as $$begin
 if tg_op='DELETE' or (to_jsonb(new)-array['archiviato','archiviato_da','archiviato_il']) is distinct from (to_jsonb(old)-array['archiviato','archiviato_da','archiviato_il']) then raise exception 'I contenuti del profilo non si sovrascrivono: crea una nuova versione';end if;return new;
end$$;
revoke all on function public.sicurezza_profilo_immutabile() from public,anon,authenticated;
drop trigger if exists sicurezza_profilo_immutabile on public.sicurezza_profili_requisiti;
create trigger sicurezza_profilo_immutabile before update or delete on public.sicurezza_profili_requisiti for each row execute function public.sicurezza_profilo_immutabile();
drop trigger if exists sicurezza_profilo_evento_immutabile on public.sicurezza_profili_eventi;
create trigger sicurezza_profilo_evento_immutabile before update or delete on public.sicurezza_profili_eventi for each row execute function public.sicurezza_itp_immutabile();

create or replace function public.sicurezza_salva_profilo(_id uuid,_company uuid,_precedente uuid,_dati jsonb)
returns public.sicurezza_profili_requisiti language plpgsql security definer set search_path=public as $$
declare vecchio public.sicurezza_profili_requisiti;ultimo public.sicurezza_profili_requisiti;nuovo public.sicurezza_profili_requisiti;
 famiglia uuid;c jsonb;chiavi text[]:=array[]::text[];
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi gestire i profili sicurezza in questa azienda' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if _id is null or jsonb_typeof(_dati) is distinct from 'object' or length(_dati::text)>200000 or (_dati-array['nome','attivita','ruoli','limiti','criteri','testi_generici'])<>'{}'::jsonb then raise exception 'Dati del profilo non validi';end if;
 if (_dati->>'testi_generici') is distinct from 'true' then raise exception 'Conferma che i testi siano generici e riutilizzabili';end if;
 if length(trim(coalesce(_dati->>'nome',''))) not between 1 and 120 or length(trim(coalesce(_dati->>'attivita','')))=0 or length(trim(coalesce(_dati->>'ruoli','')))=0 or length(trim(coalesce(_dati->>'limiti','')))=0 then raise exception 'Indica nome, attività, ruoli e limiti del profilo';end if;
 if length(_dati->>'attivita')>4000 or length(_dati->>'ruoli')>4000 or length(_dati->>'limiti')>4000 or jsonb_typeof(_dati->'criteri') is distinct from 'array' or jsonb_array_length(_dati->'criteri') not between 1 and 50 then raise exception 'Controlla dimensione e criteri del profilo';end if;
 for c in select value from jsonb_array_elements(_dati->'criteri') loop
  if jsonb_typeof(c) is distinct from 'object' or (c-array['id','titolo','catalogo_id','catalogo_versione','riferimento','indicazioni'])<>'{}'::jsonb or nullif(c->>'id','')::uuid is null or (c->>'id')=any(chiavi) or length(trim(coalesce(c->>'titolo',''))) not between 1 and 300 or length(coalesce(c->>'riferimento',''))>1000 or length(coalesce(c->>'indicazioni',''))>2000 then raise exception 'Criteri del profilo non validi o duplicati';end if;
  chiavi:=array_append(chiavi,c->>'id');
  if c->>'catalogo_id' is not null then
   if not exists(select 1 from public.sicurezza_catalogo_documenti where id=c->>'catalogo_id' and versione=(c->>'catalogo_versione')::integer and destinazione='sicurezza' and titolo=c->>'titolo') then raise exception 'Voce del catalogo non disponibile per la sicurezza o titolo non coerente';end if;
  elsif c->>'catalogo_versione' is not null then raise exception 'Versione catalogo senza voce';end if;
 end loop;
 if _precedente is null then famiglia:=_id;
 else
  select * into vecchio from public.sicurezza_profili_requisiti where id=_precedente and company_id=_company;
  if not found then raise exception 'Profilo di partenza non disponibile';end if;famiglia:=vecchio.famiglia_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('profilo'||_company::text||famiglia::text,0));
 select * into nuovo from public.sicurezza_profili_requisiti where id=_id;
 if found then
  if nuovo.company_id=_company and nuovo.creato_da=auth.uid() and nuovo.precedente_id is not distinct from _precedente and nuovo.richiesta=_dati then return nuovo;end if;
  raise exception 'Identificativo già usato per un’altra richiesta' using errcode='40001';
 end if;
 select * into ultimo from public.sicurezza_profili_requisiti where company_id=_company and famiglia_id=famiglia order by versione desc limit 1;
 if ultimo.id is distinct from _precedente then raise exception 'Esiste una versione più recente del profilo: ricarica prima di proseguire' using errcode='40001';end if;
 insert into public.sicurezza_profili_requisiti(id,company_id,famiglia_id,versione,precedente_id,nome,attivita,ruoli,limiti,criteri,richiesta,creato_da)
 values(_id,_company,famiglia,coalesce(ultimo.versione,0)+1,_precedente,trim(_dati->>'nome'),_dati->>'attivita',_dati->>'ruoli',_dati->>'limiti',_dati->'criteri',_dati,auth.uid()) returning * into nuovo;
 insert into public.sicurezza_profili_eventi(company_id,profilo_id,azione,autore) values(_company,nuovo.id,'creato',auth.uid());
 return nuovo;
end$$;
revoke all on function public.sicurezza_salva_profilo(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.sicurezza_salva_profilo(uuid,uuid,uuid,jsonb) to authenticated;

create or replace function public.sicurezza_archivia_profilo(_id uuid,_company uuid,_archiviato boolean,_atteso boolean)
returns public.sicurezza_profili_requisiti language plpgsql security definer set search_path=public as $$declare p public.sicurezza_profili_requisiti;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi gestire i profili sicurezza in questa azienda' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if _archiviato is null or _atteso is null then raise exception 'Stato di archiviazione mancante';end if;
 select * into p from public.sicurezza_profili_requisiti where id=_id and company_id=_company for update;
 if not found then raise exception 'Profilo non disponibile';end if;
 if p.archiviato=_archiviato then return p;end if;
 if p.archiviato is distinct from _atteso then raise exception 'Stato del profilo cambiato: ricarica' using errcode='40001';end if;
 update public.sicurezza_profili_requisiti set archiviato=_archiviato,archiviato_da=auth.uid(),archiviato_il=clock_timestamp() where id=_id returning * into p;
 insert into public.sicurezza_profili_eventi(company_id,profilo_id,azione,autore) values(_company,p.id,case when _archiviato then 'archiviato' else 'ripristinato' end,auth.uid());
 return p;
end$$;
revoke all on function public.sicurezza_archivia_profilo(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.sicurezza_archivia_profilo(uuid,uuid,boolean,boolean) to authenticated;

create or replace function public.sicurezza_registra_itp(_id uuid,_company uuid,_ordine uuid,_sub uuid,_precedente uuid,_dati jsonb)
returns public.sicurezza_verifiche_itp language plpgsql security definer set search_path=public as $$
declare esistente public.sicurezza_verifiche_itp;ultimo public.sicurezza_verifiche_itp;nuova public.sicurezza_verifiche_itp;
 fase uuid;eid uuid;dal date;al date;esito text;c jsonb;x text;e public.sicurezza_fascicolo;attesi jsonb;ids uuid[]:=array[]::uuid[];
 profilo public.sicurezza_profili_requisiti;requisito jsonb;criteri_salvati jsonb:='[]';
 documenti jsonb:='[]';contesto jsonb;nome text;applicabili integer:=0;negativi integer:=0;chiavi text[]:=array[]::text[];
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi registrare verifiche ITP in questa azienda' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if length(_dati::text)>250000 then raise exception 'Richiesta di verifica troppo grande';end if;
 if _id is null or jsonb_typeof(_dati) is distinct from 'object' then raise exception 'Richiesta di verifica non valida';end if;
 select * into esistente from public.sicurezza_verifiche_itp where id=_id;
 if found then
  if esistente.company_id=_company and esistente.order_id=_ordine and esistente.subappaltatore_id=_sub and esistente.registrato_da=auth.uid() and esistente.richiesta=_dati then return esistente;end if;
  raise exception 'Identificativo della richiesta già usato per altri dati' using errcode='40001';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(_company::text||_ordine::text||_sub::text,0));
 -- Recheck inside the lock: concurrent retries of the same request are idempotent.
 select * into esistente from public.sicurezza_verifiche_itp where id=_id;
 if found then
  if esistente.company_id=_company and esistente.order_id=_ordine and esistente.subappaltatore_id=_sub and esistente.registrato_da=auth.uid() and esistente.richiesta=_dati then return esistente;end if;
  raise exception 'Identificativo della richiesta già usato per altri dati' using errcode='40001';
 end if;
 select * into ultimo from public.sicurezza_verifiche_itp where company_id=_company and order_id=_ordine and subappaltatore_id=_sub order by versione desc limit 1;
 if ultimo.id is distinct from _precedente then raise exception 'Un’altra verifica è stata registrata: ricarica lo storico prima di continuare' using errcode='40001';end if;
 fase:=nullif(_dati->>'fase_id','')::uuid;dal:=(_dati->>'dal')::date;al:=nullif(_dati->>'al','')::date;esito:=_dati->>'esito';
 if dal is null or al<dal or esito not in ('positivo','negativo','da_integrare','non_applicabile','annullata') or esito is null then raise exception 'Controlla periodo ed esito della verifica';end if;
 if length(trim(coalesce(_dati->>'attivita','')))=0 or length(trim(coalesce(_dati->>'responsabile','')))=0 or length(trim(coalesce(_dati->>'ruolo_responsabile','')))=0 or length(trim(coalesce(_dati->>'motivazione','')))=0 then raise exception 'Indica lavori, responsabile, ruolo e motivazione dell’esito';end if;
 if esito='annullata' and (ultimo.id is null or (fase,dal,al) is distinct from (ultimo.fase_id,ultimo.dal,ultimo.al)) then raise exception 'La rettifica deve riferirsi alla fase e al periodo della verifica precedente';end if;
 if jsonb_typeof(_dati->'criteri') is distinct from 'array' or jsonb_array_length(_dati->'criteri')>50 or esito<>'annullata' and jsonb_array_length(_dati->'criteri')=0 then raise exception 'Definisci i criteri esaminati (massimo 50)';end if;
 if esito in ('positivo','non_applicabile') and (_dati->>'completezza') is distinct from 'true' then raise exception 'Conferma di avere definito ed esaminato i requisiti applicabili al caso';end if;
 -- Locks keep the selected context stable until insertion, including planning dates.
 perform 1 from public.orders where id=_ordine and company_id=_company for share;
 perform 1 from public.subappaltatori_sicurezza where id=_sub and company_id=_company for share;
 if fase is not null then perform 1 from public.order_work_phases where id=fase and company_id=_company and order_id=_ordine for share;end if;
 contesto:=public.sicurezza_itp_contesto(_company,_ordine,_sub,fase);
 if contesto is distinct from _dati->'contesto_atteso' then raise exception 'Impresa, commessa o fase sono cambiate: rileggi il contesto prima di registrare' using errcode='40001';end if;
 for c in select value from jsonb_array_elements(_dati->'criteri') loop
  if jsonb_typeof(c) is distinct from 'object' or length(trim(coalesce(c->>'id','')))=0 or (c->>'id')=any(chiavi) or length(trim(coalesce(c->>'titolo','')))=0 then raise exception 'Criteri non validi o duplicati';end if;
  chiavi:=array_append(chiavi,c->>'id');
  -- Strip any client-provided snapshot and reconstruct provenance from the immutable profile.
  c:=c-'profilo_snapshot';
  if c->>'profilo_id' is not null then
   select * into profilo from public.sicurezza_profili_requisiti where id=(c->>'profilo_id')::uuid and company_id=_company and versione=(c->>'profilo_versione')::integer for share;
   if not found or profilo.archiviato then raise exception 'Profilo non disponibile o archiviato: riesamina i criteri prima di registrare';end if;
   select value into requisito from jsonb_array_elements(profilo.criteri) where value->>'id'=c->>'requisito_id';
   if not found or requisito->>'titolo' is distinct from c->>'titolo' or requisito->>'catalogo_id' is distinct from c->>'catalogo_id' or requisito->>'catalogo_versione' is distinct from c->>'catalogo_versione' then raise exception 'Il criterio non corrisponde alla versione del profilo selezionata';end if;
   c:=c||jsonb_build_object('profilo_snapshot',jsonb_build_object('id',profilo.id,'famiglia_id',profilo.famiglia_id,'versione',profilo.versione,'nome',profilo.nome,'attivita',profilo.attivita,'ruoli',profilo.ruoli,'limiti',profilo.limiti,'requisito',requisito));
  elsif c->>'profilo_versione' is not null or c->>'requisito_id' is not null then raise exception 'Riferimento del profilo incompleto';end if;
  criteri_salvati:=criteri_salvati||jsonb_build_array(c);

  if c->>'catalogo_id' is not null and not exists(select 1 from public.sicurezza_catalogo_documenti where id=c->>'catalogo_id' and versione=(c->>'catalogo_versione')::integer and destinazione='sicurezza') then raise exception 'Criterio del catalogo non disponibile per la sicurezza';end if;
  if (c->>'applicabilita') not in ('da_chiarire','applicabile','non_applicabile') or c->>'applicabilita' is null or (c->>'esito') not in ('da_verificare','conforme','non_conforme','non_applicabile') or c->>'esito' is null then raise exception 'Completa applicabilità ed esito di ogni criterio';end if;
  if c->>'applicabilita'='non_applicabile' and (c->>'esito'<>'non_applicabile' or length(trim(coalesce(c->>'note','')))=0 or length(trim(coalesce(c->>'riferimento','')))=0) then raise exception 'Motiva la non applicabilità e indica il riferimento';end if;
  if c->>'applicabilita'='applicabile' then applicabili:=applicabili+1;end if;
  if c->>'applicabilita'='applicabile' and c->>'esito'='non_conforme' then negativi:=negativi+1;end if;
  if jsonb_typeof(c->'evidenze') is distinct from 'array' then raise exception 'Elenco evidenze del criterio non valido';end if;
  if esito='positivo' and (c->>'applicabilita'='da_chiarire' or c->>'applicabilita'='applicabile' and (c->>'esito'<>'conforme' or jsonb_array_length(c->'evidenze')=0 or length(trim(coalesce(c->>'riferimento','')))=0)) then raise exception 'Un esito positivo richiede criteri definiti, riferimenti ed evidenze verificate';end if;
  if esito='non_applicabile' and c->>'applicabilita'<>'non_applicabile' then raise exception 'Per l’esito non applicabile motiva tutti i criteri';end if;
  if esito='positivo' and c->>'catalogo_id' is not null and exists(select 1 from public.sicurezza_fascicolo ev where ev.company_id=_company and ev.subappaltatore_id=_sub and ev.id in (select value::uuid from jsonb_array_elements_text(c->'evidenze')) and (ev.catalogo_id is distinct from c->>'catalogo_id' or ev.catalogo_versione is distinct from (c->>'catalogo_versione')::integer)) then raise exception 'Classifica correttamente le evidenze prima di usarle per un criterio positivo del catalogo';end if;
  for x in select jsonb_array_elements_text(c->'evidenze') loop ids:=array_append(ids,x::uuid);end loop;
 end loop;
 -- Selecting a profile keeps every criterion explicit, including motivated non-applicability.
 for profilo in select p.* from public.sicurezza_profili_requisiti p where p.id in (select distinct (v->>'profilo_id')::uuid from jsonb_array_elements(criteri_salvati) v where v->>'profilo_id' is not null) loop
  if exists(select 1 from jsonb_array_elements(profilo.criteri) r where not exists(select 1 from jsonb_array_elements(criteri_salvati) v where v->>'profilo_id'=profilo.id::text and v->>'requisito_id'=r->>'id')) then raise exception 'Mantieni tutti i criteri del profilo selezionato e motiva le eventuali non applicabilità';end if;
 end loop;
 if esito='positivo' and applicabili=0 or esito='negativo' and negativi=0 then raise exception 'Esito complessivo non coerente con i criteri';end if;
 select coalesce(array_agg(distinct a order by a),array[]::uuid[]) into ids from unnest(ids) a;
 if cardinality(ids)>100 then raise exception 'Massimo 100 evidenze per verifica';end if;
 attesi:=_dati->'evidenze_attese';
 foreach eid in array ids loop
  select * into e from public.sicurezza_fascicolo where id=eid and company_id=_company and subappaltatore_id=_sub and (order_id is null or order_id=_ordine) for share;
  if not found or e.stato='superato' or e.fase_id is not null and nullif(_dati->>'fase_id','') is not null and e.fase_id<>nullif(_dati->>'fase_id','')::uuid then raise exception 'Evidenza non pertinente al soggetto o al cantiere';end if;
  if not (attesi?e.id::text) or (attesi->>e.id::text)::timestamptz is distinct from e.updated_at then raise exception 'Un’evidenza è cambiata: rileggila prima di registrare' using errcode='40001';end if;
  if esito='positivo' and e.fase_id is not null and fase is null then raise exception 'Un’evidenza limitata a una fase non può giustificare un esito generale della commessa';end if;
  if esito='positivo' and e.tipo='durc' and e.data_scadenza is null then raise exception 'Indica la scadenza effettiva del DURC prima di registrare un esito positivo';end if;
  if esito='positivo' and (e.stato<>'verificato' or e.file_path is null or e.data_scadenza<dal or e.applicabile_dal>dal or e.applicabile_al<dal) then raise exception 'Per un esito positivo seleziona solo evidenze verificate e pertinenti alla data iniziale';end if;
  documenti:=documenti||jsonb_build_array(jsonb_build_object('id',e.id,'titolo',e.titolo,'tipo',e.tipo,'catalogo_id',e.catalogo_id,'catalogo_versione',e.catalogo_versione,'order_id',e.order_id,'operaio_id',e.operaio_id,'incarico_id',e.incarico_id,'fase_id',e.fase_id,'applicabile_dal',e.applicabile_dal,'applicabile_al',e.applicabile_al,'stato',e.stato,'data_scadenza',e.data_scadenza,'file_path',e.file_path,'file_name',e.file_name,'updated_at',e.updated_at));
 end loop;
 select trim(concat_ws(' ',first_name,last_name)) into nome from public.profiles where id=auth.uid();
 insert into public.sicurezza_verifiche_itp(id,company_id,order_id,subappaltatore_id,fase_id,versione,precedente_id,dal,al,esito,attivita,responsabile,ruolo_responsabile,motivazione,completezza,criteri,evidenze,contesto,richiesta,registrato_da,registrato_da_nome)
 values(_id,_company,_ordine,_sub,nullif(_dati->>'fase_id','')::uuid,coalesce(ultimo.versione,0)+1,ultimo.id,dal,al,esito,_dati->>'attivita',_dati->>'responsabile',_dati->>'ruolo_responsabile',_dati->>'motivazione',coalesce((_dati->>'completezza')::boolean,false),criteri_salvati,documenti,contesto,_dati,auth.uid(),coalesce(nullif(nome,''),'Utente registrato')) returning * into nuova;
 return nuova;
end$$;
revoke all on function public.sicurezza_registra_itp(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.sicurezza_registra_itp(uuid,uuid,uuid,uuid,uuid,jsonb) to authenticated;

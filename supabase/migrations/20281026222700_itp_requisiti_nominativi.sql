set local lock_timeout='3s';set local statement_timeout='60s';
alter table public.subappaltatori_assegnazioni add column if not exists fase_id uuid references public.order_work_phases(id);
create index if not exists sub_assegnazioni_fase on public.subappaltatori_assegnazioni(fase_id) where fase_id is not null;
alter table public.sicurezza_verifiche_itp add column if not exists soggetti jsonb;
create or replace function public.sicurezza_assegnazione_fase_guardia() returns trigger language plpgsql security invoker set search_path=public as $$begin
 if new.fase_id is not null and not exists(select 1 from public.order_work_phases f where f.id=new.fase_id and f.order_id=new.order_id and f.company_id=new.company_id) then raise exception 'La fase non appartiene alla commessa e all’azienda dell’assegnazione';end if;return new;
end$$;
revoke all on function public.sicurezza_assegnazione_fase_guardia() from public,anon,authenticated;
drop trigger if exists sicurezza_assegnazione_fase_guardia on public.subappaltatori_assegnazioni;
create trigger sicurezza_assegnazione_fase_guardia before insert or update on public.subappaltatori_assegnazioni for each row execute function public.sicurezza_assegnazione_fase_guardia();
-- A short company-level lock serializes roster mutations with ITP capture, including new rows.
-- The ITP reader does not row-lock these sources, so an updater waiting here cannot deadlock with it.
create or replace function public.sicurezza_soggetti_serializza() returns trigger language plpgsql security definer set search_path=public as $$declare a uuid;b uuid;k uuid;begin
 perform set_config('lock_timeout','3s',true);
 if tg_op<>'INSERT' then a:=old.company_id;end if;if tg_op<>'DELETE' then b:=new.company_id;end if;
 for k in select distinct v from unnest(array[a,b])v where v is not null order by v loop perform pg_advisory_xact_lock(hashtextextended('itp_soggetti:'||k::text,0));end loop;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function public.sicurezza_soggetti_serializza() from public,anon,authenticated;
do $$declare t text;begin foreach t in array array['subappaltatori_operai','subappaltatori_assegnazioni','sicurezza_incarichi'] loop
 execute format('drop trigger if exists a_sicurezza_soggetti_serializza on public.%I',t);
 execute format('create trigger a_sicurezza_soggetti_serializza before insert or update or delete on public.%I for each row execute function public.sicurezza_soggetti_serializza()',t);
end loop;end$$;
create or replace function public.sicurezza_itp_soggetti(_company uuid,_ordine uuid,_sub uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare risultato jsonb;begin
 perform public.sicurezza_itp_contesto(_company,_ordine,_sub,null);
 select jsonb_build_object('operai',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'cognome',o.cognome,'mansione',o.mansione,'attivo',o.attivo,'updated_at',o.updated_at,'assegnazioni',(select jsonb_agg(jsonb_build_object('id',a.id,'dal',a.dal,'al',a.al,'area',a.area,'attivita',a.attivita,'fase_id',a.fase_id,'updated_at',a.updated_at) order by a.id) from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=_sub and a.operaio_id=o.id)) order by o.id) from public.subappaltatori_operai o where o.company_id=_company and o.subappaltatore_id=_sub and exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=_sub and a.operaio_id=o.id)),'[]'::jsonb),'incarichi',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'ruolo',i.ruolo,'nominativo',i.nominativo,'dal',i.dal,'al',i.al,'stato',i.stato,'figura_id',i.figura_id,'subappaltatore_id',i.subappaltatore_id,'order_id',i.order_id,'updated_at',i.updated_at) order by i.id) from public.sicurezza_incarichi i where i.company_id=_company and (i.subappaltatore_id=_sub and (i.order_id is null or i.order_id=_ordine) or i.subappaltatore_id is null and i.order_id=_ordine)),'[]'::jsonb)) into risultato;
 return risultato;
end$$;
revoke all on function public.sicurezza_itp_soggetti(uuid,uuid,uuid) from public,anon;
grant execute on function public.sicurezza_itp_soggetti(uuid,uuid,uuid) to authenticated;

create or replace function public.sicurezza_fase_con_requisiti_guardia()
returns trigger language plpgsql security definer set search_path=public as $$begin
 if tg_op='DELETE' then
  if exists(select 1 from public.sicurezza_fascicolo e where e.fase_id=old.id) then raise exception 'La fase ha requisiti di sicurezza collegati: conserva la fase per mantenere lo storico';end if;
  if exists(select 1 from public.subappaltatori_assegnazioni a where a.fase_id=old.id) then raise exception 'La fase ha assegnazioni di addetti: conserva la fase per mantenere lo storico';end if;return old;
 end if;
 if (new.company_id,new.order_id) is distinct from (old.company_id,old.order_id) then
  if exists(select 1 from public.sicurezza_fascicolo e where e.fase_id=old.id) then raise exception 'La fase ha requisiti di sicurezza collegati e non si sposta a un’altra commessa';end if;
  if exists(select 1 from public.subappaltatori_assegnazioni a where a.fase_id=old.id) then raise exception 'La fase ha assegnazioni di addetti e non si sposta a un’altra commessa';end if;
 end if;return new;
end$$;
revoke all on function public.sicurezza_fase_con_requisiti_guardia() from public,anon,authenticated;

create or replace function public.sicurezza_registra_itp(_id uuid,_company uuid,_ordine uuid,_sub uuid,_precedente uuid,_dati jsonb)
returns public.sicurezza_verifiche_itp language plpgsql security definer set search_path=public as $$
declare esistente public.sicurezza_verifiche_itp;ultimo public.sicurezza_verifiche_itp;nuova public.sicurezza_verifiche_itp;
 fase uuid;eid uuid;dal date;al date;esito text;c jsonb;x text;e public.sicurezza_fascicolo;attesi jsonb;ids uuid[]:=array[]::uuid[];
 soggetti_correnti jsonb;personale boolean;destinatario text;persona jsonb;ambito_doc text;gruppo record;atteso record;
 profilo public.sicurezza_profili_requisiti;requisito jsonb;criteri_salvati jsonb:='[]';
 documenti jsonb:='[]';contesto jsonb;nome text;applicabili integer:=0;negativi integer:=0;chiavi text[]:=array[]::text[];
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi registrare verifiche ITP in questa azienda' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if length(_dati::text)>1000000 then raise exception 'Richiesta di verifica troppo grande';end if;
 if _id is null or jsonb_typeof(_dati) is distinct from 'object' then raise exception 'Richiesta di verifica non valida';end if;
 select * into esistente from public.sicurezza_verifiche_itp where id=_id;
 if found then
  if esistente.company_id=_company and esistente.order_id=_ordine and esistente.subappaltatore_id=_sub and esistente.registrato_da=auth.uid() and esistente.richiesta=_dati then return esistente;end if;
  raise exception 'Identificativo della richiesta già usato per altri dati' using errcode='40001';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('itp_soggetti:'||_company::text,0));
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
 if jsonb_typeof(_dati->'criteri') is distinct from 'array' or jsonb_array_length(_dati->'criteri')>500 or esito<>'annullata' and jsonb_array_length(_dati->'criteri')=0 then raise exception 'Definisci i criteri esaminati (massimo 500)';end if;
 if esito in ('positivo','non_applicabile') and (_dati->>'completezza') is distinct from 'true' then raise exception 'Conferma di avere definito ed esaminato i requisiti applicabili al caso';end if;
 -- Locks keep the selected context stable until insertion, including planning dates.
 perform 1 from public.orders where id=_ordine and company_id=_company for share;
 perform 1 from public.subappaltatori_sicurezza where id=_sub and company_id=_company for share;
 if fase is not null then perform 1 from public.order_work_phases where id=fase and company_id=_company and order_id=_ordine for share;end if;
 contesto:=public.sicurezza_itp_contesto(_company,_ordine,_sub,fase);
 if contesto is distinct from _dati->'contesto_atteso' then raise exception 'Impresa, commessa o fase sono cambiate: rileggi il contesto prima di registrare' using errcode='40001';end if;
 select exists(select 1 from jsonb_array_elements(_dati->'criteri')v where v->>'destinatario' in ('operaio','incarico') or v->>'operaio_id' is not null or v->>'incarico_id' is not null or v->>'gruppo_id' is not null) into personale;
 if personale then
  soggetti_correnti:=public.sicurezza_itp_soggetti(_company,_ordine,_sub);
  if soggetti_correnti is distinct from _dati->'soggetti_attesi' then raise exception 'Organico, incarichi o assegnazioni sono cambiati: rileggi i soggetti e riesamina i criteri nominativi' using errcode='40001';end if;
 end if;
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
  c:=c-'soggetto_snapshot';persona:=null;ambito_doc:=null;
  if c->>'operaio_id' is not null and c->>'incarico_id' is not null then raise exception 'Un criterio può riferirsi a un solo titolare';end if;
  if c->>'catalogo_id' is not null then select ambito into ambito_doc from public.sicurezza_catalogo_documenti where id=c->>'catalogo_id' and versione=(c->>'catalogo_versione')::integer;end if;
  destinatario:=coalesce(c->>'destinatario',case when c->>'operaio_id' is not null then 'operaio' when c->>'incarico_id' is not null then 'incarico' when ambito_doc='commessa' then 'commessa' else 'impresa' end);
  if destinatario not in ('impresa','commessa','operaio','incarico') then raise exception 'Indica il destinatario del criterio';end if;
  if c->>'operaio_id' is not null and destinatario<>'operaio' or c->>'incarico_id' is not null and destinatario<>'incarico' then raise exception 'Titolare non coerente con il destinatario';end if;
  if destinatario='operaio' and c->>'operaio_id' is not null then
   select value into persona from jsonb_array_elements(soggetti_correnti->'operai')v where v->>'id'=c->>'operaio_id';
   if not found then raise exception 'Operaio non appartenente all’impresa e alle assegnazioni di questa commessa';end if;
   if esito='positivo' and c->>'applicabilita'='applicabile' and (not (persona->>'attivo')::boolean or not exists(select 1 from jsonb_array_elements(persona->'assegnazioni')a where (a->>'dal')::date<=dal and ((a->>'al') is null or (a->>'al')::date>=dal) and (fase is null or (a->>'fase_id') is null or a->>'fase_id'=fase::text))) then raise exception 'Operaio cessato o senza assegnazione pertinente alla data e alla fase';end if;
  elsif destinatario='incarico' and c->>'incarico_id' is not null then
   select value into persona from jsonb_array_elements(soggetti_correnti->'incarichi')v where v->>'id'=c->>'incarico_id';
   if not found then raise exception 'Incarico non pertinente all’impresa e alla commessa';end if;
   if c->>'ruolo' is not null and c->>'ruolo' is distinct from persona->>'ruolo' then raise exception 'Il ruolo selezionato non corrisponde all’incarico';end if;
   if esito='positivo' and c->>'applicabilita'='applicabile' and (persona->>'stato'<>'documentato' or (persona->>'dal')::date>dal or (persona->>'al')::date<dal) then raise exception 'Incarico non documentato o fuori periodo';end if;
  end if;
  if persona is not null then c:=c||jsonb_build_object('soggetto_snapshot',jsonb_build_object('tipo',destinatario,'dati',persona));end if;
  if esito='positivo' and c->>'applicabilita'='applicabile' then
   if destinatario in ('operaio','incarico') and persona is null then raise exception 'Seleziona il titolare del criterio nominativo';end if;
   if ambito_doc in ('persona_o_incarico','incarico') and (persona is null or ambito_doc='incarico' and destinatario<>'incarico') or ambito_doc='commessa' and destinatario<>'commessa' or ambito_doc='impresa' and destinatario<>'impresa' then raise exception 'Il destinatario non rispetta l’ambito del documento del catalogo';end if;
  end if;
  if exists(select 1 from public.sicurezza_fascicolo ev where ev.id in(select value::uuid from jsonb_array_elements_text(c->'evidenze')) and ev.company_id=_company and (
    destinatario='operaio' and (c->>'operaio_id' is null or ev.operaio_id is distinct from (c->>'operaio_id')::uuid or ev.incarico_id is not null) or
    destinatario='incarico' and (c->>'incarico_id' is null or ev.incarico_id is distinct from (c->>'incarico_id')::uuid or ev.operaio_id is not null) or
    destinatario in ('impresa','commessa') and (ev.operaio_id is not null or ev.incarico_id is not null) or
    destinatario='impresa' and ev.subappaltatore_id is distinct from _sub or
    destinatario='commessa' and ev.order_id is distinct from _ordine)) then raise exception 'L’evidenza non appartiene al titolare o all’ambito del criterio';end if;
  if c->>'gruppo_id' is not null then
   perform (c->>'gruppo_id')::uuid;
   if c->>'copertura' not in ('operai_assegnati','incarichi_ruolo') or c->>'copertura' is null or c->>'copertura'='operai_assegnati' and destinatario<>'operaio' or c->>'copertura'='incarichi_ruolo' and (destinatario<>'incarico' or nullif(c->>'ruolo','') is null) then raise exception 'Copertura nominativa del gruppo non valida';end if;
  elsif c->>'copertura' is not null then raise exception 'Gruppo di copertura mancante';end if;
  c:=c||jsonb_build_object('destinatario',destinatario);
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
 -- Coverage is checked against the frozen, company-scoped roster, not a count of documents.
 for gruppo in select v->>'gruppo_id' id,min(v->>'copertura') tipo,min(v->>'ruolo') ruolo from jsonb_array_elements(criteri_salvati)v where v->>'gruppo_id' is not null group by v->>'gruppo_id' loop
  if (select count(distinct jsonb_build_object('copertura',v->>'copertura','ruolo',v->>'ruolo','titolo',v->>'titolo','catalogo_id',v->>'catalogo_id','catalogo_versione',v->>'catalogo_versione','profilo_id',v->>'profilo_id','profilo_versione',v->>'profilo_versione','requisito_id',v->>'requisito_id')) from jsonb_array_elements(criteri_salvati)v where v->>'gruppo_id'=gruppo.id)>1 then raise exception 'Il gruppo deve riferirsi allo stesso requisito e ruolo';end if;
  if gruppo.tipo='operai_assegnati' then
   for atteso in select v->>'id' id from jsonb_array_elements(soggetti_correnti->'operai')v where exists(select 1 from jsonb_array_elements(v->'assegnazioni')a where (a->>'dal')::date<=dal and ((a->>'al') is null or (a->>'al')::date>=dal) and (fase is null or (a->>'fase_id') is null or a->>'fase_id'=fase::text)) loop
    if not exists(select 1 from jsonb_array_elements(criteri_salvati)v where v->>'gruppo_id'=gruppo.id and v->>'operaio_id'=atteso.id) then raise exception 'Manca un addetto assegnato nella copertura nominativa del requisito';end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(criteri_salvati)v where v->>'gruppo_id'=gruppo.id and v->>'operaio_id' is not null and not exists(select 1 from jsonb_array_elements(soggetti_correnti->'operai')o where o->>'id'=v->>'operaio_id' and exists(select 1 from jsonb_array_elements(o->'assegnazioni')a where (a->>'dal')::date<=dal and ((a->>'al') is null or (a->>'al')::date>=dal) and (fase is null or (a->>'fase_id') is null or a->>'fase_id'=fase::text)))) then raise exception 'Il gruppo contiene un addetto fuori assegnazione o fase';end if;
  else
   for atteso in select v->>'id' id from jsonb_array_elements(soggetti_correnti->'incarichi')v where v->>'ruolo'=gruppo.ruolo and (v->>'dal')::date<=dal and ((v->>'al') is null or (v->>'al')::date>=dal) and v->>'stato'<>'cessato' loop
    if not exists(select 1 from jsonb_array_elements(criteri_salvati)v where v->>'gruppo_id'=gruppo.id and v->>'incarico_id'=atteso.id) then raise exception 'Manca un incarico pertinente nella copertura del ruolo';end if;
   end loop;
   if exists(select 1 from jsonb_array_elements(criteri_salvati)v where v->>'gruppo_id'=gruppo.id and v->>'incarico_id' is not null and not exists(select 1 from jsonb_array_elements(soggetti_correnti->'incarichi')i where i->>'id'=v->>'incarico_id' and i->>'ruolo'=gruppo.ruolo and (i->>'dal')::date<=dal and ((i->>'al') is null or (i->>'al')::date>=dal) and i->>'stato'<>'cessato')) then raise exception 'Il gruppo contiene un incarico fuori ruolo o periodo';end if;
  end if;
 end loop;
 -- Selecting a profile keeps every criterion explicit, including motivated non-applicability.
 for profilo in select p.* from public.sicurezza_profili_requisiti p where p.id in (select distinct (v->>'profilo_id')::uuid from jsonb_array_elements(criteri_salvati) v where v->>'profilo_id' is not null) loop
  if exists(select 1 from jsonb_array_elements(profilo.criteri) r where not exists(select 1 from jsonb_array_elements(criteri_salvati) v where v->>'profilo_id'=profilo.id::text and v->>'requisito_id'=r->>'id')) then raise exception 'Mantieni tutti i criteri del profilo selezionato e motiva le eventuali non applicabilità';end if;
 end loop;
 if esito='positivo' and applicabili=0 or esito='negativo' and negativi=0 then raise exception 'Esito complessivo non coerente con i criteri';end if;
 select coalesce(array_agg(distinct a order by a),array[]::uuid[]) into ids from unnest(ids) a;
 if cardinality(ids)>500 then raise exception 'Massimo 500 evidenze per verifica';end if;
 attesi:=_dati->'evidenze_attese';
 foreach eid in array ids loop
  select * into e from public.sicurezza_fascicolo where id=eid and company_id=_company and (subappaltatore_id=_sub and (order_id is null or order_id=_ordine) or subappaltatore_id is null and order_id=_ordine) for share;
  if not found or e.stato='superato' or e.fase_id is not null and nullif(_dati->>'fase_id','') is not null and e.fase_id<>nullif(_dati->>'fase_id','')::uuid then raise exception 'Evidenza non pertinente al soggetto o al cantiere';end if;
  if not (attesi?e.id::text) or (attesi->>e.id::text)::timestamptz is distinct from e.updated_at then raise exception 'Un’evidenza è cambiata: rileggila prima di registrare' using errcode='40001';end if;
  if esito='positivo' and e.fase_id is not null and fase is null then raise exception 'Un’evidenza limitata a una fase non può giustificare un esito generale della commessa';end if;
  if esito='positivo' and e.tipo='durc' and e.data_scadenza is null then raise exception 'Indica la scadenza effettiva del DURC prima di registrare un esito positivo';end if;
  if esito='positivo' and (e.stato<>'verificato' or e.file_path is null or e.data_scadenza<dal or e.applicabile_dal>dal or e.applicabile_al<dal) then raise exception 'Per un esito positivo seleziona solo evidenze verificate e pertinenti alla data iniziale';end if;
  documenti:=documenti||jsonb_build_array(jsonb_build_object('id',e.id,'titolo',e.titolo,'tipo',e.tipo,'catalogo_id',e.catalogo_id,'catalogo_versione',e.catalogo_versione,'order_id',e.order_id,'operaio_id',e.operaio_id,'incarico_id',e.incarico_id,'fase_id',e.fase_id,'applicabile_dal',e.applicabile_dal,'applicabile_al',e.applicabile_al,'stato',e.stato,'data_scadenza',e.data_scadenza,'file_path',e.file_path,'file_name',e.file_name,'updated_at',e.updated_at));
 end loop;
 select trim(concat_ws(' ',first_name,last_name)) into nome from public.profiles where id=auth.uid();
 insert into public.sicurezza_verifiche_itp(id,company_id,order_id,subappaltatore_id,fase_id,versione,precedente_id,dal,al,esito,attivita,responsabile,ruolo_responsabile,motivazione,completezza,criteri,evidenze,contesto,richiesta,registrato_da,registrato_da_nome,soggetti)
 values(_id,_company,_ordine,_sub,nullif(_dati->>'fase_id','')::uuid,coalesce(ultimo.versione,0)+1,ultimo.id,dal,al,esito,_dati->>'attivita',_dati->>'responsabile',_dati->>'ruolo_responsabile',_dati->>'motivazione',coalesce((_dati->>'completezza')::boolean,false),criteri_salvati,documenti,contesto,_dati,auth.uid(),coalesce(nullif(nome,''),'Utente registrato'),soggetti_correnti) returning * into nuova;
 return nuova;
end$$;
revoke all on function public.sicurezza_registra_itp(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.sicurezza_registra_itp(uuid,uuid,uuid,uuid,uuid,jsonb) to authenticated;

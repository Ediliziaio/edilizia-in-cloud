set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.sicurezza_registra_itp(_id uuid,_company uuid,_ordine uuid,_sub uuid,_precedente uuid,_dati jsonb)
returns public.sicurezza_verifiche_itp language plpgsql security definer set search_path=public as $$
declare esistente public.sicurezza_verifiche_itp;ultimo public.sicurezza_verifiche_itp;nuova public.sicurezza_verifiche_itp;
 fase uuid;eid uuid;dal date;al date;esito text;c jsonb;x text;e public.sicurezza_fascicolo;attesi jsonb;ids uuid[]:=array[]::uuid[];
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
 values(_id,_company,_ordine,_sub,nullif(_dati->>'fase_id','')::uuid,coalesce(ultimo.versione,0)+1,ultimo.id,dal,al,esito,_dati->>'attivita',_dati->>'responsabile',_dati->>'ruolo_responsabile',_dati->>'motivazione',coalesce((_dati->>'completezza')::boolean,false),_dati->'criteri',documenti,contesto,_dati,auth.uid(),coalesce(nullif(nome,''),'Utente registrato')) returning * into nuova;
 return nuova;
end$$;
revoke all on function public.sicurezza_registra_itp(uuid,uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.sicurezza_registra_itp(uuid,uuid,uuid,uuid,uuid,jsonb) to authenticated;

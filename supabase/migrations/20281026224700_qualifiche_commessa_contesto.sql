alter function public.sicurezza_qualifica_fonte(uuid,text,uuid,uuid) set timezone='UTC';
-- Y: documentary qualifications projected onto the actual named case roster.
-- Current canonical sources, not reconstruction of historical employment or permission to enter.
set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.sicurezza_addetti_fotografia(_company uuid,_ordine uuid,_dal date,_al date,_fase uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare o jsonb;f jsonb;r jsonb;finale jsonb;persona jsonb;q record;foto_originale jsonb;qualifiche jsonb:='[]';corrente boolean;begin
 if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company),false) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 if _dal is null or _al is null or _al<_dal then raise exception 'Indica un periodo completo e coerente';end if;
 select jsonb_build_object('id',id,'codice',order_code,'inizio_previsto',work_start_date,'fine_prevista',work_end_date,'consegna_prevista',expected_date,'descrizione_lavori',work_description,'descrizione',description,'tipo_lavoro',tipo_lavoro,'indirizzo',coalesce(nullif(work_address,''),indirizzo_lavori)) into o from public.orders where id=_ordine and company_id=_company and deleted_at is null;
 if o is null then raise exception 'Commessa non presente in questa azienda' using errcode='42501';end if;
 if _fase is not null then
  select jsonb_build_object('id',x.id,'nome',x.name,'dal',x.start_date,'al',x.end_date,'descrizione',to_jsonb(x)->'description','posizione',x.position) into f from public.order_work_phases x where x.id=_fase and x.order_id=_ordine and x.company_id=_company;
  if f is null then raise exception 'Fase non pertinente alla commessa';end if;
  if nullif(f->>'dal','')::date>_dal or nullif(f->>'al','')::date<_al then raise exception 'Il periodo supera le date pianificate della fase: controlla date e pianificazione';end if;
 end if;
 if exists(select 1 from public.order_employees oe join public.employees e on e.id=oe.employee_id and e.company_id=_company where oe.order_id=_ordine and oe.phase_id is not null and not exists(select 1 from public.order_work_phases f where f.id=oe.phase_id and f.order_id=_ordine and f.company_id=_company)) then raise exception 'Assegnazione interna con fase non pertinente: correggi la pianificazione';end if;
 if exists(select 1 from public.order_campo_assignments a where a.company_id=_company and a.order_id=_ordine and a.role_type='employee' and a.data_inizio is not null and a.data_fine_prevista is not null and a.data_fine_prevista<a.data_inizio) then raise exception 'Accesso Campo con periodo non valido: correggi la pianificazione prima del riesame';end if;
 with sorgenti as (
  select 'employee:'||e.id::text chiave,'commessa' fonte,oe.id fonte_id,e.id employee_id,e.user_id,e.first_name nome,e.last_name cognome,oe.phase_id fase_id,_dal dal,_al al,true senza_date,e.role_type='subappaltatore' esterno_legacy,e.qualifica qualifica_fonte,e.role_type ruolo_app,false capocantiere,
   (select array_agg(h.id order by h.id) from public.hr_profili h where e.role_type<>'subappaltatore' and h.company_id=_company and (h.employee_id=e.id or e.user_id is not null and h.user_id=e.user_id and not exists(select 1 from public.hr_profili z where z.company_id=_company and z.employee_id=e.id))) hr_ids
  from public.order_employees oe join public.employees e on e.id=oe.employee_id and e.company_id=_company where oe.order_id=_ordine and (_fase is null or oe.phase_id is null or oe.phase_id=_fase)
  union all
  select 'campo:'||a.id::text,'campo',a.id,null::uuid,a.user_id,null::text,null::text,null::uuid,greatest(_dal,a.data_inizio),least(_al,a.data_fine_prevista),a.data_inizio is null,false,null::text,a.role_type,coalesce(a.is_capocantiere,false),
   (select array_agg(distinct h.id order by h.id) from public.hr_profili h where h.company_id=_company and (h.user_id=a.user_id or exists(select 1 from public.employees e where e.company_id=_company and e.user_id=a.user_id and h.employee_id=e.id)))
  from public.order_campo_assignments a where a.company_id=_company and a.order_id=_ordine and a.role_type in('employee','operaio','capocantiere') and (a.data_inizio is null or a.data_inizio<=_al) and (a.data_fine_prevista is null or a.data_fine_prevista>=_dal)
 ), collegate as (
  select hr_ids[1] persona_id,jsonb_build_object('fonte',fonte,'fonte_id',fonte_id,'fase_id',fase_id,'dal',dal,'al',al,'senza_date',senza_date,'qualifica_fonte',qualifica_fonte,'ruolo_app',ruolo_app,'capocantiere',capocantiere) periodo from sorgenti where cardinality(hr_ids)=1
 ), interni as (
  select jsonb_build_object('tipo','hr','id',h.id,'nome',h.nome,'cognome',h.cognome,'mansione',h.mansione,'attivo',h.attivo,'periodi',(select jsonb_agg(z.periodo order by z.periodo::text)from(select distinct c.periodo from collegate c where c.persona_id=h.id)z)) p
  from public.hr_profili h where h.company_id=_company and exists(select 1 from collegate c where c.persona_id=h.id)
 ), esterni as (
  select jsonb_build_object('tipo','esterno','id',w.id,'nome',w.nome,'cognome',w.cognome,'mansione',w.mansione,'attivo',w.attivo,'subappaltatore_id',w.subappaltatore_id,'impresa',s.ragione_sociale,'periodi',(select jsonb_agg(jsonb_build_object('fonte','subappalto','fonte_id',a.id,'fase_id',a.fase_id,'dal',greatest(_dal,a.dal),'al',least(_al,a.al),'senza_date',false,'attivita',a.attivita,'area',a.area)order by a.id)from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=w.subappaltatore_id and a.operaio_id=w.id and a.dal<=_al and(a.al is null or a.al>=_dal) and(_fase is null or a.fase_id is null or a.fase_id=_fase)))p
  from public.subappaltatori_operai w join public.subappaltatori_sicurezza s on s.id=w.subappaltatore_id and s.company_id=_company where w.company_id=_company and exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=w.subappaltatore_id and a.operaio_id=w.id and a.dal<=_al and(a.al is null or a.al>=_dal) and(_fase is null or a.fase_id is null or a.fase_id=_fase))
 )select jsonb_build_object('persone',coalesce((select jsonb_agg(p order by p->>'tipo',p->>'id') from(select p from interni union all select p from esterni)t),'[]'),'da_collegare',coalesce((select jsonb_agg(jsonb_build_object('chiave',chiave,'fonte',fonte,'fonte_id',fonte_id,'nome',nome,'cognome',cognome,'motivo',case when esterno_legacy then 'Anagrafica esterna legacy: riconciliare nel fascicolo del subappaltatore' when coalesce(cardinality(hr_ids),0)=0 then 'Profilo HR non collegato' else 'Collegamento HR ambiguo' end)order by chiave,fonte_id)from sorgenti where coalesce(cardinality(hr_ids),0)<>1),'[]')) into r;
 -- A foreign/missing employee reference is an unresolved local assignment, never silently omitted.
 r:=jsonb_set(r,'{da_collegare}',(r->'da_collegare')||coalesce((select jsonb_agg(jsonb_build_object('chiave','assegnazione:'||oe.id::text,'fonte','commessa','fonte_id',oe.id,'nome',null,'cognome',null,'motivo','Persona assegnata non presente in questa azienda: verifica la riga di assegnazione')order by oe.id)from public.order_employees oe where oe.order_id=_ordine and not exists(select 1 from public.employees e where e.id=oe.employee_id and e.company_id=_company)),'[]'::jsonb));
 if jsonb_array_length(r->'persone')>100 or jsonb_array_length(r->'da_collegare')>100 then raise exception 'Organico esteso: restringi periodo e fase prima di continuare';end if;
 for persona in select value from jsonb_array_elements(r->'persone') loop
  for q in select distinct on(famiglia_id) * from public.sicurezza_qualifiche_addetti where company_id=_company and persona_tipo=persona->>'tipo' and persona_id=(persona->>'id')::uuid order by famiglia_id,versione desc loop
   if jsonb_array_length(qualifiche)>=500 then raise exception 'Più di 500 qualifiche: serve un filtro prima di continuare';end if;
   corrente:=false;begin foto_originale:=public.sicurezza_qualifica_fonte(_company,persona->>'tipo',(persona->>'id')::uuid,q.fonte_id);corrente:=foto_originale->'foto'->>'impronta'=q.fonte_impronta;exception when raise_exception then corrente:=false;end;
   qualifiche:=qualifiche||jsonb_build_array(jsonb_build_object('id',q.id,'famiglia_id',q.famiglia_id,'versione',q.versione,'persona_tipo',q.persona_tipo,'persona_id',q.persona_id,'stato',q.stato,'dati',q.dati,'fonte_id',q.fonte_id,'fonte_impronta',q.fonte_impronta,'fonte_corrente',corrente,'contesto_originale',jsonb_build_object('order_id',q.fonte_snapshot->'order_id','fase_id',q.fonte_snapshot->'fase_id','dal',q.fonte_snapshot->'applicabile_dal','al',q.fonte_snapshot->'applicabile_al'),'registrato_il',q.registrato_il));
  end loop;
 end loop;
 finale:=r||jsonb_build_object('company_id',_company,'order_id',_ordine,'dal',_dal,'al',_al,'fase_id',_fase,'commessa',o,'fase',f,'qualifiche',qualifiche);
 return finale||jsonb_build_object('impronta',public.sicurezza_sds_impronta(finale));
end$$;
revoke all on function public.sicurezza_addetti_fotografia(uuid,uuid,date,date,uuid) from public,anon,authenticated;
create or replace function public.sicurezza_addetti_commessa(_company uuid,_ordine uuid,_dal date,_al date,_fase uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$begin
 return public.sicurezza_addetti_fotografia(_company,_ordine,_dal,_al,_fase);
end$$;
revoke all on function public.sicurezza_addetti_commessa(uuid,uuid,date,date,uuid) from public,anon;grant execute on function public.sicurezza_addetti_commessa(uuid,uuid,date,date,uuid) to authenticated;
notify pgrst,'reload schema';

create table if not exists public.sicurezza_verifiche_addetti(
 id uuid primary key,company_id uuid not null references public.companies(id),order_id uuid not null references public.orders(id),fase_id uuid references public.order_work_phases(id),
 famiglia_id uuid not null,versione integer not null check(versione>0),precedente_id uuid references public.sicurezza_verifiche_addetti(id),dal date not null,al date not null check(al>=dal),
 richiesta jsonb not null,dati jsonb not null,fotografia jsonb not null,riscontri jsonb not null,stato text not null check(stato in('parziale','da_integrare','riscontri_registrati')),
 registrato_da uuid not null,registrato_il timestamptz not null default clock_timestamp(),unique(famiglia_id,versione)
);
alter table public.sicurezza_verifiche_addetti enable row level security;
revoke all on public.sicurezza_verifiche_addetti from public,anon,authenticated;grant select on public.sicurezza_verifiche_addetti to authenticated;
create index if not exists verifiche_addetti_commessa on public.sicurezza_verifiche_addetti(company_id,order_id,registrato_il desc);
drop policy if exists verifiche_addetti_lettura on public.sicurezza_verifiche_addetti;
create policy verifiche_addetti_lettura on public.sicurezza_verifiche_addetti for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));
drop trigger if exists verifiche_addetti_immutabili on public.sicurezza_verifiche_addetti;
create trigger verifiche_addetti_immutabili before update or delete on public.sicurezza_verifiche_addetti for each row execute function public.sicurezza_qualifiche_immutabili();

create or replace function public.sicurezza_registra_addetti(_id uuid,_company uuid,_ordine uuid,_fase uuid,_dal date,_al date,_precedente uuid,_impronta text,_dati jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare esistente public.sicurezza_verifiche_addetti;prec public.sicurezza_verifiche_addetti;richiesta jsonb;quadro jsonb;selezione jsonb:='[]';riscontri jsonb:='[]';sel jsonb;rig jsonb;persona jsonb;qualifica jsonb;
 prof public.sicurezza_profili_requisiti;requisito jsonb;foto_mezzo jsonb;fam uuid;versione integer;ultimo uuid;key_req text;key_riga text;richiesti text[]:=array[]::text[];letti text[]:=array[]::text[];attesi integer;stato text;uso_dal date;uso_al date;generici boolean;
begin
 if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company),false) or public.utente_sola_lettura(_company) then raise exception 'Non puoi registrare il riesame degli addetti' using errcode='42501';end if;
 if _id is null or coalesce(_impronta,'')!~'^[0-9a-f]{64}$' or jsonb_typeof(_dati) is distinct from 'object' or length(_dati::text)>2000000 or (_dati-array['attivita','responsabile','ruolo_responsabile','requisiti','righe','requisiti_definiti','conferma_assegnazioni','attrezzatura'])<>'{}'::jsonb then raise exception 'Richiesta non valida';end if;
 richiesta:=jsonb_build_object('fase',_fase,'dal',_dal,'al',_al,'precedente',_precedente,'impronta',_impronta,'dati',_dati);
 perform set_config('lock_timeout','3s',true);perform pg_advisory_xact_lock(hashtextextended('requisiti-addetti:'||_company::text||':'||_ordine::text,0));
 select * into esistente from public.sicurezza_verifiche_addetti where id=_id;
 if found then
  if (esistente.company_id,esistente.order_id,esistente.registrato_da,esistente.richiesta) is distinct from(_company,_ordine,auth.uid(),richiesta) then raise exception 'Identificativo già usato con dati diversi' using errcode='40001';end if;
  return jsonb_build_object('id',esistente.id,'famiglia_id',esistente.famiglia_id,'versione',esistente.versione,'stato',esistente.stato);
 end if;
 quadro:=public.sicurezza_addetti_fotografia(_company,_ordine,_dal,_al,_fase);
 if quadro->>'impronta' is distinct from _impronta then raise exception 'Organico, qualifiche o pianificazione cambiati: rileggi e ricostruisci i riscontri' using errcode='40001';end if;
 -- Serialize the selected qualification families with their X writers, in canonical person order.
 for persona in select value from jsonb_array_elements(quadro->'persone') order by value->>'tipo',value->>'id' loop
  perform pg_advisory_xact_lock(hashtextextended('qualifiche:'||_company::text||':'||(persona->>'tipo')||':'||(persona->>'id'),0));
 end loop;
 quadro:=public.sicurezza_addetti_fotografia(_company,_ordine,_dal,_al,_fase);
 if quadro->>'impronta' is distinct from _impronta then raise exception 'Fonti cambiate durante la lettura: rileggi il contesto' using errcode='40001';end if;
 if _precedente is not null then
  select * into prec from public.sicurezza_verifiche_addetti where id=_precedente and company_id=_company and order_id=_ordine;
  if not found then raise exception 'Riesame precedente non pertinente';end if;
  select v.id into ultimo from public.sicurezza_verifiche_addetti v where v.famiglia_id=prec.famiglia_id order by v.versione desc limit 1;
  if ultimo is distinct from _precedente then raise exception 'Esiste un riesame più recente: aggiorna lo storico' using errcode='40001';end if;
  if prec.fase_id is distinct from _fase or (prec.dati->'attrezzatura'->>'mezzo_id') is distinct from (_dati->'attrezzatura'->>'mezzo_id') then raise exception 'Una revisione conserva fase e macchina; per un altro contesto crea un riesame distinto';end if;
  fam:=prec.famiglia_id;versione:=prec.versione+1;
 else fam:=_id;versione:=1;end if;
 if exists(select 1 from unnest(array['attivita','responsabile','ruolo_responsabile'])campo where jsonb_typeof(_dati->campo) is distinct from 'string') then raise exception 'Attività, responsabile e ruolo devono essere testi';end if;
 if coalesce(length(trim(_dati->>'attivita')),0) not between 1 and 2000 or coalesce(length(trim(_dati->>'responsabile')),0) not between 1 and 200 or coalesce(length(trim(_dati->>'ruolo_responsabile')),0) not between 1 and 300 or jsonb_typeof(_dati->'requisiti_definiti') is distinct from 'boolean' or jsonb_typeof(_dati->'conferma_assegnazioni') is distinct from 'boolean' then raise exception 'Indica attività, responsabile, ruolo e decisioni esplicite sul contesto';end if;
 if jsonb_typeof(_dati->'requisiti') is distinct from 'array' or jsonb_array_length(_dati->'requisiti') not between 1 and 50 or jsonb_typeof(_dati->'righe') is distinct from 'array' or jsonb_array_length(_dati->'righe')>500 then raise exception 'Seleziona da 1 a 50 requisiti e al massimo 500 riscontri nominativi';end if;
 if _dati->'attrezzatura' is not null and _dati->'attrezzatura'<>'null'::jsonb then
  foto_mezzo:=public.pos_mezzo_fotografia(_company,_ordine,(_dati->'attrezzatura'->>'mezzo_id')::uuid,_dati->'attrezzatura'->>'fonte_tipo',(_dati->'attrezzatura'->>'fonte_id')::uuid);
  if foto_mezzo is null or foto_mezzo is distinct from _dati->'attrezzatura' then raise exception 'Attrezzatura non pertinente o modificata: rileggi la fonte' using errcode='40001';end if;
  if nullif(foto_mezzo->>'dal','')::date>_dal or nullif(foto_mezzo->>'al','')::date<_al or foto_mezzo->>'dal' is null and _dati->'conferma_assegnazioni' is distinct from 'true'::jsonb then raise exception 'Verifica assegnazione e periodo della macchina';end if;
 end if;
 for sel in select value from jsonb_array_elements(_dati->'requisiti') loop
  if jsonb_typeof(sel) is distinct from 'object' or (sel-array['profilo_id','requisito_id'])<>'{}'::jsonb then raise exception 'Selezione del requisito non valida';end if;
  select * into prof from public.sicurezza_profili_requisiti where id=(sel->>'profilo_id')::uuid and company_id=_company for share;
  if not found or prof.archiviato then raise exception 'Profilo non disponibile o archiviato';end if;
  select value into requisito from jsonb_array_elements(prof.criteri)where value->>'id'=sel->>'requisito_id';
  if requisito is null then raise exception 'Requisito non presente nel profilo';end if;
  if requisito->>'catalogo_id' is not null and not exists(select 1 from public.sicurezza_catalogo_documenti c where c.id=requisito->>'catalogo_id' and c.versione=(requisito->>'catalogo_versione')::integer and c.destinazione='sicurezza' and c.ambito='persona_o_incarico') then raise exception 'Questo criterio non è un requisito nominativo per addetti';end if;
  key_req:=prof.id::text||':'||(requisito->>'id');if key_req=any(richiesti) then raise exception 'Requisito duplicato';end if;richiesti:=array_append(richiesti,key_req);
  if exists(select 1 from jsonb_array_elements(selezione)x where x->>'famiglia_id'=prof.famiglia_id::text and x->>'profilo_id'<>prof.id::text) then raise exception 'Non mescolare versioni diverse della stessa famiglia di profili';end if;
  selezione:=selezione||jsonb_build_array(jsonb_build_object('profilo_id',prof.id,'famiglia_id',prof.famiglia_id,'versione',prof.versione,'nome',prof.nome,'attivita',prof.attivita,'ruoli',prof.ruoli,'limiti',prof.limiti,'requisito',requisito));
 end loop;
 attesi:=jsonb_array_length(quadro->'persone')*jsonb_array_length(selezione);
 if attesi>500 or jsonb_array_length(_dati->'righe')<>attesi or attesi=0 and jsonb_array_length(quadro->'da_collegare')=0 then raise exception 'Copertura nominativa incompleta o troppo estesa: un riscontro per ogni addetto e requisito selezionato';end if;
 for rig in select value from jsonb_array_elements(_dati->'righe') loop
  if jsonb_typeof(rig) is distinct from 'object' or (rig-array['persona_tipo','persona_id','profilo_id','requisito_id','esito','qualifica_id','motivazione','confermata'])<>'{}'::jsonb or rig->>'esito' not in('da_verificare','mancante','riesaminata','non_applicabile') or rig->>'esito' is null or jsonb_typeof(rig->'confermata') is distinct from 'boolean' or coalesce(length(rig->>'motivazione'),0)>2000 then raise exception 'Riscontro non valido';end if;
  if exists(select 1 from unnest(array['persona_tipo','persona_id','profilo_id','requisito_id','esito','motivazione'])campo where jsonb_typeof(rig->campo) is distinct from 'string') or coalesce(jsonb_typeof(rig->'qualifica_id'),'missing') not in('string','null') then raise exception 'Dati nominativi del riscontro incompleti o non testuali';end if;
  select value into persona from jsonb_array_elements(quadro->'persone') where value->>'tipo'=rig->>'persona_tipo' and value->>'id'=rig->>'persona_id';
  if persona is null then raise exception 'Addetto non presente nel contesto selezionato';end if;
  key_req:=(rig->>'profilo_id')||':'||(rig->>'requisito_id');if not coalesce(key_req=any(richiesti),false) then raise exception 'Requisito non selezionato per questo riesame';end if;
  key_riga:=(persona->>'tipo')||':'||(persona->>'id')||':'||key_req;if key_riga=any(letti) then raise exception 'Riscontro nominativo duplicato';end if;letti:=array_append(letti,key_riga);
  qualifica:=null;
  if rig->>'esito'='riesaminata' then
   if rig->'confermata' is distinct from 'true'::jsonb or coalesce(length(trim(rig->>'motivazione')),0)=0 then raise exception 'Conferma e motiva la pertinenza dell’evidenza al requisito';end if;
   select value into qualifica from jsonb_array_elements(quadro->'qualifiche')where value->>'id'=rig->>'qualifica_id' and value->>'persona_tipo'=persona->>'tipo' and value->>'persona_id'=persona->>'id';
   if qualifica is null or qualifica->>'stato'<>'riesaminata' or qualifica->'fonte_corrente' is distinct from 'true'::jsonb then raise exception 'Qualifica non attuale, revocata, di un altro addetto o con originale cambiato';end if;
   select min((v->>'dal')::date),max((v->>'al')::date),bool_or((v->>'senza_date')::boolean)into uso_dal,uso_al,generici from jsonb_array_elements(persona->'periodi')v;
   if uso_dal is null or uso_al is null or (qualifica->'dati'->>'validita_dal')::date>uso_dal or nullif(qualifica->'dati'->>'validita_al','')::date<uso_al then raise exception 'La qualifica non copre il periodo di utilizzo assegnato all’addetto';end if;
   if generici and _dati->'conferma_assegnazioni' is distinct from 'true'::jsonb then raise exception 'L’assegnazione è priva di date: conferma esplicitamente il periodo dichiarato';end if;
   if nullif(qualifica->'contesto_originale'->>'order_id','') is not null and qualifica->'contesto_originale'->>'order_id'<>_ordine::text or nullif(qualifica->'contesto_originale'->>'fase_id','') is not null and qualifica->'contesto_originale'->>'fase_id' is distinct from _fase::text and exists(select 1 from jsonb_array_elements(persona->'periodi')v where v->>'fase_id' is distinct from qualifica->'contesto_originale'->>'fase_id') or nullif(qualifica->'contesto_originale'->>'dal','')::date>uso_dal or nullif(qualifica->'contesto_originale'->>'al','')::date<uso_al then raise exception 'L’originale della qualifica è limitato a un altro contesto o periodo';end if;
  elsif rig->>'esito'='non_applicabile' then
   if rig->'confermata' is distinct from 'true'::jsonb or coalesce(length(trim(rig->>'motivazione')),0)=0 or rig->>'qualifica_id' is not null then raise exception 'Motiva e conferma la non applicabilità senza collegare evidenze';end if;
  else
   if rig->>'qualifica_id' is not null or rig->'confermata' is distinct from 'false'::jsonb or rig->>'esito'='mancante' and coalesce(length(trim(rig->>'motivazione')),0)=0 then raise exception 'Un requisito aperto non conserva una conferma o un’evidenza precedente';end if;
  end if;
  select value into sel from jsonb_array_elements(selezione)x where x->>'profilo_id'=rig->>'profilo_id' and x->'requisito'->>'id'=rig->>'requisito_id';
  riscontri:=riscontri||jsonb_build_array(rig||jsonb_build_object('persona_snapshot',persona,'requisito_snapshot',sel,'qualifica_snapshot',qualifica));
 end loop;
 stato:=case when _dati->'requisiti_definiti' is distinct from 'true'::jsonb or jsonb_array_length(quadro->'da_collegare')>0 or exists(select 1 from jsonb_array_elements(riscontri)x where x->>'esito'='da_verificare') then 'parziale' when exists(select 1 from jsonb_array_elements(riscontri)x where x->>'esito'='mancante') then 'da_integrare' else 'riscontri_registrati' end;
 insert into public.sicurezza_verifiche_addetti(id,company_id,order_id,fase_id,famiglia_id,versione,precedente_id,dal,al,richiesta,dati,fotografia,riscontri,stato,registrato_da)values(_id,_company,_ordine,_fase,fam,versione,_precedente,_dal,_al,richiesta,_dati,quadro,riscontri,stato,auth.uid());
 return jsonb_build_object('id',_id,'famiglia_id',fam,'versione',versione,'stato',stato);
end$$;
revoke all on function public.sicurezza_registra_addetti(uuid,uuid,uuid,uuid,date,date,uuid,text,jsonb) from public,anon;grant execute on function public.sicurezza_registra_addetti(uuid,uuid,uuid,uuid,date,date,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
create or replace function public.sicurezza_addetti_storico(_company uuid,_ordine uuid,_dal date,_al date,_fase uuid default null,_revisioni boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb;begin
 if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company),false) or not exists(select 1 from public.orders where id=_ordine and company_id=_company) then raise exception 'Storico non disponibile' using errcode='42501';end if;
 if _dal is null or _al is null or _al<_dal then raise exception 'Indica il periodo di consultazione';end if;
 if _fase is not null and not exists(select 1 from public.order_work_phases where id=_fase and order_id=_ordine and company_id=_company) then raise exception 'Fase non pertinente allo storico della commessa';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'company_id',v.company_id,'order_id',v.order_id,'fase_id',v.fase_id,'famiglia_id',v.famiglia_id,'versione',v.versione,'precedente_id',v.precedente_id,'dal',v.dal,'al',v.al,'stato',v.stato,'dati',v.dati-'righe','impronta',v.fotografia->>'impronta','registrato_il',v.registrato_il,'registrato_da',v.registrato_da,'riscontri',jsonb_array_length(v.riscontri),'non_collegati',jsonb_array_length(v.fotografia->'da_collegare'))order by v.registrato_il desc,v.id),'[]')into r from(select v.* from public.sicurezza_verifiche_addetti v where v.company_id=_company and v.order_id=_ordine and v.dal<=_al and v.al>=_dal and(_fase is null or v.fase_id=_fase) and(_revisioni or not exists(select 1 from public.sicurezza_verifiche_addetti n where n.famiglia_id=v.famiglia_id and n.versione>v.versione))order by v.registrato_il desc,v.id limit 51)v;
 if jsonb_array_length(r)>50 then raise exception 'Più di 50 riesami: restringi il periodo/fase o escludi le revisioni precedenti';end if;
 return jsonb_build_object('company_id',_company,'order_id',_ordine,'dal',_dal,'al',_al,'fase_id',_fase,'revisioni',_revisioni,'registrazioni',r);
end$$;
revoke all on function public.sicurezza_addetti_storico(uuid,uuid,date,date,uuid,boolean) from public,anon;grant execute on function public.sicurezza_addetti_storico(uuid,uuid,date,date,uuid,boolean) to authenticated;
notify pgrst,'reload schema';

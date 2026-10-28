-- Z2a: own-emitter reviewed context. No automatic approval or original-file export.
set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.sicurezza_qualifiche_accesso_autore(_company uuid,_tipo text,_persona uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public as $$
declare p jsonb;hr boolean;sf boolean;begin
 hr:=coalesce(public.has_permission_for_company(_autore,'can_view_persone',_company),false);
 sf:=coalesce(public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company),false);
 if _autore is null or _tipo not in('hr','esterno') or _tipo is null or (_tipo='hr' and not(hr or sf)) or (_tipo='esterno' and not sf) then raise exception 'Non puoi consultare o gestire le qualifiche di questa persona' using errcode='42501';end if;
 if _tipo='hr' then select jsonb_build_object('id',id,'tipo',_tipo,'nome',nome,'cognome',cognome,'attivo',attivo) into p from public.hr_profili where id=_persona and company_id=_company;
 else select jsonb_build_object('id',id,'tipo',_tipo,'nome',nome,'cognome',cognome,'subappaltatore_id',subappaltatore_id,'attivo',attivo) into p from public.subappaltatori_operai where id=_persona and company_id=_company;end if;
 if p is null then raise exception 'Persona non presente in questa azienda' using errcode='42501';end if;return p;
end$$;
create or replace function public.sicurezza_qualifica_fonte_autore(_company uuid,_tipo text,_persona uuid,_fonte uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare p jsonb;f jsonb;percorso text;bucket text;oggetto jsonb;begin
 p:=public.sicurezza_qualifiche_accesso_autore(_company,_tipo,_persona,_autore);
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
create or replace function public.sicurezza_addetti_fotografia_autore(_company uuid,_ordine uuid,_dal date,_al date,_fase uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare o jsonb;f jsonb;r jsonb;finale jsonb;persona jsonb;q record;foto_originale jsonb;qualifiche jsonb:='[]';corrente boolean;begin
 if _autore is null or not coalesce(public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company),false) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
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
  select 'campo:'||a.id::text,'campo',a.id,null::uuid,a.user_id,null::text,null::text,null::uuid,greatest(_dal,a.data_inizio),least(_al,a.data_fine_prevista),a.data_inizio is null,exists(select 1 from public.employees z where z.company_id=_company and z.user_id=a.user_id and z.role_type='subappaltatore'),null::text,a.role_type,coalesce(a.is_capocantiere,false),
   (select array_agg(distinct h.id order by h.id) from public.hr_profili h where not exists(select 1 from public.employees z where z.company_id=_company and z.user_id=a.user_id and z.role_type='subappaltatore') and h.company_id=_company and (h.user_id=a.user_id or exists(select 1 from public.employees e where e.company_id=_company and e.user_id=a.user_id and h.employee_id=e.id)))
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
   corrente:=false;begin foto_originale:=public.sicurezza_qualifica_fonte_autore(_company,persona->>'tipo',(persona->>'id')::uuid,q.fonte_id,_autore);corrente:=foto_originale->'foto'->>'impronta'=q.fonte_impronta;exception when raise_exception then corrente:=false;end;
   qualifiche:=qualifiche||jsonb_build_array(jsonb_build_object('id',q.id,'famiglia_id',q.famiglia_id,'versione',q.versione,'persona_tipo',q.persona_tipo,'persona_id',q.persona_id,'stato',q.stato,'dati',q.dati,'fonte_id',q.fonte_id,'fonte_impronta',q.fonte_impronta,'fonte_corrente',corrente,'contesto_originale',jsonb_build_object('order_id',q.fonte_snapshot->'order_id','fase_id',q.fonte_snapshot->'fase_id','dal',q.fonte_snapshot->'applicabile_dal','al',q.fonte_snapshot->'applicabile_al'),'registrato_il',q.registrato_il));
  end loop;
 end loop;
 finale:=r||jsonb_build_object('company_id',_company,'order_id',_ordine,'dal',_dal,'al',_al,'fase_id',_fase,'commessa',o,'fase',f,'qualifiche',qualifiche);
 return finale||jsonb_build_object('impronta',public.sicurezza_sds_impronta(finale));
end$$;
revoke all on function public.sicurezza_qualifiche_accesso_autore(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.sicurezza_qualifica_fonte_autore(uuid,text,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.sicurezza_addetti_fotografia_autore(uuid,uuid,date,date,uuid,uuid) from public,anon,authenticated,service_role;
-- Preserve the existing authenticated API and hash format through one canonical implementation.
create or replace function public.sicurezza_qualifica_fonte(_company uuid,_tipo text,_persona uuid,_fonte uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$begin
 return public.sicurezza_qualifica_fonte_autore(_company,_tipo,_persona,_fonte,auth.uid());
end$$;
create or replace function public.sicurezza_addetti_fotografia(_company uuid,_ordine uuid,_dal date,_al date,_fase uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$begin
 return public.sicurezza_addetti_fotografia_autore(_company,_ordine,_dal,_al,_fase,auth.uid());
end$$;
-- Unknown or foreign unresolved identities are conservatively internal blockers.
-- Classification uses canonical IDs and role_type; never parses translated labels.
create or replace function public.pos_addetto_non_collegato_proprio(_company uuid,_ordine uuid,_riga jsonb) returns boolean language sql stable security invoker set search_path=public as $$
 select not(case when _riga->>'fonte'='commessa' then exists(
 select 1 from public.order_employees a join public.employees e on e.id=a.employee_id and e.company_id=_company
 where a.id=(_riga->>'fonte_id')::uuid and a.order_id=_ordine and e.role_type='subappaltatore')
 when _riga->>'fonte'='campo' then exists(
 select 1 from public.order_campo_assignments a join public.employees e on e.user_id=a.user_id and e.company_id=_company
 where a.id=(_riga->>'fonte_id')::uuid and a.company_id=_company and a.order_id=_ordine and e.role_type='subappaltatore')
 else false end);
$$;
revoke all on function public.pos_addetto_non_collegato_proprio(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.pos_riesame_proprio_foto(_company uuid,_ordine uuid,_riesame uuid,_autore uuid) returns jsonb language plpgsql security invoker set search_path=public set timezone='UTC' as $$
declare v public.sicurezza_verifiche_addetti;corrente jsonb;propri jsonb;salvati jsonb;rig jsonb;sel jsonb;persona jsonb;qualifica jsonb;foto jsonb;riscontri jsonb:='[]';criteri jsonb:='[]';risultato jsonb;prof public.sicurezza_profili_requisiti;
begin
 if _autore is null or not coalesce(public.has_permission_for_company(_autore,'can_view_sicurezza_cantiere',_company),false) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 select * into v from public.sicurezza_verifiche_addetti where id=_riesame and company_id=_company and order_id=_ordine;
 if not found then raise exception 'Riesame non presente in questa commessa' using errcode='42501';end if;
 if exists(select 1 from public.sicurezza_verifiche_addetti n where n.famiglia_id=v.famiglia_id and n.versione>v.versione) then raise exception 'Riesame superato: seleziona la revisione corrente' using errcode='40001';end if;
 if v.dati->'requisiti_definiti' is distinct from 'true'::jsonb then raise exception 'Requisiti ancora da definire per questa attività';end if;
 corrente:=public.sicurezza_addetti_fotografia_autore(_company,_ordine,v.dal,v.al,v.fase_id,_autore);
 if exists(select 1 from jsonb_array_elements(corrente->'da_collegare')r where public.pos_addetto_non_collegato_proprio(_company,_ordine,r)) or exists(select 1 from jsonb_array_elements(v.fotografia->'da_collegare')r where public.pos_addetto_non_collegato_proprio(_company,_ordine,r)) then raise exception 'Collegamenti della propria impresa da riconciliare: registra un nuovo riesame';end if;
 select coalesce(jsonb_agg(p order by p->>'id'),'[]') into propri from jsonb_array_elements(corrente->'persone')p where p->>'tipo'='hr';
 select coalesce(jsonb_agg(p order by p->>'id'),'[]') into salvati from jsonb_array_elements(v.fotografia->'persone')p where p->>'tipo'='hr';
 if jsonb_array_length(propri)=0 then raise exception 'Nessun addetto della propria impresa in questo riesame';end if;
 if propri is distinct from salvati or corrente->'commessa' is distinct from v.fotografia->'commessa' or corrente->'fase' is distinct from v.fotografia->'fase' then raise exception 'Organico proprio o pianificazione cambiati: registra un nuovo riesame' using errcode='40001';end if;
 if exists(select 1 from jsonb_array_elements(propri)p where p->'attivo' is distinct from 'true'::jsonb) then raise exception 'Addetto della propria impresa non attivo: verifica organico e periodo';end if;
 if v.dati->'conferma_assegnazioni' is distinct from 'true'::jsonb and exists(select 1 from jsonb_array_elements(propri)p cross join lateral jsonb_array_elements(p->'periodi')a where a->'senza_date'='true'::jsonb) then raise exception 'Conferma il periodo delle assegnazioni prive di date';end if;
 if v.dati->'attrezzatura' is not null and v.dati->'attrezzatura'<>'null'::jsonb then
  foto:=public.pos_mezzo_fotografia(_company,_ordine,(v.dati->'attrezzatura'->>'mezzo_id')::uuid,v.dati->'attrezzatura'->>'fonte_tipo',(v.dati->'attrezzatura'->>'fonte_id')::uuid);
  if foto is null or foto is distinct from v.dati->'attrezzatura' then raise exception 'Attrezzatura cambiata: registra un nuovo riesame' using errcode='40001';end if;
 end if;
 for sel in select value from jsonb_array_elements(v.dati->'requisiti') loop
  select * into prof from public.sicurezza_profili_requisiti where id=(sel->>'profilo_id')::uuid and company_id=_company;
  if not found or prof.archiviato or exists(select 1 from public.sicurezza_profili_requisiti n where n.company_id=_company and n.famiglia_id=prof.famiglia_id and n.versione>prof.versione) then raise exception 'Profilo requisito archiviato o superato: registra un nuovo riesame' using errcode='40001';end if;
  select value into foto from jsonb_array_elements(prof.criteri)c where c->>'id'=sel->>'requisito_id';
  if foto is null then raise exception 'Requisito non più disponibile';end if;
  criteri:=criteri||jsonb_build_array(jsonb_build_object('profilo_id',prof.id,'famiglia_id',prof.famiglia_id,'versione',prof.versione,'nome',prof.nome,'attivita',prof.attivita,'ruoli',prof.ruoli,'limiti',prof.limiti,'requisito',foto));
  for persona in select value from jsonb_array_elements(propri) loop
   select value into rig from jsonb_array_elements(v.riscontri)r where r->>'persona_tipo'='hr' and r->>'persona_id'=persona->>'id' and r->>'profilo_id'=prof.id::text and r->>'requisito_id'=sel->>'requisito_id';
   if rig is null or rig->>'esito' not in('riesaminata','non_applicabile') or rig->'confermata' is distinct from 'true'::jsonb or nullif(trim(rig->>'motivazione'),'') is null then raise exception 'Riscontri della propria impresa incompleti: integra il riesame';end if;
   if rig->'requisito_snapshot' is distinct from criteri->(jsonb_array_length(criteri)-1) or rig->'persona_snapshot' is distinct from persona then raise exception 'Identità o criterio del riscontro cambiati: registra un nuovo riesame' using errcode='40001';end if;
   qualifica:=null;
   if rig->>'esito'='riesaminata' then
    select value into qualifica from jsonb_array_elements(corrente->'qualifiche')q where q->>'id'=rig->>'qualifica_id' and q->>'persona_tipo'='hr' and q->>'persona_id'=persona->>'id';
    if qualifica is null or qualifica->>'stato'<>'riesaminata' or qualifica->'fonte_corrente' is distinct from 'true'::jsonb or qualifica is distinct from rig->'qualifica_snapshot' then raise exception 'Qualifica propria revocata, superata o con originale modificato' using errcode='40001';end if;
   elsif rig->>'qualifica_id' is not null then raise exception 'Non applicabilità con evidenza incoerente';end if;
   riscontri:=riscontri||jsonb_build_array(jsonb_build_object('persona_id',persona->>'id','nominativo',trim(coalesce(persona->>'nome','')||' '||coalesce(persona->>'cognome','')),'mansione',persona->>'mansione','profilo_id',prof.id,'profilo_nome',prof.nome,'profilo_versione',prof.versione,'requisito_id',sel->>'requisito_id','titolo',foto->>'titolo','esito',rig->>'esito','motivazione',rig->>'motivazione','qualifica',qualifica));
  end loop;
 end loop;
 risultato:=jsonb_build_object('versione',1,'company_id',_company,'order_id',_ordine,'id',v.id,'famiglia_id',v.famiglia_id,'revisione',v.versione,'dal',v.dal,'al',v.al,'fase_id',v.fase_id,'attivita',v.dati->>'attivita','responsabile',v.dati->>'responsabile','ruolo_responsabile',v.dati->>'ruolo_responsabile','registrato_il',v.registrato_il,'registrato_da',v.registrato_da,'commessa',corrente->'commessa','fase',corrente->'fase','persone',propri,'criteri',criteri,'riscontri',riscontri,'attrezzatura',v.dati->'attrezzatura');
 return risultato||jsonb_build_object('impronta',public.sicurezza_sds_impronta(risultato));
end$$;
revoke all on function public.pos_riesame_proprio_foto(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.pos_riesame_proprio(_company uuid,_ordine uuid,_riesame uuid) returns jsonb language plpgsql security definer set search_path=public as $$begin
 return public.pos_riesame_proprio_foto(_company,_ordine,_riesame,auth.uid());
end$$;
revoke all on function public.pos_riesame_proprio(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.pos_riesame_proprio(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';

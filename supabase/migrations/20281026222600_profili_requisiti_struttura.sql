set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.sicurezza_salva_profilo(_id uuid,_company uuid,_precedente uuid,_dati jsonb)
returns public.sicurezza_profili_requisiti language plpgsql security definer set search_path=public as $$
declare vecchio public.sicurezza_profili_requisiti;ultimo public.sicurezza_profili_requisiti;nuovo public.sicurezza_profili_requisiti;
 famiglia uuid;c jsonb;chiavi text[]:=array[]::text[];
begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi gestire i profili sicurezza in questa azienda' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 if _id is null or jsonb_typeof(_dati) is distinct from 'object' or length(_dati::text)>200000 or (_dati-array['nome','attivita','ruoli','limiti','criteri','testi_generici'])<>'{}'::jsonb then raise exception 'Dati del profilo non validi';end if;
 if exists(select 1 from unnest(array['nome','attivita','ruoli','limiti']) k where jsonb_typeof(_dati->k) is distinct from 'string') then raise exception 'Nome, attività, ruoli e limiti devono essere testi';end if;
 if (_dati->>'testi_generici') is distinct from 'true' then raise exception 'Conferma che i testi siano generici e riutilizzabili';end if;
 if length(trim(coalesce(_dati->>'nome',''))) not between 1 and 120 or length(trim(coalesce(_dati->>'attivita','')))=0 or length(trim(coalesce(_dati->>'ruoli','')))=0 or length(trim(coalesce(_dati->>'limiti','')))=0 then raise exception 'Indica nome, attività, ruoli e limiti del profilo';end if;
 if length(_dati->>'attivita')>4000 or length(_dati->>'ruoli')>4000 or length(_dati->>'limiti')>4000 or jsonb_typeof(_dati->'criteri') is distinct from 'array' or jsonb_array_length(_dati->'criteri') not between 1 and 50 then raise exception 'Controlla dimensione e criteri del profilo';end if;
 for c in select value from jsonb_array_elements(_dati->'criteri') loop
  if jsonb_typeof(c) is distinct from 'object' or (c-array['id','titolo','catalogo_id','catalogo_versione','riferimento','indicazioni'])<>'{}'::jsonb or nullif(c->>'id','')::uuid is null or (c->>'id')=any(chiavi) or length(trim(coalesce(c->>'titolo',''))) not between 1 and 300 or length(coalesce(c->>'riferimento',''))>1000 or length(coalesce(c->>'indicazioni',''))>2000 then raise exception 'Criteri del profilo non validi o duplicati';end if;
  if exists(select 1 from unnest(array['id','titolo','riferimento','indicazioni']) k where jsonb_typeof(c->k) is distinct from 'string') then raise exception 'Titolo, riferimento e indicazioni dei criteri devono essere testi';end if;
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


-- All business rows, storage metadata and audit events are rolled back.
begin;
set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table prova_catalogo(actor uuid,azienda uuid,sub uuid,ordine uuid,operaio uuid,incarico uuid,evidenza uuid,estraneo uuid);
insert into prova_catalogo select sp.user_id,sp.company_id,s.id,o.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from public.staff_permissions sp join public.subappaltatori_sicurezza s on s.company_id=sp.company_id join public.orders o on o.company_id=sp.company_id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
grant select on prova_catalogo to authenticated;
do $$begin if not exists(select 1 from prova_catalogo) then raise exception 'Fixture aziendale non disponibile';end if;end$$;
insert into public.subappaltatori_operai(id,company_id,subappaltatore_id,nome,cognome,mansione) select operaio,azienda,sub,'TEST CATALOGO','ROLLBACK','Operaio' from prova_catalogo;
insert into public.sicurezza_incarichi(id,company_id,subappaltatore_id,order_id,ruolo,nominativo,dal) select incarico,azienda,sub,ordine,'rspp','TEST CATALOGO ROLLBACK','2026-10-27' from prova_catalogo;
insert into public.sicurezza_incarichi(id,company_id,order_id,ruolo,nominativo,dal) select f.estraneo,o.company_id,o.id,'rspp','TEST ALTRA AZIENDA','2026-10-27' from prova_catalogo f cross join lateral(select company_id,id from public.orders where company_id<>f.azienda limit 1)o;
do $$declare f record;idvoce text;begin
 select * into f from prova_catalogo;
 if (select count(*) from public.sicurezza_catalogo_documenti where versione=1)<>82 or (select sum(jsonb_array_length(fonti)) from public.sicurezza_catalogo_documenti where versione=1)<>124 then raise exception 'ASSERT: copertura catalogo incompleta';end if;
 foreach idvoce in array array['lul','unilav_assunzione','doma','plac'] loop
  begin
   insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,tipo,titolo,catalogo_id,catalogo_versione) values(f.azienda,f.sub,'altro','TEST NON CONSENTITO',idvoce,1);
   raise exception 'ASSERT: voce riservata caricabile in sicurezza';
  exception when raise_exception then if sqlerrm not like 'Questa voce richiede%' then raise;end if;end;
 end loop;
 begin
  insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,tipo,titolo,catalogo_id,catalogo_versione) values(f.azienda,f.sub,'pos','TEST SENZA COMMESSA','pos',1);
  raise exception 'ASSERT: POS generico accettato';
 exception when raise_exception then if sqlerrm not like 'Scegli la commessa%' then raise;end if;end;
 begin
  insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,tipo,titolo,catalogo_id,catalogo_versione) values(f.azienda,f.sub,'nomina','TEST SENZA INCARICO','nomina_rspp',1);
  raise exception 'ASSERT: nomina senza incarico accettata';
 exception when raise_exception then if sqlerrm not like 'Collega l’incarico%' then raise;end if;end;
 begin
  insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,tipo,titolo,catalogo_id,catalogo_versione) values(f.azienda,f.sub,'formazione','TEST SENZA PERSONA','formazione_preposto',1);
  raise exception 'ASSERT: attestato senza persona accettato';
 exception when raise_exception then if sqlerrm not like 'Collega l’operaio%' then raise;end if;end;
 begin
  insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,order_id,incarico_id,tipo,titolo,catalogo_id,catalogo_versione) values(f.azienda,f.sub,f.ordine,f.estraneo,'nomina','TEST ALTRA AZIENDA','nomina_rspp',1);
  raise exception 'ASSERT: incarico estraneo accettato';
 exception when raise_exception then if sqlerrm not like 'Incarico non pertinente%' then raise;end if;end;
 begin
  insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,tipo,titolo,catalogo_id,catalogo_versione) values(f.azienda,f.sub,'durc','TEST TIPO ERRATO','visura',1);
  raise exception 'ASSERT: tipo non coerente accettato';
 exception when raise_exception then if sqlerrm not like 'Tipo di evidenza non coerente%' then raise;end if;end;
end$$;
-- Non-applicability must not require a fictitious appointment.
insert into public.sicurezza_fascicolo(company_id,subappaltatore_id,order_id,tipo,titolo,catalogo_id,catalogo_versione,stato,note) select azienda,sub,ordine,'nomina','TEST NON APPLICABILE','nomina_cse',1,'non_applicabile','Solo prova tecnica con rollback, nessuna valutazione normativa reale' from prova_catalogo;
-- Catalogue metadata does not grant business-data access or catalogue editing.
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);set local role authenticated;
do $$begin
 if (select count(*) from public.sicurezza_catalogo_documenti where versione=1)<>82 then raise exception 'ASSERT: metadati catalogo non leggibili';end if;
 begin update public.sicurezza_catalogo_documenti set titolo='Alterato' where id='durc';raise exception 'ASSERT: catalogo modificabile dal client';exception when insufficient_privilege then null;end;
end$$;reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_catalogo;set local role authenticated;
insert into public.sicurezza_fascicolo(id,company_id,subappaltatore_id,order_id,incarico_id,tipo,titolo,catalogo_id,catalogo_versione) select evidenza,azienda,sub,ordine,incarico,'nomina','TEST NOMINA CATALOGO','nomina_rspp',1 from prova_catalogo;
do $$declare f record;begin select * into f from prova_catalogo;
 if not exists(select 1 from public.sicurezza_fascicolo where id=f.evidenza and stato='da_richiedere' and data_scadenza is null and origine_requisito='da_verificare') then raise exception 'ASSERT: requisiti o scadenze inventati';end if;
 begin update public.sicurezza_incarichi set subappaltatore_id=null where id=f.incarico;raise exception 'ASSERT: titolare cambiato con evidenze collegate';exception when raise_exception then if sqlerrm not like 'L’incarico ha documenti collegati%' then raise;end if;end;
end$$;
reset role;
insert into storage.objects(bucket_id,name) select 'fascicoli-cantiere',azienda::text||'/'||evidenza::text||'/sintetico.pdf' from prova_catalogo;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_catalogo;set local role authenticated;
update public.sicurezza_fascicolo e set file_path=f.azienda::text||'/'||f.evidenza::text||'/sintetico.pdf',file_name='sintetico.pdf',stato='ricevuto' from prova_catalogo f where e.id=f.evidenza;
update public.sicurezza_fascicolo set stato='verificato' where id=(select evidenza from prova_catalogo);
do $$declare f record;begin select * into f from prova_catalogo;
 if not exists(select 1 from public.sicurezza_fascicolo where id=f.evidenza and verificato_da=f.actor) then raise exception 'ASSERT: verifica non attribuita';end if;
 begin update public.sicurezza_fascicolo set catalogo_id='aggiornamento_nomine' where id=f.evidenza;raise exception 'ASSERT: classificazione verificata cambiata';exception when raise_exception then if sqlerrm not like 'Riapri in integrazione%' then raise;end if;end;
 begin update public.sicurezza_incarichi set nominativo='Persona diversa' where id=f.incarico;raise exception 'ASSERT: persona cambiata con file collegato';exception when raise_exception then if sqlerrm not like 'L’incarico ha file collegati%' then raise;end if;end;
end$$;
reset role;
select 'PASS: catalogo, ambiti, soggetti, verifica e protezione documenti' as esito;
rollback;

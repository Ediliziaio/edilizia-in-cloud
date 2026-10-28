-- Read-only projection of synthetic records. No upload, no issued document; all writes roll back.
begin;set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table prova_dpi(actor uuid,azienda uuid,ordine uuid,altra_azienda uuid,altro_ordine uuid,utente_non_collegato uuid,fase uuid,fase2 uuid,e1 uuid,e2 uuid,e3 uuid,e4 uuid);
insert into prova_dpi
select sp.user_id,sp.company_id,o.id,c.id,oo.id,p.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()
from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id and o.deleted_at is null
join public.companies c on c.id<>sp.company_id join public.orders oo on oo.company_id=c.id and oo.deleted_at is null
join public.profiles p on p.id<>sp.user_id and not exists(select 1 from public.employees e where e.company_id=sp.company_id and e.user_id=p.id)
where sp.can_view_sicurezza_cantiere and not exists(select 1 from public.employees e where e.company_id=sp.company_id and e.user_id=sp.user_id)
and not public.has_permission_for_company(sp.user_id,'can_view_sicurezza_cantiere',c.id)
and not exists(select 1 from public.order_campo_assignments a where a.order_id=o.id and a.user_id in (sp.user_id,p.id)) limit 1;
grant select on prova_dpi to authenticated;
do $$begin if not exists(select 1 from prova_dpi) then raise exception 'Fixture DPI autorizzata non disponibile';end if;end$$;
insert into public.order_work_phases(id,company_id,order_id,name,position) select x.id,f.azienda,f.ordine,'TEST DPI FASE',x.pos from prova_dpi f cross join lateral(values(f.fase,998),(f.fase2,999))x(id,pos);
insert into public.employees(id,company_id,first_name,last_name,user_id,is_active) select x.id,f.azienda,'TEST DPI','Omonimo',x.utente,true from prova_dpi f cross join lateral(values(f.e1,null::uuid),(f.e2,f.actor),(f.e3,null::uuid),(f.e4,null::uuid))x(id,utente);
insert into public.order_employees(order_id,employee_id,phase_id) select f.ordine,x.id,x.fase from prova_dpi f cross join lateral(values(f.e1,f.fase),(f.e3,f.fase2))x(id,fase);
insert into public.order_campo_assignments(company_id,order_id,user_id,role_type,data_inizio,data_fine_prevista) select f.azienda,f.ordine,x.utente,'employee','2026-11-01','2026-11-30' from prova_dpi f cross join lateral(values(f.actor),(f.utente_non_collegato))x(utente);
insert into public.employee_dpi_consegne(company_id,employee_id,dpi_type,consegna_date,status,modulo_consegna_path)
select f.azienda,x.id,'casco','2026-10-01','in_use','TEST DPI PATH PRIVATO' from prova_dpi f cross join lateral(values(f.e1),(f.e2),(f.e3),(f.e4))x(id);
alter table prova_dpi add column legacy uuid default gen_random_uuid();
insert into public.employees(id,company_id,first_name,last_name,role_type,is_active) select legacy,azienda,'TEST DPI','Esterno legacy','subappaltatore',true from prova_dpi;
insert into public.order_employees(order_id,employee_id,phase_id) select ordine,legacy,fase from prova_dpi;
do $$declare f record;begin select * into f from prova_dpi;
 begin insert into public.employee_dpi_consegne(company_id,employee_id,dpi_type,consegna_date,status) values(f.azienda,f.legacy,'guanti','2026-10-27','in_use');raise exception 'ASSERT: impresa esterna nel registro interno';exception when raise_exception then if sqlerrm<>'Il dipendente non appartiene all’azienda della consegna' then raise;end if;end;
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_dpi;set local role authenticated;
do $$declare f record;d jsonb;r jsonb;id1 uuid:=gen_random_uuid();req1 uuid:=gen_random_uuid();rid uuid;begin
 select * into f from prova_dpi;
 if (public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-10-27',f.fase)->>'esterni_legacy')::integer<1 then raise exception 'ASSERT: anagrafica esterna esclusa senza avviso';end if;
 d:=jsonb_build_object('tipo','guanti','marca','TEST DPI','taglia','M','matricola','TEST-1','consegnato_il','2026-10-27','scade_il',null,'stato','in_use','restituito_il',null,'note','TEST GESTIONE DPI ROLLBACK','annullata',false,'motivo','Registrazione sintetica per collaudo');
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,req1,jsonb_set(d,'{motivo}','""'));raise exception 'ASSERT: senza motivo';exception when raise_exception then if sqlerrm not like 'Indica il motivo%' then raise;end if;end;
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,req1,d||'{"registrato_da":"falso"}');raise exception 'ASSERT: autore client';exception when raise_exception then if sqlerrm not like 'Campo DPI non consentito%' then raise;end if;end;
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e4,'2026-10-27',f.fase,null,req1,d);raise exception 'ASSERT: addetto non assegnato';exception when serialization_failure then null;end;
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,req1,jsonb_set(d,'{scade_il}','"2026-10-01"'));raise exception 'ASSERT: scadenza precedente';exception when raise_exception then if sqlerrm<>'Le date DPI precedono la consegna' then raise;end if;end;
 r:=public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,req1,d);
 if (r->>'versione')::integer<>1 or (r->>'modulo_registrato')::boolean then raise exception 'ASSERT: nuova consegna o modulo inventato';end if;
 if not exists(select 1 from public.employee_dpi_eventi where consegna_id=id1 and registrato_da=f.actor and richiesta_id=req1 and versione=1) then raise exception 'ASSERT: audit non attribuito';end if;
 if public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,req1,d)<>r or (select count(*) from public.employee_dpi_eventi where consegna_id=id1)<>1 then raise exception 'ASSERT: retry duplicato';end if;
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,req1,jsonb_set(d,'{marca}','"Diversa"'));raise exception 'ASSERT: nonce usato per altro payload';exception when serialization_failure then null;end;
 d:=jsonb_set(d,'{stato}','"returned"');
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,1,gen_random_uuid(),d);raise exception 'ASSERT: reso senza data';exception when raise_exception then if sqlerrm<>'Indica la data di restituzione' then raise;end if;end;
 d:=jsonb_set(d,'{restituito_il}','"2026-10-27"');
 r:=public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,1,gen_random_uuid(),d);
 if (r->>'versione')::integer<>2 then raise exception 'ASSERT: versione rettifica';end if;
 begin perform public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,1,gen_random_uuid(),d);raise exception 'ASSERT: versione obsoleta';exception when serialization_failure then null;end;
 d:=jsonb_set(jsonb_set(d,'{annullata}','true'),'{motivo}','"Annullamento sintetico con storico"');
 r:=public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,2,gen_random_uuid(),d);
 if (r->>'versione')::integer<>3 or not (r->>'annullata')::boolean or r->>'annullamento_motivo'<>'Annullamento sintetico con storico' then raise exception 'ASSERT: annullamento';end if;
 d:=jsonb_set(jsonb_set(d,'{annullata}','false'),'{motivo}','"Ripristino sintetico con motivazione"');
 r:=public.sicurezza_salva_dpi(id1,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,3,gen_random_uuid(),d);
 if (r->>'versione')::integer<>4 or (r->>'annullata')::boolean or r->>'annullamento_motivo' is not null then raise exception 'ASSERT: ripristino';end if;
 -- A source record with an existing private path must retain it without exposing it.
 select id into rid from public.employee_dpi_consegne where employee_id=f.e1 and modulo_consegna_path='TEST DPI PATH PRIVATO';
 r:=public.sicurezza_salva_dpi(rid,f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,1,gen_random_uuid(),d);
 if not (r->>'modulo_registrato')::boolean or r::text like '%TEST DPI PATH PRIVATO%' then raise exception 'ASSERT: riferimento privato';end if;
 if exists(select 1 from public.employee_dpi_eventi where consegna_id=rid and (prima::text like '%TEST DPI PATH PRIVATO%' or dopo::text like '%TEST DPI PATH PRIVATO%' or richiesta::text like '%TEST DPI PATH PRIVATO%')) then raise exception 'ASSERT: path nello storico';end if;
 begin update public.employee_dpi_eventi set motivo='Falso' where consegna_id=id1;raise exception 'ASSERT: audit modificabile dal client';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$declare f record;rid uuid;v integer;t timestamptz;begin
 select * into f from prova_dpi;select id,versione,created_at into rid,v,t from public.employee_dpi_consegne where employee_id=f.e1 and modulo_consegna_path='TEST DPI PATH PRIVATO';
 update public.employee_dpi_consegne set versione=900,created_at='2000-01-01',dpi_brand='Rettifica fonte diretta' where id=rid;
 if not exists(select 1 from public.employee_dpi_consegne where id=rid and versione=v+1 and created_at=t and modulo_consegna_path='TEST DPI PATH PRIVATO') then raise exception 'ASSERT: versione spoofabile o path perso';end if;
 begin update public.employee_dpi_consegne set employee_id=f.e2 where id=rid;raise exception 'ASSERT: trasferimento titolare';exception when raise_exception then if sqlerrm not like 'Una consegna DPI non si trasferisce%' then raise;end if;end;
 begin update public.employees set company_id=f.altra_azienda where id=f.e1;raise exception 'ASSERT: trasferimento impresa del dipendente';exception when raise_exception then if sqlerrm not like 'Il dipendente ha consegne DPI%' then raise;end if;end;
 begin update public.employees set role_type='subappaltatore' where id=f.e1;raise exception 'ASSERT: fusione con impresa esterna';exception when raise_exception then if sqlerrm not like 'Il dipendente ha consegne DPI%' then raise;end if;end;
 begin delete from public.employee_dpi_eventi where consegna_id=rid;raise exception 'ASSERT: audit riscrivibile da SQL ordinario';exception when raise_exception then if sqlerrm not like 'Lo storico delle consegne DPI non si modifica%' then raise;end if;end;
end$$;
-- Read-only applies both to the RPC and direct source edits, while authorized history remains readable.
update public.staff_permissions set sola_lettura=true where user_id=(select actor from prova_dpi) and company_id=(select azienda from prova_dpi);
set local role authenticated;
do $$declare f record;rid uuid;begin select * into f from prova_dpi;
 select id into rid from public.employee_dpi_consegne where employee_id=f.e1 limit 1;
 begin perform public.sicurezza_salva_dpi(gen_random_uuid(),f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,gen_random_uuid(),'{}');raise exception 'ASSERT: sola lettura RPC';exception when insufficient_privilege then null;end;
 begin update public.employee_dpi_consegne set dpi_brand='vietato' where id=rid;raise exception 'ASSERT: sola lettura fonte';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.employee_dpi_eventi where employee_id=f.e1) then raise exception 'ASSERT: lettura storico negata';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);set local role authenticated;
do $$declare f record;begin select * into f from prova_dpi;
 if exists(select 1 from public.employee_dpi_eventi where company_id=f.azienda) then raise exception 'ASSERT: fuga storico';end if;
 begin perform public.sicurezza_salva_dpi(gen_random_uuid(),f.azienda,f.ordine,f.e1,'2026-10-27',f.fase,null,gen_random_uuid(),'{}');raise exception 'ASSERT: scrittura estranea';exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'PASS: creazione, rettifica, replay, CAS, annullamento/ripristino, audit, fonte coerente e sola lettura DPI' esito;
rollback;

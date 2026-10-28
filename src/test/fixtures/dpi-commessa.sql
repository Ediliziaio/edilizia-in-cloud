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
-- Since block N, the canonical source rejects mismatched company/employee before insertion.
do $$declare f record;begin select * into f from prova_dpi;
 begin insert into public.employee_dpi_consegne(company_id,employee_id,dpi_type,consegna_date,status) values(f.altra_azienda,f.e1,'guanti','2026-10-01','in_use');raise exception 'ASSERT: azienda consegna incoerente';exception when raise_exception then if sqlerrm<>'Il dipendente non appartiene all’azienda della consegna' then raise;end if;end;
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_dpi;set local role authenticated;
do $$declare f record;r jsonb;a jsonb;prima jsonb;begin
 select * into f from prova_dpi;
 r:=public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-10-27',f.fase);
 if not exists(select 1 from jsonb_array_elements(r->'addetti')x where x->>'id'=f.e1::text) then raise exception 'ASSERT: addetto fase escluso';end if;
 if exists(select 1 from jsonb_array_elements(r->'addetti')x where x->>'id' in (f.e2::text,f.e3::text,f.e4::text)) then raise exception 'ASSERT: periodo/fase/non assegnato ignorati';end if;
 select x into a from jsonb_array_elements(r->'addetti')x where x->>'id'=f.e1::text;
 if jsonb_array_length(a->'consegne')<>1 or (a->'consegne'->0->>'modulo_registrato')::boolean is not true then raise exception 'ASSERT: consegne tenant o riferimento modulo';end if;
 if r::text like '%TEST DPI PATH PRIVATO%' or r::text like '%modulo_consegna_path%' or r::text like '%hourly_rate%' or r::text like '%email%' then raise exception 'ASSERT: dati riservati nella proiezione';end if;
 prima:=r;
 r:=public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-11-15',f.fase);
 if not exists(select 1 from jsonb_array_elements(r->'addetti')x where x->>'id'=f.e2::text) then raise exception 'ASSERT: assegnazione Campo non inclusa nel periodo';end if;
 if (r->>'campo_senza_dipendente')::integer<1 then raise exception 'ASSERT: identità non collegata nascosta';end if;
 r:=public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-11-15',null);
 if not exists(select 1 from jsonb_array_elements(r->'addetti')x where x->>'id'=f.e3::text) then raise exception 'ASSERT: tutte le fasi non include la seconda';end if;
 if public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-10-27',f.fase)<>prima then raise exception 'ASSERT: lettura modifica le fonti';end if;
 begin perform public.sicurezza_dpi_commessa(f.azienda,f.ordine,null,null);raise exception 'ASSERT: data obbligatoria';exception when raise_exception then if sqlerrm<>'Indica la data di riferimento' then raise;end if;end;
 begin perform public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-11-15',gen_random_uuid());raise exception 'ASSERT: fase estranea';exception when raise_exception then if sqlerrm<>'La fase non appartiene alla commessa' then raise;end if;end;
 begin perform public.sicurezza_dpi_commessa(f.azienda,f.altro_ordine,'2026-11-15',null);raise exception 'ASSERT: ordine estraneo';exception when insufficient_privilege then null;end;
 begin perform public.sicurezza_dpi_commessa(f.altra_azienda,f.altro_ordine,'2026-11-15',null);raise exception 'ASSERT: azienda estranea';exception when insufficient_privilege then null;end;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);set local role authenticated;
do $$declare f record;begin select * into f from prova_dpi;
 begin perform public.sicurezza_dpi_commessa(f.azienda,f.ordine,'2026-10-27',null);raise exception 'ASSERT: utente senza permesso';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin if has_function_privilege('anon','public.sicurezza_dpi_commessa(uuid,uuid,date,uuid)','execute') then raise exception 'ASSERT: anon execute';end if;end$$;
select 'PASS: DPI scopo azienda/commessa, assegnazioni, fase/data, identità distinte e nessun file/HR riservato' esito;
rollback;

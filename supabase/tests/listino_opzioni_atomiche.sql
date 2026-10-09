-- Rollback-only integration tests: never commit fixture rows or product edits.
begin;
do $test$
declare
  f uuid; actor uuid;
  c uuid; macro uuid; other_f uuid; a uuid:=gen_random_uuid(); other_a uuid:=gen_random_uuid();
  first_v uuid:=gen_random_uuid(); second_v uuid:=gen_random_uuid(); other_v uuid:=gen_random_uuid();
  axis_code text:='test_'||replace(gen_random_uuid()::text,'-',''); n int; caught boolean;
begin
  select user_id into actor from public.user_roles where role='super_admin' limit 1;
  select id into f from public.article_families x where x.attivo and x.deleted_at is null and
    exists(select 1 from public.article_families y where y.company_id=x.company_id
      and y.macrocategoria_id=x.macrocategoria_id and y.id<>x.id and y.attivo and y.deleted_at is null) limit 1;
  if actor is null or f is null then raise exception 'Test richiede un admin e due prodotti attivi nella stessa tipologia'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  select company_id,macrocategoria_id into c,macro from public.article_families where id=f;
  select id into other_f from public.article_families where company_id=c and macrocategoria_id=macro and attivo and deleted_at is null and id<>f limit 1;
  insert into public.article_family_axes(id,family_id,company_id,codice,nome,tipo,obbligatorio,sort_order)
    values(a,f,c,axis_code,'TEST rollback','discrete',true,9999),(other_a,other_f,c,axis_code,'TEST rollback','discrete',true,9999);
  insert into public.article_family_axis_values(id,axis_id,company_id,valore,label,is_default,attivo)
    values(first_v,a,c,'first','Prima',true,true),(second_v,a,c,'second','Seconda',false,true),(other_v,other_a,c,'first','Prima',true,true);
  perform public.listino_salva_opzioni(f,a,second_v,'{"is_default":true}'::jsonb);
  if (select count(*) from public.article_family_axis_values where axis_id=a and is_default)<>1 or
    not (select is_default from public.article_family_axis_values where id=second_v) then raise exception 'FAIL unique default'; end if;
  caught:=false;
  begin perform public.listino_salva_opzioni(f,a,first_v,'{"label":"","is_default":true}'::jsonb);
    exception when others then caught:=true; end;
  if not caught or not (select is_default from public.article_family_axis_values where id=second_v) then raise exception 'FAIL failed save rollback'; end if;
  caught:=false;
  begin perform public.listino_salva_opzioni(f,null,null,'{"attivo":false}'::jsonb,array[first_v,second_v]);
    exception when others then caught:=true; end;
  if not caught or (select count(*) from public.article_family_axis_values where axis_id=a and attivo)<>2 then raise exception 'FAIL bulk rollback'; end if;
  caught:=false;
  begin perform public.listino_salva_opzioni(f,null,null,'{"attivo":false}'::jsonb,array[first_v,other_v]);
    exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'FAIL other product isolation'; end if;
  perform public.listino_salva_opzioni(f,null,null,'{"maggiorazione_tipo":"percentuale","maggiorazione_valore":10}'::jsonb,array[first_v]);
  if (select maggiorazione_acquisto from public.article_family_axis_values where id=first_v)<>0 then raise exception 'FAIL purchase changed'; end if;
  perform public.listino_varianti_linea(macro,jsonb_build_array(jsonb_build_object(
    'chiave',axis_code,'nome','TEST rollback','completa',false,'allinea_base',false,
    'valori',jsonb_build_array(jsonb_build_object('nome','Prima','tipo','percentuale','vendita',15,'acquisto',5,'attivo',true,'aggiorna',true)))),array[f]);
  if (select maggiorazione_valore from public.article_family_axis_values where id=first_v)<>15 or
    (select maggiorazione_valore from public.article_family_axis_values where id=other_v)<>0 then raise exception 'FAIL line scope'; end if;
  perform public.listino_salva_opzioni(f,a,null,'{"valore":"third","label":"Terza","is_default":true,"attivo":true}'::jsonb);
  if (select count(*) from public.article_family_axis_values where axis_id=a and is_default)<>1 then raise exception 'FAIL create default'; end if;
  caught:=false;
  begin perform public.listino_salva_opzioni(f,null,null,'{"maggiorazione_tipo":"fisso_pz","maggiorazione_valore":20}'::jsonb,array[first_v]);
    exception when others then caught:=true; end;
  if not caught or (select maggiorazione_tipo from public.article_family_axis_values where id=first_v)<>'percentuale' then raise exception 'FAIL cost units'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  caught:=false;
  begin perform public.listino_salva_opzioni(f,a,first_v,'{"label":"Unauthorized"}'::jsonb);
    exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'FAIL tenant permission'; end if;
  if has_function_privilege('anon','public.listino_salva_opzioni(uuid,uuid,uuid,jsonb,uuid[])','EXECUTE') then raise exception 'FAIL anonymous grant'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  caught:=false;
  begin perform public.listino_salva_opzioni(f,a,first_v,'{"label":"Unauthenticated"}'::jsonb);
    exception when insufficient_privilege then caught:=true; end;
  if not caught then raise exception 'FAIL anonymous access'; end if;
end;
$test$;
select 'PASS: default atomico, rollback, bulk atomico, isolamento prodotto, costo preservato, ambito linea, blocco anonimo' as result;
rollback;

begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
create temporary table prova_bozza(actor uuid,azienda uuid,ordine uuid,vuota uuid,con_iter uuid);
insert into prova_bozza select sp.user_id,sp.company_id,o.id,gen_random_uuid(),gen_random_uuid() from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
grant select on prova_bozza to authenticated;
do $$ begin if not exists(select 1 from prova_bozza) then raise exception 'Fixture assente';end if;end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from prova_bozza;
insert into public.pos_documents(id,company_id,order_id,tipo_lavori,indirizzo_cantiere,status,revisione,contenuto,iter,document_type)
select vuota,azienda,ordine,'TEST ROLLBACK','Sintetico','bozza',0,'{}'::jsonb,'{}'::jsonb,'pos' from prova_bozza
union all select con_iter,azienda,ordine,'TEST ROLLBACK','Sintetico','bozza',0,'{}'::jsonb,'{}'::jsonb,'pos' from prova_bozza;
-- A previously recorded signature must survive even if the draft now shows an empty iter.
update public.pos_documents set iter='{"firma_datore_il":"2026-10-01"}' where id=(select con_iter from prova_bozza);
update public.pos_documents set iter='{}' where id=(select con_iter from prova_bozza);
do $$ begin
 begin
  delete from public.pos_iter_eventi where pos_id=(select vuota from prova_bozza);
  raise exception 'ASSERT: cancellazione diretta dello storico concessa';
 exception when raise_exception then if sqlerrm like 'ASSERT:%' then raise;end if;if sqlerrm<>'Lo storico POS non si modifica o cancella' then raise;end if;end;
end $$;
set local role authenticated;
do $$ declare f record;n int;begin
 select * into f from prova_bozza;
 delete from public.pos_documents where id=f.vuota;
 get diagnostics n=row_count;if n<>1 then raise exception 'ASSERT: bozza senza iter non eliminabile';end if;
 if exists(select 1 from public.pos_iter_eventi where pos_id=f.vuota) then raise exception 'ASSERT: evento iniziale vuoto orfano';end if;
 begin
  delete from public.pos_documents where id=f.con_iter;
  raise exception 'ASSERT: iter precedente perduto';
 exception when raise_exception then if sqlerrm like 'ASSERT:%' then raise;end if;if sqlerrm not like 'Il POS ha un iter%' then raise;end if;end;
 if (select count(*) from public.pos_iter_eventi where pos_id=f.con_iter)<>3 then raise exception 'ASSERT: storico iter alterato';end if;
end $$;
reset role;
rollback;
select 'PASS: eliminazione bozza senza iter, divieto cancellazione eventi diretti, conservazione iter anche dopo azzeramento; fixture annullata' as risultato;

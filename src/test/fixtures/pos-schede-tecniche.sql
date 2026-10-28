begin;
set local lock_timeout='3s';set local statement_timeout='60s';
create temporary table tecnica_test(actor uuid,company_id uuid,order_id uuid,pos_id uuid,contenuto jsonb);
insert into tecnica_test select sp.user_id,sp.company_id,o.id,gen_random_uuid(),null from public.staff_permissions sp join public.orders o on o.company_id=sp.company_id where sp.can_view_sicurezza_cantiere and not sp.sola_lettura limit 1;
grant select on tecnica_test to authenticated;
do $$begin if not exists(select 1 from tecnica_test) then raise exception 'Azienda di prova assente';end if;end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true) from tecnica_test;
update tecnica_test set contenuto='{"versione_modello": 1, "versione_controlli": 2, "versione_tecnica": 1, "formazione": [], "lavorazioni": [{"id": "l1", "titolo": "TEST SCHEDA TECNICA", "tecnica": {"area": "TEST area", "interferenze": "TEST interferenze", "condizioni_avvio": "TEST condizioni_avvio", "sospensione": "TEST sospensione", "emergenze": "TEST emergenze", "prima": "TEST prima", "durante": "TEST durante", "dopo": "TEST dopo", "riesaminata": true, "attrezzature_previste": "si", "motivo_senza_attrezzature": "", "rischi": [{"id": "r1", "pericolo": "TEST pericolo", "esposti": "TEST esposti", "situazione": "TEST situazione", "valutazione_iniziale": "TEST valutazione_iniziale", "misure_collettive": "TEST misure_collettive", "misure_organizzative": "TEST misure_organizzative", "dpi": "TEST dpi", "valutazione_residua": "TEST valutazione_residua", "riferimento": "TEST riferimento"}], "attrezzature": [{"id": "a1", "nome": "TEST nome", "identificativo": "TEST identificativo", "impiego": "TEST impiego", "controlli_preuso": "TEST controlli_preuso", "manuale_riferimento": "TEST manuale_riferimento", "formazione_addestramento": "TEST formazione_addestramento"}]}}]}'::jsonb;
insert into public.pos_documents(id,company_id,order_id,tipo_lavori,indirizzo_cantiere,status,revisione,contenuto,iter,updated_at) select pos_id,company_id,order_id,'TEST TECNICA ROLLBACK','Indirizzo sintetico','bozza',0,contenuto,'{}',clock_timestamp() from tecnica_test;
set local role authenticated;
do $$declare f record;begin select * into f from tecnica_test;
 begin update public.pos_documents set contenuto=contenuto-'versione_tecnica' where id=f.pos_id;raise exception 'ASSERT: downgrade ammesso';exception when serialization_failure then null;end;
 begin update public.pos_documents set status='approvato' where id=f.pos_id;raise exception 'ASSERT: client approva';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$declare f record;k text;begin select * into f from tecnica_test;
 -- A valid declaration does not make missing fields acceptable at approval.
 foreach k in array array['area','interferenze','condizioni_avvio','sospensione','emergenze','prima','durante','dopo'] loop
  begin update public.pos_documents set contenuto=jsonb_set(f.contenuto,array['lavorazioni','0','tecnica',k],'""'::jsonb),status='approvato' where id=f.pos_id;raise exception 'ASSERT: campo contesto mancante ammesso';exception when raise_exception then if sqlerrm not like 'Dettaglio tecnico: completa %' then raise;end if;end;
 end loop;
 foreach k in array array['id','pericolo','esposti','situazione','valutazione_iniziale','misure_collettive','misure_organizzative','dpi','valutazione_residua','riferimento'] loop
  begin update public.pos_documents set contenuto=jsonb_set(f.contenuto,array['lavorazioni','0','tecnica','rischi','0',k],'""'::jsonb),status='approvato' where id=f.pos_id;raise exception 'ASSERT: campo rischio mancante ammesso';exception when raise_exception then if sqlerrm not like 'Rischio specifico: completa %' then raise;end if;end;
 end loop;
 foreach k in array array['id','nome','identificativo','impiego','controlli_preuso','manuale_riferimento','formazione_addestramento'] loop
  begin update public.pos_documents set contenuto=jsonb_set(f.contenuto,array['lavorazioni','0','tecnica','attrezzature','0',k],'""'::jsonb),status='approvato' where id=f.pos_id;raise exception 'ASSERT: campo attrezzatura mancante ammesso';exception when raise_exception then if sqlerrm not like 'Attrezzatura effettiva: completa %' then raise;end if;end;
 end loop;
 begin update public.pos_documents set contenuto=jsonb_set(f.contenuto,'{lavorazioni,0,tecnica,riesaminata}','false'::jsonb),status='approvato' where id=f.pos_id;raise exception 'ASSERT: riesame non confermato';exception when raise_exception then if sqlerrm<>'Dettaglio tecnico della lavorazione da riesaminare' then raise;end if;end;
 begin update public.pos_documents set contenuto=jsonb_set(f.contenuto,'{lavorazioni,0,tecnica,attrezzature_previste}','"no"'::jsonb),status='approvato' where id=f.pos_id;raise exception 'ASSERT: attrezzature nascoste';exception when raise_exception then if sqlerrm not like 'Motiva l’assenza%' then raise;end if;end;
 update tecnica_test set contenuto=jsonb_set(contenuto,'{lavorazioni}',(contenuto->'lavorazioni')||jsonb_build_array(jsonb_set(contenuto->'lavorazioni'->0,'{id}','"l2"'::jsonb)));
 select * into f from tecnica_test;
 update public.pos_documents set contenuto=f.contenuto,status='approvato',approvato_da=f.actor,approvato_da_nome='TEST TECNICO',approvato_il=clock_timestamp() where id=f.pos_id;
 if not exists(select 1 from public.pos_contenuti_archiviati where pos_id=f.pos_id and snapshot->'contenuto'->'lavorazioni'->0->'tecnica'->'riesaminata'='true'::jsonb) then raise exception 'ASSERT: dettaglio tecnico non conservato nello storico';end if;
end$$;
set local role authenticated;
select public.pos_apri_revisione(p.id,'TEST NUOVA REVISIONE TECNICA',p.updated_at) from public.pos_documents p join tecnica_test f on f.pos_id=p.id;
reset role;
do $$declare f record;begin select * into f from tecnica_test;
 if not exists(select 1 from public.pos_documents where id=f.pos_id and status='bozza' and revisione=1 and contenuto->'versione_tecnica'='1'::jsonb and contenuto->'lavorazioni'->0->'tecnica'->'riesaminata'='false'::jsonb) then raise exception 'ASSERT: riesame ereditato nella nuova revisione';end if;
 if (select contenuto->'lavorazioni'->0->>'id' from public.pos_documents where id=f.pos_id)<>'l1' or (select contenuto->'lavorazioni'->1->>'id' from public.pos_documents where id=f.pos_id)<>'l2' then raise exception 'ASSERT: ordine delle schede alterato';end if;
 if not exists(select 1 from public.pos_contenuti_archiviati where pos_id=f.pos_id and revisione=0 and snapshot->'contenuto'->'lavorazioni'->0->'tecnica'->'riesaminata'='true'::jsonb) then raise exception 'ASSERT: revisione originale mutata';end if;
end$$;
select 'PASS schede tecniche: campi, riesame, client, downgrade, snapshot e nuova revisione' as risultato;
rollback;

-- A justified non-applicability does not require inventing a person or appointment.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.sicurezza_fascicolo_catalogo_guardia()
returns trigger language plpgsql security invoker set search_path=public as $$
declare c public.sicurezza_catalogo_documenti%rowtype;
begin
 if tg_op='UPDATE' and old.stato='verificato' and (new.catalogo_id,new.catalogo_versione,new.incarico_id) is distinct from (old.catalogo_id,old.catalogo_versione,old.incarico_id) then
  raise exception 'Riapri in integrazione il documento verificato prima di cambiarne classificazione o incarico';
 end if;
 if new.incarico_id is not null and not exists(select 1 from public.sicurezza_incarichi i where i.id=new.incarico_id and i.company_id=new.company_id and i.subappaltatore_id is not distinct from new.subappaltatore_id and (i.order_id is null or i.order_id=new.order_id)) then
  raise exception 'Incarico non pertinente al titolare o alla commessa del documento';
 end if;
 if new.catalogo_id is null then return new;end if;
 select * into c from public.sicurezza_catalogo_documenti where id=new.catalogo_id and versione=new.catalogo_versione;
 if not found then raise exception 'Voce del catalogo non disponibile';end if;
 if c.destinazione<>'sicurezza' then raise exception 'Questa voce richiede un archivio riservato o una classificazione da chiarire: non si carica nel fascicolo sicurezza';end if;
 if new.tipo<>c.tipo_fascicolo then raise exception 'Tipo di evidenza non coerente con il catalogo selezionato';end if;
 if c.ambito='commessa' and new.order_id is null then raise exception 'Scegli la commessa per questa voce del catalogo';end if;
 if c.ambito='incarico' and new.stato<>'non_applicabile' and new.incarico_id is null then raise exception 'Collega l’incarico a cui si riferisce il documento';end if;
 if c.ambito='persona_o_incarico' and new.stato<>'non_applicabile' and new.operaio_id is null and new.incarico_id is null then raise exception 'Collega l’operaio o l’incarico titolare del documento';end if;
 if new.origine_requisito<>'da_verificare' and length(trim(coalesce(new.riferimento_requisito,'')))=0 then raise exception 'Specifica il riferimento del requisito confermato';end if;
 return new;
end $$;
revoke all on function public.sicurezza_fascicolo_catalogo_guardia() from public,anon,authenticated;

-- Le consegne e i prezzi confrontati con la fattura aggiornano anche gli
-- articoli preparati PRIMA del DDT. Nessun nuovo costo o arrivo viene creato.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_items drop constraint if exists order_items_prezzo_fonte_check;
alter table public.order_items add constraint order_items_prezzo_fonte_check
 check (prezzo_fonte is null or prezzo_fonte in ('listino','ultimo_acquisto','scomposizione','offerta','ordine','manuale','ddt','fattura')) not valid;
alter table public.order_items validate constraint order_items_prezzo_fonte_check;

create or replace function public.materiali_prezzo_da_documenti(p_articolo uuid)
returns void language plpgsql security definer set search_path=public as $function$
declare
 azienda uuid; medio numeric; ricevuti numeric; senza_prezzo bigint; tutto_fatturato boolean;
begin
 -- Il lock serializza due consegne/fatture sullo stesso articolo. Questa
 -- funzione è privata: si entra solo dai servizi e trigger già autorizzati.
 select o.company_id into azienda from order_items a join orders o on o.id=a.order_id
  where a.id=p_articolo for update of a;
 if azienda is null then return; end if;
 with arrivi as materialized (
  select c.riga_id,c.ddt_id,r.quantita as quantita_bolla,r.prezzo_unitario,
   greatest(0,c.quantita-coalesce((select sum(s.quantita) from ddt_consegne s
    where s.consegna_origine_id=c.id and s.company_id=azienda and s.tipo='reso'),0)) as q
  from ddt_consegne c join ddt_righe r on r.id=c.riga_id and r.company_id=azienda
   join ddt_ricezione d on d.id=c.ddt_id and d.company_id=azienda
  where c.order_item_id=p_articolo and c.company_id=azienda
   and c.tipo='ingresso' and c.destinazione='cantiere'
 ), fatturato as (
  select k.riga_id,sum(k.quantita) as q,
   sum(k.quantita*v.prezzo_unitario)/nullif(sum(k.quantita),0) as prezzo
  from fattura_ddt_consumi(azienda,array(select distinct ddt_id from arrivi),null) k
   join ddt_valorizzazioni v on v.riga_id=k.riga_id and v.fattura_id=k.fattura_id and v.company_id=azienda
   join fatture_ricevute f on f.id=v.fattura_id and f.company_id=azienda
  where coalesce(f.tipo_documento,'TD01')<>'TD04'
  group by k.riga_id
 )
 select sum(a.q),sum(a.q*a.prezzo_unitario)/nullif(sum(a.q),0),
  count(*) filter(where a.prezzo_unitario is null),
  bool_and(coalesce(f.q>=a.quantita_bolla and round(f.prezzo,4)=round(a.prezzo_unitario,4),false))
 into ricevuti,medio,senza_prezzo,tutto_fatturato
 from arrivi a left join fatturato f on f.riga_id=a.riga_id where a.q>0;
 -- Un DDT senza prezzo non trasforma una stima in un costo certo. In caso
 -- di consegne multiple il prezzo è il medio delle quantità accettate nette.
 if ricevuti is null or ricevuti<=0 or senza_prezzo>0 or medio is null then return; end if;
 update order_items a set costo_stimato_iniziale=coalesce(a.costo_stimato_iniziale,a.purchase_price),
  purchase_price=round(medio,4),prezzo_da_definire=false,
  prezzo_fonte=case when tutto_fatturato then 'fattura' else 'ddt' end,
  prezzo_aggiornato_il=now(),updated_at=now()
 where a.id=p_articolo and (a.purchase_price is distinct from round(medio,4)
  or a.prezzo_da_definire is true
  or a.prezzo_fonte is distinct from case when tutto_fatturato then 'fattura' else 'ddt' end);
end $function$;
revoke all on function public.materiali_prezzo_da_documenti(uuid) from public,anon,authenticated;

create or replace function public.materiali_prezzo_documenti_trigger()
returns trigger language plpgsql security definer set search_path=public as $function$
declare articolo uuid;
begin
 if tg_table_name='ddt_consegne' then
  if new.order_item_id is not null then perform materiali_prezzo_da_documenti(new.order_item_id); end if;
 else
  for articolo in select distinct c.order_item_id from ddt_consegne c
   where c.riga_id=new.id and c.company_id=new.company_id and c.order_item_id is not null
   order by c.order_item_id loop
   perform materiali_prezzo_da_documenti(articolo);
  end loop;
 end if;
 return null;
end $function$;
revoke all on function public.materiali_prezzo_documenti_trigger() from public,anon,authenticated;
drop trigger if exists materiali_prezzo_consegna on public.ddt_consegne;
create trigger materiali_prezzo_consegna after insert on public.ddt_consegne
 for each row execute function public.materiali_prezzo_documenti_trigger();
drop trigger if exists materiali_prezzo_bolla on public.ddt_righe;
create trigger materiali_prezzo_bolla after update of prezzo_unitario on public.ddt_righe
 for each row execute function public.materiali_prezzo_documenti_trigger();

-- Un retry dello stesso confronto deve riallineare anche i vecchi articoli
-- collegati, pur senza duplicare le valorizzazioni già registrate.
do $patch$
declare d text; ancora text:=$s$return jsonb_build_object('righe',n,$s$;
begin
 select pg_get_functiondef('public.ddt_valorizza_da_fattura(uuid,uuid,jsonb)'::regprocedure) into d;
 if position('materiali_preparati_documenti_v1' in d)=0 then
  if position(ancora in d)=0 then raise exception 'Revisionare il servizio di confronto prezzi DDT'; end if;
  d:=replace(d,ancora,$s$
 -- materiali_preparati_documenti_v1
 perform public.materiali_prezzo_da_documenti(z.order_item_id)
 from (select distinct c.order_item_id from public.ddt_consegne c
  where c.ddt_id=d.id and c.company_id=d.company_id and c.order_item_id is not null
   and exists(select 1 from jsonb_array_elements(p_righe) richiesta_voce(valore) where (richiesta_voce.valore->>'riga_id')::uuid=c.riga_id)
  order by c.order_item_id) z;
 return jsonb_build_object('righe',n,$s$);
  execute d;
 end if;
 -- I prezzi dei documenti accettati hanno precedenza su una successiva
 -- revisione dell'ODA. Le righe dell'ordine mantengono i propri importi.
 if to_regprocedure('public.materiali_prezzo_da_ordine()') is not null then
  select pg_get_functiondef('public.materiali_prezzo_da_ordine()'::regprocedure) into d;
  if position('materiali_documenti_precedenza_v1' in d)=0 then
   ancora:='where oi.id = new.order_item_id';
   if position(ancora in d)=0 then raise exception 'Revisionare il sincronizzatore prezzi ODA'; end if;
   execute replace(d,ancora,ancora||E'\n     and coalesce(oi.prezzo_fonte,'''') not in (''ddt'',''fattura'') -- materiali_documenti_precedenza_v1');
  end if;
 end if;
end $patch$;
notify pgrst,'reload schema';

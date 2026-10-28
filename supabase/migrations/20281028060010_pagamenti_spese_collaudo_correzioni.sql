set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.storna_pagamenti_costo(p_costo uuid,p_data date default current_date)
returns void language plpgsql security invoker set search_path='' as $$
declare c public.company_costs; movimento record;
begin
 select * into c from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(c.company_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text,2810));
 perform 1 from public.company_costs where id=p_costo for update;
 if p_data is null or p_data>current_date then raise exception 'Data storno non valida'; end if;
 if exists(select 1 from public.prima_nota_entries where cost_id=p_costo and (bank_transaction_id is not null or sal_sub_id is not null))
 or exists(select 1 from public.sal_sub_pagamenti q join public.prima_nota_entries p on p.id=q.prima_nota_id where p.cost_id=p_costo)
 then raise exception 'Pagamento collegato a banca o SAL: riconcilia i collegamenti prima dello storno'; end if;
 if c.is_paid and not exists(select 1 from public.prima_nota_entries where cost_id=p_costo) then raise exception 'Pagamento storico da verificare'; end if;
 for movimento in select * from public.prima_nota_entries x where x.cost_id=p_costo and x.company_id=c.company_id and x.direction='uscita'
 and not exists(select 1 from public.prima_nota_entries r where r.reversal_of=x.id) for update loop
  insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,cost_id,order_id,is_auto,auto_source,created_by,reversal_of)
  values(c.company_id,'entrata','storno','Storno pagamento: '||c.name,movimento.amount,p_data,c.id,c.order_id,true,'storno_pagamento',auth.uid(),movimento.id);
 end loop;
 perform public.spesa_pagamento_sincronizza(c.id);
end $$;

create or replace function public.dettaglio_pagamento_costo(p_costo uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.company_costs; totale numeric; pagato numeric; righe jsonb;
begin
 select * into c from public.company_costs where id=p_costo;
 if c.id is null or auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(c.company_id)
 or not (coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',c.company_id),false) or public.user_can_read_accountant_company(c.company_id))
 then raise exception 'Costo non disponibile' using errcode='42501'; end if;
 select round(coalesce((select sum(case when tipo_documento in ('TD04','TD08') then -abs(totale_documento) else totale_documento end) from public.fatture_ricevute where company_cost_id=c.id and company_id=c.company_id and coalesce(stato,'') not in ('annullata','scartata','rifiutata')),c.amount*(1+coalesce(c.vat_rate,0)/100)),2) into totale;
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'importo',p.amount,'direzione',p.direction,'banca',p.bank_transaction_id,'riferimento',p.reference_number,'storno_di',p.reversal_of) order by p.entry_date,p.created_at),'[]'::jsonb)
 into pagato,righe from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 return jsonb_build_object('id',c.id,'company_id',c.company_id,'nome',c.name,'totale',totale,'pagato',pagato,'residuo',greatest(0,totale-pagato),'da_verificare',(c.is_paid and pagato=0) or pagato>totale or exists(select 1 from public.scadenze where company_id=c.company_id and cost_id=c.id and paid_amount>pagato),'movimenti',righe);
end $$;

create or replace function public.pagamenti_sal_candidati(p_sal uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sal_subappaltatori; documenti jsonb; pagamenti jsonb;
begin
 select * into s from public.sal_subappaltatori where id=p_sal;
 if s.id is null or auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(s.company_id)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',s.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',s.company_id),false)
 then raise exception 'SAL non disponibile' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.company_cost_id,'numero',f.numero_fattura)),'[]'::jsonb) into documenti from public.fatture_ricevute f
 where f.company_id=s.company_id and f.contratto_subappalto_id=s.contratto_id and f.company_cost_id is not null and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata');
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'disponibile',p.amount-coalesce(q.importo,0),'riferimento',p.reference_number)),'[]'::jsonb) into pagamenti
 from public.prima_nota_entries p left join (select prima_nota_id,sum(importo) as importo from public.sal_sub_pagamenti where company_id=s.company_id group by prima_nota_id) q on q.prima_nota_id=p.id
 where p.company_id=s.company_id and p.direction='uscita' and p.amount>coalesce(q.importo,0) and not exists(select 1 from public.prima_nota_entries where reversal_of=p.id)
 and (exists(select 1 from public.fatture_ricevute where company_cost_id=p.cost_id and company_id=s.company_id and contratto_subappalto_id=s.contratto_id)
 or exists(select 1 from public.sal_subappaltatori where id=p.sal_sub_id and company_id=s.company_id and contratto_id=s.contratto_id));
 return jsonb_build_object('documenti',documenti,'pagamenti',pagamenti);
end $$;

create or replace function public.registra_pagamenti_costi(p_ids uuid[],p_data date default current_date,p_storno boolean default false)
returns void language plpgsql security invoker set search_path='' as $$
declare cid uuid;
begin
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)>100 or array_position(p_ids,null) is not null then raise exception 'Seleziona da 1 a 100 costi'; end if;
 if (select count(distinct company_id) from public.company_costs where id=any(p_ids))<>1 then raise exception 'Seleziona costi della stessa azienda'; end if;
 for cid in select distinct unnest(p_ids) order by 1 loop
  if p_storno then perform public.storna_pagamenti_costo(cid,p_data);
  else perform public.registra_pagamento_costo(cid,gen_random_uuid(),null,p_data); end if;
 end loop;
end $$;
revoke all on function public.dettaglio_pagamento_costo(uuid),public.pagamenti_sal_candidati(uuid),public.registra_pagamenti_costi(uuid[],date,boolean) from public,anon;
grant execute on function public.dettaglio_pagamento_costo(uuid),public.pagamenti_sal_candidati(uuid),public.registra_pagamenti_costi(uuid[],date,boolean) to authenticated;


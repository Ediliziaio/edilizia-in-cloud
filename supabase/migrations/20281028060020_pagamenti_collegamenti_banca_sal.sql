set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.pagamento_costo_banca_candidati(p_costo uuid,p_pagamento uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.company_costs; p public.prima_nota_entries; risultato jsonb;
begin
 select * into c from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(c.company_id);
 if not coalesce(public.has_permission_for_company(auth.uid(),'can_view_tesoreria',c.company_id),false)
 and not coalesce(public.has_permission_for_company(auth.uid(),'can_manage_payments',c.company_id),false) then raise exception 'Accesso banca non autorizzato' using errcode='42501'; end if;
 select * into p from public.prima_nota_entries where id=p_pagamento and company_id=c.company_id and cost_id=c.id and direction='uscita';
 if p.id is null or p.bank_transaction_id is not null or exists(select 1 from public.prima_nota_entries where reversal_of=p.id) then raise exception 'Pagamento non disponibile per abbinamento'; end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into risultato from (
 select t.id,t.booking_date as data,t.description as descrizione,abs(t.amount) as importo
 from public.bank_transactions t where t.company_id=c.company_id and t.transaction_type='debit' and coalesce(t.currency,'EUR')='EUR' and abs(t.amount)=p.amount
 and t.reconciliation_status is distinct from 'reconciled' and t.linked_cost_id is null and t.linked_invoice_id is null and t.linked_scadenza_id is null and t.linked_installment_id is null
 and not exists(select 1 from public.prima_nota_entries n where n.bank_transaction_id=t.id)
 and not exists(select 1 from public.bank_reconciliations b where b.transaction_id=t.id and b.unmatched_at is null)
 order by t.booking_date desc,t.id limit 100) x;
 return risultato;
end $$;

-- Una fattura arrivata dopo un SAL può utilizzare il pagamento già registrato.
create or replace function public.collega_pagamento_sal_fattura(p_pagamento uuid,p_costo uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare c public.company_costs; p public.prima_nota_entries;
begin
 select * into c from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(c.company_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text,2810));
 select * into c from public.company_costs where id=p_costo for update;
 select * into p from public.prima_nota_entries where id=p_pagamento and company_id=c.company_id and direction='uscita' for update;
 if p.id is null or p.sal_sub_id is null or (p.cost_id is not null and p.cost_id<>c.id) or exists(select 1 from public.prima_nota_entries where reversal_of=p.id)
 or not exists(select 1 from public.sal_subappaltatori s join public.fatture_ricevute f on f.contratto_subappalto_id=s.contratto_id and f.company_id=s.company_id where s.id=p.sal_sub_id and s.company_id=c.company_id and f.company_cost_id=c.id)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',c.company_id),false)
 then raise exception 'Pagamento SAL non attribuibile a questa fattura' using errcode='42501'; end if;
 if p.cost_id=c.id then return; end if;
 update public.prima_nota_entries set cost_id=c.id where id=p.id;
 perform public.spesa_pagamento_sincronizza(c.id);
end $$;

create or replace function public.pagamento_costo_sal_da_collegare(p_costo uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.company_costs; risultato jsonb;
begin
 select * into c from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(c.company_id);
 if not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',c.company_id),false) then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'data',p.entry_date,'importo',p.amount,'numero_sal',s.numero_sal)),'[]'::jsonb) into risultato
 from public.prima_nota_entries p join public.sal_subappaltatori s on s.id=p.sal_sub_id and s.company_id=p.company_id
 where p.company_id=c.company_id and p.cost_id is null and p.direction='uscita' and not exists(select 1 from public.prima_nota_entries where reversal_of=p.id)
 and exists(select 1 from public.fatture_ricevute f where f.company_id=c.company_id and f.company_cost_id=c.id and f.contratto_subappalto_id=s.contratto_id);
 return risultato;
end $$;
revoke all on function public.pagamento_costo_banca_candidati(uuid,uuid),public.collega_pagamento_sal_fattura(uuid,uuid),public.pagamento_costo_sal_da_collegare(uuid) from public,anon;
grant execute on function public.pagamento_costo_banca_candidati(uuid,uuid),public.collega_pagamento_sal_fattura(uuid,uuid),public.pagamento_costo_sal_da_collegare(uuid) to authenticated;

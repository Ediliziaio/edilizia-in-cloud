-- Debiti verso fornitori: un costo con il pagamento abbinato in banca o in prima nota è pagato (15/11/2026)
--
-- Dal 20290401110000 i costi registrati e non pagati sono debiti verso
-- fornitori, secondo il flag is_paid del costo. Ma un costo può avere il
-- bonifico abbinato in Tesoreria (bank_transactions.linked_cost_id) o la
-- prima nota del pagamento, con il flag rimasto «non pagato» (Demo: 3 costi,
-- 162.000 €). Adesso un costo con un pagamento abbinato conta come pagato
-- dalla data di quel pagamento.

create or replace function private.cg_debiti_fornitori_al(p_company uuid, p_rif date)
returns numeric language sql stable security definer set search_path to '' as $$
  with costi as (
    select cc.id, cc.amount, cc.is_paid, cc.paid_date, f.n_fatture, f.rapporto,
           -- Pagato anche se il flag non è aggiornato: un movimento di banca o una
           -- prima nota in uscita abbinati al costo, alla loro data.
           least((select min(coalesce(bt.value_date, bt.booking_date)) from public.bank_transactions bt
                   where bt.linked_cost_id = cc.id and bt.company_id = p_company),
                 (select min(pn.entry_date) from public.prima_nota_entries pn
                   where pn.cost_id = cc.id and pn.company_id = p_company and pn.direction in ('uscita', 'out'))) as pagato_il,
           coalesce(cc.mese_competenza, cc.documento_data, f.data_fattura, cc.due_date, cc.paid_date) as data
      from public.company_costs cc
      left join lateral (
        select count(*) as n_fatture, min(fr.data_fattura) as data_fattura,
               sum(coalesce(fr.netto_a_pagare, fr.totale_documento, 0)) / nullif(sum(coalesce(fr.imponibile_totale, 0)), 0) as rapporto
          from public.fatture_ricevute fr
         where fr.company_cost_id = cc.id
      ) f on true
     where cc.company_id = p_company and cc.amount is not null
       and (f.n_fatture > 0 or cc.supplier_id is not null)
  )
  select
    coalesce((
      select sum(c.amount * coalesce(c.rapporto, 1))
        from costi c
       where c.data <= p_rif
         and (not coalesce(c.is_paid, false) or c.paid_date > p_rif)
         and (c.pagato_il is null or c.pagato_il > p_rif)), 0)
    +
    coalesce((
      select sum(greatest(coalesce(s.amount, 0) - case
               when s.paid_date is not null and s.paid_date > p_rif then 0
               when s.status = 'pagata' then coalesce(s.amount, 0)
               else coalesce(s.paid_amount, 0) end, 0))
        from public.scadenze s
       where s.company_id = p_company
         and s.direction = 'uscita'
         and coalesce(s.is_previsionale, false) = false
         and s.status not in ('annullata', 'cancelled')
         -- Rimborsi di note di credito ai clienti: stanno nei crediti.
         and s.invoice_id is null
         -- Scadenze di un costo già contato qui sopra.
         and (s.cost_id is null or not exists (select 1 from costi c where c.id = s.cost_id))
         -- Alla data il debito c'era già.
         and (s.due_date <= p_rif or s.created_at::date <= p_rif)
         and (s.tipo = 'pagamento_fornitore' or (s.tipo = 'costo_aziendale' and s.due_date <= p_rif))), 0)
$$;
revoke all on function private.cg_debiti_fornitori_al(uuid, date) from public, anon, authenticated;

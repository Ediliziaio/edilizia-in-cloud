-- Stato patrimoniale: debiti verso fornitori anche dai costi registrati e non pagati (15/11/2026)
--
-- I debiti verso fornitori venivano solo dallo scadenzario. Ma una fattura
-- ricevuta e registrata («Contabilizza») diventa un costo con il suo stato di
-- pagamento (company_costs.is_paid, paid_date) e quasi mai una scadenza: finché
-- non è pagata è un debito (art. 2424 c.c., D.7; OIC 19), e nello Stato
-- patrimoniale non c'era. Costi registrati da fattura e non pagati, oggi:
-- Impresa Vulcano 844.536 €, URBAN VISION 792.114 €, Demo 2 749.633 €.
--
-- Adesso private.cg_debiti_fornitori_al somma:
--  - i costi registrati da una fattura ricevuta o con un fornitore, nati entro
--    la data e non pagati alla data (non pagati oggi, o pagati dopo la data),
--    IVA compresa: importo del costo per il rapporto totale/imponibile delle
--    sue fatture (una fattura stornata da nota di credito resta a zero; senza
--    fattura l'importo del costo);
--  - le scadenze in uscita come prima, tranne quelle legate a uno di questi
--    costi, che altrimenti conterebbero due volte.
-- Restano fuori i costi senza fattura e senza fornitore (F24, IMU, TFR,
-- utenze inserite a mano): non sono debiti verso fornitori.
-- Lo usano lo Stato patrimoniale e quindi DPO, rating e piano.

create or replace function private.cg_debiti_fornitori_al(p_company uuid, p_rif date)
returns numeric language sql stable security definer set search_path to '' as $$
  with costi as (
    select cc.id, cc.amount, cc.is_paid, cc.paid_date, f.n_fatture, f.rapporto,
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
         and (not coalesce(c.is_paid, false) or c.paid_date > p_rif)), 0)
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

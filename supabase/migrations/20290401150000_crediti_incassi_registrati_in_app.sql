-- Crediti verso clienti: un incasso registrato nell'app conta anche se non è arrivato al gestionale (15/11/2026)
--
-- Per le fatture importate da Fatture in Cloud l'incassato lo decide il
-- gestionale: l'incasso registrato nell'app viene inviato là
-- (billing-payment-push) e torna con la sincronizzazione. Se l'invio fallisce
-- l'incasso resta registrato nell'app ma la fattura resta «da incassare». Ad
-- oggi nessun invio è mai riuscito (Dimora Torino 7, Innovasol 1, Demo 1:
-- «manca il conto di saldo predefinito del metodo Bonifico» su Fatture in
-- Cloud). Innovasol, fattura 254: 61.000 € incassati il 07/11 e ancora tra i
-- crediti.
--
-- private.cg_crediti_clienti_al prendeva il più basso tra incassato della
-- fattura e incassi registrati: adesso il più alto. I soldi sono arrivati, e
-- lo Stato patrimoniale non deve aspettare il gestionale esterno.

create or replace function private.cg_crediti_clienti_al(p_company uuid, p_rif date)
returns numeric language sql stable security definer set search_path to '' as $$
  with emesse as (
    select f.*,
           i.payment_date as data_incasso_fattura,
           coalesce(i.total, 0) as totale_fattura,
           coalesce(i.paid_amount, 0) as incassato_fattura,
           d.pagato_at::date as data_incasso_documento,
           coalesce(d.totale_da_pagare, d.totale_documento, 0) as totale_documento
      from public.v_cg_fatture_emesse f
      left join public.invoices i on f.origine = 'invoices' and i.id = f.id
      left join public.documenti_fiscali d on f.origine = 'documenti_fiscali' and d.id = f.id
     where f.company_id = p_company and f.data <= p_rif
  ), righe as (
    select p.invoice_id,
           sum(p.amount) as tutte,
           sum(p.amount) filter (where p.payment_date <= p_rif) as entro
      from public.invoice_payments p
     where p.company_id = p_company
     group by p.invoice_id
  ), rimborsi as (
    -- Note di credito con scadenze di rimborso: quanto resta da rimborsare alla data.
    -- Una nota con le sole scadenze annullate resta col suo residuo, come prima.
    select s.invoice_id,
           sum(greatest(coalesce(s.amount, 0) - case
                 when s.paid_date is not null and s.paid_date > p_rif then 0
                 when s.status = 'pagata' then coalesce(s.amount, 0)
                 else coalesce(s.paid_amount, 0) end, 0)) as da_rimborsare
      from public.scadenze s
     where s.company_id = p_company and s.direction = 'uscita' and s.invoice_id is not null
       and s.status not in ('annullata', 'cancelled')
     group by s.invoice_id
  )
  select coalesce(sum(
    case
      when e.origine = 'invoices' and e.document_type = 'credit_note' and rb.invoice_id is not null
        then -rb.da_rimborsare
      when e.origine = 'invoices' then e.segno * greatest(e.totale_fattura - case
          -- Il più alto tra gli incassi registrati nell'app fino alla data e l'incassato
          -- della fattura (meno gli incassi registrati dopo la data).
          when r.invoice_id is not null then greatest(coalesce(r.entro, 0),
            case when e.data_incasso_fattura is null or e.data_incasso_fattura <= p_rif
                 then greatest(e.incassato_fattura - (r.tutte - coalesce(r.entro, 0)), 0) else 0 end)
          when e.data_incasso_fattura is null or e.data_incasso_fattura <= p_rif then e.incassato_fattura
          else 0 end, 0)
      when e.origine = 'documenti_fiscali' and e.data_incasso_documento > p_rif
        then e.segno * e.totale_documento
      else e.segno * e.residuo
    end), 0)
    from emesse e
    left join righe r on r.invoice_id = e.id
    left join rimborsi rb on rb.invoice_id = e.id
$$;
revoke all on function private.cg_crediti_clienti_al(uuid, date) from public, anon, authenticated;

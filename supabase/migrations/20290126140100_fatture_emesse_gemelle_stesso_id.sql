-- La stessa fattura si riconosce anche dall'id (9 novembre 2026).
--
-- I dati dimostrativi hanno la fattura in entrambe le tabelle con lo stesso id,
-- ma un prefisso aggiunto al numero solo in `documenti_fiscali`: il confronto su
-- numero e data, da solo, le contava due volte.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.v_cg_fatture_emesse as
select i.id,
       i.company_id,
       'invoices'::text as origine,
       i.invoice_number as numero,
       i.issue_date as data,
       case when i.document_type = 'credit_note' then -1 else 1 end as segno,
       coalesce(i.total, 0::numeric) - coalesce(i.tax_amount, 0::numeric) as imponibile,
       coalesce(i.tax_amount, 0::numeric) as iva,
       greatest(coalesce(i.total, 0::numeric) - coalesce(i.paid_amount, 0::numeric), 0::numeric) as residuo,
       i.client_id as cliente_id,
       i.client_company_name as controparte,
       i.order_id,
       i.document_type
  from invoices i
 where (i.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
   and i.issue_date is not null
   and i.deleted_at is null
union all
select d.id,
       d.company_id,
       'documenti_fiscali'::text as origine,
       d.numero,
       d.data_emissione as data,
       case when d.tipo = 'nota_credito' then -1 else 1 end as segno,
       coalesce(d.imponibile_totale, 0::numeric) as imponibile,
       coalesce(d.iva_totale, 0::numeric) as iva,
       case when d.stato = 'pagata' then 0::numeric
            else greatest(coalesce(d.totale_da_pagare, d.totale_documento, 0::numeric)
                          - coalesce(d.importo_pagato, 0::numeric), 0::numeric)
       end as residuo,
       -- `invoices.client_id` punta ai contatti, `anagrafica_id` a un'altra
       -- tabella: metterli nella stessa colonna farebbe confondere gli id.
       null::uuid as cliente_id,
       d.cliente_snapshot ->> 'ragione_sociale' as controparte,
       d.ordine_id as order_id,
       case when d.tipo = 'nota_credito' then 'credit_note'::text else 'invoice'::text end as document_type
  from documenti_fiscali d
 where d.deleted_at is null
   and d.data_emissione is not null
   and d.stato <> all (array['bozza'::text, 'annullata'::text, 'rifiutata'::text])
   and d.tipo = any (array['fattura'::text, 'fattura_pa'::text, 'fattura_riepilogativa'::text,
                           'nota_credito'::text, 'nota_debito'::text])
   and not exists (
     select 1
       from invoices g
      where g.company_id = d.company_id
        and g.deleted_at is null
        and (g.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
        and (
          g.id = d.id
          or (g.invoice_number = d.numero
              and g.issue_date = d.data_emissione
              and (g.document_type = 'credit_note') = (d.tipo = 'nota_credito'))
        )
   );

alter view public.v_cg_fatture_emesse set (security_invoker = on);

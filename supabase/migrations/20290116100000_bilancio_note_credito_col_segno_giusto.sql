-- Le note di credito abbassano i ricavi e i crediti (9 novembre 2026).
--
-- In `invoices` una nota di credito è salvata con `total` POSITIVO e si
-- riconosce solo dal `document_type`. La vista dei ricavi e il calcolo dei
-- crediti verso clienti non lo guardavano: una nota di credito si SOMMAVA
-- invece di sottrarsi. Sui dati veri i ricavi risultavano gonfiati di una
-- percentuale a una cifra per quasi tutte le aziende, e i crediti verso
-- clienti anche di più: una nota di credito non si incassa mai, quindi
-- restava lì per sempre come se fosse una fattura aperta.
--
-- Qui si cambia solo il segno, e si escludono le fatture cancellate con
-- `deleted_at`. Tutto il resto — che cosa entra nei ricavi, con quale data —
-- resta com'era: quei difetti si guardano a parte.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.v_cg_ricavi_classificati as
with ricavi_invoices as (
  select i.company_id,
         i.issue_date as data,
         -- Il segno lo dà il tipo di documento, non l'importo salvato.
         case when i.document_type = 'credit_note' then -1 else 1 end
           * (coalesce(i.total, 0::numeric) - coalesce(i.tax_amount, 0::numeric))
           as importo_imponibile,
         case when i.document_type = 'credit_note' then -1 else 1 end
           * coalesce(i.tax_amount, 0::numeric) as iva_amount,
         i.document_type as invoice_type,
         extract(year from i.issue_date)::integer as anno,
         extract(month from i.issue_date)::integer as mese,
         i.client_id as cliente_id,
         i.order_id,
         'invoice'::text as source
    from invoices i
   where (i.status <> all (array['cancelled'::text, 'draft'::text, 'annullata'::text, 'bozza'::text]))
     and i.issue_date is not null
     -- Una fattura cancellata non è un ricavo nemmeno se lo stato è rimasto indietro.
     and i.deleted_at is null
), companies_with_invoices as (
  select distinct ricavi_invoices.company_id, ricavi_invoices.anno
    from ricavi_invoices
), ricavi_orders as (
  select o.company_id,
         o.created_at::date as data,
         coalesce(o.total_amount, 0::numeric) as importo_imponibile,
         coalesce(o.total_amount, 0::numeric) * (coalesce(o.vat_rate, 22::numeric) / 100.0) as iva_amount,
         'order'::text as invoice_type,
         extract(year from o.created_at)::integer as anno,
         extract(month from o.created_at)::integer as mese,
         o.customer_id as cliente_id,
         o.id as order_id,
         'order'::text as source
    from orders o
   where o.created_at is not null
     and coalesce(o.total_amount, 0::numeric) > 0::numeric
     and not exists (
       select 1 from companies_with_invoices c
        where c.company_id = o.company_id
          and c.anno = extract(year from o.created_at)::integer
     )
)
select company_id, data, importo_imponibile, iva_amount, invoice_type, anno, mese, cliente_id, order_id, source
  from ricavi_invoices
union all
select company_id, data, importo_imponibile, iva_amount, invoice_type, anno, mese, cliente_id, order_id, source
  from ricavi_orders;

comment on view public.v_cg_ricavi_classificati is
  'Ricavi del Controllo di Gestione. Le note di credito entrano col segno meno (09/11/2026). Il ramo sugli ordini resta un ripiego per le aziende senza fatture nell''anno.';

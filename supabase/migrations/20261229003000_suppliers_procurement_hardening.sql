-- Supplier procurement hardening
-- Keeps supplier lookups, merge operations, audit reads and reporting fast on larger tenants.

create index if not exists idx_suppliers_company_lower_name
  on public.suppliers (company_id, lower(name));

create index if not exists idx_suppliers_company_vat_number
  on public.suppliers (company_id, vat_number)
  where vat_number is not null and vat_number <> '';

create index if not exists idx_suppliers_company_status_category
  on public.suppliers (company_id, is_active, product_category);

create index if not exists idx_company_activity_log_supplier_audit
  on public.company_activity_log (company_id, target_type, created_at desc)
  where target_type = 'supplier';

create index if not exists idx_article_templates_company_supplier
  on public.article_templates (company_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_company_costs_company_supplier
  on public.company_costs (company_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_order_items_supplier
  on public.order_items (supplier_id)
  where supplier_id is not null;

create index if not exists idx_purchase_orders_company_supplier
  on public.purchase_orders (company_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_scadenze_company_supplier
  on public.scadenze (company_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_prima_nota_company_supplier
  on public.prima_nota_entries (company_id, supplier_id)
  where supplier_id is not null;

create index if not exists idx_warehouse_stock_company_supplier
  on public.warehouse_stock (company_id, supplier_id)
  where supplier_id is not null;

create or replace view public.supplier_procurement_report
with (security_invoker = true) as
select
  s.company_id,
  s.id as supplier_id,
  s.name,
  s.product_category,
  s.is_active,
  s.is_foreign,
  count(distinct po.id) filter (where po.status is distinct from 'annullato') as purchase_order_count,
  coalesce(sum(po.total) filter (where po.status is distinct from 'annullato'), 0) as purchase_order_total,
  count(distinct sc.id) filter (where sc.status in ('da_pagare', 'parziale')) as open_due_count,
  coalesce(
    sum(coalesce(sc.amount, 0) - coalesce(sc.paid_amount, 0))
      filter (where sc.status in ('da_pagare', 'parziale')),
    0
  ) as open_due_amount,
  max(po.issue_date) as last_purchase_order_date
from public.suppliers s
left join public.purchase_orders po
  on po.company_id = s.company_id
  and po.supplier_id = s.id
left join public.scadenze sc
  on sc.company_id = s.company_id
  and sc.supplier_id = s.id
  and sc.tipo = 'pagamento_fornitore'
group by s.company_id, s.id, s.name, s.product_category, s.is_active, s.is_foreign;

comment on view public.supplier_procurement_report is
  'Tenant-scoped supplier procurement summary for dashboards, purchase history and reporting.';

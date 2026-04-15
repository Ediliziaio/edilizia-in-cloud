-- ════════════════════════════════════════════════════════════════
-- FIX: allinea i metric keys dei dashboard_templates al metric_catalog
--
-- BUG: i 4 template seed (executive-v1, sales-v1, worksites-v1, finance-v1)
-- referenziano metriche che NON esistono nel metric_catalog:
--   - `revenue`            → corretto: `revenue_total`
--   - `gross_margin`       → corretto: `margin_total`
--   - `overdue_amount`     → corretto: `overdue_receivables`
--   - `cashflow`           → corretto: `cashflow_forecast_30d`
--   - `active_sites`, `active_opportunities`, `opportunities_won`,
--     `pipeline_value`, `conversion_rate`, `opportunities_count`,
--     `deadlines_this_week`, `sites_delivered`, `avg_sal_percent`
--     → NON esistono affatto nel catalog → sostituite con metriche equivalenti
--       dal catalog (orders_*, customers_*, margin_total, ...).
--
-- Anche le breakdown dimension sono state allineate agli allowed_dimensions:
--   - `site`, `opportunity_stage` → non ammesse → rimosse/sostituite
--
-- Impatto pre-fix: clonando QUALSIASI template veniva lanciata
--   `Widget X references unknown or inactive metric Y`
--   da _dashboard_validate_layout dentro save_dashboard → builder inservibile.
-- ════════════════════════════════════════════════════════════════

-- Executive (company_admin) ─────────────────────────────────────────
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'executive-v1',
  'Panoramica Executive',
  'KPI strategici: fatturato, margine, crediti scaduti e ordini.',
  ARRAY['company_admin','super_admin']::public.app_role[],
  'executive',
  'layout-dashboard',
  10,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','ytd'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_revenue','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Fatturato YTD','metric','revenue_total','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_margin','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Margine','metric','margin_total','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_overdue','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Crediti scaduti','metric','overdue_receivables','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_orders','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Ordini (periodo)','metric','orders_count','aggregation','count')),
      jsonb_build_object('id','revenue_trend','type','chart_line','x',0,'y',2,'w',8,'h',4,
        'config', jsonb_build_object('title','Fatturato per mese','metric','revenue_total','aggregation','sum','breakdown','month')),
      jsonb_build_object('id','orders_pie','type','chart_pie','x',8,'y',2,'w',4,'h',4,
        'config', jsonb_build_object('title','Ordini per stato','metric','orders_count','aggregation','count','breakdown','order_status'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- Vendite (salesperson) ─────────────────────────────────────────────
-- NOTA: il catalog non ha ancora metriche opportunità/pipeline → uso
-- metriche ordini + top clienti come proxy sensato per le vendite.
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'sales-v1',
  'Dashboard Vendite',
  'Performance commerciale: ordini, valore medio e top clienti.',
  ARRAY['salesperson','call_center']::public.app_role[],
  'sales',
  'trending-up',
  20,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_orders_month','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Ordini mese','metric','orders_count','aggregation','count')),
      jsonb_build_object('id','kpi_orders_open','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Ordini aperti','metric','orders_open','aggregation','count')),
      jsonb_build_object('id','kpi_avg_value','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Valore medio ordine','metric','order_avg_value','aggregation','avg','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_new_customers','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Nuovi clienti','metric','customers_new','aggregation','count')),
      jsonb_build_object('id','status_bar','type','chart_bar','x',0,'y',2,'w',6,'h',4,
        'config', jsonb_build_object('title','Ordini per stato','metric','orders_by_status','aggregation','count','breakdown','order_status')),
      jsonb_build_object('id','top_customers_table','type','table','x',6,'y',2,'w',6,'h',4,
        'config', jsonb_build_object('title','Top clienti','metric','customers_top','aggregation','sum','breakdown','customer'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- Cantieri (employee / company_staff) ───────────────────────────────
-- NOTA: il catalog non ha ancora metriche cantiere/SAL dedicate →
-- uso metriche ordini (ogni ordine = un cantiere nel dominio dell'app).
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'worksites-v1',
  'Dashboard Cantieri',
  'Stato ordini/cantieri: aperti, durata media e consegne.',
  ARRAY['employee','company_staff']::public.app_role[],
  'operations',
  'hard-hat',
  30,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_open','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Cantieri aperti','metric','orders_open','aggregation','count')),
      jsonb_build_object('id','kpi_month','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Nuovi nel mese','metric','orders_count','aggregation','count')),
      jsonb_build_object('id','kpi_avg_duration','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Durata media (gg)','metric','order_avg_duration','aggregation','avg')),
      jsonb_build_object('id','kpi_avg_value','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Valore medio','metric','order_avg_value','aggregation','avg','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','orders_status_bar','type','chart_bar','x',0,'y',2,'w',12,'h',4,
        'config', jsonb_build_object('title','Distribuzione per stato','metric','orders_by_status','aggregation','count','breakdown','order_status'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- Finanza (company_admin / company_staff) ───────────────────────────
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'finance-v1',
  'Dashboard Finanza',
  'Cash flow, scaduto, fatturato reale e margine.',
  ARRAY['company_admin','company_staff']::public.app_role[],
  'finance',
  'wallet',
  40,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','ytd'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_rev','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Fatturato','metric','revenue_total','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_margin','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Margine','metric','margin_total','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_overdue','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Crediti scaduti','metric','overdue_receivables','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_cashflow','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Cash flow 30gg','metric','cashflow_forecast_30d','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','rev_area','type','chart_area','x',0,'y',2,'w',8,'h',4,
        'config', jsonb_build_object('title','Fatturato mensile','metric','revenue_total','aggregation','sum','breakdown','month')),
      jsonb_build_object('id','overdue_bar','type','chart_bar','x',8,'y',2,'w',4,'h',4,
        'config', jsonb_build_object('title','Scaduto per cliente','metric','overdue_receivables','aggregation','sum','breakdown','customer'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

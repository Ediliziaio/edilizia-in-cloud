-- ════════════════════════════════════════════════════════════════
-- Seed dashboard templates — Sprint 5.4
-- 4 template iniziali: Executive, Vendite, Cantieri, Finanza.
-- I layout usano metriche dal metric_catalog (assunte esistenti).
-- ════════════════════════════════════════════════════════════════

-- Executive (company_admin)
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'executive-v1',
  'Panoramica Executive',
  'KPI strategici: fatturato, margine, cantieri attivi e scadenzario.',
  ARRAY['company_admin','super_admin']::public.app_role[],
  'executive',
  'layout-dashboard',
  10,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','ytd'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_revenue','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Fatturato YTD','metric','revenue','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_margin','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Margine','metric','gross_margin','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_overdue','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Scaduto','metric','overdue_amount','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_sites','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Cantieri attivi','metric','active_sites','aggregation','count')),
      jsonb_build_object('id','revenue_trend','type','chart_line','x',0,'y',2,'w',8,'h',4,
        'config', jsonb_build_object('title','Fatturato per mese','metric','revenue','aggregation','sum','breakdown','month')),
      jsonb_build_object('id','order_pie','type','chart_pie','x',8,'y',2,'w',4,'h',4,
        'config', jsonb_build_object('title','Ordini per stato','metric','orders_count','aggregation','count','breakdown','order_status'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- Vendite (salesperson)
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'sales-v1',
  'Dashboard Vendite',
  'Performance commerciale: opportunità, conversioni e pipeline.',
  ARRAY['salesperson','call_center']::public.app_role[],
  'sales',
  'trending-up',
  20,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_opp','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Opportunità attive','metric','active_opportunities','aggregation','count')),
      jsonb_build_object('id','kpi_won','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Vinte (mese)','metric','opportunities_won','aggregation','count')),
      jsonb_build_object('id','kpi_pipeline','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Pipeline','metric','pipeline_value','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_conv','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Conversion %','metric','conversion_rate','aggregation','avg','format', jsonb_build_object('decimals',1))),
      jsonb_build_object('id','funnel','type','chart_bar','x',0,'y',2,'w',6,'h',4,
        'config', jsonb_build_object('title','Funnel opportunità','metric','opportunities_count','aggregation','count','breakdown','opportunity_stage')),
      jsonb_build_object('id','top_table','type','table','x',6,'y',2,'w',6,'h',4,
        'config', jsonb_build_object('title','Top clienti','metric','revenue','aggregation','sum','breakdown','customer'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- Cantieri (employee / company_staff)
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'worksites-v1',
  'Dashboard Cantieri',
  'Stato cantieri, scadenze, consegne e SAL.',
  ARRAY['employee','company_staff']::public.app_role[],
  'operations',
  'hard-hat',
  30,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_active','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Cantieri attivi','metric','active_sites','aggregation','count')),
      jsonb_build_object('id','kpi_due','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Scadenze settimana','metric','deadlines_this_week','aggregation','count')),
      jsonb_build_object('id','kpi_delivered','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Consegnati (mese)','metric','sites_delivered','aggregation','count')),
      jsonb_build_object('id','progress_sal','type','progress','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','SAL medio','metric','avg_sal_percent','aggregation','avg','target',100)),
      jsonb_build_object('id','sites_table','type','table','x',0,'y',2,'w',12,'h',4,
        'config', jsonb_build_object('title','Cantieri attivi','metric','active_sites','aggregation','count','breakdown','site'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- Finanza (company_admin / company_staff)
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'finance-v1',
  'Dashboard Finanza',
  'Cash flow, scadenze, fatturato e margine.',
  ARRAY['company_admin','company_staff']::public.app_role[],
  'finance',
  'wallet',
  40,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','ytd'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_rev','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Fatturato','metric','revenue','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_margin','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Margine','metric','gross_margin','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_overdue','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Scaduto','metric','overdue_amount','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','kpi_cashflow','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Cash flow','metric','cashflow','aggregation','sum','format', jsonb_build_object('currency','EUR'))),
      jsonb_build_object('id','rev_area','type','chart_area','x',0,'y',2,'w',8,'h',4,
        'config', jsonb_build_object('title','Fatturato mensile','metric','revenue','aggregation','sum','breakdown','month')),
      jsonb_build_object('id','overdue_bar','type','chart_bar','x',8,'y',2,'w',4,'h',4,
        'config', jsonb_build_object('title','Scaduto per cliente','metric','overdue_amount','aggregation','sum','breakdown','customer'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

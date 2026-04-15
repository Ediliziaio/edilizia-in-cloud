-- ════════════════════════════════════════════════════════════════
-- Dashboard Builder — Sprint 5.6 — nuovi template per aree extra
--
-- Aggiunge 3 template che sfruttano le metriche introdotte da
-- 20260916000037_dashboard_builder_extended_metrics.sql:
--   • marketing-v1   → Marketing & Pipeline
--   • tesoreria-v1   → Tesoreria & Banking
--   • calendar-v1    → Calendario & Appuntamenti
--
-- Pensati per ridurre l'onboarding: l'utente clona il template
-- per il proprio ruolo e ottiene subito una dashboard funzionante.
-- ════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- Marketing & Pipeline (salesperson + company_admin)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'marketing-v1',
  'Dashboard Marketing & Pipeline',
  'Lead, opportunità aperte, pipeline value e vinte nel periodo.',
  ARRAY['salesperson','call_center','company_admin']::public.app_role[],
  'marketing',
  'megaphone',
  50,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_leads','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Nuovi lead','metric','leads_new','aggregation','count','compareTo','prev_period')),
      jsonb_build_object('id','kpi_opps_open','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Opportunità aperte','metric','opportunities_open','aggregation','count')),
      jsonb_build_object('id','kpi_pipeline','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Pipeline value','metric','pipeline_value','aggregation','sum','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','kpi_won','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Vinte nel periodo','metric','opportunities_won','aggregation','count','compareTo','prev_period')),
      jsonb_build_object('id','divider_funnel','type','divider','x',0,'y',2,'w',12,'h',1,
        'config', jsonb_build_object('title','PIPELINE','subtitle','Distribuzione e andamento')),
      jsonb_build_object('id','funnel_bar','type','chart_bar','x',0,'y',3,'w',6,'h',4,
        'config', jsonb_build_object('title','Pipeline per stage','metric','pipeline_value','aggregation','sum','breakdown','bucket','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','leads_trend','type','chart_area','x',6,'y',3,'w',6,'h',4,
        'config', jsonb_build_object('title','Lead per mese','metric','leads_new','aggregation','count','breakdown','month')),
      jsonb_build_object('id','leads_source','type','chart_pie','x',0,'y',7,'w',4,'h',4,
        'config', jsonb_build_object('title','Lead per sorgente','metric','leads_new','aggregation','count','breakdown','source')),
      jsonb_build_object('id','opps_assigned','type','table','x',4,'y',7,'w',8,'h',4,
        'config', jsonb_build_object('title','Opportunità per agente','metric','opportunities_open','aggregation','count','breakdown','assigned_to'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- ──────────────────────────────────────────────────────────────────
-- Tesoreria & Banking (company_admin)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'tesoreria-v1',
  'Dashboard Tesoreria',
  'Saldo conti, entrate/uscite bancarie, scaduti per cliente.',
  ARRAY['company_admin','super_admin']::public.app_role[],
  'finance',
  'landmark',
  60,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_cash','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Saldo cassa totale','metric','cash_balance','aggregation','sum','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','kpi_inflow','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Entrate periodo','metric','bank_inflows','aggregation','sum','format', jsonb_build_object('currency','EUR','decimals',0),'compareTo','prev_period')),
      jsonb_build_object('id','kpi_outflow','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Uscite periodo','metric','bank_outflows','aggregation','sum','format', jsonb_build_object('currency','EUR','decimals',0),'compareTo','prev_period')),
      jsonb_build_object('id','kpi_overdue','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Rate scadute','metric','installments_overdue','aggregation','sum','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','divider_flow','type','divider','x',0,'y',2,'w',12,'h',1,
        'config', jsonb_build_object('title','FLUSSI BANCARI','subtitle','Andamento e composizione')),
      jsonb_build_object('id','inflow_trend','type','chart_area','x',0,'y',3,'w',6,'h',4,
        'config', jsonb_build_object('title','Entrate per mese','metric','bank_inflows','aggregation','sum','breakdown','month','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','outflow_trend','type','chart_area','x',6,'y',3,'w',6,'h',4,
        'config', jsonb_build_object('title','Uscite per mese','metric','bank_outflows','aggregation','sum','breakdown','month','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','cash_split','type','chart_pie','x',0,'y',7,'w',4,'h',4,
        'config', jsonb_build_object('title','Saldo per tipo conto','metric','cash_balance','aggregation','sum','breakdown','category','format', jsonb_build_object('currency','EUR','decimals',0))),
      jsonb_build_object('id','overdue_table','type','table','x',4,'y',7,'w',8,'h',4,
        'config', jsonb_build_object('title','Top rate scadute per cliente','metric','installments_overdue','aggregation','sum','breakdown','customer','format', jsonb_build_object('currency','EUR','decimals',0)))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

-- ──────────────────────────────────────────────────────────────────
-- Calendario & Appuntamenti (employee + company_staff)
-- ──────────────────────────────────────────────────────────────────
INSERT INTO public.dashboard_templates (slug, name, description, target_roles, category, icon, sort_order, layout)
VALUES (
  'calendar-v1',
  'Dashboard Calendario',
  'Appuntamenti, completati, distribuzione per agente e categoria.',
  ARRAY['employee','company_staff','company_admin']::public.app_role[],
  'operations',
  'calendar-days',
  70,
  jsonb_build_object(
    'globalFilters', jsonb_build_object('period','this_month'),
    'widgets', jsonb_build_array(
      jsonb_build_object('id','kpi_total','type','kpi_card','x',0,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Appuntamenti periodo','metric','appointments_count','aggregation','count','compareTo','prev_period')),
      jsonb_build_object('id','kpi_done','type','kpi_card','x',3,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Completati','metric','appointments_completed','aggregation','count')),
      jsonb_build_object('id','kpi_orders_open','type','kpi_card','x',6,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Cantieri aperti','metric','orders_open','aggregation','count')),
      jsonb_build_object('id','kpi_avg_dur','type','kpi_card','x',9,'y',0,'w',3,'h',2,
        'config', jsonb_build_object('title','Durata media (gg)','metric','order_avg_duration','aggregation','avg')),
      jsonb_build_object('id','divider_agenda','type','divider','x',0,'y',2,'w',12,'h',1,
        'config', jsonb_build_object('title','AGENDA','subtitle','Andamento giornaliero e ripartizioni')),
      jsonb_build_object('id','daily_chart','type','chart_bar','x',0,'y',3,'w',8,'h',4,
        'config', jsonb_build_object('title','Appuntamenti per giorno','metric','appointments_count','aggregation','count','breakdown','day')),
      jsonb_build_object('id','category_pie','type','chart_pie','x',8,'y',3,'w',4,'h',4,
        'config', jsonb_build_object('title','Per categoria','metric','appointments_count','aggregation','count','breakdown','category')),
      jsonb_build_object('id','assigned_table','type','table','x',0,'y',7,'w',6,'h',4,
        'config', jsonb_build_object('title','Per agente','metric','appointments_count','aggregation','count','breakdown','assigned_to')),
      jsonb_build_object('id','done_assigned','type','table','x',6,'y',7,'w',6,'h',4,
        'config', jsonb_build_object('title','Completati per agente','metric','appointments_completed','aggregation','count','breakdown','assigned_to'))
    )
  )
) ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description, target_roles = EXCLUDED.target_roles,
    layout = EXCLUDED.layout, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order;

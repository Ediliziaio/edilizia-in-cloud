-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Permessi dedicati per due moduli distinti che prima riusavano un altro gate:
--  • can_view_firma_elettronica → modulo FEA (cantieri + CRM); prima usava canViewOrders / canViewMarketingOpportunities.
--  • can_view_reputazione       → gestione reputazione/recensioni; prima usava canViewMarketingDashboard.
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_firma_elettronica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_reputazione boolean NOT NULL DEFAULT false;

-- Backfill: chi vedeva il modulo lo mantiene (nessuna regressione).
UPDATE public.staff_permissions
  SET can_view_firma_elettronica = true
  WHERE (can_view_orders = true OR can_view_marketing_opportunities = true)
    AND can_view_firma_elettronica = false;

UPDATE public.staff_permissions
  SET can_view_reputazione = true
  WHERE can_view_marketing_dashboard = true
    AND can_view_reputazione = false;

COMMENT ON COLUMN public.staff_permissions.can_view_firma_elettronica IS 'Accesso al modulo Firma Elettronica (FEA) — cantieri e CRM';
COMMENT ON COLUMN public.staff_permissions.can_view_reputazione IS 'Accesso al modulo Reputazione (gestione recensioni)';

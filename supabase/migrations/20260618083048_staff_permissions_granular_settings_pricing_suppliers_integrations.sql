-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Esplosione mirata area Impostazioni: 3 nuove sotto-aree (Listino & Prezzi,
-- Fornitori, Integrazioni & Canali) estratte dai bucket grezzi esistenti.
-- Additiva + retrocompatibile: ogni utente mantiene accesso a tutte le route
-- che vedeva prima dello split.
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_settings_pricing      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_pricing      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_settings_suppliers    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_suppliers    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_settings_integrations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_settings_integrations boolean NOT NULL DEFAULT false;

-- Backward-compat (eseguita una sola volta in migration):
--  • Listino & Prezzi  ← era dentro "Personalizzazione" (customization)
--  • Fornitori         ← era dentro "Gestione Ordini" (orders)
--  • Integrazioni      ← api/webhook/integrazioni erano sotto "Sicurezza";
--                        whatsapp-bot/firma/lead-forms sotto "Personalizzazione"
UPDATE public.staff_permissions SET
  can_view_settings_pricing      = can_view_settings_customization,
  can_edit_settings_pricing      = can_edit_settings_customization,
  can_view_settings_suppliers    = can_view_settings_orders,
  can_edit_settings_suppliers    = can_edit_settings_orders,
  can_view_settings_integrations = (can_view_settings_security OR can_view_settings_customization),
  can_edit_settings_integrations = can_edit_settings_customization;

-- ============================================================
-- PERSONE & ACCESSI — REDESIGN
-- Nuove colonne permessi granulari su staff_permissions
-- Nuovi ruoli: worker, subcontractor (come valori enum app_role)
-- ============================================================

-- 1. Nuovi permessi per sezioni mancanti
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_interventi           BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_manutenzione         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_sicurezza_cantiere   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_subappaltatori       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_giornale_lavori      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_messaggi_esterni     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_automazioni          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_render_ai            BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_sales_os             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_sms_marketing        BOOLEAN DEFAULT false;

-- 2. Migrazione dati: chi aveva can_view_orders eredita le sezioni collegate
UPDATE public.staff_permissions SET
  can_view_interventi         = COALESCE(can_view_orders, false),
  can_view_manutenzione       = COALESCE(can_view_orders, false),
  can_view_sicurezza_cantiere = COALESCE(can_view_orders, false),
  can_view_subappaltatori     = COALESCE(can_view_orders, false),
  can_view_giornale_lavori    = COALESCE(can_view_persone, false),
  can_view_messaggi_esterni   = COALESCE(can_view_persone, false),
  can_view_automazioni        = COALESCE(can_view_settings, false),
  can_view_render_ai          = COALESCE(can_view_marketing_ai_agent, false),
  can_view_sms_marketing      = COALESCE(can_view_marketing_email, false)
WHERE true;

-- 3. Aggiungi nuovi valori all'enum app_role (idempotente)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'worker';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'subcontractor';

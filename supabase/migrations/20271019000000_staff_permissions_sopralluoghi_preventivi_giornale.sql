-- Permessi dedicati per Sopralluoghi, Preventivi (prima ereditati dal CRM:
-- contatti/opportunità) e modifica del Giornale Lavori. Additivi + retrocompatibili.
-- (Già applicata in prod via MCP; file per parità git. Idempotente.)
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_sopralluoghi    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_preventivi      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_preventivi      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_giornale_lavori boolean NOT NULL DEFAULT false;

-- Backward-compat:
--  • Sopralluoghi      <- erano gated su can_view_marketing_contacts
--  • Preventivi        <- erano gated su can_view/edit_marketing_opportunities
--  • Modifica Giornale <- prima non esisteva gate edit: chi vedeva poteva scrivere
UPDATE public.staff_permissions SET
  can_view_sopralluoghi    = COALESCE(can_view_marketing_contacts, false),
  can_view_preventivi      = COALESCE(can_view_marketing_opportunities, false),
  can_edit_preventivi      = COALESCE(can_edit_marketing_opportunities, false),
  can_edit_giornale_lavori = COALESCE(can_view_giornale_lavori, false);

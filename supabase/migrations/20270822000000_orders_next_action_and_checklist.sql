-- Operatività commessa (OrderDetail): prossima azione + checklist fasi.
-- Già applicata sul DB via MCP; file per tracciabilità/ambienti.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_date date,
  ADD COLUMN IF NOT EXISTS operational_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.orders.next_action IS 'Prossima azione operativa libera (cosa fare adesso sulla commessa)';
COMMENT ON COLUMN public.orders.next_action_date IS 'Scadenza della prossima azione';
COMMENT ON COLUMN public.orders.operational_checklist IS 'Checklist fasi operative: { sopralluogo, materiale, posa, collaudo, fatturazione: bool }';

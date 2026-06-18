-- Nuovo permesso: visibilità degli IMPORTI DI VENDITA in commesse/preventivi/lista.
-- Separa il "vedere i soldi" dall'operare sulla commessa (inserire articoli, ecc.).
-- DEFAULT true → retrocompatibile: chi oggi vede le commesse continua a vedere gli
-- importi; l'admin disattiva il permesso solo per chi NON deve vederli.
-- Costi/margini riusano i permessi esistenti can_view_costs / can_view_margins.
-- (Già applicata in prod via MCP; file per parità git. Idempotente.)
ALTER TABLE public.staff_permissions
  ADD COLUMN IF NOT EXISTS can_view_order_amounts boolean NOT NULL DEFAULT true;

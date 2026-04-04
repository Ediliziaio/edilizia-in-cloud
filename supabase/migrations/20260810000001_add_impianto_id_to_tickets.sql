-- Migration A: Collega ticket all'impianto di manutenzione
-- ADDITIVE: aggiunge colonna nullable, zero breaking changes
ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS impianto_id UUID
REFERENCES public.impianti_cliente(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tickets.impianto_id IS
'FK all''impianto cliente. Popolato quando il ticket nasce da un piano manutenzione.';

CREATE INDEX IF NOT EXISTS idx_tickets_impianto
ON public.tickets(impianto_id)
WHERE impianto_id IS NOT NULL;

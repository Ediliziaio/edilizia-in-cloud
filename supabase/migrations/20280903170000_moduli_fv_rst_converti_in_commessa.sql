-- Moduli vendita → commessa: Fotovoltaico e Ristrutturazione.
--
-- Serramenti la conversione ce l'ha dal maggio 2026 (sr_converti_in_ordine).
-- Fotovoltaico ha la colonna `orders.fv_progetto_id` e `fv_progetti.ordine_id`
-- dall'ottobre 2026 e NESSUNA riga di codice le ha mai scritte; Ristrutturazione
-- non aveva nemmeno la colonna. Risultato: un preventivo firmato da un modulo
-- restava lì, e la commessa si rifaceva a mano.
--
-- Qui solo lo schema: la conversione vera passa da `create_order_atomic`
-- (righe, storico stato e rate in una transazione sola) chiamata dal client,
-- come già fanno la nuova commessa e il simulatore.
-- Idempotente.

ALTER TABLE public.rst_progetti
  ADD COLUMN IF NOT EXISTS ordine_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.rst_progetti.ordine_id IS 'Commessa nata da questo preventivo (conversione una tantum)';
CREATE INDEX IF NOT EXISTS idx_rst_progetti_ordine ON public.rst_progetti(ordine_id) WHERE ordine_id IS NOT NULL;

-- Il gemello per Ristrutturazione della colonna che il Fotovoltaico ha già:
-- dalla commessa si risale al preventivo di modulo che l'ha generata.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rst_progetto_id uuid;
COMMENT ON COLUMN public.orders.rst_progetto_id IS 'Preventivo Ristrutturazione di origine (soft link, come fv_progetto_id)';
CREATE INDEX IF NOT EXISTS idx_orders_rst_progetto ON public.orders(rst_progetto_id) WHERE rst_progetto_id IS NOT NULL;

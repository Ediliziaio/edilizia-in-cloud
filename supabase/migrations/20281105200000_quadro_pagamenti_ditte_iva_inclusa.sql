-- Quadro pagamenti della commessa (commessa_quadro_pagamenti, 20281031250000):
-- per le ditte senza costo registrato l'importo era total_cost × (1 + IVA).
-- order_external_teams.total_cost è già IVA inclusa: v_ordine_marginalita lo
-- divide per (1 + IVA) per avere l'imponibile. Da pagare è total_cost così com'è.
-- Idempotente: sostituisce il calcolo solo se c'è ancora quello vecchio.

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.commessa_quadro_pagamenti(uuid)'::regprocedure);
  IF position('coalesce(oet.total_cost, 0) * (1 + coalesce(oet.vat_rate, 0) / 100)' in d) > 0 THEN
    d := replace(d, 'round(coalesce(oet.total_cost, 0) * (1 + coalesce(oet.vat_rate, 0) / 100), 2)', 'round(coalesce(oet.total_cost, 0), 2)');
    EXECUTE d;
  END IF;
END
$do$;

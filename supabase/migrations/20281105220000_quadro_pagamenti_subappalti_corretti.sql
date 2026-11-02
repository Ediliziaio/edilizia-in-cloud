-- Quadro pagamenti della commessa (commessa_quadro_pagamenti), due correzioni
-- trovate rileggendo il flusso del subappalto (31/10/2026):
-- 1. Il costo della fattura di un subappalto si nascondeva sempre, anche per un
--    contratto senza SAL: la riga del contratto vale 0 e il debito spariva dal
--    «da pagare». Ora si nasconde solo se la fattura è legata a un SAL o il
--    contratto ha SAL (allora la riga del contratto la rappresenta).
-- 2. Per i subappalti la «scadenza» era la data di emissione del SAL non pagato:
--    ogni SAL risultava subito «scaduto». La data resta (è quando il SAL è
--    maturato) ma non fa più scattare lo scaduto.
-- Idempotente: ogni sostituzione solo se c'è ancora il testo di prima.
DO $do$
DECLARE d text; nuovo text;
BEGIN
  d := pg_get_functiondef('public.commessa_quadro_pagamenti(uuid)'::regprocedure);
  nuovo := replace(d,
    'WHERE frs.company_cost_id = c.id AND ks.order_id = p_order_id)',
    'WHERE frs.company_cost_id = c.id AND ks.order_id = p_order_id
                       AND (frs.sal_subappaltatore_id IS NOT NULL
                            OR EXISTS (SELECT 1 FROM public.sal_subappaltatori sx WHERE sx.contratto_id = ks.id)))');
  nuovo := replace(nuovo,
    'WHEN u.scadenza IS NOT NULL AND u.scadenza < (SELECT d FROM oggi) THEN ''scaduto''',
    'WHEN u.scadenza IS NOT NULL AND u.scadenza < (SELECT d FROM oggi) AND u.origine_tipo <> ''subappalto'' THEN ''scaduto''');
  IF nuovo <> d THEN EXECUTE nuovo; END IF;
END
$do$;

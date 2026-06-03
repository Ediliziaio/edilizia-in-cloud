-- ============================================================================
-- normalize_comped_payment_method — canonicalizza i valori legacy "regalo".
--
-- Storicamente companies.payment_method ha accettato vari sinonimi per indicare
-- un'azienda regalata (accesso gratuito per policy: demo, partner, early adopter).
-- Il valore canonico è "comped" (l'unico scrivibile dalla UI PaymentMethodCard).
-- Questa migration allinea i DATI ai classificatori del codice
-- (getEffectivePaymentStatus, gate carta client+server, process-dunning,
-- adminRevenue) portando tutti i sinonimi a "comped".
--
-- ESCLUSI di proposito: 'none'/''/'free'/'trial' → NON sono regali, indicano
-- "nessuna carta" e devono restare bloccati dal gate (anche un account gratis
-- richiede la carta per i tool a consumo).
--
-- Idempotente: se non esistono valori legacy aggiorna 0 righe.
--
-- Anteprima (eseguire PRIMA, in sola lettura, per vedere quante righe tocca):
--   SELECT lower(trim(payment_method)) AS metodo, count(*)
--   FROM public.companies
--   WHERE lower(trim(payment_method)) IN
--     ('complimentary','comp','manual_free','gift','gifted','gratis','omaggio')
--   GROUP BY 1 ORDER BY 2 DESC;
-- ============================================================================

UPDATE public.companies
SET payment_method = 'comped'
WHERE lower(trim(payment_method)) IN (
  'complimentary',
  'comp',
  'manual_free',
  'gift',
  'gifted',
  'gratis',
  'omaggio'
)
AND payment_method IS DISTINCT FROM 'comped';

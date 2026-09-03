-- Enterprise aveva email_overage_price_eur = 0: residuo dell'epoca in cui il
-- piano dava email illimitate (email_monthly_included = -1), quando il prezzo
-- per email non veniva mai usato. Da quando nessun piano include email, il
-- prezzo e' l'unica cosa che decide: a zero, sendEmailUnified non addebita
-- (`shouldCharge` richiede pricePerEmail > 0) e le 6 aziende Enterprise
-- avrebbero continuato a inviare gratis.
--
-- Valore scelto proseguendo la scala esistente: 0,0015 base -> 0,0012 Pro ->
-- 0,0010 Enterprise. Si cambia con un UPDATE su subscription_plans.
UPDATE public.subscription_plans
SET email_overage_price_eur = 0.0010
WHERE name = 'Enterprise' AND COALESCE(email_overage_price_eur, 0) = 0;

-- Risultati dei test A/B sulle email delle automazioni.
--
-- La variante viene scritta in email_delivery_log.metadata->>'ab_variant' da
-- process-automation. Qui si aggrega per oggetto e variante.
--
-- ⚠️ Aperture e clic restano a zero finché i fornitori non sono configurati per
-- chiamare `email-provider-webhook`: la funzione esiste ed è pronta, ma nessuno
-- la chiama, quindi oggi un test A/B misura solo quante ne sono partite.
CREATE OR REPLACE VIEW public.v_email_ab_risultati
WITH (security_invoker = on) AS
SELECT
  d.company_id,
  d.subject                             AS oggetto,
  d.metadata->>'ab_variant'             AS variante,
  count(*)                              AS inviate,
  count(*) FILTER (WHERE d.opened_at IS NOT NULL)  AS aperte,
  count(*) FILTER (WHERE d.clicked_at IS NOT NULL) AS cliccate,
  round(100.0 * count(*) FILTER (WHERE d.opened_at IS NOT NULL) / NULLIF(count(*), 0), 1)  AS apertura_pct,
  round(100.0 * count(*) FILTER (WHERE d.clicked_at IS NOT NULL) / NULLIF(count(*), 0), 1) AS clic_pct,
  min(d.sent_at)                        AS dal,
  max(d.sent_at)                        AS al
FROM public.email_delivery_log d
WHERE d.metadata->>'ab_variant' IS NOT NULL
  AND d.status IN ('sent', 'delivered')
GROUP BY d.company_id, d.subject, d.metadata->>'ab_variant';

COMMENT ON VIEW public.v_email_ab_risultati IS
  'Esito dei test A/B sull''oggetto delle email di automazione: inviate, aperte e cliccate per variante. Aperture e clic sono attendibili solo quando i webhook dei fornitori sono collegati.';

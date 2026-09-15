-- Dal 15/09/2026 un'azienda può avere, accanto al piano e sullo stesso customer
-- Stripe, abbonamenti accessori: l'add-on WhatsApp Business e gli Agenti AI.
-- sync-stripe-mrr li contava come piano: un'azienda da 127 € con l'add-on
-- risultava 157 € su Stripe contro 127 € interni, contata due volte fra le
-- aziende Stripe, e con un «prezzo diverso dal piano» che non esiste.
--
-- mrr_stripe_cents resta il MRR del piano, quello che si confronta con
-- mrr_interno_cents (e che leggono admin_dashboard_summary e admin_kpi_saas).
-- Gli accessori hanno un campo proprio, come gli altri prodotti AEDIX.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.mrr_snapshots
  ADD COLUMN IF NOT EXISTS mrr_accessori_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS abbonamenti_accessori integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.mrr_snapshots.mrr_accessori_cents IS
  'Abbonamenti accessori delle aziende (add-on WhatsApp Business, Agenti AI): fatturato di Edilizia in Cloud, ma non piano. Fuori da mrr_stripe_cents, che si confronta con mrr_interno_cents.';
COMMENT ON COLUMN public.mrr_snapshots.mrr_stripe_cents IS
  'MRR del piano incassato da Stripe, per le sole aziende della piattaforma. Esclude gli altri prodotti AEDIX (mrr_altri_prodotti_cents, dal 2026-09-05) e gli abbonamenti accessori (mrr_accessori_cents, dal 2026-09-15).';

-- Gli snapshot scritti dalla funzione nuova prima di questa migrazione hanno gli
-- accessori solo nel dettaglio discrepanze: si ricostruiscono da lì.
UPDATE public.mrr_snapshots s
   SET mrr_accessori_cents = x.somma,
       abbonamenti_accessori = x.quanti
  FROM (
    SELECT s2.data,
           sum((d->>'mrr_stripe')::bigint) AS somma,
           count(*)                        AS quanti
      FROM public.mrr_snapshots s2
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s2.dettaglio_discrepanze, '[]'::jsonb)) d
     WHERE d->>'motivo' LIKE 'abbonamento accessorio:%'
     GROUP BY s2.data
  ) x
 WHERE x.data = s.data
   AND s.abbonamenti_accessori = 0;

NOTIFY pgrst, 'reload schema';

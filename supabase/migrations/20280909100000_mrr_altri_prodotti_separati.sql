-- Il cruscotto ha letto 243,13 il 4 settembre e 127 il 5, senza che nessuno
-- avesse toccato niente: l'account Stripe è condiviso con gli altri prodotti
-- AEDIX, e quattro abbonamenti che non risalivano a nessuna azienda erano
-- contati dentro il MRR di Edilizia in Cloud. Quando si sono chiusi, il numero
-- è sceso di 116,13 e sembrava una perdita nostra. Non lo era: quegli euro non
-- erano mai stati nostri.
--
-- Da qui in avanti `mrr_stripe_cents` conta solo le sottoscrizioni che risalgono
-- a un'azienda della piattaforma. Le altre restano contate, ma in un campo
-- proprio: toglierle dal totale senza registrarle da nessuna parte avrebbe
-- sostituito un numero gonfiato con un numero cieco.

ALTER TABLE public.mrr_snapshots
  ADD COLUMN IF NOT EXISTS mrr_altri_prodotti_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sottoscrizioni_altri_prodotti integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.mrr_snapshots.mrr_altri_prodotti_cents IS
  'Abbonamenti attivi sullo stesso account Stripe che non risalgono a nessuna azienda: appartengono ad altri prodotti AEDIX e non sono fatturato di Edilizia in Cloud.';
COMMENT ON COLUMN public.mrr_snapshots.mrr_stripe_cents IS
  'MRR incassato da Stripe per le sole aziende della piattaforma. Dal 2026-09-05 esclude gli altri prodotti AEDIX, contati in mrr_altri_prodotti_cents.';

-- Lo storico non si riscrive, ma si annota: gli snapshot fino al 4 settembre
-- includono gli altri prodotti dentro mrr_stripe_cents. Il dettaglio delle
-- discrepanze permette di ricostruire quanto valessero, giorno per giorno.
UPDATE public.mrr_snapshots s
   SET mrr_altri_prodotti_cents = COALESCE(x.somma, 0),
       sottoscrizioni_altri_prodotti = COALESCE(x.quante, 0)
  FROM (
    SELECT s2.data,
           sum((d->>'mrr_stripe')::bigint) AS somma,
           count(*)                        AS quante
      FROM public.mrr_snapshots s2
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s2.dettaglio_discrepanze, '[]'::jsonb)) d
     WHERE d->>'motivo' = 'altro prodotto AEDIX'
     GROUP BY s2.data
  ) x
 WHERE x.data = s.data;

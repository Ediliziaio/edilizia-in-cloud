-- La serie storica portava dentro gli altri prodotti AEDIX, e quindi mostrava
-- un salto di 116,13 fra il 4 e il 5 settembre che non è mai avvenuto: il
-- fatturato di Edilizia in Cloud è stato 127 euro tutti e dieci i giorni.
--
-- Lasciare il gradino avrebbe significato spiegare a voce, ogni volta che
-- qualcuno guarda il grafico, che quel crollo non è reale. La serie si corregge:
-- `mrr_stripe_cents` passa al netto, e il valore originale resta ricostruibile
-- sommando `mrr_altri_prodotti_cents`, che è appena stato popolato giorno per
-- giorno dal dettaglio delle discrepanze.
--
-- Si tocca solo ciò che è verificabile: gli snapshot con `calcolo_affidabile`
-- e con un dettaglio discrepanze da cui il numero è stato ricavato.

UPDATE public.mrr_snapshots
   SET mrr_stripe_cents = mrr_stripe_cents - mrr_altri_prodotti_cents,
       aziende_attive_stripe = GREATEST(aziende_attive_stripe - sottoscrizioni_altri_prodotti, 0)
 WHERE COALESCE(calcolo_affidabile, false)
   AND COALESCE(mrr_altri_prodotti_cents, 0) > 0
   AND mrr_stripe_cents >= mrr_altri_prodotti_cents;

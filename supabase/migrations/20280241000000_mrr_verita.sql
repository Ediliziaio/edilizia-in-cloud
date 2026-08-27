-- Il MRR contava i regalati.
--
-- sync-stripe-mrr escludeva i metodi "regalo" con una lista che conteneva
-- "comp" ma non "comped" — e "comped" e' l'UNICO valore che la UI scrive
-- (lo ha imposto la migration 20270618010000). Risultato: 8 aziende regalate
-- su 11 attive entravano nel MRR, che diceva 3.686 €/mese contro i 127 €
-- realmente fatturati. Il riepilogo mensile lo ripeteva per email.
--
-- La correzione della logica sta nella edge. Qui: le colonne che permettono
-- di leggere il numero senza doversi fidare.

-- Quanto si sta regalando, a listino. Non e' fatturato e non va sommato al
-- MRR, ma tenuto accanto: un MRR basso con molto regalato e' una scelta,
-- un MRR basso e basta e' un problema. Sono due diagnosi diverse.
ALTER TABLE public.mrr_snapshots
  ADD COLUMN IF NOT EXISTS mrr_regalato_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aziende_regalate integer NOT NULL DEFAULT 0;

-- useMrrReconciliation seleziona discrepanza_cents, che non e' mai esistita:
-- la query andava in errore e la card di riconciliazione — proprio quella che
-- avrebbe reso visibile il divario — era vuota. Generata, cosi' non puo'
-- divergere dai due addendi.
ALTER TABLE public.mrr_snapshots
  ADD COLUMN IF NOT EXISTS discrepanza_cents bigint
  GENERATED ALWAYS AS (mrr_stripe_cents - mrr_interno_cents) STORED;

COMMENT ON COLUMN public.mrr_snapshots.mrr_interno_cents IS
  'MRR fatturato: solo aziende attive con un pagamento vero in corso. Esclude i regalati (payment_method comped e sinonimi) e chi e'' in past_due.';
COMMENT ON COLUMN public.mrr_snapshots.mrr_regalato_cents IS
  'Valore a listino degli accessi regalati. Mai sommare al MRR: non e'' fatturato.';

-- Gli snapshot gia' scritti portano il numero gonfiato. Azzerarli
-- cancellerebbe la storia, lasciarli farebbe leggere al grafico una caduta
-- che non e' mai avvenuta. Si marcano come inattendibili: la verita' riparte
-- dal primo giro della edge corretta.
ALTER TABLE public.mrr_snapshots
  ADD COLUMN IF NOT EXISTS calcolo_affidabile boolean NOT NULL DEFAULT true;

UPDATE public.mrr_snapshots SET calcolo_affidabile = false WHERE data <= CURRENT_DATE;

COMMENT ON COLUMN public.mrr_snapshots.calcolo_affidabile IS
  'false sugli snapshot calcolati prima del fix "comped" (MRR gonfiato dai regalati).';

NOTIFY pgrst, 'reload schema';

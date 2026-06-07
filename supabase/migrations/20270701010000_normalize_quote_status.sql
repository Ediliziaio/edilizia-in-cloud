-- Normalizza il vocabolario degli stati preventivo a un solo set (italiano).
--
-- Problema: alcuni record quotes hanno lo stato INGLESE 'draft' invece di 'bozza'.
-- QUOTE_STATUS_CONFIG (src/lib/quoteStatus.ts) e i gate UI usano solo l'italiano
-- (bozza/inviata/accettata/rifiutata/scaduta/convertita): i preventivi 'draft'
-- ricadevano nel fallback 'bozza' per la visualizzazione, ma i gate per-stato
-- (es. mostrare "Modifica"/"Invia per firma", o "Converti" su 'accettata') non
-- scattavano → preventivi bloccati e mai convertibili in commessa.
--
-- Fix: mappa gli stati inglesi legacy ai corrispettivi italiani. Idempotente.
UPDATE public.quotes SET status = 'bozza'      WHERE status = 'draft';
UPDATE public.quotes SET status = 'inviata'    WHERE status = 'sent';
UPDATE public.quotes SET status = 'accettata'  WHERE status = 'accepted';
UPDATE public.quotes SET status = 'rifiutata'  WHERE status = 'rejected';
UPDATE public.quotes SET status = 'scaduta'    WHERE status = 'expired';
UPDATE public.quotes SET status = 'convertita' WHERE status = 'converted';

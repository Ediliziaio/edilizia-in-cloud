-- Streaming delle risposte di Silvio.
--
-- Fino a oggi silvio-chat scriveva il messaggio in chat solo alla fine del
-- turno, e il frontend simulava la digitazione con un typewriter. Ora, quando
-- il modello comincia la risposta finale, silvio-chat inserisce una riga con
-- streaming = true e la aggiorna a lotti (realtime UPDATE) man mano che il
-- testo arriva; l'ultimo aggiornamento porta il contenuto definitivo, i
-- metadati e streaming = false. Il frontend usa la colonna per due cose:
-- mostrare il testo cosi' com'e' mentre cresce (niente typewriter sopra un
-- testo che gia' scorre) e non ri-animare il messaggio quando diventa
-- definitivo.

ALTER TABLE public.internal_chat_messages
  ADD COLUMN IF NOT EXISTS streaming boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.internal_chat_messages.streaming IS
  'true mentre silvio-chat sta ancora scrivendo il contenuto (aggiornato a lotti via realtime UPDATE); false = messaggio definitivo. Il frontend non anima col typewriter i messaggi arrivati in streaming.';

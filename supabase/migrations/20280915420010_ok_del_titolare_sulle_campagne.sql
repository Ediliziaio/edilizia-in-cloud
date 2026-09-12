-- File ricostruito, non originale: leggere prima di fidarsi.
--
-- La versione 20280915420010 risultava registrata in schema_migrations con
-- ZERO istruzioni e senza alcun file nel repository. Una registrazione vuota
-- non porta niente in un branch di preview, ma intanto teneva rosso il
-- controllo Supabase su main e fermava il deploy delle migrazioni per tutti.
--
-- Chiesto alle sessioni aperte: due su tre l'hanno disconosciuta, la terza non
-- ha risposto. Il contenuto qui sotto NON viene dal registro (era vuoto): e'
-- letto dalla produzione. In public.meta_campaigns esistono due colonne che
-- nessuna migrazione del repository crea, e sono le ultime due della tabella:
--
--   approved_by  uuid
--   approved_at  timestamptz
--
-- Sono l'ok del titolare a una campagna, il nome della migrazione. Al
-- 12/09/2026 nessuna riga e' approvata (0 su tutta la tabella) e nessuna
-- funzione, policy o vincolo le usa: il codice che le legge non e' ancora
-- pubblicato. Le colonne restano nullabili e senza vincolo, esattamente come
-- stanno in produzione.
--
-- Se l'autore pubblica il suo file, cade su questo stesso percorso e lo
-- sostituisce senza creare doppioni. Se invece quel lavoro prevedeva anche una
-- policy o una funzione, qui non c'e': in produzione non esistono.

ALTER TABLE public.meta_campaigns
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

COMMENT ON COLUMN public.meta_campaigns.approved_by IS 'Chi ha dato l''ok alla campagna.';
COMMENT ON COLUMN public.meta_campaigns.approved_at IS 'Quando e'' arrivato l''ok alla campagna.';

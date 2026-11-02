-- Recupero una tantum degli allegati IMAP mai salvati (vedi email-poll-inbox,
-- modo «recupera_allegati»). Una riga per casella: fin dove si è arrivati.
CREATE TABLE IF NOT EXISTS public.email_recupero_allegati (
  connection_id uuid PRIMARY KEY,
  cursore timestamptz NOT NULL DEFAULT now(),
  trovati integer NOT NULL DEFAULT 0,
  tentativi integer NOT NULL DEFAULT 0,
  ultimo_errore text,
  finito_at timestamptz,
  aggiornato_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_recupero_allegati ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_recupero_allegati FROM PUBLIC, anon, authenticated;

INSERT INTO public.email_recupero_allegati (connection_id)
SELECT id FROM public.email_oauth_connections WHERE provider = 'imap' AND status IN ('active', 'error')
ON CONFLICT (connection_id) DO NOTHING;

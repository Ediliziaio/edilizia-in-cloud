-- Estende customer_messages per supportare canali multipli (chat, nota, email)
-- con subject e metadata di consegna.

BEGIN;

ALTER TABLE public.customer_messages
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'chat'
    CHECK (channel IN ('chat', 'internal', 'email', 'sms', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS delivery_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sent', 'delivered', 'failed', 'queued', 'opened', 'bounced'));

COMMENT ON COLUMN public.customer_messages.channel IS
  'Canale di invio del messaggio: chat (portale cliente), internal (nota staff-only), email, sms, whatsapp.';
COMMENT ON COLUMN public.customer_messages.subject IS
  'Oggetto (richiesto solo per channel=email).';
COMMENT ON COLUMN public.customer_messages.delivery_metadata IS
  'Metadati di consegna: delivery_log_id, provider, subject, from, reply_to, ecc.';

-- Indice per query per canale
CREATE INDEX IF NOT EXISTS idx_customer_messages_channel
  ON public.customer_messages(customer_id, channel, created_at DESC);

COMMIT;

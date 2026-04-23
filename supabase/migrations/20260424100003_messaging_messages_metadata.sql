-- =============================================================================
-- P1-2 — Metadata strutturata + supporto tipi media WhatsApp estesi
-- =============================================================================
-- Risolve il bug P1 "WhatsApp media type non gestiti": Meta manda 10+ tipi
-- messaggio (text, image, video, audio, document, location, contacts,
-- sticker, reaction, interactive, button). Il codice precedente gestiva solo
-- i primi 5, gli altri finivano nel ramo text con content='[Messaggio]' →
-- dati strutturati (es. lat/lng di una posizione cantiere) persi.
--
-- Questa migration introduce una colonna jsonb `metadata` su
-- messaging_messages e whatsapp_messages per conservare i dati strutturati
-- (coordinate, contatti, emoji di reazione, etc.) e amplia il CHECK
-- constraint su message_type per accettare tutti i tipi Meta.
-- =============================================================================

ALTER TABLE public.messaging_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- Amplia il CHECK su messaging_messages.message_type (drop idempotente).
ALTER TABLE public.messaging_messages
  DROP CONSTRAINT IF EXISTS messaging_messages_message_type_check;

ALTER TABLE public.messaging_messages
  ADD CONSTRAINT messaging_messages_message_type_check
  CHECK (message_type IN (
    'text',
    'image',
    'video',
    'audio',
    'document',
    'location',
    'contacts',
    'sticker',
    'reaction',
    'interactive',
    'button',
    'unknown'
  ));

COMMENT ON COLUMN public.messaging_messages.metadata IS
  'P1-2: dati strutturati del messaggio (es. latitude/longitude per location, contatti, emoji per reaction). Null per messaggi text semplici.';
COMMENT ON COLUMN public.whatsapp_messages.metadata IS
  'P1-2: specchio di messaging_messages.metadata per accesso diretto dal processor AI.';

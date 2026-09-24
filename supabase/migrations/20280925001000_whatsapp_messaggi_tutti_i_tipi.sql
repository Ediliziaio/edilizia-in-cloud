-- WhatsApp: si salvano anche i messaggi con modello e le risposte coi bottoni
-- (24/09/2026).
--
-- Il vincolo su whatsapp_messages.message_type ammetteva solo testo e media
-- (text, image, document, audio, video, location, sticker). Così:
--   - whatsapp-send non registrava i messaggi inviati con un modello
--     ('template') né quelli coi bottoni ('interactive'): l'inserimento
--     falliva in silenzio e il messaggio spariva dalle conversazioni;
--   - il webhook perdeva le risposte ai bottoni ('button', 'interactive'),
--     le reazioni, i contatti condivisi e i tipi che non conosce ('unknown').
-- L'elenco nuovo è quello che il parser del webhook e whatsapp-send scrivono
-- davvero (whatsapp-webhook/parser.ts, whatsapp-send/index.ts).

set local lock_timeout = '3s';

alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_message_type_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_message_type_check
  check (message_type = any (array[
    'text', 'image', 'document', 'audio', 'video', 'location', 'sticker',
    'contacts', 'reaction', 'interactive', 'button', 'template', 'unknown'
  ]));

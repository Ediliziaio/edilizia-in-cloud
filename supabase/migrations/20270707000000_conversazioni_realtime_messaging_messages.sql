-- =============================================================================
-- Conversazioni / Inbox — realtime sui nuovi messaggi WhatsApp
-- =============================================================================
-- Abilita il realtime su public.messaging_messages: i nuovi messaggi WhatsApp in
-- arrivo aggiornano la lista/timeline dell'inbox Conversazioni istantaneamente.
-- Il frontend (ConversazioniInbox) è GIÀ sottoscritto a questa tabella; finché non
-- è nella publication non riceve eventi e ricade in modo trasparente sul polling
-- (refetchOnWindowFocus + intervallo 25s) → nessuna rottura.
--
-- Additivo + idempotente. NON applicata (modalità locale).
-- NB di costo: aggiungere una tabella alla publication fa broadcastare ogni write.
-- messaging_messages è il canale "chat" (volume moderato) → ok. Per email_inbox /
-- sms_logs (volume più alto) si resta sul polling per evitare overhead di broadcast.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messaging_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messaging_messages';
  END IF;
END $$;
